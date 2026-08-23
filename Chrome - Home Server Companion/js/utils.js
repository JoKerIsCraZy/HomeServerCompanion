/**
 * Utility functions for Home Server Companion
 */

// Populates globalThis.hscChangelogEntries. Imported for the side effect so
// that the options page, which is a classic script, can share the one list.
import './core/changelogEntries.js';

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Use this when inserting untrusted data into HTML context via innerHTML.
 *
 * Quotes are escaped too: callers interpolate into attribute values
 * (`title="${escapeHtml(x)}"`), and the previous textContent round-trip left
 * `"` and `'` intact, which let a value break out of its attribute.
 *
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string safe for HTML text and attribute context
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Validates a URL is safe for chrome.tabs.create()
 * @param {string} urlString - URL to validate
 * @returns {boolean} - True if safe (http:// or https://), false otherwise
 */
export function validateUrl(urlString) {
    if (!urlString || typeof urlString !== 'string') {
        return false;
    }
    try {
        const url = new URL(urlString);
        // Allow http, https, plex (Plex deep links), and chrome-extension (own runtime URLs)
        return ['http:', 'https:', 'plex:', 'chrome-extension:'].includes(url.protocol);
    } catch (e) {
        return false;
    }
}

/**
 * Checks whether a host looks like it belongs to a private/local network.
 * Used to give `chrome.tabs.create()` links that come from service responses
 * an extra sanity check — a compromised Sonarr/Radarr/Unraid instance
 * shouldn't be able to redirect the user to arbitrary public sites without
 * the user seeing it first.
 * @param {string} hostname
 * @returns {boolean}
 */
export function isLocalHost(hostname) {
    if (!hostname) return false;
    // URL.hostname wraps IPv6 literals in brackets — strip them before matching.
    const host = String(hostname).toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
    if (host === 'localhost' || host === '::1') return true;

    // Private IPv4 ranges. The host must be a well-formed IPv4 literal before
    // any numeric range applies: matching `10.`/`192.168.` as a string prefix
    // would classify registrable names like `192.168.evil.com` as private and
    // open them without the confirmation prompt.
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (v4) {
        const octets = v4.slice(1).map(Number);
        if (octets.some(o => o > 255)) return false;
        const [a, b] = octets;
        if (a === 127) return true;                        // loopback
        if (a === 10) return true;                         // RFC1918
        if (a === 192 && b === 168) return true;           // RFC1918
        if (a === 172 && b >= 16 && b <= 31) return true;  // RFC1918
        if (a === 169 && b === 254) return true;           // link-local
        return false;
    }

    // IPv6 unique-local / link-local — only for actual IPv6 literals.
    if (host.includes(':')) {
        return /^(fc|fd)[0-9a-f]{2}:/.test(host) || /^fe80:/.test(host);
    }

    // Home-network suffixes. None of these TLDs are publicly registrable, but
    // the name is still held to a single label before the suffix so it cannot
    // be a subdomain of something else.
    return /^[a-z0-9-]+\.(local|home|lan|internal|intranet)$/.test(host);
}

/**
 * Returns true if the candidate URL is trusted for silent navigation.
 * A URL is trusted when it is local/private, OR its host matches the host
 * of one of the user-configured trusted base URLs (their own home servers).
 * Everything else — e.g. a `webUiUrl` label pointing to `evil.com` pushed
 * by a compromised container — must go through a user-visible confirmation.
 *
 * @param {string} candidateUrl - URL we're about to open
 * @param {string[]} trustedBaseUrls - Configured service URLs (radarrUrl, unraidUrl, …)
 * @returns {boolean}
 */
export function isTrustedNavigationUrl(candidateUrl, trustedBaseUrls = []) {
    if (!validateUrl(candidateUrl)) return false;
    try {
        const u = new URL(candidateUrl);
        // Extension's own pages, Plex deep links — always trusted
        if (u.protocol === 'chrome-extension:' || u.protocol === 'plex:') return true;
        if (isLocalHost(u.hostname)) return true;
        for (const base of trustedBaseUrls) {
            if (!base) continue;
            try {
                const b = new URL(base);
                if (b.hostname === u.hostname) return true;
            } catch { /* ignore malformed base */ }
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Collects every configured service URL from the app state so callers can
 * build a trusted-host list without knowing every service key by name.
 * @param {object} configs - The Chrome-synced configs object
 * @returns {string[]}
 */
export function collectTrustedBaseUrls(configs = {}) {
    const urls = [];
    const keys = Object.keys(configs);
    for (const k of keys) {
        if (typeof configs[k] === 'string' && /Url$/.test(k) && configs[k]) {
            urls.push(configs[k]);
        }
    }
    // Portainer multi-instance
    if (Array.isArray(configs.portainerInstances)) {
        for (const inst of configs.portainerInstances) {
            if (inst?.url) urls.push(inst.url);
        }
    }
    return urls;
}

/**
 * Safe open-in-new-tab wrapper. Opens the URL directly if it is trusted,
 * otherwise prompts the user to confirm the external navigation.
 * @param {string} candidateUrl
 * @param {object} configs - App configs (used to derive trusted hosts)
 * @param {string} [source] - Optional origin label shown in the prompt
 */
export async function openUrlSafely(candidateUrl, configs = {}, source = '') {
    if (!validateUrl(candidateUrl)) return false;
    const trusted = collectTrustedBaseUrls(configs);
    if (isTrustedNavigationUrl(candidateUrl, trusted)) {
        chrome.tabs.create({ url: candidateUrl });
        return true;
    }
    let host = '';
    try { host = new URL(candidateUrl).hostname; } catch { /* ignore */ }
    const origin = source ? ` (from ${source})` : '';
    // In-page modal rather than window.confirm(): a native dialog makes the
    // extension popup lose focus and close, so the prompt is never seen and
    // the click looks like it did nothing.
    const ok = await showConfirmModal(
        'Open external link?',
        `This link${origin} points to ${host}, which is not one of your configured servers. Open it anyway?`,
        'Open',
        '#2196f3'
    );
    if (ok) chrome.tabs.create({ url: candidateUrl });
    return ok;
}

/**
 * Shows a global notification toast
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', 'info'
 * @param {number} duration - Duration in ms (default 3000)
 */
export function showNotification(message, type = 'info', duration = 3000) {
    // Check if container exists, if not create it
    let container = document.getElementById('global-notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'global-notification-container';
        document.body.appendChild(container);
    }

    // Create notification element
    const notification = document.createElement('div');
    
    // Check if type is a color code
    if (type.startsWith('#') || type.startsWith('rgb')) {
        notification.className = 'global-notification'; // base class only
        notification.style.background = type;
    } else {
        notification.className = `global-notification ${type}`;
    }
    
    notification.textContent = message;
    
    container.appendChild(notification);
    
    // Animation via class
    requestAnimationFrame(() => {
        notification.classList.add('show');
    });
    

    setTimeout(() => {
        notification.classList.remove('show');
        notification.addEventListener('transitionend', () => {
            notification.remove();
        });
    }, duration);
}

/**
 * Shows a custom confirmation modal
 * @param {string} title - Title
 * @param {string} message - Message
 * @param {string} confirmText - Text for confirm button
 * @param {string} confirmColor - Color class/code for confirm button (default: '#f44336' red)
 * @returns {Promise<boolean>} - Resolves true if confirmed, false if cancelled
 */
/**
 * Shows a custom confirmation modal
 * @param {string} title - Title
 * @param {string} message - Message
 * @param {string} confirmText - Text for confirm button
 * @param {string} confirmColor - Color class/code for confirm button (default: '#f44336' red)
 * @returns {Promise<boolean>} - Resolves true if confirmed, false if cancelled
 */
export function showConfirmModal(title, message, confirmText = 'Confirm', confirmColor = '#f44336') {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'custom-modal-backdrop';
        
        const content = document.createElement('div');
        content.className = 'custom-modal';
        
        const header = document.createElement('div');
        header.className = 'custom-modal-header';
        header.textContent = title;
        
        const body = document.createElement('div');
        body.className = 'custom-modal-body';
        body.textContent = message; // Safe: textContent handles escaping
        
        const footer = document.createElement('div');
        footer.className = 'custom-modal-footer';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'modal-btn cancel';
        cancelBtn.textContent = 'Cancel';
        
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'modal-btn confirm';
        confirmBtn.style.backgroundColor = confirmColor;
        confirmBtn.textContent = confirmText;
        
        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);
        
        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        modal.appendChild(content);
        
        document.body.appendChild(modal);

        // Animation
        requestAnimationFrame(() => modal.classList.add('show'));

        const cleanup = (result) => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 200);
            resolve(result);
        };

        cancelBtn.addEventListener('click', () => cleanup(false));
        confirmBtn.addEventListener('click', () => cleanup(true));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cleanup(false);
        });
        
        // Enter/Escape keys
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                window.removeEventListener('keydown', keyHandler);
                cleanup(false);
            } else if (e.key === 'Enter') {
                window.removeEventListener('keydown', keyHandler);
                cleanup(true);
            }
        };
        window.addEventListener('keydown', keyHandler);
    });
}

