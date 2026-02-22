# ImageFap Downloader - Web GUI

This is a web-based graphical user interface for the ImageFap Downloader.

## Features

- **Easy to Use Interface**: Simple web form to paste gallery links and select download folders
- **Real-time Progress Tracking**: Live progress bar and detailed activity log
- **Advanced Options**: Configure download settings including:
  - Overwrite existing files
  - Sequential filenames
  - Full filenames
  - Save gallery metadata (JSON)
  - Save HTML pages
  - Directory structure customization
  - Concurrent download limits
  - Retry settings
- **Live Updates**: WebSocket-based real-time updates of download progress
- **Multiple Downloads**: Track and manage download statistics

## Installation

1. Make sure you have Node.js >= 20.18.1 installed
2. Install dependencies (if not already installed):
   ```bash
   npm install
   ```

## Usage

### Starting the Web Server

Run the following command to start the web server:

```bash
npm run web
```

This will:
1. Build the TypeScript code
2. Start the web server on port 3000 (default)

You should see:
```
ImageFap Downloader Web GUI running at http://localhost:3000
```

### Using the Web Interface

1. Open your browser and navigate to `http://localhost:3000`
2. Enter the ImageFap gallery URL in the "Gallery URL" field
3. Enter or select the local download folder path
4. (Optional) Configure advanced options by expanding the "Advanced Options" section
5. Click "Start Download" to begin
6. Monitor progress in real-time through the progress bar and activity log
7. Use "Cancel" button to abort an ongoing download

### Supported URL Types

The downloader supports various ImageFap URL formats:
- User galleries: `https://www.imagefap.com/profile/{username}/galleries`
- Gallery folders: `https://www.imagefap.com/organizer/{folderId}`
- Individual galleries: `https://www.imagefap.com/pictures/{galleryId}/{galleryName}`
- User favorites: `https://www.imagefap.com/userfavorites.php?userid={userId}`
- Favorites folders: `https://www.imagefap.com/showfavorites.php?userid={userId}&folderid={folderId}`

### Configuration Options

#### Basic Options
- **Gallery URL**: The ImageFap URL to download from (required)
- **Download Folder**: Local path where images will be saved (required)

#### Advanced Options
- **Overwrite existing files**: Replace files if they already exist
- **Sequential filenames**: Prefix filenames with sequence numbers
- **Full filenames**: Fetch complete image titles from individual photo pages
- **Save gallery info (JSON)**: Save gallery metadata as JSON files
- **Save HTML pages**: Save original HTML pages
- **Directory Structure**: Choose which folders to create in the hierarchy
- **Max Concurrent Downloads**: Number of images to download simultaneously (1-50)
- **Max Retries**: Number of retry attempts for failed downloads (0-10)

### Custom Port

To run the server on a different port, set the PORT environment variable:

```bash
PORT=8080 npm run web
```

## Technical Details

### Architecture
- **Backend**: Express.js server with WebSocket support
- **Frontend**: Vanilla JavaScript with modern CSS
- **Real-time Communication**: WebSocket for live progress updates
- **Type Safety**: Written in TypeScript

### API Endpoints

- `POST /api/download` - Start a new download
- `POST /api/download/:id/cancel` - Cancel an active download
- `GET /api/downloads` - List active downloads

### WebSocket Events

- `log` - Log messages from the downloader
- `complete` - Download completed successfully
- `error` - Download error occurred
- `cancelled` - Download was cancelled

## Troubleshooting

### Port Already in Use
If port 3000 is already in use, either:
- Stop the application using port 3000
- Use a different port: `PORT=8080 npm run web`

### Path Selection Not Working
The folder selector uses the browser's file input API. Some browsers may have limitations:
- You can manually type the full path into the "Download Folder" field
- Make sure the path exists and you have write permissions

### WebSocket Connection Issues
If the activity log shows connection errors:
- Check if a firewall is blocking WebSocket connections
- Ensure the server is running and accessible
- Try refreshing the page

## Command Line Interface

The original CLI is still available.

## License

MIT License - Same as the original imagefap-dl project
