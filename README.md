<div align="center">
  <img src="images/logo.png" alt="Logo" width="256">
</div>

# Home Server Companion

[![Version](https://img.shields.io/badge/version-2.2-blue.svg?style=for-the-badge)](https://github.com/JoKerIsCraZy/HomeServerCompanion/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](https://github.com/JoKerIsCraZy/HomeServerCompanion/blob/master/LICENSE)
[![Maintenance](https://img.shields.io/badge/Maintenance%20Status-Actively%20Developed-brightgreen?style=for-the-badge)](https://github.com/JoKerIsCraZy/HomeServerCompanion)

[![Available on Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install_Now-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/home-server-companion/legakiehaacgpdkmlebkjcijaiegoeld)
[![Browser Support](https://img.shields.io/badge/Supports-Chrome-critical?style=for-the-badge&logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/home-server-companion/legakiehaacgpdkmlebkjcijaiegoeld)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/)
[![Built With](https://img.shields.io/badge/Built%20With-JavaScript-F7DF1E?logo=javascript&logoColor=black&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)

---

[![GitHub Stars](https://img.shields.io/github/stars/JoKerIsCraZy/HomeServerCompanion?style=flat&logo=github)](https://github.com/JoKerIsCraZy/HomeServerCompanion/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/JoKerIsCraZy/HomeServerCompanion?style=flat&logo=github)](https://github.com/JoKerIsCraZy/HomeServerCompanion/network/members)
[![Open Issues](https://img.shields.io/github/issues/JoKerIsCraZy/HomeServerCompanion)](https://github.com/JoKerIsCraZy/HomeServerCompanion/issues)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat)](http://makeapullrequest.com)

---

**Home Server Companion** is a powerful, modern Chrome Extension designed to bring your home server directly to your browser's toolbar. Manage downloads, monitor streams, check requests, and control your server status with a sleek, unified interface.

## ✨ Features

A comprehensive dashboard for your self-hosted services:

- **📦 SABnzbd**:
    - Monitor real-time download queue and speed.
    - Pause/Resume the entire queue or delete individual items.
    - View download history.
- **📺 Sonarr & Radarr**:
    - **Calendar**: View upcoming episodes and movie releases.
    - **Queue**: Track active downloads.
    - **History**: See recently imported media.
    - **Quick Links**: Jump directly to series/movie pages.
- **🎬 Tautulli**:
    - View active Plex streams with user and playback details.
    - **Kill Stream**: Terminate active streams directly from the popup.
- **✍️ Overseerr**:
    - **Browse Requests**: View pending and approved media requests.
    - **Search**: Search for new content to request directly.
    - **Details**: View detailed metadata for requested media.
- **⚙️ Unraid**:
    - **System Stats**: Real-time CPU and RAM usage monitoring.
    - **Array Status**: Check array capacity and health.
    - **Docker Management**: Start, Stop, or Restart containers instantaneously.
- **🌈 General**:
    - **Dark/Light Mode**: Matches your system preference or custom toggle.
    - **Customizable Order**: Reorder services in the sidebar to fit your workflow.
    - **Direct Links**: One-click access to all your service Web UIs.

## 📸 Screenshots

<div align="center">
  <img src="images/screenshot_1.png" alt="Dashboard View" width="750">
  <img src="images/screenshot_2.png" alt="Requests View" width="750">
  <img src="images/screenshot_3.png" alt="Settings View" width="750">
</div>

## 🚀 Installation

**Home Server Companion** is officially available on the **Chrome Web Store**!

### Option 1: Install via the Chrome Web Store (Recommended)

1.  Visit the extension page on the **Chrome Web Store**:
    * [https://chromewebstore.google.com/detail/home-server-companion/legakiehaacgpdkmlebkjcijaiegoeld](https://chromewebstore.google.com/detail/home-server-companion/legakiehaacgpdkmlebkjcijaiegoeld)
2.  Click **Add to Chrome** and confirm the installation.
3.  The **Home Server Companion** icon will appear in your toolbar. Pin it for easy access!

### Option 2: Manual Installation (For Developers)

If you wish to test the latest development version or contribute changes:

1.  **Download** the latest release or clone this repository to a folder on your computer.
2.  Open Google Chrome and navigate to `chrome://extensions`.
3.  Enable **Developer mode** by toggling the switch in the top-right corner.
4.  Click the **Load unpacked** button that appears.
5.  Select the **root folder** of this project (the folder containing `manifest.json`).

## ⚙️ Configuration

Once installed, you need to connect your services.

1.  Right-click the extension icon and select **Options**.
2.  Navigate through the tabs to configure each service you use.

| Service       | Setting       | Description                                                                            |
| :------------ | :------------ | :------------------------------------------------------------------------------------- |
| **General**   | Service Order | Drag and drop (or use arrows) to reorder the sidebar. The top item opens by default.   |
| **SABnzbd**   | URL & API Key | Found in Config -> General / API.                                                      |
| **Sonarr**    | URL & API Key | Found in Settings -> General.                                                          |
| **Radarr**    | URL & API Key | Found in Settings -> General.                                                          |
| **Tautulli**  | URL & API Key | Found in Settings -> Web Interface.                                                    |
| **Overseerr** | URL & API Key | Found in Settings -> General.                                                          |
| **Unraid**    | URL           | IP Address or Hostname (e.g., `http://192.168.1.10`).                                  |
|               | API Key       | Required for advanced control. Generate via "Management Access" settings if available. |

> **Note**: Ensure your URLs include the protocol (`http://` or `https://`) and port if non-standard (e.g., `:8080`).

## 🛠️ Usage

- **Click** the extension icon to open the dashboard.
- **Sidebar**: Switch between services.
- **Sub-tabs**: Within services like Sonarr/Radarr (Calendar/Queue) or Unraid (Stats/Docker), use the top tabs to switch views.
- **Theme**: Toggle between Light and Dark mode using the sun/moon icon.
- **Settings**: Click the gear icon to return to the configuration page.

## Permissions & Privacy

We value your privacy and only request permissions necessary for core functionality:

- **Storage (`storage`)**: Used exclusively to save your configuration (Server URLs, API Keys, View Preferences) locally within your browser profile via the Chrome Sync API. No data is ever sent to external servers or analytics.
- **Optional Host Permissions (`optional_host_permissions`)**: This extension uses *optional host permissions* to communicate with your self-hosted instances (SABnzbd, Sonarr, etc.). **Permission is only requested when you attempt to connect a specific server URL in the extension options.** Since your servers can be on any local IP address or custom domain, we require this dynamic permission to fetch data from the specific URLs you configure. **We do not access any other websites.**

## 💻 Tech Stack

- **Frontend**: HTML5, CSS3 (Custom Variables), JavaScript (ES6 Modules).
- **Platform**: Chrome Extension Manifest V3.
- **Storage**: Chrome Sync Storage API for settings persistence.

## 🤝 Contributing

Contributions are welcome! If you have a feature request or bug report, please open an issue or submit a pull request.

---

_Built with ❤️ for the HomeLab community._
