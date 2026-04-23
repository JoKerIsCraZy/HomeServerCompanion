/**
 * Utility functions for Home Server Companion
 */

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Use this when inserting untrusted data into HTML context via innerHTML.
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string safe for HTML insertion
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const text = String(str);
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
    // RFC1918 private IPv4 ranges
    if (/^10\./.test(hostname)) return true;
    if (/^192\.168\./.test(hostname)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
    // IPv4 link-local
    if (/^169\.254\./.test(hostname)) return true;
    // IPv6 unique-local / link-local
    if (/^(fc|fd)[0-9a-f]{2}:/i.test(hostname)) return true;
    if (/^fe80:/i.test(hostname)) return true;
    // Common local TLDs used on home networks
    if (/\.(local|home|lan|internal|intranet)$/i.test(hostname)) return true;
    return false;
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
export function openUrlSafely(candidateUrl, configs = {}, source = '') {
    if (!validateUrl(candidateUrl)) return false;
    const trusted = collectTrustedBaseUrls(configs);
    if (isTrustedNavigationUrl(candidateUrl, trusted)) {
        chrome.tabs.create({ url: candidateUrl });
        return true;
    }
    let host = '';
    try { host = new URL(candidateUrl).hostname; } catch { /* ignore */ }
    const origin = source ? ` (from ${source})` : '';
    const ok = confirm(
        `This link${origin} points to an external site:\n\n${host}\n\nOpen it anyway?`
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
            const mapContainer = document.createElement('div');
            mapContainer.className = 'ip-map-container';
            const iframe = document.createElement('iframe');
            iframe.className = 'ip-map-frame';
            // OpenStreetMap using new lat/long fields (latitude/longitude)
            const lat = data.latitude;
            const lon = data.longitude;
            iframe.src = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - 0.05},${lat - 0.03},${lon + 0.05},${lat + 0.03}&layer=mapnik&marker=${lat},${lon}`;
            iframe.frameBorder = "0";
            iframe.loading = "lazy";
            
            const coords = document.createElement('div');
            coords.className = 'ip-map-coords';
            coords.textContent = `${lat}, ${lon}`;
            
            mapContainer.appendChild(iframe);
            mapContainer.appendChild(coords);
            bodyEl.appendChild(mapContainer);

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
    
    if (result.last_run_version !== version) {
        // Create changelog content safely using DOM API
        const changelogItems = [
            { title: 'Tracearr:', desc: 'New service for monitoring Plex streams with live progress bars, stream details, and a statistics dashboard.' },
            { title: 'Seerr (formerly Overseerr):', desc: 'Rebranded with Multi-Auth support (API Key, Local Account, Plex Sign-In). Your existing settings migrate automatically on first launch.' },
            { title: 'Unraid Temperatures:', desc: 'Live CPU, Motherboard, and Hottest Disk temperature cards on the Unraid dashboard (requires Unraid OS 7.3+ / API v4.30).' },
            { title: 'Docker Template Icons:', desc: 'Unraid containers now show their template icons directly in the list — no more two-letter placeholders.' },
            { title: 'Instant Load:', desc: 'Unraid tab renders from the last snapshot immediately while fetching fresh data in the background. No more blank screens.' },
            { title: 'Responsive Design:', desc: 'Mobile and tablet optimized interface with touch-friendly navigation and a reusable component library.' },
            { title: 'Security Hardening:', desc: 'Tighter Content Security Policy, DOM injection protection, and confirmation prompts before opening external links from Docker labels.' },
            { title: 'Performance:', desc: 'Up to 3× faster dashboard refresh — smarter polling, staggered badge updates, and fewer API roundtrips.' },
            { title: 'Bug Fixes:', desc: 'Fullscreen button now opens correctly, Seerr request statuses display accurately, Tracearr empty state clears when streams start.' }
        ];
        
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
}
