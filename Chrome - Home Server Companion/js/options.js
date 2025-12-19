const services = ['unraid', 'sabnzbd', 'sonarr', 'radarr', 'tautulli', 'overseerr'];

// --- UI Navigation ---
// --- UI Navigation ---
const tabs = document.querySelectorAll('.tab-btn');
const glider = document.getElementById('glider');

const moveGlider = (el) => {
    if (!el || !glider) return;
    // sub-tabs padding is 5px, glider is absolute at left: 5px
    // We want glider visual position to match button visual position
    // glidetLeft + translateX = buttonLeft
    // 5 + translateX = offsetLeft
    const offset = el.offsetLeft - 5;
    glider.style.width = `${el.offsetWidth}px`;
    glider.style.transform = `translateX(${offset}px)`;
};

// Initialize Glider
const initGlider = () => {
    const initialActive = document.querySelector('.tab-btn.active');
    if (initialActive) {
        moveGlider(initialActive);
    }
};

// Wait for fonts/layout
window.addEventListener('load', initGlider);
// Also try immediately
initGlider();

tabs.forEach(item => {
    item.addEventListener('click', () => {
        // Active Tab
        tabs.forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        
        moveGlider(item);

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
    const isActive = enabledEl ? enabledEl.checked : false;
    if (enabledEl) data[enabledId] = isActive;

    let originToRequest = null;

    if (urlEl) {
        let val = urlEl.value.trim().replace(/\/$/, ""); // Strip trailing slash
        
        // If service is enabled, we require a URL
        // If disabled, we allow empty (and save it as empty)
        
        if (isActive) {
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
        } else {
            // Disabled: Allow saving existing value OR empty value
            // We still want to validate if they DID enter something, but if it's empty, that's fine.
            if (val.length > 0) {
                 // They entered something, let's try to validate/save it, but be lenient? 
                 // Actually, if they typed garbage, we probably shouldn't save it even if disabled to avoid issues later.
                 // let's stick to: If empty -> save empty. If not empty -> validate.
                 
                // Clean protocol if user pasted it
                val = val.replace(/^https?:\/\//, '');
                const protocol = protocolEl ? protocolEl.value : 'http://';
                const fullUrl = protocol + val;
                
                try {
                    const urlObj = new URL(fullUrl); // Just check if it parses
                     data[urlId] = fullUrl;
                     originToRequest = `${urlObj.origin}/*`;
                } catch(e) {
                     // If it's invalid but disabled, maybe just don't save the URL update? 
                     // Or block? logic: "If you type it, it must be valid."
                     showStatus(service, 'Invalid URL format (even if disabled)!', 'error');
                     return;
                }
            } else {
                // Empty and disabled -> Clear it
                data[urlId] = "";
            }
        }
    }
    
    // Validate API Key if present
    if (keyEl) {
        const apiKey = keyEl.value.trim();
        
        if (isActive) {
             // If enabled, enforces rules
             // Special case: Unraid might not need a key (optional)? 
             // The user prompt said: "Wenn aktiviert muss man einen api und url eintragen"
             // So we enforce it for everyone for now to be safe, unless it's strictly optional in logic.
             // Looking at testConnection, Unraid CAN work without key.
             
             if (service !== 'unraid' && (!apiKey || apiKey.length === 0)) {
                 showStatus(service, 'API Key is required!', 'error');
                 return;
             }

             if (apiKey.length > 0) {
                // Check for suspicious characters
                if (apiKey.includes('<') || apiKey.includes('>') || apiKey.includes('"') || apiKey.includes("'")) {
                    showStatus(service, 'Invalid characters in API key!', 'error');
                    return;
                }
                
                // Check minimum length (most API keys are at least 20 chars) - Relaxed to 10
                if (apiKey.length < 10 && service !== 'unraid') { // Unraid might have short password/keys?
                    showStatus(service, 'API key seems too short!', 'error');
                    return;
                }
                
                // Check maximum length
                if (apiKey.length > 500) {
                    showStatus(service, 'API key seems too long!', 'error');
                    return;
                }
                
                data[keyId] = apiKey;
             } else {
                 // Unraid allowed empty
                  data[keyId] = "";
             }
        } else {
            // Disabled
            if (apiKey.length > 0) {
                 data[keyId] = apiKey; // Save if present
            } else {
                 data[keyId] = ""; // Clear if empty
            }
        }
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

const renderOrderList = (initialLoad = true) => {
    const render = () => {
        const container = document.getElementById('service-order-list');
        container.replaceChildren();
        
        window.currentOrder.forEach((service, index) => {
            const row = document.createElement('div');
            row.className = 'draggable-item';
            row.setAttribute('draggable', 'true');
            row.dataset.index = index;
            
            // Handle Drop Events
            row.addEventListener('dragstart', dragStart);
            row.addEventListener('dragover', dragOver);
            row.addEventListener('drop', dragDrop);
            row.addEventListener('dragenter', dragEnter);
            row.addEventListener('dragleave', dragLeave);
            row.addEventListener('dragend', dragEnd);

            // Add Hamburger Icon (Drag Handle)
            const handle = document.createElement('div');
            handle.style.cssText = "cursor: grab; display: flex; align-items: center; opacity: 0.5; margin-right: 15px;";
            
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("width", "16");
            svg.setAttribute("height", "16");
            svg.setAttribute("viewBox", "0 0 24 24");
            svg.setAttribute("fill", "none");
            svg.setAttribute("stroke", "currentColor");
            svg.setAttribute("stroke-width", "2");
            svg.setAttribute("stroke-linecap", "round");
            svg.setAttribute("stroke-linejoin", "round");

            const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line1.setAttribute("x1", "3");
            line1.setAttribute("y1", "12");
            line1.setAttribute("x2", "21");
            line1.setAttribute("y2", "12");

            const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line2.setAttribute("x1", "3");
            line2.setAttribute("y1", "6");
            line2.setAttribute("x2", "21");
            line2.setAttribute("y2", "6");

            const line3 = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line3.setAttribute("x1", "3");
            line3.setAttribute("y1", "18");
            line3.setAttribute("x2", "21");
            line3.setAttribute("y2", "18");

            svg.appendChild(line1);
            svg.appendChild(line2);
            svg.appendChild(line3);
            handle.appendChild(svg);

            const name = service.charAt(0).toUpperCase() + service.slice(1);
            const nameSpan = document.createElement('span');
            nameSpan.style.fontWeight = '500';
            nameSpan.textContent = name;
            
            // Left Side Container (Handle + Name)
            const left = document.createElement('div');
            left.style.display = 'flex';
            left.style.alignItems = 'center';
            left.appendChild(handle);
            left.appendChild(nameSpan);

            row.appendChild(left);
            container.appendChild(row);
        });
    };

    if (initialLoad) {
        chrome.storage.sync.get(['serviceOrder'], (items) => {
            if (items.serviceOrder) {
                window.currentOrder = items.serviceOrder;
                // Ensure all known services are present
                services.forEach(s => {
                    if (!window.currentOrder.includes(s)) window.currentOrder.push(s);
                });
            }
            render();
        });
    } else {
        render();
    }
};

// Drag & Drop Handlers
let dragSrcEl = null;

function dragStart(e) {
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.index);
    this.classList.add('dragging');
}

function dragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function dragEnter(e) {
    this.classList.add('over');
}

function dragLeave(e) {
    this.classList.remove('over');
}

function dragDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    const srcIndex = parseInt(dragSrcEl.dataset.index);
    const destIndex = parseInt(this.dataset.index);

    if (srcIndex !== destIndex) {
        // Reorder Array
        const item = window.currentOrder.splice(srcIndex, 1)[0];
        window.currentOrder.splice(destIndex, 0, item);
        
        // Re-render
        renderOrderList(false);
    }
    
    return false;
}

function dragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.draggable-item').forEach(item => {
        item.classList.remove('over');
    });
}