/**
 * Shows a custom prompt modal
 * @param {string} title - Title
 * @param {string} message - Message/Label
 * @param {string} defaultValue - Default input value
 * @param {string} confirmColor - Confirm button color
 * @returns {Promise<string|null>} - Resolves with input value or null if cancelled
 */
export function showPromptModal(title, message, defaultValue = '', confirmColor = '#ff9800') {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'custom-modal-backdrop';
        
        const content = document.createElement('div');
        content.className = 'custom-modal';
        
        const header = document.createElement('div');
        header.className = 'custom-modal-header';
        header.textContent = title;
        
        const body = document.createElement('div');
        body.className = 'custom-modal-body';
        
        const label = document.createElement('label');
        label.className = 'modal-label';
        label.textContent = message;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'modal-input';
        input.value = defaultValue;
        
        body.appendChild(label);
        body.appendChild(input);
        
        const footer = document.createElement('div');
        footer.className = 'custom-modal-footer';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'modal-btn cancel';
        cancelBtn.textContent = 'Cancel';
        
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'modal-btn confirm';
        confirmBtn.style.backgroundColor = confirmColor;
        confirmBtn.textContent = 'OK';
        
        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);
        
        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        modal.appendChild(content);
        
        document.body.appendChild(modal);

        requestAnimationFrame(() => {
            modal.classList.add('show');
            input.focus();
            input.select();
        });

        const cleanup = (result) => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 200);
            resolve(result);
        };

        cancelBtn.addEventListener('click', () => cleanup(null));
        confirmBtn.addEventListener('click', () => cleanup(input.value));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) cleanup(null);
        });

        // Enter/Escape keys
        const keyHandler = (e) => {
            if (e.key === 'Escape') {
                window.removeEventListener('keydown', keyHandler);
                cleanup(null);
            } else if (e.key === 'Enter') {
                window.removeEventListener('keydown', keyHandler);
                cleanup(input.value);
            }
        };
        window.addEventListener('keydown', keyHandler);
    });
}


