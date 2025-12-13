const services = ['sabnzbd', 'sonarr', 'radarr', 'tautulli', 'unraid'];

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
            
            if (urlEl && items[`${service}Url`]) urlEl.value = items[`${service}Url`];
            if (keyEl && items[`${service}Key`]) keyEl.value = items[`${service}Key`];
        });
    });
};

const saveService = (service) => {
    const urlId = `${service}Url`;
    const keyId = `${service}Key`;
    
    const urlEl = document.getElementById(urlId);
    const keyEl = document.getElementById(keyId);
    
    const data = {};
    if (urlEl) data[urlId] = urlEl.value.replace(/\/$/, ""); // Strip trailing slash
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
    const url = document.getElementById(`${service}Url`).value.replace(/\/$/, "");
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
document.addEventListener('DOMContentLoaded', loadOptions);

services.forEach(service => {
    const saveBtn = document.getElementById(`save${service.charAt(0).toUpperCase() + service.slice(1)}`);
    const testBtn = document.getElementById(`test${service.charAt(0).toUpperCase() + service.slice(1)}`);

    if (saveBtn) saveBtn.addEventListener('click', () => saveService(service));
    if (testBtn) testBtn.addEventListener('click', () => testConnection(service));
});
