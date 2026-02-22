import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import util from 'util';
import ImageFapDownloader from '../lib/ImageFapDownloader.js';
import Logger, { LogEntry, LogLevel } from '../lib/utils/logging/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Track active downloads
const activeDownloads = new Map<string, { downloader: ImageFapDownloader; abortController: AbortController }>();

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected');
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Broadcast to all connected clients
function broadcast(data: any) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(JSON.stringify(data));
    }
  });
}

// Custom logger that sends updates via WebSocket
class WebLogger implements Logger {
  log(entry: LogEntry | null): void {
    if (entry) {
      // Serialize message array to handle Error objects and complex objects
      const serializedMessage = entry.message.map((m) => {
        if (m instanceof Error) {
          // Serialize Error objects with stack trace
          return {
            type: 'error',
            name: m.name,
            message: m.message,
            stack: m.stack,
            cause: m.cause
          };
        } else if (typeof m === 'object' && m !== null) {
          // Use util.inspect for complex objects to get a readable string
          return util.inspect(m, { depth: 3, colors: false });
        } else {
          return m;
        }
      });

      broadcast({
        type: 'log',
        level: entry.level,
        originator: entry.originator,
        message: serializedMessage
      });
    }
  }

  async end(): Promise<void> {
    // No cleanup needed
  }

  getLevel(): LogLevel {
    return 'info';
  }
}

// API Routes
app.post('/api/download', async (req, res) => {
  const { url, outDir, options } = req.body;

  if (!url || !outDir) {
    return res.status(400).json({ error: 'URL and output directory are required' });
  }

  // Generate download ID
  const downloadId = Date.now().toString();

  try {
    const webLogger = new WebLogger();
    const abortController = new AbortController();

    const downloader = new ImageFapDownloader(url, {
      outDir,
      logger: webLogger,
      overwrite: options?.overwrite ?? false,
      seqFilenames: options?.seqFilenames ?? false,
      fullFilenames: options?.fullFilenames ?? false,
      saveJSON: options?.saveJSON ?? true,
      saveHTML: options?.saveHTML ?? false,
      dirStructure: {
        user: options?.dirStructure?.user ?? true,
        favorites: options?.dirStructure?.favorites ?? true,
        folder: options?.dirStructure?.folder ?? true,
        gallery: options?.dirStructure?.gallery ?? true
      },
      request: {
        maxRetries: options?.request?.maxRetries ?? 3,
        maxConcurrent: options?.request?.maxConcurrent ?? 10,
        minTime: {
          page: options?.request?.minTime?.page ?? 200,
          image: options?.request?.minTime?.image ?? 200
        }
      }
    });

    // Store the download
    activeDownloads.set(downloadId, { downloader, abortController });

    // Start download in background
    downloader.start({ signal: abortController.signal })
      .then(() => {
        broadcast({
          type: 'complete',
          downloadId,
          message: 'Download completed successfully'
        });
        activeDownloads.delete(downloadId);
      })
      .catch((error) => {
        if (!abortController.signal.aborted) {
          broadcast({
            type: 'error',
            downloadId,
            message: error instanceof Error ? error.message : 'Unknown error occurred'
          });
        }
        activeDownloads.delete(downloadId);
      });

    res.json({ 
      success: true, 
      downloadId,
      message: 'Download started' 
    });

  } catch (error) {
    console.error('Error starting download:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to start download' 
    });
  }
});

app.post('/api/download/:id/cancel', (req, res) => {
  const { id } = req.params;
  const download = activeDownloads.get(id);

  if (!download) {
    return res.status(404).json({ error: 'Download not found' });
  }

  download.abortController.abort();
  activeDownloads.delete(id);

  broadcast({
    type: 'cancelled',
    downloadId: id,
    message: 'Download cancelled'
  });

  res.json({ success: true, message: 'Download cancelled' });
});

app.get('/api/downloads', (req, res) => {
  const downloads = Array.from(activeDownloads.keys()).map(id => ({ id }));
  res.json({ downloads });
});

// Get user's home directory
app.get('/api/user-home', (req, res) => {
  const homeDir = os.homedir();
  const platform = process.platform;
  const separator = platform === 'win32' ? '\\' : '/';
  const defaultPath = `${homeDir}${separator}Downloads${separator}imagefap`;
  
  res.json({ 
    homeDir,
    platform,
    separator,
    defaultPath
  });
});

// Validate directory path
app.post('/api/validate-path', (req, res) => {
  const { dirPath } = req.body;
  
  if (!dirPath) {
    return res.status(400).json({ error: 'Path is required' });
  }

  try {
    const parsedPath = path.parse(dirPath);
    
    // Check if parent directory exists
    let parentExists = false;
    let parentPath = parsedPath.dir;
    
    try {
      parentExists = fs.existsSync(parentPath) && fs.statSync(parentPath).isDirectory();
    } catch (e) {
      parentExists = false;
    }

    // Check if the directory itself exists
    let exists = false;
    let isDirectory = false;
    let writable = false;

    try {
      exists = fs.existsSync(dirPath);
      if (exists) {
        const stats = fs.statSync(dirPath);
        isDirectory = stats.isDirectory();
        // Try to check if writable
        try {
          fs.accessSync(dirPath, fs.constants.W_OK);
          writable = true;
        } catch (e) {
          writable = false;
        }
      } else {
        // If doesn't exist, can we create it?
        writable = parentExists;
      }
    } catch (e) {
      // Path is invalid
    }

    res.json({
      valid: exists ? isDirectory && writable : parentExists,
      exists,
      isDirectory,
      writable,
      parentExists,
      parentPath,
      message: exists 
        ? (isDirectory ? (writable ? 'Directory is valid and writable' : 'Directory exists but is not writable') : 'Path exists but is not a directory')
        : (parentExists ? 'Directory will be created' : 'Parent directory does not exist')
    });
  } catch (error) {
    res.status(400).json({ 
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid path' 
    });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`ImageFap Downloader Web GUI running at http://localhost:${PORT}`);
});