/**
 * Checks if version changed and shows changelog
 */
/**
 * Shows IP geolocation info in a modal
 * @param {string} ip - IP address to lookup
 */
const MAP_TILE_SIZE = 256;

/**
 * Projects a coordinate into global pixel space at a zoom level (Web Mercator),
 * the space OpenStreetMap's raster tiles are cut from.
 * @param {number} lat
 * @param {number} lon
 * @param {number} zoom
 * @returns {{x: number, y: number}} Pixel position on the whole-world canvas
 */
function latLonToWorldPixel(lat, lon, zoom) {
    const scale = MAP_TILE_SIZE * Math.pow(2, zoom);
    const sinLat = Math.sin(lat * Math.PI / 180);
    return {
        x: (lon + 180) / 360 * scale,
        y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
    };
}

/**
 * Builds a static map as a grid of OpenStreetMap raster tiles.
 *
 * An <iframe> embed cannot be used: the extension CSP sets `frame-src 'none'`,
 * so Chrome replaces it with a "content blocked" placeholder. Images are not
 * restricted, so the tiles are fetched and positioned by hand instead, which
 * keeps the CSP untouched.
 *
 * The layer is a fixed 3x3 grid anchored with `left/top: 50%` and shifted by
 * the point's offset inside it, so the coordinate lands dead centre without
 * the container's width ever being measured.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {number} [zoom=12]
 * @returns {HTMLElement} The tile layer
 */
