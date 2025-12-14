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
        services.forEach(service => {
            const urlEl = document.getElementById(`${service}Url`);
            const keyEl = document.getElementById(`${service}Key`);
            const protocolEl = document.getElementById(`${service}Protocol`);
            
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
    
    const urlEl = document.getElementById(urlId);
    const keyEl = document.getElementById(keyId);
    const protocolEl = document.getElementById(protocolId);
    
    const data = {};
    if (urlEl) {
        let val = urlEl.value.trim().replace(/\/$/, ""); // Strip trailing slash
        // Clean protocol if user pasted it
        val = val.replace(/^https?:\/\//, '');
        
        const protocol = protocolEl ? protocolEl.value : 'http://';
        data[urlId] = protocol + val;
    }
    if (keyEl) data[keyId] = keyEl.value;

    chrome.storage.sync.set(data, () => {
        showStatus(service, 'Settings saved!', 'success');
    });
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
});

services.forEach(service => {
    const saveBtn = document.getElementById(`save${service.charAt(0).toUpperCase() + service.slice(1)}`);
    const testBtn = document.getElementById(`test${service.charAt(0).toUpperCase() + service.slice(1)}`);

    if (saveBtn) saveBtn.addEventListener('click', () => saveService(service));
    if (testBtn) testBtn.addEventListener('click', () => testConnection(service));
});

// --- General / Reordering Logic ---
let currentOrder = [...services]; // Default

const renderOrderList = () => {
    chrome.storage.sync.get(['serviceOrder'], (items) => {
        if (items.serviceOrder) {
            // Merge with default to ensure no services are lost if config is old
            currentOrder = items.serviceOrder;
            // Ensure all known services are present (in case of new ones added later)
            services.forEach(s => {
                if (!currentOrder.includes(s)) currentOrder.push(s);
            });
        }
        
        const container = document.getElementById('service-order-list');
        container.innerHTML = '';
        
        currentOrder.forEach((service, index) => {
            const row = document.createElement('div');
            row.style.cssText = 'padding: 10px 15px; background: white; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;';
            if (index === currentOrder.length - 1) row.style.borderBottom = 'none';

            const name = service.charAt(0).toUpperCase() + service.slice(1);
            
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
            downBtn.disabled = index === currentOrder.length - 1;
            downBtn.onclick = () => moveItem(index, 1);

            controls.appendChild(upBtn);
            controls.appendChild(downBtn);

            row.innerHTML = `<span>${name}</span>`;
            row.appendChild(controls);
            container.appendChild(row);
        });
    });
};

const moveItem = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= currentOrder.length) return;
    
    // Swap
    [currentOrder[index], currentOrder[newIndex]] = [currentOrder[newIndex], currentOrder[index]];
    
    // Re-render (optimistic)
    // We don't save yet, user must click Save
    // But we need to update UI.
    // To do this simply, we'll manually call the render part or just update the UI array
    // Let's just re-save strictly to UI state? No, better to update the local variable and re-render.
    // The render function fetches from storage, which is bad for immediate UI updates.
    // Let's refactor render slightly to use local var if changed? 
    // Actually, let's just update the UI directly since we have currentOrder.
    const container = document.getElementById('service-order-list');
    container.innerHTML = '';
    currentOrder.forEach((service, i) => {
        const row = document.createElement('div');
         row.style.cssText = 'padding: 10px 15px; background: white; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;';
        if (i === currentOrder.length - 1) row.style.borderBottom = 'none';

        const name = service.charAt(0).toUpperCase() + service.slice(1);
        
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
        downBtn.disabled = i === currentOrder.length - 1;
        downBtn.onclick = () => moveItem(i, 1);

        controls.appendChild(upBtn);
        controls.appendChild(downBtn);

        row.innerHTML = `<span>${name}</span>`;
        row.appendChild(controls);
        container.appendChild(row);
    });
};

document.getElementById('saveOrder').addEventListener('click', () => {
    chrome.storage.sync.set({ serviceOrder: currentOrder }, () => {
        showStatus('General', 'Order saved!', 'success');
    });
});
