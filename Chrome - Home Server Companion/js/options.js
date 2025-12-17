const services = ['sabnzbd', 'sonarr', 'radarr', 'tautulli', 'overseerr', 'unraid'];

// --- UI Navigation ---
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        // Active Sidebar Item
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        // Active Section
        const target = item.dataset.target;
        document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
        document.getElementById(target).classList.add('active');
    });
});

// --- Save & Load ---
const loadOptions = () => {
    chrome.storage.sync.get(null, (items) => {
        // Apply Dark Mode
        if (items.darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }

        // Load Persistence Setting (default true if undefined)
        const persistenceEl = document.getElementById('enablePersistence');
        if (persistenceEl) {
             if (items.enablePersistence === undefined) {
                 persistenceEl.checked = true; // Default
             } else {
                 persistenceEl.checked = items.enablePersistence;
             }
        }

        // Load Badge Check Interval (default 5000ms)
        const badgeIntervalEl = document.getElementById('badgeCheckInterval');
        if (badgeIntervalEl) {
            const interval = items.badgeCheckInterval || 5000;
            badgeIntervalEl.value = interval.toString();
        }

        services.forEach(service => {
            const urlEl = document.getElementById(`${service}Url`);
            const keyEl = document.getElementById(`${service}Key`);
            const protocolEl = document.getElementById(`${service}Protocol`);
            const enabledEl = document.getElementById(`${service}Enabled`);
            
            // Load Enabled State (Default true)
            if (enabledEl) {
                if (items[`${service}Enabled`] === undefined) {
                    enabledEl.checked = true;
                } else {
                    enabledEl.checked = items[`${service}Enabled`];
                }
            }
            
            if (urlEl && items[`${service}Url`]) {
                let fullUrl = items[`${service}Url`];
                let protocol = 'http://';
                
                if (fullUrl.startsWith('https://')) {
                    protocol = 'https://';
                    fullUrl = fullUrl.substring(8);
                } else if (fullUrl.startsWith('http://')) {
                    fullUrl = fullUrl.substring(7);
                }
                
                if (protocolEl) protocolEl.value = protocol;
                urlEl.value = fullUrl;
            }
            if (keyEl && items[`${service}Key`]) keyEl.value = items[`${service}Key`];
        });
    });
};

const saveService = (service) => {
    const urlId = `${service}Url`;
    const keyId = `${service}Key`;
    const protocolId = `${service}Protocol`;
    const enabledId = `${service}Enabled`;
    
    const urlEl = document.getElementById(urlId);
    const keyEl = document.getElementById(keyId);
    const protocolEl = document.getElementById(protocolId);
    const enabledEl = document.getElementById(enabledId);
    
    const data = {};
    if (enabledEl) data[enabledId] = enabledEl.checked;

    let originToRequest = null;

    if (urlEl) {
        let val = urlEl.value.trim().replace(/\/$/, ""); // Strip trailing slash
        
        // Basic sanitization - remove dangerous characters
        if (val.includes('<') || val.includes('>') || val.includes('"') || val.includes("'")) {
            showStatus(service, 'Invalid characters in URL!', 'error');
            return;
        }
        
        // Clean protocol if user pasted it
        val = val.replace(/^https?:\/\//, '');
        
        // Check if empty after cleaning
        if (!val || val.length === 0) {
            showStatus(service, 'Please enter a valid URL!', 'error');
            return;
        }
        
        const protocol = protocolEl ? protocolEl.value : 'http://';
        const fullUrl = protocol + val;
        
        try {
            // Validate URL format
            const urlObj = new URL(fullUrl);
            
            // Ensure protocol is http or https
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                showStatus(service, 'Only HTTP/HTTPS protocols allowed!', 'error');
                return;
            }
            
            // Validate hostname exists
            if (!urlObj.hostname || urlObj.hostname.length === 0) {
                showStatus(service, 'Invalid hostname!', 'error');
                return;
            }
            
            // Check for valid hostname format (basic check)
            const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$|^localhost$/;
            if (!hostnameRegex.test(urlObj.hostname)) {
                showStatus(service, 'Invalid hostname format!', 'error');
                return;
            }
            
            data[urlId] = fullUrl;
            originToRequest = `${urlObj.origin}/*`;
        } catch (e) {
            showStatus(service, 'Invalid URL format!', 'error');
            console.warn("Invalid URL:", fullUrl, e);
            return;
        }
    }
    
    // Validate API Key if present
    if (keyEl && keyEl.value) {
        const apiKey = keyEl.value.trim();
        
        // Check for suspicious characters
        if (apiKey.includes('<') || apiKey.includes('>') || apiKey.includes('"') || apiKey.includes("'")) {
            showStatus(service, 'Invalid characters in API key!', 'error');
            return;
        }
        
        // Check minimum length (most API keys are at least 20 chars)
        if (apiKey.length < 10) {
            showStatus(service, 'API key seems too short!', 'error');
            return;
        }
        
        // Check maximum length (prevent abuse)
        if (apiKey.length > 500) {
            showStatus(service, 'API key seems too long!', 'error');
            return;
        }
        
        data[keyId] = apiKey;
    }

    const performSave = () => {
        chrome.storage.sync.set(data, () => {
             // Check results and notify user
             showStatus(service, 'Settings saved!', 'success');
        });
    };

    if (originToRequest) {
        chrome.permissions.contains({ origins: [originToRequest] }, (result) => {
            if (result) {
                // Already has permission
                performSave();
            } else {
                // Request permission
                chrome.permissions.request({ origins: [originToRequest] }, (granted) => {
                    if (granted) {
                        performSave();
                    } else {
                        showStatus(service, 'Saved, but permission denied!', 'error');
                        // Still save to storage so they don't lose the text
                        chrome.storage.sync.set(data); 
                    }
                });
            }
        });
    } else {
        performSave();
    }
};