function buildStaticMap(lat, lon, zoom = 12) {
    const layer = document.createElement('div');
    layer.className = 'ip-map-tiles';

    const world = latLonToWorldPixel(lat, lon, zoom);
    const tileCount = Math.pow(2, zoom);
    const centreTileX = Math.floor(world.x / MAP_TILE_SIZE);
    const centreTileY = Math.floor(world.y / MAP_TILE_SIZE);
    const firstTileX = centreTileX - 1;
    const firstTileY = centreTileY - 1;

    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const tileX = firstTileX + col;
            const tileY = firstTileY + row;
            // Rows outside the projection have no tile; columns wrap the globe.
            if (tileY < 0 || tileY >= tileCount) continue;
            const wrappedX = ((tileX % tileCount) + tileCount) % tileCount;

            const tile = document.createElement('img');
            tile.className = 'ip-map-tile';
            tile.alt = '';
            tile.setAttribute('aria-hidden', 'true');
            tile.loading = 'lazy';
            tile.style.left = `${col * MAP_TILE_SIZE}px`;
            tile.style.top = `${row * MAP_TILE_SIZE}px`;
            tile.src = `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${tileY}.png`;
            layer.appendChild(tile);
        }
    }

    // Where the coordinate sits inside the 3x3 layer.
    const offsetX = world.x - firstTileX * MAP_TILE_SIZE;
    const offsetY = world.y - firstTileY * MAP_TILE_SIZE;
    layer.style.transform = `translate(${-offsetX}px, ${-offsetY}px)`;

    return layer;
}

export async function showIpInfoModal(ip) {
    // Create modal immediately with loading state
    const modal = document.createElement('div');
    modal.className = 'custom-modal-backdrop';
    
    // HEADER
    const modalContent = document.createElement('div');
    modalContent.className = 'custom-modal ip-info-modal';
    
    const header = document.createElement('div');
    header.className = 'custom-modal-header';
    
    const title = document.createElement('span');
    title.className = 'ip-modal-title';
    title.textContent = 'IP Information';
    
    const badge = document.createElement('span');
    badge.className = 'ip-address-badge';
    badge.textContent = ip;
    
    header.appendChild(title);
    header.appendChild(badge);
    modalContent.appendChild(header);
    
    // BODY
    const bodyEl = document.createElement('div');
    bodyEl.className = 'custom-modal-body ip-modal-body';
    const loading = document.createElement('div');
    loading.className = 'ip-loading';
    loading.textContent = 'Loading...';
    bodyEl.appendChild(loading);
    modalContent.appendChild(bodyEl);
    
    // FOOTER
    const footer = document.createElement('div');
    footer.className = 'custom-modal-footer';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-btn confirm';
    closeBtn.style.backgroundColor = '#e5a00d';
    closeBtn.textContent = 'Close';
    footer.appendChild(closeBtn);
    modalContent.appendChild(footer);
    
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    requestAnimationFrame(() => modal.classList.add('show'));

    const cleanup = () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
    };

    closeBtn.addEventListener('click', cleanup);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) cleanup();
    });
    
    const keyHandler = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter') {
            window.removeEventListener('keydown', keyHandler);
            cleanup();
        }
    };
    window.addEventListener('keydown', keyHandler);

    // Fetch IP data from ipwho.is (HTTPS support)
    try {
        const response = await fetch(`https://ipwho.is/${ip}`);
        const data = await response.json();
        
        bodyEl.replaceChildren(); // Clear loading

        if (data.success) {
            const grid = document.createElement('div');
            grid.className = 'ip-info-grid';
            
            // Flag
            const flagDiv = document.createElement('div');
            flagDiv.className = 'ip-info-flag';
            const flagImg = document.createElement('img');
            // Use provided flag or fallback
            flagImg.src = data.flag ? data.flag.img : `https://flagsapi.com/${data.country_code}/flat/64.png`;
            flagImg.alt = data.country || "Flag";
            flagImg.onerror = () => { flagImg.style.display = 'none'; };
            flagDiv.appendChild(flagImg);
            grid.appendChild(flagDiv);
            
            // Details
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'ip-info-details';
            
            const createRow = (label, value) => {
                const row = document.createElement('div');
                row.className = 'ip-info-row';
                const lbl = document.createElement('span');
                lbl.className = 'ip-info-label';
                lbl.textContent = label;
                const val = document.createElement('span');
                val.className = 'ip-info-value';
                val.textContent = value || 'N/A';
                row.appendChild(lbl);
                row.appendChild(val);
                detailsDiv.appendChild(row);
            };

            createRow('Country', data.country);
            createRow('Region', data.region); // Changed from regionName
            createRow('City', data.city);
            createRow('ZIP', data.postal);    // Changed from zip
            // Timezone ID usually more useful/readable than just abbr
            createRow('Timezone', data.timezone ? data.timezone.id : 'N/A');
            
            // Connection info (ISP/Org/ASN)
            const conn = data.connection || {};
            createRow('ISP', conn.isp);
            createRow('ASN', conn.asn ? `AS${conn.asn} (${conn.org})` : conn.org);
            
            grid.appendChild(detailsDiv);
            bodyEl.appendChild(grid);
            
            // Map
            const lat = Number(data.latitude);
            const lon = Number(data.longitude);
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
                const mapContainer = document.createElement('div');
                mapContainer.className = 'ip-map-container';

                mapContainer.appendChild(buildStaticMap(lat, lon));

                const marker = document.createElement('div');
                marker.className = 'ip-map-marker';
                mapContainer.appendChild(marker);

                const credit = document.createElement('div');
                credit.className = 'ip-map-attribution';
                credit.textContent = '© OpenStreetMap contributors';
                mapContainer.appendChild(credit);

                const coords = document.createElement('div');
                coords.className = 'ip-map-coords';
                coords.textContent = `${lat}, ${lon}`;
                mapContainer.appendChild(coords);

                bodyEl.appendChild(mapContainer);
            }

        } else {
            const errDiv = document.createElement('div');
            errDiv.className = 'ip-error';
            errDiv.textContent = data.message || 'Could not retrieve information for this IP address.';
            bodyEl.appendChild(errDiv);
        }
    } catch (error) {
        console.error('IP lookup failed:', error);
        bodyEl.replaceChildren();
        const errDiv = document.createElement('div');
        errDiv.className = 'ip-error';
        errDiv.textContent = 'Failed to fetch IP information.';
        bodyEl.appendChild(errDiv);
    }
}

