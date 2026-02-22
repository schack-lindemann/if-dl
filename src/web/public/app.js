// Global state
let currentDownloadId = null;
let ws = null;
let downloadStats = {
    total: 0,
    downloaded: 0,
    skipped: 0,
    errors: 0
};

// DOM Elements
const galleryUrlInput = document.getElementById('galleryUrl');
const downloadPathInput = document.getElementById('downloadPath');
const browseBtn = document.getElementById('browseBtn');
const startBtn = document.getElementById('startBtn');
const cancelBtn = document.getElementById('cancelBtn');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const logContainer = document.getElementById('logContainer');
const clearLogBtn = document.getElementById('clearLogBtn');

// Connect to WebSocket
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onopen = () => {
        addLog('Connected to server', 'success');
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    ws.onclose = () => {
        addLog('Disconnected from server. Reconnecting...', 'warning');
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        addLog('Connection error', 'error');
    };
}

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'log':
            handleLogMessage(data);
            break;
        case 'complete':
            handleDownloadComplete(data);
            break;
        case 'error':
            handleDownloadError(data);
            break;
        case 'cancelled':
            handleDownloadCancelled(data);
            break;
    }
}

// Handle log messages
function handleLogMessage(data) {
    // Process message array to handle serialized error objects
    let message;
    if (Array.isArray(data.message)) {
        message = data.message.map(m => {
            if (typeof m === 'object' && m !== null && m.type === 'error') {
                // Format error object
                return `${m.name}: ${m.message}${m.stack ? '\n' + m.stack : ''}`;
            }
            return m;
        }).join(' ');
    } else {
        message = data.message;
    }
    
    // Add originator if available
    const fullMessage = data.originator ? `${data.originator}: ${message}` : message;
    addLog(fullMessage, data.level);

    // Parse stats from log messages
    if (typeof message === 'string') {
        if (message.includes('Downloaded "')) {
            downloadStats.downloaded++;
            updateProgress();
        } else if (message.includes('Skipping existing')) {
            downloadStats.skipped++;
            updateProgress();
        } else if (message.includes('Error downloading')) {
            downloadStats.errors++;
            updateProgress();
        } else if (message.includes('Downloading') && message.includes('images')) {
            // Extract total count
            const match = message.match(/Downloading (\d+) images/);
            if (match) {
                downloadStats.total += parseInt(match[1]);
                updateProgress();
            }
        }
    }
}

// Handle download complete
function handleDownloadComplete(data) {
    addLog(data.message, 'success');
    progressBar.style.width = '100%';
    progressBar.textContent = '100%';
    progressText.textContent = 'Download completed successfully!';
    resetDownloadState();
}

// Handle download error
function handleDownloadError(data) {
    addLog(`Error: ${data.message}`, 'error');
    progressText.textContent = 'Download failed';
    resetDownloadState();
}

// Handle download cancelled
function handleDownloadCancelled(data) {
    addLog(data.message, 'warning');
    progressText.textContent = 'Download cancelled';
    resetDownloadState();
}

// Update progress bar
function updateProgress() {
    const processed = downloadStats.downloaded + downloadStats.skipped + downloadStats.errors;
    if (downloadStats.total > 0) {
        const percentage = Math.round((processed / downloadStats.total) * 100);
        progressBar.style.width = percentage + '%';
        progressBar.textContent = percentage + '%';
        progressText.textContent = `Downloaded: ${downloadStats.downloaded} | Skipped: ${downloadStats.skipped} | Errors: ${downloadStats.errors}`;
    } else {
        progressText.textContent = 'Processing...';
    }
}

// Add log entry
function addLog(message, level = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    
    const timestamp = new Date().toLocaleTimeString();
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'timestamp';
    timestampSpan.textContent = `[${timestamp}]`;
    
    const messageSpan = document.createElement('span');
    messageSpan.textContent = ` ${message}`;
    
    entry.appendChild(timestampSpan);
    entry.appendChild(messageSpan);
    logContainer.appendChild(entry);
    
    // Auto-scroll to bottom
    logContainer.scrollTop = logContainer.scrollHeight;
}

// Clear log
clearLogBtn.addEventListener('click', () => {
    logContainer.innerHTML = '';
});

// Global platform info
let platformInfo = null;

// Load default path from server
async function loadDefaultPath() {
    try {
        const response = await fetch('/api/user-home');
        platformInfo = await response.json();
        
        if (!downloadPathInput.value) {
            downloadPathInput.value = platformInfo.defaultPath;
        }
    } catch (error) {
        console.error('Failed to load default path:', error);
        // Fallback to client-side detection
        const isWindows = navigator.platform.toLowerCase().includes('win');
        const userHome = isWindows ? 'C:\\Users\\YourUsername' : (navigator.platform.toLowerCase().includes('mac') ? '/Users/YourUsername' : '/home/YourUsername');
        const separator = isWindows ? '\\' : '/';
        downloadPathInput.value = `${userHome}${separator}Downloads${separator}imagefap`;
    }
}

// Validate path with server
async function validatePath(dirPath) {
    try {
        const response = await fetch('/api/validate-path', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dirPath })
        });
        return await response.json();
    } catch (error) {
        return { valid: false, error: 'Failed to validate path' };
    }
}

