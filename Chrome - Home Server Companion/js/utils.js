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
export function showConfirmModal(title, message, confirmText = 'Confirm', confirmColor = '#f44336') {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'custom-modal-backdrop';
        modal.innerHTML = `
            <div class="custom-modal">
                <div class="custom-modal-header">${title}</div>
                <div class="custom-modal-body">${message}</div>
                <div class="custom-modal-footer">
                    <button class="modal-btn cancel">Cancel</button>
                    <button class="modal-btn confirm" style="background-color: ${confirmColor}">${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Animation
        requestAnimationFrame(() => modal.classList.add('show'));

        const cleanup = (result) => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 200);
            resolve(result);
        };

        modal.querySelector('.cancel').addEventListener('click', () => cleanup(false));
        modal.querySelector('.confirm').addEventListener('click', () => cleanup(true));
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
        modal.innerHTML = `
            <div class="custom-modal">
                <div class="custom-modal-header">${title}</div>
                <div class="custom-modal-body">
                    <label class="modal-label">${message}</label>
                    <input type="text" class="modal-input" value="${defaultValue}">
                </div>
                <div class="custom-modal-footer">
                    <button class="modal-btn cancel">Cancel</button>
                    <button class="modal-btn confirm" style="background-color: ${confirmColor}">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const input = modal.querySelector('input');
        
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

        modal.querySelector('.cancel').addEventListener('click', () => cleanup(null));
        modal.querySelector('.confirm').addEventListener('click', () => cleanup(input.value));
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
        modal.innerHTML = `
            <div class="custom-modal">
                <div class="custom-modal-header">${title}</div>
                <div class="custom-modal-body">${message}</div>
                <div class="custom-modal-footer">
                    <button class="modal-btn confirm" style="background-color: ${btnColor}">${btnText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        requestAnimationFrame(() => modal.classList.add('show'));

        const cleanup = () => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 200);
            resolve();
        };

        modal.querySelector('.confirm').addEventListener('click', cleanup);
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
export async function checkAndShowChangelog() {
    const version = chrome.runtime.getManifest().version;
    
    // Wrapper for local storage
    const getStorage = (key) => new Promise(resolve => chrome.storage.local.get(key, resolve));
    const result = await getStorage(['last_run_version']);
    
    if (result.last_run_version !== version) {
        // Defines the changelog content for the current version
        const changelog = `
            <ul style="text-align: left; padding-left: 20px; margin: 0; list-style-type: disc;">
                <li style="margin-bottom: 4px;"><b>Custom Modals:</b> New dark-mode styled dialogs replacing native alerts & confirmation dialogs.</li>
                <li style="margin-bottom: 4px;"><b>Service Colors:</b> Notifications matches service branding.</li>
                <li style="margin-bottom: 4px;"><b>SABnzbd:</b> Added item count badges to Queue & History.</li>
                <li style="margin-bottom: 4px;"><b>Wizarr:</b> Added Wizarr as a service to manage & create invites.</li>
            </ul>
        `;
        
        await showInfoModal(`What's New in v${version}`, changelog, 'Awesome!', '#2196f3');
        
        // Save new version so it doesn't show again
        await new Promise(resolve => chrome.storage.local.set({ last_run_version: version }, resolve));
    }
}
