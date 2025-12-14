<div align="center">
  <img src="icons/logo.png" alt="Logo" width="128">
</div>

# Home Server Companion

![Version](https://img.shields.io/badge/version-1.9-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Chrome](https://img.shields.io/badge/platform-Chrome_Extension-red.svg)

**Home Server Companion** is a powerful, modern Chrome Extension designed to bring your home server directly to your browser's toolbar. Manage downloads, monitor streams, check requests, and control your server status with a sleek, unified interface.

## ✨ Features

A comprehensive dashboard for your self-hosted services:

- **SABnzbd**:
  - Monitor real-time download queue and speed.
  - Pause/Resume the entire queue or delete individual items.
  - View download history.
- **Sonarr & Radarr**:
  - **Calendar**: View upcoming episodes and movie releases.
  - **Queue**: Track active downloads.
  - **History**: See recently imported media.
  - **Quick Links**: Jump directly to series/movie pages.
- **Tautulli**:
  - View active Plex streams with user and playback details.
  - **Kill Stream**: Terminate active streams directly from the popup.
- **Overseerr**:
  - **Browse Requests**: View pending and approved media requests.
  - **Search**: Search for new content to request directly.
  - **Details**: View detailed metadata for requested media.
- **Unraid**:
  - **System Stats**: Real-time CPU and RAM usage monitoring.
  - **Array Status**: Check array capacity and health.
  - **Docker Management**: Start, Stop, or Restart containers instantaneously.
- **General**:
  - **Dark/Light Mode**: Matches your system preference or custom toggle.
  - **Customizable Order**: Reorder services in the sidebar to fit your workflow.
  - **Direct Links**: One-click access to all your service Web UIs.

## 🚀 Installation

As this extension is currently in active development, it is installed via Chrome's "Developer Mode".

1.  **Download** the latest release or clone this repository to a folder on your computer.
2.  Open Google Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer mode** by toggling the switch in the top-right corner.
4.  Click the **Load unpacked** button that appears.
5.  Select the **root folder** of this project (the folder containing `manifest.json`).
6.  The **Home Server Companion** icon will appear in your toolbar. Pin it for easy access!

## ⚙️ Configuration

Once installed, you need to connect your services.

1.  Right-click the extension icon and select **Options**.
2.  Navigate through the tabs to configure each service you use.

| Service       | Setting       | Description                                                                            |
| :------------ | :------------ | :------------------------------------------------------------------------------------- |
| **General**   | Service Order | Drag and drop (or use arrows) to reorder the sidebar. The top item opens by default.   |
| **SABnzbd**   | URL & API Key | Found in Config -> General / API.                                                      |
| **Sonarr**    | URL & API Key | Found in Settings -> General.                                                          |
| **Radarr**    | URL & API Key | Found in Settings -> General.                                                          |
| **Tautulli**  | URL & API Key | Found in Settings -> Web Interface.                                                    |
| **Overseerr** | URL & API Key | Found in Settings -> General.                                                          |
| **Unraid**    | URL           | IP Address or Hostname (e.g., `http://192.168.1.10`).                                  |
|               | API Key       | Required for advanced control. Generate via "Management Access" settings if available. |

> **Note**: Ensure your URLs include the protocol (`http://` or `https://`) and port if non-standard (e.g., `:8080`).

## 🛠️ Usage

- **Click** the extension icon to open the dashboard.
- **Sidebar**: Switch between services.
- **Sub-tabs**: Within services like Sonarr/Radarr (Calendar/Queue) or Unraid (Stats/Docker), use the top tabs to switch views.
- **Theme**: Toggle between Light and Dark mode using the sun/moon icon.
- **Settings**: Click the gear icon to return to the configuration page.

## � Permissions & Privacy

We value your privacy and only request permissions necessary for core functionality:

- **Storage (`storage`)**: Used exclusively to save your configuration (Server URLs, API Keys, View Preferences) locally within your browser profile via the Chrome Sync API. No data is ever sent to external servers or analytics.
- **Host Permissions (`<all_urls>`)**: Required to communicate with your self-hosted instances. Since your server can be hosted on any local IP (e.g., `192.168.x.x`) or custom domain that is unknown to the extension beforehand, we require dynamic permission to fetch data from the specific URLs you configure.

## �💻 Tech Stack

- **Frontend**: HTML5, CSS3 (Custom Variables), JavaScript (ES6 Modules).
- **Platform**: Chrome Extension Manifest V3.
- **Storage**: Chrome Sync Storage API for settings persistence.

## 🤝 Contributing

Contributions are welcome! If you have a feature request or bug report, please open an issue or submit a pull request.

---

_Built with ❤️ for the HomeLab community._
