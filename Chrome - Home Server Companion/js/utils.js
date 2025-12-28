/**
 * Utility functions for Home Server Companion
 */

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
 * Shows a simple info modal with one button
 */
export function showInfoModal(title, message, btnText = 'OK', btnColor = '#2196f3') {
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
        // Note: For changelog, we might WANT HTML. 
        // Logic: Check if message starts with <, otherwise use textContent.
        // This is a simple heuristic but safer than always innerHTML.
        if (typeof message === 'string' && message.trim().startsWith('<')) {
             body.innerHTML = message;
        } else {
             body.textContent = message;
        }
        
        const footer = document.createElement('div');
        footer.className = 'custom-modal-footer';
        
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'modal-btn confirm';
        confirmBtn.style.backgroundColor = btnColor;
        confirmBtn.textContent = btnText;
        
        footer.appendChild(confirmBtn);
        
        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(footer);
        modal.appendChild(content);
        
        document.body.appendChild(modal);

        requestAnimationFrame(() => modal.classList.add('show'));

        const cleanup = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 200);
            resolve();
        };

        confirmBtn.addEventListener('click', cleanup);
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
        // Defines the changelog content for the current version
        const changelog = `
            <ul style="text-align: left; padding-left: 20px; margin: 0; list-style-type: disc;">
                <li style="margin-bottom: 4px;"><b>Dashboard & UI:</b> Completely new Dashboard view and refactored Settings page.</li>
                <li style="margin-bottom: 4px;"><b>Unified Search:</b> New global search bar for faster navigation and queries.</li>
                <li style="margin-bottom: 4px;"><b>Performance:</b> Optimized API queries and faster load times.</li>
                <li style="margin-bottom: 4px;"><b>Tautulli Enhancements:</b> IP Geolocation lookup, country flags, and performance optimizations.</li>
                <li style="margin-bottom: 4px;"><b>Wizarr & SABnzbd:</b> Added Wizarr integration and SABnzbd badges.</li>
            </ul>
        `;
        
        await showInfoModal(`What's New in v${version}`, changelog, 'Awesome!', '#2196f3');
        
        // Save new version so it doesn't show again
        await new Promise(resolve => chrome.storage.local.set({ last_run_version: version }, resolve));
    }
}
