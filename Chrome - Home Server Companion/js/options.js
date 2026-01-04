const services = ['dashboard', 'unraid', 'sabnzbd', 'sonarr', 'radarr', 'tautulli', 'overseerr', 'prowlarr', 'wizarr', 'portainer'];

// ==================== PORTAINER MULTI-INSTANCE ====================
let portainerInstances = [];
let currentPortainerInstanceId = null;

function generateId() {
    return 'p_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function renderPortainerTabs() {
    const container = document.getElementById('portainer-instance-tabs');
    if (!container) return;
    container.innerHTML = '';

    portainerInstances.forEach((inst, idx) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'instance-tab' + (inst.id === currentPortainerInstanceId ? ' active' : '');

        if (inst.icon) {
            const iconImg = document.createElement('img');
            iconImg.src = inst.icon;
            iconImg.className = 'instance-tab-icon';
            tab.appendChild(iconImg);
        }

        const nameSpan = document.createElement('span');
        nameSpan.textContent = inst.name || `Instance ${idx + 1}`;
        tab.appendChild(nameSpan);

        tab.onclick = () => selectPortainerInstance(inst.id);
        container.appendChild(tab);
    });

    // "New" button
    const newTab = document.createElement('button');
    newTab.type = 'button';
    newTab.className = 'instance-tab instance-tab-new';
    newTab.textContent = '+ New';
    newTab.onclick = addPortainerInstance;
    container.appendChild(newTab);
}

function selectPortainerInstance(id) {
    currentPortainerInstanceId = id;
    const inst = portainerInstances.find(i => i.id === id);
    if (!inst) return;

    // Populate form
    document.getElementById('portainerInstanceName').value = inst.name || '';

    const fullUrl = inst.url || '';
    let protocol = 'http://';
    let urlVal = fullUrl;
    if (fullUrl.startsWith('https://')) {
        protocol = 'https://';
        urlVal = fullUrl.substring(8);
    } else if (fullUrl.startsWith('http://')) {
        urlVal = fullUrl.substring(7);
    }
    document.getElementById('portainerProtocol').value = protocol;
    document.getElementById('portainerUrl').value = urlVal;
    document.getElementById('portainerKey').value = inst.key || '';

    // Icon preview
    const iconImg = document.getElementById('portainerIconImg');
    const iconPlaceholder = document.getElementById('portainerIconPlaceholder');
    const iconClearBtn = document.getElementById('portainerIconClear');

    if (inst.icon) {
        iconImg.src = inst.icon;
        iconImg.style.display = 'block';
        iconPlaceholder.style.display = 'none';
        iconClearBtn.style.display = 'inline-flex';
    } else {
        iconImg.style.display = 'none';
        iconPlaceholder.style.display = 'block';
        iconClearBtn.style.display = 'none';
    }

    // Update delete button visibility (can't delete if only 1 instance)
    const deleteBtn = document.getElementById('deletePortainerInstance');
    if (deleteBtn) {
        deleteBtn.style.display = portainerInstances.length > 1 ? 'inline-flex' : 'none';
    }

    // Hide in sidebar checkbox
    const hideCheckbox = document.getElementById('portainerHideInSidebar');
    if (hideCheckbox) {
        hideCheckbox.checked = inst.hideInSidebar || false;
    }

    renderPortainerTabs();
}

function addPortainerInstance() {
    const newInst = {
        id: generateId(),
        name: '',
        url: '',
        key: '',
        icon: ''
    };
    portainerInstances.push(newInst);
    selectPortainerInstance(newInst.id);
}

function deletePortainerInstance() {
    if (portainerInstances.length <= 1) {
        showStatus('Portainer', 'Cannot delete the last instance!', 'error');
        return;
    }

    const idx = portainerInstances.findIndex(i => i.id === currentPortainerInstanceId);
    if (idx === -1) return;

    const deletedId = currentPortainerInstanceId;
    portainerInstances.splice(idx, 1);

    // Select next available instance
    const nextInst = portainerInstances[Math.min(idx, portainerInstances.length - 1)];
    selectPortainerInstance(nextInst.id);

    // Remove from service order and save
    chrome.storage.sync.get(['serviceOrder'], (orderItems) => {
        let serviceOrder = orderItems.serviceOrder || [];
        const instanceOrderId = 'portainer_' + deletedId;
        
        // Remove this instance from the order
        serviceOrder = serviceOrder.filter(s => s !== instanceOrderId);
        
        // Save both instances and order
        chrome.storage.sync.set({ portainerInstances, serviceOrder }, () => {
            showStatus('Portainer', 'Instance deleted!', 'success');
            
            // Refresh the order list
            window.orderPortainerInstances = portainerInstances;
            renderOrderList(true);
        });
    });
}

