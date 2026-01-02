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

### New in v3.6

- **Settings Rework**: Completely redesigned Options/Settings page with modern glassmorphism UI
- **UI Improvements**: Various small UI fixes and visual enhancements throughout the extension

### v3.5

- **Ctrl+S Shortcut**: Press `Ctrl+S` anywhere to instantly open the Unified Search with focus ready for typing
- **Fullscreen Mode Overhaul**: Comprehensive redesign for fullscreen/tab mode
  - Larger sidebar with bigger icons (80px width, 36px icons)
  - Grid layouts for all services (SABnzbd, Sonarr, Radarr, Tautulli, Unraid, Prowlarr, Overseerr, Wizarr)
  - Responsive breakpoints for different screen sizes
- **Service-Specific Fullscreen Improvements**:
  - **Prowlarr**: Larger indexer cards (350px min), bigger text, enhanced search elements
  - **Search Modal**: Wider modal (800px), larger inputs and results
  - **Unraid**: Larger system stats, CPU ring (80px), storage elements enhanced
  - **Wizarr**: 2-column layout, larger invitations, wider modal (600px)
- **Unified Search**: Centralized search bar (Omnibox) to quickly find content across services.
- **Code Quality**: Network timeout wrapper, XSS fix, shared HTTP utility, CSS consolidation
- **Accessibility**: Added ARIA labels throughout the extension
- **Performance**: Targeted DOM updates, staggered refresh intervals, badge error handling