const showStatus = (service, msg, type) => {
    const el = document.getElementById(`status${service.charAt(0).toUpperCase() + service.slice(1)}`);
    el.textContent = msg;
    el.className = `status ${type}`;
    setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => { el.className = 'status'; el.style.opacity = '0'; }, 300); // Reset class after fade
    }, 2000);
    el.style.opacity = '1';
};


// --- Connection Testing ---
const testConnection = async (service) => {
    const urlInput = document.getElementById(`${service}Url`).value.trim().replace(/\/$/, "");
    const protocol = document.getElementById(`${service}Protocol`).value;
    // Clean protocol if user pasted it
    const cleanUrl = urlInput.replace(/^https?:\/\//, '');
    const url = protocol + cleanUrl;
    const apiKey = document.getElementById(`${service}Key`) ? document.getElementById(`${service}Key`).value : '';

    if (!url) {
        showStatus(service, 'Please enter a URL first.', 'error');
        return;
    }

    let testUrl = '';
    
    // Construct Test URL based on Service
    switch(service) {
        case 'sabnzbd':
            testUrl = `${url}/api?mode=queue&output=json&apikey=${apiKey}&limit=1`;
            break;
        case 'sonarr':
            testUrl = `${url}/api/v3/system/status?apikey=${apiKey}`;
            break;
        case 'radarr':
            testUrl = `${url}/api/v3/system/status?apikey=${apiKey}`;
            break;
        case 'tautulli':
            testUrl = `${url}/api/v2?apikey=${apiKey}&cmd=get_activity`;
            break;
        case 'overseerr':
            testUrl = `${url}/api/v1/status`; // Overseerr status endpoint
            break;
        case 'unraid':
            if (apiKey) {
                // Test Auth with a simple GraphQL query
                testUrl = `${url}/graphql`; 
            } else {
                 testUrl = url; 
            }
            break;
    }

    showStatus(service, 'Testing...', 'success');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        let options = {
            method: 'GET',
            signal: controller.signal,
            mode: (service === 'unraid' && !apiKey) ? 'no-cors' : 'cors'
        };

        if (service === 'unraid' && apiKey) {
             options.method = 'POST';
             options.headers = { 
                 'Content-Type': 'application/json', 
                 'X-API-Key': apiKey 
             };
             options.body = JSON.stringify({ query: "{ info { versions { core { unraid } } } }" }); // Simple query
        }

        if (service === 'overseerr') {
             options.headers = {
                 'X-Api-Key': apiKey
             };
        }

        const response = await fetch(testUrl, options);
        
        clearTimeout(timeoutId);

        if (service === 'unraid') {
             if (apiKey) {
                 if (response.ok) showStatus(service, 'API Key Valid!', 'success');
                 else showStatus(service, `Auth Failed: ${response.status}`, 'error');
             } else {
                showStatus(service, 'Server Reachable!', 'success');
             }
        } else {
            if (response.ok) {
                 showStatus(service, 'Connection Successful!', 'success');
            } else {
                showStatus(service, `Error: ${response.status}`, 'error');
            }
        }
    } catch (err) {
        showStatus(service, 'Connection Failed (Network/CORS)', 'error');
        console.error(err);
    }
};

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    loadOptions();
    renderOrderList();

    // General Save Button
    const saveOrderBtn = document.getElementById('saveOrder');
    if (saveOrderBtn) {
        saveOrderBtn.addEventListener('click', () => {
             // const currentOrder = getCurrentOrder(); // Use window.currentOrder
             const currentOrder = window.currentOrder;
             const enablePersistence = document.getElementById('enablePersistence').checked;
             const badgeCheckInterval = parseInt(document.getElementById('badgeCheckInterval').value) || 5000;
             
             chrome.storage.sync.set({ 
                 serviceOrder: window.currentOrder || currentOrder, // window.currentOrder is set below
                 enablePersistence: enablePersistence,
                 badgeCheckInterval: badgeCheckInterval
             }, () => {
                 showStatus('General', 'Settings saved!', 'success');
             });
        });
    }
});

