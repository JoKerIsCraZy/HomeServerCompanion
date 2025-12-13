# Home Server Companion - Chrome Extension

A sleek, modern dashboard for managing your Home Server services directly from your browser toolbar.

## Features

- **SABnzbd**: Monitor download queue, history, pause/resume, and delete items.
- **Sonarr / Radarr**: View upcoming calendar, recent history, and queue.
- **Tautulli**: See active Plex streams with rich metadata and "Kill Stream" capability.
- **Unraid**: Real-time system stats (CPU, RAM bars), array capacity, and Docker container management (Start/Stop/Restart).
- **Direct Links**: Quickly open the web interface for any active service.
- **Dark Mode**: Fully supported dark/light themes.

## Installation

Since this extension is not yet in the Chrome Web Store, you must install it manually ("Load Unpacked").

1.  **Download** this folder to your computer.
2.  Open Chrome and go to `chrome://extensions`.
3.  Enable **Developer mode** (toggle in the top-right corner).
4.  Click **Load unpacked**.
5.  Select the folder containing this `manifest.json`.
6.  The extension icon (Home Server) will appear in your toolbar.

## Configuration

1.  Right-click the extension icon and select **Options** (or click the ⚙️ icon in the extension sidebar).
2.  Enter the **URL** (including http/https and port) and **API Key** for each service you use.
3.  Click **Save**.

### Unraid Configuration

- **URL**: Your Unraid dashboard URL (e.g., `http://192.168.1.100`).
- **API Key**: Derived from the "Unraid API" or "My Servers" plugin if applicable, or custom setup.

## Screenshots

_(Add your screenshots here)_

---

_Built with ❤️ for Home Server Enthusiasts._
