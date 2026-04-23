<div align="center">
  <img src="images/logo.png" alt="Logo" width="256">

# Home Server Companion

**Your Home Server, One Click Away**

[![Version](https://img.shields.io/badge/version-4.0.0-blue.svg?style=for-the-badge)](https://github.com/JoKerIsCraZy/HomeServerCompanion/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](https://github.com/JoKerIsCraZy/HomeServerCompanion/blob/master/LICENSE)
[![Maintenance](https://img.shields.io/badge/Maintenance%20Status-Actively%20Developed-brightgreen?style=for-the-badge)](https://github.com/JoKerIsCraZy/HomeServerCompanion)

[![Chrome Web Store Version](https://img.shields.io/chrome-web-store/v/legakiehaacgpdkmlebkjcijaiegoeld?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/home-server-companion/legakiehaacgpdkmlebkjcijaiegoeld)
[![Available on Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install_Now-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/home-server-companion/legakiehaacgpdkmlebkjcijaiegoeld)

  <br/>

[![GitHub Stars](https://img.shields.io/github/stars/JoKerIsCraZy/HomeServerCompanion?style=flat&logo=github)](https://github.com/JoKerIsCraZy/HomeServerCompanion/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/JoKerIsCraZy/HomeServerCompanion?style=flat&logo=github)](https://github.com/JoKerIsCraZy/HomeServerCompanion/network/members)
[![Open Issues](https://img.shields.io/github/issues/JoKerIsCraZy/HomeServerCompanion)](https://github.com/JoKerIsCraZy/HomeServerCompanion/issues)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat)](http://makeapullrequest.com)

</div>

---

## ⚡ Quick Start

```
1. Install from Chrome Web Store
2. Complete the setup wizard
3. Click the icon and start managing your server!
```

<div align="center">

|      Shortcut      | Action                               |
| :----------------: | :----------------------------------- |
|      `Ctrl+S`      | Open Unified Search                  |
|      `Ctrl+D`      | Open Docker Container Search         |
|      `Ctrl+A`      | Open NZB Search (Prowlarr)           |
|      `Enter`       | Search Movies & TV Shows (Seerr) |
|        `n:`        | Search NZBs directly via Prowlarr    |
|        `d:`        | Search Docker Containers             |
| `Right-click text` | Context menu search                  |

</div>

---

## 🔍 Unified Search - The Power Feature

The **Unified Search Bar** is your command center. Click the search bar or press `Enter` anywhere to instantly search across your services.

### Search Syntax

|  Prefix  | What it does                     | Example        |
| :------: | :------------------------------- | :------------- |
| _(none)_ | Search Movies & TV via Seerr | `Breaking Bad` |
|   `n:`   | Search NZBs via Prowlarr         | `n:ubuntu iso` |
|   `d:`   | Search Docker Containers         | `d:plex`       |

### 🔥 Prowlarr NZB Search (`n:`)

Search **all your indexers at once** directly from the extension!

- **Category Filter** - Filter by Movies, TV, Audio, Games, etc.
- **Indexer Filter** - Select specific indexers or search all
- **One-Click Grab** - Download NZBs directly from the extension
- **Size & Seeders** - See file details before downloading

```
n:Movie Name 2024      -> Search all indexers for "Movie Name 2024"
n:ubuntu server        -> Find Linux ISOs across your indexers
```

### 🐳 Docker Container Search (`d:`)

Search **all your Docker containers** across Unraid and all Portainer instances!

- **Multi-Server Search** - Search Unraid + all Portainer instances at once
- **Source Labels** - See which server each container is from
- **Quick Actions** - Start, Stop, Restart containers directly
- **WebUI Links** - One-click access to container web interfaces

```
d:plex                 -> Find all "plex" containers across servers
d:sonarr               -> Locate your Sonarr containers
```

---

## ✨ Feature Highlights

<table>
<tr>
<td width="50%" valign="top">

### 🖥️ Fullscreen Mode

Open in a new tab for a **full dashboard experience**:

- Larger cards and grid layouts
- Responsive design for any screen
- Perfect for dedicated monitoring

</td>
<td width="50%" valign="top">

### 🔔 Live Badges

Real-time notifications on sidebar icons:

- Queue item counts
- Download warnings
- Issues requiring attention

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🌐 Context Menu Search

Highlight any text on the web, right-click:

> "Search in Home Server Companion"

Instantly search for movies or TV shows!

</td>
<td width="50%" valign="top">

### 🎨 Dark Theme

Beautiful high-contrast dark UI:

- Easy on the eyes
- Perfect for night use
- Service-specific accent colors

</td>
</tr>
</table>

---

## 📦 Supported Services

<details>
<summary><b>⚙️ Unraid</b> - Complete Server Management</summary>

- **System Dashboard** - Real-time CPU ring, RAM bar, uptime
- **Storage Overview** - Array, Cache, Pools, Boot drives
- **Docker Management** - Start/Stop/Restart with search & sort
- **VM Control** - Manage VMs
- **Quick Links** - Direct access to WebUIs

</details>

<details>
<summary><b>⬇️ SABnzbd</b> - Download Management</summary>

- **Live Queue** - Speed, ETA, progress bars
- **Timed Pause** - 15min, 30min, 1h, 2h, 6h, or indefinite
- **History** - Completed downloads with status
- **Queue Control** - Pause, resume, delete items

</details>

<details>
<summary><b>📺 Sonarr</b> - TV Show Management</summary>

- **Calendar** - Upcoming episodes with air times
- **Queue** - Active downloads with warnings
- **History** - Recently imported, grouped by series
- **Missing** - Find and search for missing episodes
- **Manual Import** - Advanced quality/language selection
- **Badge Alerts** - Visual queue issue notifications

</details>

<details>
<summary><b>🎥 Radarr</b> - Movie Management</summary>

- **Calendar** - Upcoming releases (Digital, Physical, Cinema)
- **Queue** - Monitor downloads with issue detection
- **History** - Recently imported with poster art
- **Missing** - Search for missing movies
- **Manual Import** - Full quality/language control
- **Badge Alerts** - Download warning notifications

</details>

<details>
<summary><b>📊 Tautulli</b> - Plex Monitoring</summary>

- **Active Streams** - Rich metadata with posters
- **IP Geolocation** - Click IPs for location info & maps
- **Kill Stream** - Terminate streams directly
- **Activity Links** - Jump to media in Plex/Tautulli
- **Stream Details** - Quality, bandwidth, transcode info

</details>

<details>
<summary><b>✏️ Seerr</b> - Media Requests</summary>

- **Browse Requests** - Filter by status with accurate media status display
- **TMDB Search** - Find movies & TV shows
- **Trending** - Discover with type filter
- **One-Click Request** - Movies & full TV seasons
- **Approve/Decline** - Manage pending requests
- **Multi-Auth** - API Key, Local Account, or Plex Sign-In
- **Smart Caching** - Instant load times

</details>

<details>
<summary><b>📡 Tracearr</b> - Content Tracking</summary>

- **Live Streams** - Active Plex streams with poster art and progress bars
- **Stream Details** - Video/audio codec, resolution, bandwidth, player info
- **Statistics** - Overview, plays today, watch time, active users, top users
- **Kill Stream** - Terminate streams directly
- **Badge Alerts** - Live stream count in sidebar

</details>

<details>
<summary><b>🔎 Prowlarr</b> - Indexer Management</summary>

- **Indexer Overview** - Real-time status monitoring
- **VIP Timer** - Track subscription expirations
- **Statistics** - Performance metrics & query stats
- **Direct Search** - Search all indexers with filters
- **Favicon Display** - Visual indexer identification

</details>

<details>
<summary><b>🧙 Wizarr</b> - Plex Invitations</summary>

- **Invitation Dashboard** - Active & used invites
- **Create Invites** - Server, libraries, expiration
- **Quick Copy** - One-click invite link copy
- **Management** - Delete unused invitations

</details>

<details>
<summary><b>🐳 Portainer</b> - Docker Container Management</summary>

- **Multi-Instance Support** - Manage multiple Portainer servers
- **Custom Names & Icons** - Personalize each instance
- **Container Overview** - Start/Stop/Restart containers
- **Stack Management** - Control Docker Compose stacks
- **Real-time Status** - Running container counts
- **Per-Instance Tab Memory** - Each instance remembers its view

</details>

---

## 📷 Screenshots

<details open>
<summary><b>Dashboard</b></summary>
<div align="center">
  <img src="images/dashboard.png" alt="Dashboard" width="60%">
</div>
</details>

<details>
<summary><b>Unraid</b></summary>
<div align="center">
  <img src="images/unraid_dashboard.png" alt="Unraid Dashboard" width="45%">
  <img src="images/unraid_storage.png" alt="Unraid Storage" width="45%">
  <img src="images/unraid_docker.png" alt="Unraid Docker" width="45%">
  <img src="images/unraid_vms.png" alt="Unraid VMs" width="45%">
</div>
</details>

<details>
<summary><b>SABnzbd</b></summary>
<div align="center">
  <img src="images/sabnzbd_queue.png" alt="SABnzbd Queue" width="45%">
  <img src="images/sabnzbd_history.png" alt="SABnzbd History" width="45%">
</div>
</details>

<details>
<summary><b>Sonarr & Radarr</b></summary>
<div align="center">
  <img src="images/sonarr_calendar.png" alt="Sonarr Calendar" width="45%">
  <img src="images/radarr_calendar.png" alt="Radarr Calendar" width="45%">
  <img src="images/radarr_queue.png" alt="Queue" width="45%">
  <img src="images/radarr_manual_import.png" alt="Manual Import" width="45%">
  <img src="images/sonarr_missing.png" alt="Missing" width="45%">
  <img src="images/radarr_missing.png" alt="Missing" width="45%">
</div>
</details>

<details>
<summary><b>Tautulli</b></summary>
<div align="center">
  <img src="images/tautulli_activity.png" alt="Tautulli Activity" width="60%">
</div>
</details>

<details>
<summary><b>Seerr</b></summary>
<div align="center">
  <img src="images/seerr_requests.png" alt="Seerr Requests" width="45%">
  <img src="images/seerr_search.png" alt="Seerr Search" width="45%">
  <img src="images/seerr_trending.png" alt="Seerr Trending" width="45%">
</div>
</details>

<details>
<summary><b>Prowlarr</b></summary>
<div align="center">
  <img src="images/prowlarr_indexer.png" alt="Prowlarr Indexer" width="45%">
  <img src="images/prowlarr_search.png" alt="Prowlarr Search" width="45%">
  <img src="images/prowlarr_stats.png" alt="Prowlarr Stats" width="45%">
</div>
</details>

<details>
<summary><b>Wizarr</b></summary>
<div align="center">
  <img src="images/wizarr.png" alt="Wizarr" width="45%">
  <img src="images/wizarr_invite.png" alt="Wizarr Invites" width="45%">
</div>
</details>

<details>
<summary><b>Portainer</b></summary>
<div align="center">
  <img src="images/portainer_containers.png" alt="Portainer Containers" width="45%">
  <img src="images/portainer_stacks.png" alt="Portainer Stacks" width="45%">
</div>
</details>

---

## 🚀 Installation

### Option 1: Chrome Web Store (Recommended)

<div align="center">

[![Install from Chrome Web Store](https://img.shields.io/badge/Install_Now-Chrome_Web_Store-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/home-server-companion/legakiehaacgpdkmlebkjcijaiegoeld)

</div>

### Option 2: Manual Installation (Developers)

1. Clone this repository
2. Go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** -> Select the project folder

---

## 🔧 Configuration

| Service       | Where to find API Key      |
| :------------ | :------------------------- |
| **Unraid**    | Management Access settings |
| **SABnzbd**   | Config -> General -> API   |
| **Sonarr**    | Settings -> General        |
| **Radarr**    | Settings -> General        |
| **Tautulli**  | Settings -> Web Interface  |
| **Tracearr**  | Settings -> API Tokens     |
| **Seerr**     | Settings -> General        |
| **Prowlarr**  | Settings -> General        |
| **Wizarr**    | Settings -> API            |
| **Portainer** | Settings -> Access Tokens  |

> 💡 **Tip**: Include `http://` or `https://` and port if needed (e.g., `http://192.168.1.10:8080`)

---

## ⌨️ Keyboard Shortcuts & Search

| Action           | How                                                                |
| :--------------- | :----------------------------------------------------------------- |
| Open Search      | `Ctrl+S` or click search bar or press `Enter`                      |
| Search Movies/TV | Type and press `Enter`                                             |
| Search NZBs      | Type `n:searchterm`                                                |
| Close Search     | Press `Escape` or click outside                                    |
| Context Menu     | Highlight text -> Right-click -> "Search in Home Server Companion" |

---

## 🛡️ Privacy & Permissions

- **Storage**: Saves your config locally (URLs, API keys, preferences)
- **Host Permissions**: Only requested for servers YOU configure
- **No Analytics**: Zero data sent to external servers
- **Local Only**: Everything stays in your browser

---

## 💻 Tech Stack

|              |                              |
| :----------- | :--------------------------- |
| **Frontend** | HTML5, CSS3, JavaScript ES6  |
| **Platform** | Chrome Extension Manifest V3 |
| **Storage**  | Chrome Sync Storage API      |

---

## 🤝 Contributing

Contributions welcome! Open an issue or submit a PR.

---

<div align="center">

**Built with ❤️ for the HomeLab community**

[![GitHub Stars](https://img.shields.io/github/stars/JoKerIsCraZy/HomeServerCompanion?style=social)](https://github.com/JoKerIsCraZy/HomeServerCompanion/stargazers)

</div>