// Show path validation status
function showPathStatus(validation) {
    const existingStatus = document.querySelector('.path-status');
    if (existingStatus) existingStatus.remove();
    
    const statusDiv = document.createElement('div');
    statusDiv.className = `path-status ${validation.valid ? 'valid' : 'invalid'}`;
    statusDiv.textContent = `${validation.valid ? '✓' : '✗'} ${validation.message}`;
    statusDiv.style.cssText = `
        margin-top: 5px;
        padding: 8px;
        border-radius: 4px;
        font-size: 14px;
        background: ${validation.valid ? '#d4edda' : '#f8d7da'};
        color: ${validation.valid ? '#155724' : '#721c24'};
        border: 1px solid ${validation.valid ? '#c3e6cb' : '#f5c6cb'};
    `;
    
    downloadPathInput.parentElement.parentElement.appendChild(statusDiv);
}

// Browse for folder - enhanced with validation
browseBtn.addEventListener('click', async () => {
    const currentPath = downloadPathInput.value.trim();
    const defaultPath = currentPath || (platformInfo ? platformInfo.defaultPath : '');
    
    const examples = platformInfo ? (
        platformInfo.platform === 'darwin' ? `• macOS: ${platformInfo.homeDir}/Downloads/imagefap` :
        platformInfo.platform === 'win32' ? `• Windows: ${platformInfo.homeDir}\\Downloads\\imagefap` :
        `• Linux: ${platformInfo.homeDir}/Downloads/imagefap`
    ) : '• /Users/yourusername/Downloads/imagefap\n• C:\\Users\\yourusername\\Downloads\\imagefap';
    
    const userPath = prompt(
        'Enter the FULL path to the download folder:\n\n' +
        'Examples:\n' +
        examples + '\n\n' +
        'Important: The path must be absolute (complete from root), not relative!',
        defaultPath
    );
    
    if (userPath && userPath.trim()) {
        const newPath = userPath.trim();
        downloadPathInput.value = newPath;
        
        // Validate the path
        addLog('Validating path...', 'info');
        const validation = await validatePath(newPath);
        showPathStatus(validation);
        
        if (validation.valid) {
            addLog(`Path validated: ${validation.message}`, 'success');
        } else {
            addLog(`Path validation failed: ${validation.message}`, 'error');
        }
    }
});

// Add real-time validation on blur
downloadPathInput.addEventListener('blur', async () => {
    const dirPath = downloadPathInput.value.trim();
    if (dirPath) {
        const validation = await validatePath(dirPath);
        showPathStatus(validation);
    }
});

// Start download
startBtn.addEventListener('click', async () => {
    const url = galleryUrlInput.value.trim();
    const outDir = downloadPathInput.value.trim();

    if (!url || !outDir) {
        alert('Please fill in both the gallery URL and download folder');
        return;
    }

    // Validate URL format
    try {
        new URL(url);
    } catch (error) {
        alert('Please enter a valid URL');
        return;
    }

    // Validate path with server
    addLog('Validating download path...', 'info');
    const validation = await validatePath(outDir);
    
    if (!validation.valid) {
        alert(
            `Invalid download path!\n\n` +
            `Problem: ${validation.message}\n\n` +
            `Please click the pencil button (✏️) to enter a valid absolute path.`
        );
        showPathStatus(validation);
        return;
    }
    
    showPathStatus(validation);

    // Collect options
    const options = {
        overwrite: document.getElementById('overwrite').checked,
        seqFilenames: document.getElementById('seqFilenames').checked,
        fullFilenames: document.getElementById('fullFilenames').checked,
        saveJSON: document.getElementById('saveJSON').checked,
        saveHTML: document.getElementById('saveHTML').checked,
        dirStructure: {
            user: document.getElementById('dirUser').checked,
            favorites: document.getElementById('dirFavorites').checked,
            folder: document.getElementById('dirFolder').checked,
            gallery: document.getElementById('dirGallery').checked
        },
        request: {
            maxConcurrent: parseInt(document.getElementById('maxConcurrent').value),
            maxRetries: parseInt(document.getElementById('maxRetries').value),
            minTime: {
                page: 200,
                image: 200
            }
        }
    };

    try {
        startBtn.disabled = true;
        cancelBtn.disabled = false;
        progressBar.style.width = '0%';
        progressBar.textContent = '';
        progressText.textContent = 'Starting download...';
        downloadStats = { total: 0, downloaded: 0, skipped: 0, errors: 0 };

        const response = await fetch('/api/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url, outDir, options })
        });

        const data = await response.json();

        if (response.ok) {
            currentDownloadId = data.downloadId;
            addLog(data.message, 'success');
        } else {
            throw new Error(data.error || 'Failed to start download');
        }
    } catch (error) {
        addLog(`Error: ${error.message}`, 'error');
        resetDownloadState();
    }
});

// Cancel download
cancelBtn.addEventListener('click', async () => {
    if (!currentDownloadId) return;

    try {
        const response = await fetch(`/api/download/${currentDownloadId}/cancel`, {
            method: 'POST'
        });

        const data = await response.json();
        if (response.ok) {
            addLog('Cancelling download...', 'warning');
        } else {
            throw new Error(data.error || 'Failed to cancel download');
        }
    } catch (error) {
        addLog(`Error: ${error.message}`, 'error');
    }
});

// Reset download state
function resetDownloadState() {
    currentDownloadId = null;
    startBtn.disabled = false;
    cancelBtn.disabled = true;
}

// Initialize
connectWebSocket();
loadDefaultPath().then(() => {
    addLog('ImageFap Downloader Web GUI ready', 'info');
});