function savePortainerInstance() {
    const inst = portainerInstances.find(i => i.id === currentPortainerInstanceId);
    if (!inst) return;

    const name = document.getElementById('portainerInstanceName').value.trim();
    const protocol = document.getElementById('portainerProtocol').value;
    const urlVal = document.getElementById('portainerUrl').value.trim().replace(/\/$/, '').replace(/^https?:\/\//, '');
    const key = document.getElementById('portainerKey').value.trim();
    const iconImg = document.getElementById('portainerIconImg');

    // Validate
    if (!urlVal) {
        showStatus('Portainer', 'Please enter a URL!', 'error');
        return;
    }
    if (!key || key.length < 10) {
        showStatus('Portainer', 'Access Token is required (min 10 chars)!', 'error');
        return;
    }

    const fullUrl = protocol + urlVal;
    try {
        new URL(fullUrl);
    } catch (e) {
        showStatus('Portainer', 'Invalid URL format!', 'error');
        return;
    }

    // Update instance
    inst.name = name || 'Portainer';
    inst.url = fullUrl;
    inst.key = key;
    inst.icon = iconImg.style.display !== 'none' ? iconImg.src : '';
    inst.hideInSidebar = document.getElementById('portainerHideInSidebar')?.checked || false;

    // Request permission for URL
    const urlObj = new URL(fullUrl);
    chrome.permissions.request({ origins: [`${urlObj.origin}/*`] }, (granted) => {
        // Update service order to include this instance if it's new
        chrome.storage.sync.get(['serviceOrder'], (orderItems) => {
            let serviceOrder = orderItems.serviceOrder || [...services];
            const instanceOrderId = 'portainer_' + inst.id;
            
            // Check if this instance is already in the order
            const hasThisInstance = serviceOrder.includes(instanceOrderId);
            const hasLegacyPortainer = serviceOrder.includes('portainer');
            
            if (!hasThisInstance) {
                if (hasLegacyPortainer) {
                    // Replace legacy 'portainer' with this instance
                    const legacyIdx = serviceOrder.indexOf('portainer');
                    serviceOrder[legacyIdx] = instanceOrderId;
                } else {
                    // Add to end
                    serviceOrder.push(instanceOrderId);
                }
            }
            
            // Save both instances and order
            chrome.storage.sync.set({ portainerInstances, serviceOrder }, () => {
                showStatus('Portainer', 'Instance saved!', 'success');
                renderPortainerTabs();
                
                // Refresh the order list to show updated name/icon
                window.orderPortainerInstances = portainerInstances;
                renderOrderList(true);

                // Notify background to update rules
                chrome.runtime.sendMessage({ action: 'UPDATE_PORTAINER_RULES' });
            });
        });
    });
}

function loadPortainerInstances() {
    chrome.storage.sync.get(['portainerInstances', 'portainerUrl', 'portainerKey'], (items) => {
        if (items.portainerInstances && items.portainerInstances.length > 0) {
            portainerInstances = items.portainerInstances;
        } else if (items.portainerUrl || items.portainerKey) {
            // Migrate from old single-instance format
            portainerInstances = [{
                id: generateId(),
                name: 'Portainer',
                url: items.portainerUrl || '',
                key: items.portainerKey || '',
                icon: ''
            }];
            // Save migrated data
            chrome.storage.sync.set({ portainerInstances });
        } else {
            // Create default empty instance
            portainerInstances = [{
                id: generateId(),
                name: '',
                url: '',
                key: '',
                icon: ''
            }];
        }

        currentPortainerInstanceId = portainerInstances[0].id;
        selectPortainerInstance(currentPortainerInstanceId);
    });
}

function setupPortainerIconUpload() {
    const uploadBtn = document.getElementById('portainerIconBtn');
    const uploadInput = document.getElementById('portainerIconUpload');
    const clearBtn = document.getElementById('portainerIconClear');
    const iconImg = document.getElementById('portainerIconImg');
    const iconPlaceholder = document.getElementById('portainerIconPlaceholder');

    if (uploadBtn) {
        uploadBtn.onclick = () => uploadInput.click();
    }

    if (uploadInput) {
        uploadInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                showStatus('Portainer', 'Please select an image file!', 'error');
                return;
            }

            if (file.size > 100 * 1024) {
                showStatus('Portainer', 'Image too large (max 100KB)!', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = (evt) => {
                const img = new Image();
                img.onload = () => {
                    // Resize if needed
                    const maxSize = 64;
                    let width = img.width;
                    let height = img.height;

                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = (height / width) * maxSize;
                            width = maxSize;
                        } else {
                            width = (width / height) * maxSize;
                            height = maxSize;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const dataUrl = canvas.toDataURL('image/png', 0.8);
                    iconImg.src = dataUrl;
                    iconImg.style.display = 'block';
                    iconPlaceholder.style.display = 'none';
                    clearBtn.style.display = 'inline-flex';
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
            uploadInput.value = '';
        };
    }

    if (clearBtn) {
        clearBtn.onclick = () => {
            iconImg.src = '';
            iconImg.style.display = 'none';
            iconPlaceholder.style.display = 'block';
            clearBtn.style.display = 'none';
        };
    }
}
// ==================== END PORTAINER MULTI-INSTANCE ====================

// --- UI Navigation ---
// --- UI Navigation ---
const tabs = document.querySelectorAll('.tab-btn');
const glider = document.getElementById('glider');

const moveGlider = (el) => {
    if (!el || !glider) return;
    const subTabs = el.parentElement;
    const subTabsRect = subTabs.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    
    // Calculate position relative to parent
    const left = elRect.left - subTabsRect.left - 6; // 6px padding
    const top = elRect.top - subTabsRect.top - 6;
    
    glider.style.width = `${el.offsetWidth}px`;
    glider.style.transform = `translate(${left}px, ${top}px)`;
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

// Keyboard navigation with arrow keys
document.addEventListener('keydown', (e) => {
    // Only handle if not focused on input/select
    if (document.activeElement.tagName === 'INPUT' || 
        document.activeElement.tagName === 'SELECT' || 
        document.activeElement.tagName === 'TEXTAREA') return;
    
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const tabsArray = Array.from(tabs);
        const currentIndex = tabsArray.findIndex(t => t.classList.contains('active'));
        let newIndex;
        
        if (e.key === 'ArrowLeft') {
            newIndex = currentIndex > 0 ? currentIndex - 1 : tabsArray.length - 1;
        } else {
            newIndex = currentIndex < tabsArray.length - 1 ? currentIndex + 1 : 0;
        }
        
        tabsArray[newIndex].click();
    }
});

// --- Save & Load ---
const loadOptions = () => {
    chrome.storage.sync.get(null, (items) => {
        // Apply Dark Mode
        // Apply Dark Mode (Forced)
        document.body.classList.add('dark-mode');

        // Populate Start Page Options
        const startPageSelect = document.getElementById('startPage');
        if (startPageSelect) {
            // Clear existing except first (Last Active) if needed, but easier to rebuild or append
            // Assuming first option is static in HTML
            
            services.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
                startPageSelect.appendChild(opt);
            });

            // Load Setting
            if (items.startPage) {
                startPageSelect.value = items.startPage;
            } else {
                // Migration: Check old enablePersistence
                if (items.enablePersistence === false) {
                    startPageSelect.value = 'dashboard';
                } else {
                    startPageSelect.value = 'last-active';
                }
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
			
			// Load Extra Boolean Settings (e.g. Tautulli IP Lookup)
            const activeIpEl = document.getElementById(`${service}EnableIpLookup`);
            if (activeIpEl) {
                if (items[`${service}EnableIpLookup`] === undefined) {
                    activeIpEl.checked = false; // Default false for optional behavior
                } else {
                    activeIpEl.checked = items[`${service}EnableIpLookup`];
                }
            }
        });

        // Load Plex Redirect Mode
        const plexRedirectModeEl = document.getElementById('plexRedirectMode');
        const plexAppSettingsEl = document.getElementById('plexAppSettings');
        const plexTokenEl = document.getElementById('plexToken');
        
        if (plexRedirectModeEl) {
            plexRedirectModeEl.value = items.plexRedirectMode || 'web';
            
            // Toggle app settings visibility
            if (plexAppSettingsEl) {
                plexAppSettingsEl.style.display = plexRedirectModeEl.value === 'app' ? 'block' : 'none';
            }
            
            // Add change listener for toggle
            plexRedirectModeEl.addEventListener('change', () => {
                if (plexAppSettingsEl) {
                    plexAppSettingsEl.style.display = plexRedirectModeEl.value === 'app' ? 'block' : 'none';
                }
            });
        }

        // Load Plex Token separately (not standard key)
        if (plexTokenEl && items.plexToken) {
            plexTokenEl.value = items.plexToken;
        }
        
        // Load Plex URL
        const plexUrlEl = document.getElementById('plexUrl');
        const plexProtocolEl = document.getElementById('plexProtocol');
        if (plexUrlEl && items.plexUrl) {
            let fullUrl = items.plexUrl;
            let protocol = 'http://';
            
            if (fullUrl.startsWith('https://')) {
                protocol = 'https://';
                fullUrl = fullUrl.substring(8);
            } else if (fullUrl.startsWith('http://')) {
                fullUrl = fullUrl.substring(7);
            }
            
            if (plexProtocolEl) plexProtocolEl.value = protocol;
            plexUrlEl.value = fullUrl;
        }
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
    // Extra Toggle
    const enableIpLookupId = `${service}EnableIpLookup`;
    const enableIpLookupEl = document.getElementById(enableIpLookupId);

    const data = {};
    const isActive = enabledEl ? enabledEl.checked : false;
    if (enabledEl) data[enabledId] = isActive;

    // Handle Extra Toggle
    if (enableIpLookupEl) {
        data[enableIpLookupId] = enableIpLookupEl.checked;
    }

    let originsToRequest = [];

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
                originsToRequest.push(`${urlObj.origin}/*`);
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
                     originsToRequest.push(`${urlObj.origin}/*`);
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

    // IP Lookup Permission Extra Check
    if (enableIpLookupEl && enableIpLookupEl.checked) {
        originsToRequest.push('https://ipwho.is/*');
    }

    if (originsToRequest.length > 0) {
        chrome.permissions.contains({ origins: originsToRequest }, (result) => {
            if (result) {
                // Already has permission
                performSave();
            } else {
                // Request permission
                chrome.permissions.request({ origins: originsToRequest }, (granted) => {
                    if (granted) {
                        performSave();
                    } else {
                        showStatus(service, 'Saved, but permission denied!', 'error');
                        // Revert check for clarity if denied
                        if (enableIpLookupEl && originsToRequest.includes('https://ipwho.is/*')) {
                             data[enableIpLookupId] = false;
                             enableIpLookupEl.checked = false;
                        }
                        // Still save to storage so they don't lose the text
                        chrome.storage.sync.set(data); 
                    }
                });
            }
        });
    } else {
        // Check if we should REMOVE permissions if unchecked? 
        // Optional: If user unchecked IP lookup, we could remove 'https://ipwho.is/*'.
        // But usually better to keep permissions unless explicitly revoked to avoid re-prompting.
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
        case 'prowlarr':
            testUrl = `${url}/api/v1/health?apikey=${apiKey}`;
            break;
        case 'wizarr':
            testUrl = `${url}/api/status`;
            break;
        case 'portainer':
            testUrl = `${url}/api/status`;
            break;
        case 'plex':
            // Plex uses X-Plex-Token in query param
            const plexToken = document.getElementById('plexToken')?.value || '';
            testUrl = `${url}/?X-Plex-Token=${plexToken}`;
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

        if (service === 'wizarr') {
             options.headers = {
                 'X-API-Key': apiKey,
                 'accept': 'application/json'
             };
        }

        if (service === 'portainer') {
             options.headers = {
                 'X-API-Key': apiKey,
                 'accept': 'application/json'
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

    // Portainer Multi-Instance Setup
    loadPortainerInstances();
    setupPortainerIconUpload();

    // Portainer Save Button (override default)
    const savePortainerBtn = document.getElementById('savePortainer');
    if (savePortainerBtn) {
        savePortainerBtn.onclick = savePortainerInstance;
    }

    // Portainer Delete Button
    const deletePortainerBtn = document.getElementById('deletePortainerInstance');
    if (deletePortainerBtn) {
        deletePortainerBtn.onclick = deletePortainerInstance;
    }

    // General Save Button
    const saveOrderBtn = document.getElementById('saveOrder');
    if (saveOrderBtn) {
        saveOrderBtn.addEventListener('click', () => {
             // const currentOrder = getCurrentOrder(); // Use window.currentOrder
             const currentOrder = window.currentOrder;
             const startPage = document.getElementById('startPage').value;
             const badgeCheckInterval = parseInt(document.getElementById('badgeCheckInterval').value) || 5000;

             chrome.storage.sync.set({
                 serviceOrder: window.currentOrder || currentOrder,
                 startPage: startPage,
                 // enablePersistence: true // We can keep this true internally or deprecate it. Let's rely on StartPage value.
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

    if (saveBtn) {
        saveBtn.addEventListener('click', () => saveService(service));
    }
    if (testBtn) testBtn.addEventListener('click', () => testConnection(service));
});

// Plex-specific event listeners (Plex is not in services array)
const plexSaveBtn = document.getElementById('savePlex');
const plexTestBtn = document.getElementById('testPlex');
if (plexSaveBtn) plexSaveBtn.addEventListener('click', () => savePlexSettings());
if (plexTestBtn) plexTestBtn.addEventListener('click', () => testConnection('plex'));

// Special Plex save function
const savePlexSettings = () => {
    const plexRedirectMode = document.getElementById('plexRedirectMode')?.value || 'web';
    const plexProtocol = document.getElementById('plexProtocol')?.value || 'http://';
    const plexUrl = document.getElementById('plexUrl')?.value.trim().replace(/\/$/, '') || '';
    const plexToken = document.getElementById('plexToken')?.value.trim() || '';
    
    const data = {
        plexRedirectMode: plexRedirectMode
    };
    
    // Only require URL/Token if app mode is selected
    if (plexRedirectMode === 'app') {
        if (!plexUrl) {
            showStatus('Plex', 'Plex Server URL required for App mode!', 'error');
            return;
        }
        if (!plexToken) {
            showStatus('Plex', 'Plex Token required for App mode!', 'error');
            return;
        }
        
        // Clean and validate URL
        const cleanUrl = plexUrl.replace(/^https?:\/\//, '');
        const fullUrl = plexProtocol + cleanUrl;
        
        try {
            const urlObj = new URL(fullUrl);
            data.plexUrl = fullUrl;
            data.plexToken = plexToken;
            
            // Request permission for Plex server
            chrome.permissions.request({ origins: [`${urlObj.origin}/*`] }, (granted) => {
                if (granted || true) { // Save even if permission denied
                    chrome.storage.sync.set(data, () => {
                        showStatus('Plex', 'Settings saved!', 'success');
                    });
                }
            });
            return;
        } catch (e) {
            showStatus('Plex', 'Invalid URL format!', 'error');
            return;
        }
    }
    
    // Web mode - just save the mode
    chrome.storage.sync.set(data, () => {
        showStatus('Plex', 'Settings saved!', 'success');
    });
};

// --- General / Reordering Logic ---
window.currentOrder = [...services]; // Default attached to window for easy access in listener
window.orderPortainerInstances = []; // Track portainer instances for order list

const renderOrderList = (initialLoad = true) => {
    const render = () => {
        const container = document.getElementById('service-order-list');
        container.replaceChildren();
        
        window.currentOrder.forEach((serviceId, index) => {
            const row = document.createElement('div');
            row.className = 'draggable-item';
            row.setAttribute('draggable', 'true');
            row.dataset.index = index;
            row.dataset.serviceId = serviceId;
            
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

            // Determine display name and icon
            let displayName = serviceId.charAt(0).toUpperCase() + serviceId.slice(1);
            let customIcon = null;

            // Check if this is a Portainer instance
            if (serviceId.startsWith('portainer_')) {
                const instId = serviceId.replace('portainer_', '');
                const inst = window.orderPortainerInstances.find(i => i.id === instId);
                if (inst) {
                    displayName = inst.name || 'Portainer';
                    customIcon = inst.icon;
                }
            } else if (serviceId === 'portainer') {
                // Legacy single portainer - check if we have an instance with a name
                if (window.orderPortainerInstances.length > 0) {
                    const firstInst = window.orderPortainerInstances[0];
                    displayName = firstInst.name || 'Portainer';
                    customIcon = firstInst.icon;
                }
            }

            // Left Side Container (Handle + Icon + Name)
            const left = document.createElement('div');
            left.style.display = 'flex';
            left.style.alignItems = 'center';
            left.appendChild(handle);

            // Add custom icon if available
            if (customIcon) {
                const iconImg = document.createElement('img');
                iconImg.src = customIcon;
                iconImg.style.cssText = 'width: 20px; height: 20px; border-radius: 4px; object-fit: cover; margin-right: 10px;';
                left.appendChild(iconImg);
            }

            const nameSpan = document.createElement('span');
            nameSpan.style.fontWeight = '500';
            nameSpan.textContent = displayName;
            left.appendChild(nameSpan);

            row.appendChild(left);
            container.appendChild(row);
        });
    };

    if (initialLoad) {
        chrome.storage.sync.get(['serviceOrder', 'portainerInstances'], (items) => {
            // Load Portainer instances first
            window.orderPortainerInstances = items.portainerInstances || [];
            
            if (items.serviceOrder) {
                // Filter out any services that are no longer valid
                window.currentOrder = items.serviceOrder.filter(s => {
                    // Check regular services
                    if (services.includes(s) && s !== 'portainer') return true;
                    // Check portainer instances
                    if (s === 'portainer') return true;
                    if (s.startsWith('portainer_')) {
                        const instId = s.replace('portainer_', '');
                        return window.orderPortainerInstances.some(i => i.id === instId);
                    }
                    return false;
                });
                
                // Ensure all known services are present (except portainer which is handled specially)
                services.forEach(s => {
                    if (s === 'portainer') {
                        // For portainer, add instances if they're not already in the order
                        if (window.orderPortainerInstances.length > 0) {
                            // Check if we have the legacy 'portainer' entry that needs migration
                            const legacyIdx = window.currentOrder.indexOf('portainer');
                            if (legacyIdx !== -1) {
                                // Replace legacy 'portainer' with all instances
                                window.currentOrder.splice(legacyIdx, 1);
                                window.orderPortainerInstances.forEach((inst, i) => {
                                    window.currentOrder.splice(legacyIdx + i, 0, 'portainer_' + inst.id);
                                });
                            } else {
                                // Check if any portainer_* entries exist
                                const hasInstances = window.currentOrder.some(o => o.startsWith('portainer_'));
                                if (!hasInstances) {
                                    // Add all instances
                                    window.orderPortainerInstances.forEach(inst => {
                                        window.currentOrder.push('portainer_' + inst.id);
                                    });
                                } else {
                                    // Ensure all instances are present
                                    window.orderPortainerInstances.forEach(inst => {
                                        const instOrderId = 'portainer_' + inst.id;
                                        if (!window.currentOrder.includes(instOrderId)) {
                                            window.currentOrder.push(instOrderId);
                                        }
                                    });
                                }
                            }
                        } else if (!window.currentOrder.includes('portainer')) {
                            window.currentOrder.push('portainer');
                        }
                    } else if (!window.currentOrder.includes(s)) {
                        window.currentOrder.push(s);
                    }
                });
            } else {
                // No saved order - build default with portainer instances
                window.currentOrder = services.filter(s => s !== 'portainer');
                if (window.orderPortainerInstances.length > 0) {
                    window.orderPortainerInstances.forEach(inst => {
                        window.currentOrder.push('portainer_' + inst.id);
                    });
                } else {
                    window.currentOrder.push('portainer');
                }
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


// ==================== OVERSEERR MULTI-AUTH ====================

// Plex OAuth configuration
const PLEX_AUTH_CONFIG = {
    clientId: 'home-server-companion',
    product: 'Home Server Companion',
    device: 'Chrome Extension',
    version: '1.0'
};

// Initialize Overseerr auth UI
function initOverseerrAuth() {
    const authMethodSelect = document.getElementById('overseerrAuthMethod');
    const apiKeyPanel = document.getElementById('overseerrAuthApiKey');
    const localPanel = document.getElementById('overseerrAuthLocal');
    const plexPanel = document.getElementById('overseerrAuthPlex');
    const plexLoginBtn = document.getElementById('overseerrPlexLogin');
    
    if (!authMethodSelect) return;
    
    // Toggle panels based on auth method
    authMethodSelect.addEventListener('change', (e) => {
        const method = e.target.value;
        
        apiKeyPanel.style.display = method === 'apikey' ? 'block' : 'none';
        localPanel.style.display = method === 'local' ? 'block' : 'none';
        plexPanel.style.display = method === 'plex' ? 'block' : 'none';
    });
    
    // Plex login button
    if (plexLoginBtn) {
        plexLoginBtn.addEventListener('click', startPlexOAuth);
    }
}

// Start Plex OAuth flow
async function startPlexOAuth() {
    const statusEl = document.getElementById('overseerrPlexStatus');
    statusEl.innerHTML = '<span style="color: var(--accent-primary);">Opening Plex login...</span>';
    
    try {
        // Get a PIN from Plex
        const pinRes = await fetch('https://plex.tv/api/v2/pins', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Plex-Client-Identifier': PLEX_AUTH_CONFIG.clientId,
                'X-Plex-Product': PLEX_AUTH_CONFIG.product,
                'X-Plex-Device': PLEX_AUTH_CONFIG.device,
                'X-Plex-Version': PLEX_AUTH_CONFIG.version
            },
            body: JSON.stringify({ strong: true })
        });
        
        if (!pinRes.ok) throw new Error('Failed to get Plex PIN');
        
        const pinData = await pinRes.json();
        const pinId = pinData.id;
        const pinCode = pinData.code;
        
        // Open Plex auth window
        const authUrl = `https://app.plex.tv/auth#?clientID=${PLEX_AUTH_CONFIG.clientId}&code=${pinCode}&context%5Bdevice%5D%5Bproduct%5D=${encodeURIComponent(PLEX_AUTH_CONFIG.product)}`;
        
        const authWindow = window.open(authUrl, 'PlexAuth', 'width=800,height=600');
        
        statusEl.innerHTML = '<span style="color: #E5A00D;">Waiting for Plex login... Close the popup when done.</span>';
        
        // Poll for completion
        let attempts = 0;
        const maxAttempts = 60; // 2 minutes
        
        const pollInterval = setInterval(async () => {
            attempts++;
            
            if (attempts > maxAttempts) {
                clearInterval(pollInterval);
                statusEl.innerHTML = '<span style="color: #fc8181;">Timeout. Please try again.</span>';
                return;
            }
            
            // Check if window was closed
            if (authWindow && authWindow.closed) {
                // Check the PIN status
                try {
                    const checkRes = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
                        headers: {
                            'Accept': 'application/json',
                            'X-Plex-Client-Identifier': PLEX_AUTH_CONFIG.clientId
                        }
                    });
                    
                    if (checkRes.ok) {
                        const checkData = await checkRes.json();
                        
                        if (checkData.authToken) {
                            clearInterval(pollInterval);
                            
                            // Save the Plex auth token
                            chrome.storage.sync.set({ 
                                overseerrPlexToken: checkData.authToken 
                            }, () => {
                                statusEl.innerHTML = '<span style="color: #48bb78;">✓ Plex account linked successfully!</span>';
                            });
                            return;
                        }
                    }
                } catch (e) {
                    console.error('PIN check error:', e);
                }
                
                clearInterval(pollInterval);
                statusEl.innerHTML = '<span style="color: #fc8181;">Login cancelled or failed.</span>';
                return;
            }
        }, 2000);
        
    } catch (e) {
        console.error('Plex OAuth error:', e);
        statusEl.innerHTML = `<span style="color: #fc8181;">Error: ${e.message}</span>`;
    }
}

// Save Overseerr with multi-auth support
async function saveOverseerrAuth() {
    const authMethod = document.getElementById('overseerrAuthMethod')?.value || 'apikey';
    const protocol = document.getElementById('overseerrProtocol')?.value || 'http://';
    const urlInput = document.getElementById('overseerrUrl')?.value.trim() || '';
    const enabled = document.getElementById('overseerrEnabled')?.checked ?? true;
    
    if (!urlInput) {
        showStatus('Overseerr', 'URL is required!', 'error');
        return;
    }
    
    const cleanUrl = urlInput.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const fullUrl = protocol + cleanUrl;
    
    const data = {
        overseerrEnabled: enabled,
        overseerrUrl: fullUrl,
        overseerrAuthMethod: authMethod
    };
    
    // Save auth-specific data
    if (authMethod === 'apikey') {
        const apiKey = document.getElementById('overseerrKey')?.value.trim() || '';
        if (!apiKey) {
            showStatus('Overseerr', 'API Key is required!', 'error');
            return;
        }
        data.overseerrKey = apiKey;
        
    } else if (authMethod === 'local') {
        const email = document.getElementById('overseerrEmail')?.value.trim() || '';
        const password = document.getElementById('overseerrPassword')?.value || '';
        
        if (!email || !password) {
            showStatus('Overseerr', 'Email and password are required!', 'error');
            return;
        }
        
        // Test local login
        showStatus('Overseerr', 'Logging in...', 'success');
        try {
            const res = await fetch(`${fullUrl}/api/v1/auth/local`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include'
            });
            
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || `Login failed: ${res.status}`);
            }
            
            // Store credentials for re-login
            data.overseerrEmail = email;
            data.overseerrPassword = password;
            
        } catch (e) {
            showStatus('Overseerr', `Login failed: ${e.message}`, 'error');
            return;
        }
        
    } else if (authMethod === 'plex') {
        // Plex auth - check if token exists
        const stored = await new Promise(r => chrome.storage.sync.get(['overseerrPlexToken'], r));
        if (!stored.overseerrPlexToken) {
            showStatus('Overseerr', 'Please sign in with Plex first!', 'error');
            return;
        }
        
        // Test Plex login to Overseerr
        showStatus('Overseerr', 'Authenticating with Plex...', 'success');
        try {
            const res = await fetch(`${fullUrl}/api/v1/auth/plex`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authToken: stored.overseerrPlexToken }),
                credentials: 'include'
            });
            
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || `Plex auth failed: ${res.status}`);
            }
            
        } catch (e) {
            showStatus('Overseerr', `Plex login failed: ${e.message}`, 'error');
            return;
        }
    }
    
    // Request permissions
    try {
        const urlObj = new URL(fullUrl);
        await new Promise((resolve) => {
            chrome.permissions.request({ origins: [`${urlObj.origin}/*`] }, resolve);
        });
    } catch {}
    
    // Save to storage
    chrome.storage.sync.set(data, () => {
        showStatus('Overseerr', 'Settings saved!', 'success');
    });
}

// Test Overseerr connection with any auth method
async function testOverseerrConnection() {
    const authMethod = document.getElementById('overseerrAuthMethod')?.value || 'apikey';
    const protocol = document.getElementById('overseerrProtocol')?.value || 'http://';
    const urlInput = document.getElementById('overseerrUrl')?.value.trim() || '';
    
    if (!urlInput) {
        showStatus('Overseerr', 'URL is required!', 'error');
        return;
    }
    
    const cleanUrl = urlInput.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const fullUrl = protocol + cleanUrl;
    
    showStatus('Overseerr', 'Testing...', 'success');
    
    try {
        let options = { method: 'GET' };
        
        if (authMethod === 'apikey') {
            const apiKey = document.getElementById('overseerrKey')?.value.trim() || '';
            options.headers = { 'X-Api-Key': apiKey };
        } else {
            // Cookie auth - use credentials
            options.credentials = 'include';
        }
        
        const res = await fetch(`${fullUrl}/api/v1/auth/me`, options);
        
        if (res.ok) {
            const user = await res.json();
            showStatus('Overseerr', `✓ Connected as: ${user.displayName || user.email}`, 'success');
        } else if (res.status === 401) {
            showStatus('Overseerr', 'Not authenticated. Please save settings first.', 'error');
        } else {
            showStatus('Overseerr', `Error: ${res.status}`, 'error');
        }
        
    } catch (e) {
        showStatus('Overseerr', `Connection failed: ${e.message}`, 'error');
    }
}

// Load Overseerr auth settings
function loadOverseerrAuth(items) {
    const authMethodSelect = document.getElementById('overseerrAuthMethod');
    const apiKeyPanel = document.getElementById('overseerrAuthApiKey');
    const localPanel = document.getElementById('overseerrAuthLocal');
    const plexPanel = document.getElementById('overseerrAuthPlex');
    const plexStatus = document.getElementById('overseerrPlexStatus');
    
    if (!authMethodSelect) return;
    
    // Set auth method
    const method = items.overseerrAuthMethod || 'apikey';
    authMethodSelect.value = method;
    
    // Show correct panel
    apiKeyPanel.style.display = method === 'apikey' ? 'block' : 'none';
    localPanel.style.display = method === 'local' ? 'block' : 'none';
    plexPanel.style.display = method === 'plex' ? 'block' : 'none';
    
    // Load local auth fields
    if (items.overseerrEmail) {
        document.getElementById('overseerrEmail').value = items.overseerrEmail;
    }
    if (items.overseerrPassword) {
        document.getElementById('overseerrPassword').value = items.overseerrPassword;
    }
    
    // Update Plex status
    if (items.overseerrPlexToken && plexStatus) {
        plexStatus.innerHTML = '<span style="color: #48bb78;">✓ Plex account linked</span>';
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initOverseerrAuth();
    
    // Override Overseerr save/test buttons
    const saveBtn = document.getElementById('saveOverseerr');
    const testBtn = document.getElementById('testOverseerr');
    
    if (saveBtn) {
        saveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveOverseerrAuth();
        });
    }
    
    if (testBtn) {
        testBtn.addEventListener('click', (e) => {
            e.preventDefault();
            testOverseerrConnection();
        });
    }
});

// Load Overseerr auth on storage load (called from loadOptions)
chrome.storage.sync.get(null, (items) => {
    setTimeout(() => loadOverseerrAuth(items), 100);
});
