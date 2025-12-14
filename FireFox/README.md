# Home Server Companion - Firefox

This is the Firefox version of the Home Server Companion extension.

## Installation (Temporary / Debug)

1.  Open Firefox and type `about:debugging` in the address bar.
2.  Click on **This Firefox** in the sidebar.
3.  Click **Load Temporary Add-on...**.
4.  Navigate to this directory (`FireFox`) and select the `manifest.json` file.
5.  The extension is now installed temporarily.

## Development

- This version is ported from the Chrome Extension.
- It uses Manifest V3.
- The ID set in `manifest.json` under `browser_specific_settings` is a placeholder. If you publish this to AMO (addons.mozilla.org), you may need to adjust it or let AMO sign it.
