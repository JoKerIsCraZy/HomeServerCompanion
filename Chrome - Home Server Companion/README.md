# Home Server Companion - Chrome

This is the original Chrome version of the Home Server Companion extension.

### Install via the Chrome Web Store (Recommended)

1.  Visit the extension page on the **Chrome Web Store**:
    - [https://chromewebstore.google.com/detail/home-server-companion/legakiehaacgpdkmlebkjcijaiegoeld](https://chromewebstore.google.com/detail/home-server-companion/legakiehaacgpdkmlebkjcijaiegoeld)
2.  Click **Add to Chrome** and confirm the installation.
3.  The **Home Server Companion** icon will appear in your toolbar. Pin it for easy access!

## Installation (Developer Mode)

1.  Open Google Chrome and navigate to `chrome://extensions`.
2.  Enable **Developer mode** by toggling the switch in the top-right corner.
3.  Click the **Load unpacked** button that appears.
4.  Navigate to this directory (`Chrome`) and select it.
5.  The **Home Server Companion** icon will appear in your toolbar.

## Development

- This version uses Manifest V3.

### New in v3.4

- **Dashboard & UI**: Brand new Dashboard view for a quick overview and a completely refactored, tab-based Settings page.
- **Unified Search**: Centralized search bar (Omnibox) to quickly find content across services.
- **Performance**: Significant improvements in API query handling and load times.
- **Wizarr Integration**: Create and manage invites directly from the extension.
- **Tautulli Enhancements**: IP Geolocation lookup, country flags, and performance optimizations.
- **Service Enhancements**:
  - **Sonarr & Radarr**:
    - **Live Badges**: Real-time count of items in Queue and History (for SABnzbd/Sonarr/Radarr).
    - **Manual Import**: Resolve "Manual Import Needed" warnings directly from the extension. Select specific files, qualities, and languages via an interactive dialog.
    - **Queue Management**: Remove items, blocklist releases, and view detailed progress/status.
    - **Missing Content**: Dedicated tab to view and search for missing episodes or movies.
  - **Tautulli**:
    - **IP Geolocation**: Click on any IP address in "Active Streams" to view detailed info (Country, City, ISP, ASN) and an interactive map.
    - **Stream Management**: Terminate active streams directly from the popup.
    - **Activity Links**: Click titles/posters to jump directly to the media page.
  - **SABnzbd**: Live badges for file counts.
- **Security**: Reinforced Content Security Policy (CSP) and safer DOM handling.