services.forEach(service => {
    const saveBtn = document.getElementById(`save${service.charAt(0).toUpperCase() + service.slice(1)}`);
    const testBtn = document.getElementById(`test${service.charAt(0).toUpperCase() + service.slice(1)}`);

    if (saveBtn) saveBtn.addEventListener('click', () => saveService(service));
    if (testBtn) testBtn.addEventListener('click', () => testConnection(service));
});

// --- General / Reordering Logic ---
window.currentOrder = [...services]; // Default attached to window for easy access in listener

const renderOrderList = () => {
    chrome.storage.sync.get(['serviceOrder'], (items) => {
        if (items.serviceOrder) {
            // Merge with default to ensure no services are lost if config is old

            window.currentOrder = items.serviceOrder;
            // Ensure all known services are present (in case of new ones added later)
            services.forEach(s => {
                if (!window.currentOrder.includes(s)) window.currentOrder.push(s);
            });
        }
        
        const container = document.getElementById('service-order-list');
        container.replaceChildren();
        
        window.currentOrder.forEach((service, index) => {
            const row = document.createElement('div');
            row.style.cssText = 'padding: 10px 15px; background: white; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;';
            if (index === window.currentOrder.length - 1) row.style.borderBottom = 'none';

            const name = service.charAt(0).toUpperCase() + service.slice(1);
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = name;
            
            const controls = document.createElement('div');
            controls.style.display = 'flex';
            controls.style.gap = '5px';

            const upBtn = document.createElement('button');
            upBtn.textContent = '\u2191'; // Up Arrow
            upBtn.className = 'btn-secondary';
            upBtn.style.padding = '5px 10px';
            upBtn.disabled = index === 0;
            upBtn.onclick = () => moveItem(index, -1);

            const downBtn = document.createElement('button');
            downBtn.textContent = '\u2193'; // Down Arrow
            downBtn.className = 'btn-secondary';
            downBtn.style.padding = '5px 10px';
            downBtn.disabled = index === window.currentOrder.length - 1;
            downBtn.onclick = () => moveItem(index, 1);

            controls.appendChild(upBtn);
            controls.appendChild(downBtn);

            row.appendChild(nameSpan);
            row.appendChild(controls);
            container.appendChild(row);
        });
    });
};

const moveItem = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= window.currentOrder.length) return;
    
    // Swap
    [window.currentOrder[index], window.currentOrder[newIndex]] = [window.currentOrder[newIndex], window.currentOrder[index]];
    
    // Re-render (optimistic)
    // Keep UI in sync with reordering without waiting for storage callback
    const container = document.getElementById('service-order-list');
    container.innerHTML = '';
    window.currentOrder.forEach((service, i) => {
        const row = document.createElement('div');
         row.style.cssText = 'padding: 10px 15px; background: white; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;';
        if (i === window.currentOrder.length - 1) row.style.borderBottom = 'none';

        const name = service.charAt(0).toUpperCase() + service.slice(1);
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = name;
        
        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '5px';

        const upBtn = document.createElement('button');
        upBtn.textContent = '\u2191'; // Up Arrow
        upBtn.className = 'btn-secondary';
        upBtn.style.padding = '5px 10px';
        upBtn.disabled = i === 0;
        upBtn.onclick = () => moveItem(i, -1);

        const downBtn = document.createElement('button');
        downBtn.textContent = '\u2193'; // Down Arrow
        downBtn.className = 'btn-secondary';
        downBtn.style.padding = '5px 10px';
        downBtn.disabled = i === window.currentOrder.length - 1;
        downBtn.onclick = () => moveItem(i, 1);

        controls.appendChild(upBtn);
        controls.appendChild(downBtn);

        row.appendChild(nameSpan);
        row.appendChild(controls);
        container.appendChild(row);
    });
};