export async function checkAndShowChangelog() {
    const version = chrome.runtime.getManifest().version;

    // Wrapper for local storage
    const getStorage = (key) => new Promise(resolve => chrome.storage.local.get(key, resolve));
    const result = await getStorage(['last_run_version']);

    if (result.last_run_version === version) return;

    // A profile that has never recorded a version and has never finished the
    // setup wizard is a fresh install, not an upgrade. It was being shown
    // "What's New in v4.0.0" as its first ever screen, listing changes against
    // a version it never ran. Record the version and say nothing.
    if (!result.last_run_version) {
        const sync = await new Promise(resolve =>
            chrome.storage.sync.get(['setupCompleted'], resolve));
        if (!sync.setupCompleted) {
            await new Promise(resolve =>
                chrome.storage.local.set({ last_run_version: version }, resolve));
            return;
        }
    }

    const changelogItems = globalThis.hscChangelogEntries;
    
    // Create modal with DOM
    const modal = document.createElement('div');
    modal.className = 'custom-modal-backdrop';

    const content = document.createElement('div');
    content.className = 'custom-modal';
    // Constrain to popup viewport — Chrome extension popups are small.
    // Use flex column so the body can scroll while header/footer stay pinned.
    content.style.maxHeight = '85vh';
    content.style.display = 'flex';
    content.style.flexDirection = 'column';

    const header = document.createElement('div');
    header.className = 'custom-modal-header';
    header.style.flexShrink = '0';
    header.textContent = `What's New in v${version}`;

    const body = document.createElement('div');
    body.className = 'custom-modal-body';
    body.style.textAlign = 'left';
    body.style.padding = '14px 18px';
    body.style.fontSize = '12.5px';
    body.style.overflowY = 'auto';
    body.style.flex = '1 1 auto';
    body.style.minHeight = '0';

    const ul = document.createElement('ul');
    ul.style.cssText = 'padding-left: 18px; margin: 0; list-style-type: disc;';

    changelogItems.forEach(item => {
        const li = document.createElement('li');
        li.style.marginBottom = '6px';
        li.style.lineHeight = '1.4';
        const b = document.createElement('b');
        b.textContent = item.title;
        li.appendChild(b);
        li.appendChild(document.createTextNode(' ' + item.desc));
        ul.appendChild(li);
    });

    body.appendChild(ul);
    
    const footer = document.createElement('div');
    footer.className = 'custom-modal-footer';
    footer.style.flexShrink = '0';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'modal-btn confirm';
    confirmBtn.style.backgroundColor = '#2196f3';
    confirmBtn.textContent = 'Awesome!';
    footer.appendChild(confirmBtn);
    
    content.appendChild(header);
    content.appendChild(body);
    content.appendChild(footer);
    modal.appendChild(content);
    
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
    
    await new Promise(resolve => {
        const cleanup = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 200);
            resolve();
        };
        confirmBtn.addEventListener('click', cleanup);
        modal.addEventListener('click', (e) => { if (e.target === modal) cleanup(); });
    });
    
    // Save new version so it doesn't show again
    await new Promise(resolve => chrome.storage.local.set({ last_run_version: version }, resolve));
}
