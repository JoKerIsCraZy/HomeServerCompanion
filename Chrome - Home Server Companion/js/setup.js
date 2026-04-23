// ==================== SETUP WIZARD ====================
// This wizard only runs on first install OR when manually triggered.
// Existing users with configured services will NOT see this automatically.

// Security: Escape HTML to prevent XSS
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const text = String(str);
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const SERVICES = [
    { 
        id: 'dashboard', 
        name: 'Dashboard', 
        icon: '📊', 
        description: 'Overview of all services',
        hasConfig: false,
        defaultEnabled: true
    },
    { 
        id: 'unraid', 
        name: 'Unraid', 
        icon: '🖥️', 
        description: 'Unraid Server Monitoring',
        hasConfig: true,
        urlPlaceholder: 'tower.local',
        keyRequired: false,
        keyHelp: 'Optional: API Key from Unraid Settings'
    },
    { 
        id: 'sabnzbd', 
        name: 'SABnzbd', 
        icon: '📥', 
        description: 'Usenet Download Client',
        hasConfig: true,
        urlPlaceholder: 'localhost:8080',
        keyRequired: true,
        keyHelp: 'Find API Key at: Config → General → API Key'
    },
    { 
        id: 'sonarr', 
        name: 'Sonarr', 
        icon: '📺', 
        description: 'TV Series Management',
        hasConfig: true,
        urlPlaceholder: 'localhost:8989',
        keyRequired: true,
        keyHelp: 'API Key at: Settings → General → Security'
    },
    { 
        id: 'radarr', 
        name: 'Radarr', 
        icon: '🎬', 
        description: 'Movie Management',
        hasConfig: true,
        urlPlaceholder: 'localhost:7878',
        keyRequired: true,
        keyHelp: 'API Key at: Settings → General → Security'
    },
    { 
        id: 'tautulli', 
        name: 'Tautulli', 
        icon: '📈', 
        description: 'Plex Statistics & Monitoring',
        hasConfig: true,
        urlPlaceholder: 'localhost:8181',
        keyRequired: true,
        keyHelp: 'API Key at: Settings → Web Interface → API Key'
    },
    { 
        id: 'plex', 
        name: 'Plex', 
        icon: '▶️', 
        description: 'Open media directly in Plex app (Windows)',
        hasConfig: true,
        urlPlaceholder: 'localhost:32400',
        keyRequired: false,
        keyHelp: 'Optional: Plex Token for opening media in the Plex app'
    },
    { 
        id: 'seerr', 
        name: 'Seerr', 
        icon: '🎯', 
        description: 'Media Request Management',
        hasConfig: true,
        hasMultiAuth: true, // Special auth handling
        urlPlaceholder: 'localhost:5055',
        keyRequired: false, // Now optional because of multi-auth
        keyHelp: 'Choose your authentication method below'
    },
    { 
        id: 'prowlarr', 
        name: 'Prowlarr', 
        icon: '🔍', 
        description: 'Indexer Manager',
        hasConfig: true,
        urlPlaceholder: 'localhost:9696',
        keyRequired: true,
        keyHelp: 'API Key at: Settings → General → Security'
    },
    {
        id: 'wizarr',
        name: 'Wizarr',
        icon: '🧙',
        description: 'User Invitations',
        hasConfig: true,
        urlPlaceholder: 'localhost:5690',
        keyRequired: true,
        keyHelp: 'API Key from Wizarr Settings'
    },
    {
        id: 'tracearr',
        name: 'Tracearr',
        icon: '📊',
        description: 'Content Tracking & Analytics',
        hasConfig: true,
        urlPlaceholder: 'localhost:3085',
        keyRequired: true,
        keyHelp: 'Public API Key (trr_pub_xxx) at: Settings → General → API'
    },
    {
        id: 'portainer',
        name: 'Portainer',
        icon: '🐳',
        description: 'Docker Container Management',
        hasConfig: true,
        urlPlaceholder: 'localhost:9000',
        keyRequired: true,
        keyHelp: 'Access Token at: My Account → Access Tokens. Multiple instances can be added later in Settings.'
    }
];

// State
let currentStep = 1;
let selectedServices = new Set(['dashboard']); // Dashboard enabled by default
let serviceConfigs = {};
let configQueue = []; // Services that need configuration
let currentConfigIndex = 0;

// Portainer Multi-Instance Support
let portainerInstances = [];
let currentPortainerInstanceIndex = 0;

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// DOM Elements
const progressFill = document.getElementById('progressFill');
const progressSteps = document.getElementById('progressSteps');
const wizardContent = document.getElementById('wizardContent');
const btnBack = document.getElementById('btnBack');
const btnNext = document.getElementById('btnNext');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadExistingConfig();
    renderProgressSteps();
    renderServicesGrid();
    updateNavigation();
    
    btnNext.addEventListener('click', nextStep);
    btnBack.addEventListener('click', prevStep);
});

// Load existing configuration from storage
async function loadExistingConfig() {
    return new Promise(resolve => {
        chrome.storage.sync.get(null, (items) => {
            // Load enabled services
            SERVICES.forEach(service => {
                const enabledKey = `${service.id}Enabled`;
                const hasUrl = !!items[`${service.id}Url`];
                
                if (items[enabledKey] === true) {
                    selectedServices.add(service.id);
                } else if (items[enabledKey] === false) {
                    selectedServices.delete(service.id);
                } else if (hasUrl) {
                    // Backwards compatibility: if URL exists but no Enabled flag, consider it enabled
                    selectedServices.add(service.id);
                }
                // If undefined and no URL, keep default (dashboard on, others off)
            });
            
            // Load existing service configurations
            SERVICES.forEach(service => {
                if (service.hasConfig && items[`${service.id}Url`]) {
                    const fullUrl = items[`${service.id}Url`];
                    let protocol = 'http://';
                    let url = fullUrl;
                    
                    if (fullUrl.startsWith('https://')) {
                        protocol = 'https://';
                        url = fullUrl.substring(8);
                    } else if (fullUrl.startsWith('http://')) {
                        url = fullUrl.substring(7);
                    }
                    
                    serviceConfigs[service.id] = {
                        protocol,
                        url,
                        key: items[`${service.id}Key`] || (service.id === 'plex' ? items.plexToken : '') || '',
                        fullUrl
                    };
                }
            });
            
            // Load existing Portainer instances
            if (items.portainerInstances && items.portainerInstances.length > 0) {
                portainerInstances = items.portainerInstances.map(inst => ({
                    id: inst.id,
                    name: inst.name || '',
                    url: inst.url ? inst.url.replace(/^https?:\/\//, '') : '',
                    key: inst.key || '',
                    protocol: inst.url?.startsWith('https://') ? 'https://' : 'http://'
                }));
            }
            
            resolve();
        });
    });
}

function renderProgressSteps() {
    // Simple 4-step progress: Welcome, Select, Configure, Done
    const steps = ['Welcome', 'Select', 'Configure', 'Done'];
    progressSteps.innerHTML = steps.map((label, i) => `
        <div class="progress-step ${i === 0 ? 'active' : ''}" data-step="${i + 1}">
            ${i + 1}
        </div>
    `).join('');
}

function updateProgress() {
    const totalSteps = 4;
    let visualStep = 1;
    
    if (currentStep === 1) visualStep = 1;
    else if (currentStep === 2) visualStep = 2;
    else if (currentStep === 3) visualStep = 3;
    else visualStep = 4;
    
    const percentage = ((visualStep - 1) / (totalSteps - 1)) * 100;
    progressFill.style.width = `${percentage}%`;
    
    document.querySelectorAll('.progress-step').forEach((step, i) => {
        step.classList.remove('active', 'completed');
        if (i + 1 < visualStep) step.classList.add('completed');
        else if (i + 1 === visualStep) step.classList.add('active');
    });
}

function renderServicesGrid() {
    const grid = document.getElementById('servicesGrid');
    grid.innerHTML = SERVICES.map(service => `
        <div class="service-card ${selectedServices.has(service.id) ? 'selected' : ''}" 
             data-service="${service.id}">
            <div class="service-toggle"></div>
            <div class="service-card-header">
                <div class="service-icon">${service.icon}</div>
                <h3>${service.name}</h3>
            </div>
            <p class="service-description">${service.description}</p>
        </div>
    `).join('');
    
    // Add click handlers
    grid.querySelectorAll('.service-card').forEach(card => {
        card.addEventListener('click', () => toggleService(card.dataset.service));
    });
}

function toggleService(serviceId) {
    if (selectedServices.has(serviceId)) {
        selectedServices.delete(serviceId);
    } else {
        selectedServices.add(serviceId);
    }
    
    const card = document.querySelector(`.service-card[data-service="${serviceId}"]`);
    card.classList.toggle('selected');
}

function buildConfigQueue() {
    configQueue = SERVICES.filter(s => 
        selectedServices.has(s.id) && s.hasConfig
    );
    currentConfigIndex = 0;
}

function renderConfigStep() {
    if (configQueue.length === 0) {
        // No services need configuration, skip to summary
        showFinalStep();
        return;
    }
    
    const service = configQueue[currentConfigIndex];
    const configStep = document.getElementById('configStep');
    const form = document.getElementById('configForm');
    
    // Special handling for Portainer (multi-instance)
    if (service.id === 'portainer') {
        renderPortainerConfigStep();
        return;
    }
    
    // Special handling for Seerr (multi-auth)
    if (service.hasMultiAuth) {
        renderSeerrConfigStep();
        return;
    }
    
    // Get existing config if any
    const existing = serviceConfigs[service.id] || {};
    
    form.innerHTML = `
        <div class="config-header">
            <div class="config-service-icon">${service.icon}</div>
            <div class="config-service-info">
                <h1 style="font-size: 22px; margin-bottom: 4px;">${service.name}</h1>
                <span class="config-progress">Service ${currentConfigIndex + 1} of ${configQueue.length}</span>
            </div>
        </div>
        
        <div class="form-group" style="margin-top: 24px;">
            <label>Server URL</label>
            <div class="input-group">
                <select id="configProtocol">
                    <option value="http://" ${existing.protocol === 'http://' ? 'selected' : ''}>http://</option>
                    <option value="https://" ${existing.protocol === 'https://' ? 'selected' : ''}>https://</option>
                </select>
                <input type="text" id="configUrl" placeholder="${service.urlPlaceholder}" 
                       value="${escapeHtml(existing.url || '')}">
            </div>
            <p class="help-text">e.g. ${service.urlPlaceholder} or 192.168.1.100:${service.urlPlaceholder.split(':')[1] || '80'}</p>
        </div>
        
        <div class="form-group">
            <label>API Key ${service.keyRequired ? '' : '(Optional)'}</label>
            <input type="password" id="configKey" placeholder="Enter API Key" 
                   value="${escapeHtml(existing.key || '')}">
            <p class="help-text">${service.keyHelp}</p>
        </div>
        
        <div class="test-connection">
            <button type="button" class="test-btn" id="testBtn">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                Test Connection
            </button>
            <span class="test-status" id="testStatus"></span>
        </div>
    `;
    
    document.getElementById('testBtn').addEventListener('click', () => testConnection(service));
}

// Portainer Multi-Instance Configuration
function renderPortainerConfigStep() {
    const form = document.getElementById('configForm');
    const service = SERVICES.find(s => s.id === 'portainer');
    
    // Initialize first instance if empty
    if (portainerInstances.length === 0) {
        portainerInstances.push({ id: generateId(), name: '', url: '', key: '', protocol: 'http://' });
    }
    
    const instance = portainerInstances[currentPortainerInstanceIndex];
    const totalInstances = portainerInstances.length;
    
    form.innerHTML = `
        <div class="config-header">
            <div class="config-service-icon">${service.icon}</div>
            <div class="config-service-info">
                <h1 style="font-size: 22px; margin-bottom: 4px;">Portainer</h1>
                <span class="config-progress">Instance ${currentPortainerInstanceIndex + 1} of ${totalInstances}</span>
            </div>
        </div>
        
        <div class="form-group" style="margin-top: 24px;">
            <label>Instance Name</label>
            <input type="text" id="configName" placeholder="e.g. Main Server, NAS, etc." 
                   value="${escapeHtml(instance.name || '')}">
            <p class="help-text">A friendly name to identify this Portainer instance</p>
        </div>
        
        <div class="form-group">
            <label>Server URL</label>
            <div class="input-group">
                <select id="configProtocol">
                    <option value="http://" ${instance.protocol === 'http://' ? 'selected' : ''}>http://</option>
                    <option value="https://" ${instance.protocol === 'https://' ? 'selected' : ''}>https://</option>
                </select>
                <input type="text" id="configUrl" placeholder="localhost:9000" 
                       value="${escapeHtml(instance.url || '')}">
            </div>
            <p class="help-text">e.g. localhost:9000 or 192.168.1.100:9000</p>
        </div>
        
        <div class="form-group">
            <label>Access Token</label>
            <input type="password" id="configKey" placeholder="Enter Access Token" 
                   value="${escapeHtml(instance.key || '')}">
            <p class="help-text">Access Token at: My Account → Access Tokens</p>
        </div>
        
        <div class="test-connection">
            <button type="button" class="test-btn" id="testBtn">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                Test Connection
            </button>
            <span class="test-status" id="testStatus"></span>
        </div>
        
        ${totalInstances > 1 ? `
        <div class="portainer-tabs" style="margin-top: 24px; display: flex; gap: 8px; flex-wrap: wrap; padding: 16px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
            ${portainerInstances.map((inst, idx) => `
                <button type="button" class="instance-tab" data-index="${idx}" style="
                    padding: 10px 16px; 
                    border-radius: 10px; 
                    border: 1px solid ${idx === currentPortainerInstanceIndex ? 'var(--accent-primary)' : 'var(--glass-border)'};
                    background: ${idx === currentPortainerInstanceIndex ? 'linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.15))' : 'rgba(255,255,255,0.03)'};
                    color: ${idx === currentPortainerInstanceIndex ? '#fff' : 'var(--text-secondary)'};
                    font-size: 13px;
                    font-weight: 500;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s ease;
                    ${idx === currentPortainerInstanceIndex ? 'box-shadow: 0 0 15px rgba(102, 126, 234, 0.3);' : ''}
                ">
                    <span style="font-size: 14px;">🐳</span>
                    ${inst.name || `Instance ${idx + 1}`}
                </button>
            `).join('')}
        </div>` : ''}
        
        <div class="portainer-actions" style="margin-top: 20px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <button type="button" class="test-btn" id="addInstanceBtn" style="background: rgba(72, 187, 120, 0.1); border-color: rgba(72, 187, 120, 0.3); color: #48bb78;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Add Instance
            </button>
            ${totalInstances > 1 ? `
            <button type="button" class="test-btn" id="removeInstanceBtn" style="background: rgba(252, 129, 129, 0.1); border-color: rgba(252, 129, 129, 0.3); color: #fc8181;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                Remove
            </button>
            <span style="color: var(--text-muted); font-size: 12px; margin-left: auto;">
                ${totalInstances} instance${totalInstances > 1 ? 's' : ''} configured
            </span>` : ''}
        </div>
    `;
    
    // Event listeners
    document.getElementById('testBtn').addEventListener('click', () => testConnection(service));
    
    document.getElementById('addInstanceBtn').addEventListener('click', () => {
        saveCurrentPortainerInstance();
        portainerInstances.push({ id: generateId(), name: '', url: '', key: '', protocol: 'http://' });
        currentPortainerInstanceIndex = portainerInstances.length - 1;
        renderPortainerConfigStep();
    });
    
    const removeBtn = document.getElementById('removeInstanceBtn');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            if (portainerInstances.length > 1) {
                portainerInstances.splice(currentPortainerInstanceIndex, 1);
                currentPortainerInstanceIndex = Math.min(currentPortainerInstanceIndex, portainerInstances.length - 1);
                renderPortainerConfigStep();
            }
        });
    }
    
    // Instance tab switching
    document.querySelectorAll('.instance-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            saveCurrentPortainerInstance();
            currentPortainerInstanceIndex = parseInt(tab.dataset.index);
            renderPortainerConfigStep();
        });
    });
}

// Seerr Multi-Auth Configuration State
let seerrAuthMethod = 'plex';

function renderSeerrConfigStep() {
    const form = document.getElementById('configForm');
    const service = SERVICES.find(s => s.id === 'seerr');
    const existing = serviceConfigs['seerr'] || {};

    form.innerHTML = `
        <div class="config-header">
            <div class="config-service-icon">${service.icon}</div>
            <div class="config-service-info">
                <h1 style="font-size: 22px; margin-bottom: 4px;">${service.name}</h1>
                <span class="config-progress">Service ${currentConfigIndex + 1} of ${configQueue.length}</span>
            </div>
        </div>

        <div class="form-group" style="margin-top: 24px;">
            <label>Server URL</label>
            <div class="input-group">
                <select id="configProtocol">
                    <option value="http://" ${existing.protocol === 'http://' ? 'selected' : ''}>http://</option>
                    <option value="https://" ${existing.protocol === 'https://' ? 'selected' : ''}>https://</option>
                </select>
                <input type="text" id="configUrl" placeholder="${service.urlPlaceholder}"
                       value="${escapeHtml(existing.url || '')}">
            </div>
            <p class="help-text">e.g. ${service.urlPlaceholder} or 192.168.1.100:5055</p>
        </div>

        <div class="form-group">
            <label>Authentication Method</label>
            <select id="seerrAuthMethodSelect" style="width: 100%; padding: 12px; border-radius: 8px; background: var(--input-background); border: 1px solid var(--glass-border); color: var(--text-primary);">
                <option value="apikey" ${seerrAuthMethod === 'apikey' ? 'selected' : ''}>API Key (Admin Access)</option>
                <option value="local" ${seerrAuthMethod === 'local' ? 'selected' : ''}>Local Account (Email/Password)</option>
                <option value="plex" ${seerrAuthMethod === 'plex' ? 'selected' : ''}>Plex Sign-In</option>
            </select>
            <p class="help-text">API Key = Admin access. Local/Plex = Your personal account.</p>
        </div>

        <!-- API Key Panel -->
        <div id="authPanelApiKey" class="auth-panel" style="${seerrAuthMethod === 'apikey' ? '' : 'display: none;'}">
            <div class="form-group">
                <label>API Key</label>
                <input type="password" id="configKey" placeholder="Enter API Key"
                       value="${escapeHtml(existing.key || '')}">
                <p class="help-text">Find in Seerr → Settings → General</p>
            </div>
        </div>

        <!-- Local Auth Panel -->
        <div id="authPanelLocal" class="auth-panel" style="${seerrAuthMethod === 'local' ? '' : 'display: none;'}">
            <div style="background: rgba(252, 129, 129, 0.1); border: 1px solid rgba(252, 129, 129, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 16px; display: flex; align-items: flex-start; gap: 10px;">
                <span style="font-size: 16px;">⚠️</span>
                <p style="color: #fc8181; font-size: 12px; margin: 0;">
                    <strong>Security Notice:</strong> Your password will be stored in plain text in the browser's local storage. Use a unique password for Seerr.
                </p>
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="configEmail" placeholder="your@email.com"
                       value="${escapeHtml(existing.email || '')}">
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="configPassword" placeholder="Password"
                       value="${escapeHtml(existing.password || '')}">
            </div>
        </div>

        <!-- Plex Auth Panel -->
        <div id="authPanelPlex" class="auth-panel" style="${seerrAuthMethod === 'plex' ? '' : 'display: none;'}">
            <div style="background: rgba(229, 160, 13, 0.1); border: 1px solid rgba(229, 160, 13, 0.3); border-radius: 12px; padding: 20px;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <span style="font-size: 24px;">🎬</span>
                    <span style="font-weight: 600; color: #E5A00D;">Plex Authentication</span>
                </div>
                <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 16px;">
                    Sign in with your Plex account to authenticate with Seerr.
                </p>
                <button type="button" id="plexSignInBtn" class="test-btn" style="background: #E5A00D; color: #000; border: none; width: 100%;">
                    Sign in with Plex
                </button>
                <div id="plexAuthStatus" style="margin-top: 12px; font-size: 13px; text-align: center;"></div>
            </div>
        </div>

        <div class="test-connection">
            <button type="button" class="test-btn" id="testBtn">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                Test Connection
            </button>
            <span class="test-status" id="testStatus"></span>
        </div>
    `;

    // Auth method toggle
    document.getElementById('seerrAuthMethodSelect').addEventListener('change', (e) => {
        seerrAuthMethod = e.target.value;
        document.getElementById('authPanelApiKey').style.display = seerrAuthMethod === 'apikey' ? '' : 'none';
        document.getElementById('authPanelLocal').style.display = seerrAuthMethod === 'local' ? '' : 'none';
        document.getElementById('authPanelPlex').style.display = seerrAuthMethod === 'plex' ? '' : 'none';
    });

    // Plex sign in
    document.getElementById('plexSignInBtn')?.addEventListener('click', startWizardPlexOAuth);

    // Test button
    document.getElementById('testBtn').addEventListener('click', () => testSeerrAuth());
}



// Show save status feedback
function showSaveStatus(message) {
    const statusEl = document.getElementById('testStatus');
    if (statusEl) {
        statusEl.innerHTML = `<span style="color: #48bb78;">✓ ${message}</span>`;
        setTimeout(() => {
            statusEl.innerHTML = '';
        }, 2000);
    }
}

// Plex OAuth for Setup Wizard
async function startWizardPlexOAuth() {
    const statusEl = document.getElementById('plexAuthStatus');
    statusEl.innerHTML = '<span style="color: #E5A00D;">Opening Plex login...</span>';
    
    const clientId = 'home-server-companion';
    
    try {
        const pinRes = await fetch('https://plex.tv/api/v2/pins', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Plex-Client-Identifier': clientId,
                'X-Plex-Product': 'Home Server Companion',
                'X-Plex-Device': 'Chrome Extension',
                'X-Plex-Version': '1.0'
            },
            body: JSON.stringify({ strong: true })
        });
        
        if (!pinRes.ok) throw new Error('Failed to get Plex PIN');
        
        const pinData = await pinRes.json();
        const authUrl = `https://app.plex.tv/auth#?clientID=${clientId}&code=${pinData.code}&context%5Bdevice%5D%5Bproduct%5D=Home%20Server%20Companion`;
        
        const authWindow = window.open(authUrl, 'PlexAuth', 'width=800,height=600');
        statusEl.innerHTML = '<span style="color: #E5A00D;">Waiting for Plex login...</span>';
        
        let attempts = 0;
        const pollInterval = setInterval(async () => {
            attempts++;
            if (attempts > 60 || (authWindow && authWindow.closed)) {
                clearInterval(pollInterval);
                
                try {
                    const checkRes = await fetch(`https://plex.tv/api/v2/pins/${pinData.id}`, {
                        headers: { 'Accept': 'application/json', 'X-Plex-Client-Identifier': clientId }
                    });
                    
                    if (checkRes.ok) {
                        const checkData = await checkRes.json();
                        if (checkData.authToken) {
                            // Save token
                            serviceConfigs['seerr'] = serviceConfigs['seerr'] || {};
                            serviceConfigs['seerr'].plexToken = checkData.authToken;
                            statusEl.innerHTML = '<span style="color: #48bb78;">✓ Plex account linked!</span>';
                            return;
                        }
                    }
                } catch {}
                
                statusEl.innerHTML = '<span style="color: #fc8181;">Login failed or cancelled.</span>';
            }
        }, 2000);

    } catch (e) {
        statusEl.innerHTML = `<span style="color: #fc8181;">Error: ${escapeHtml(e.message)}</span>`;
    }
}

// Save current Seerr config
function saveCurrentSeerrConfig() {
    const protocol = document.getElementById('configProtocol').value;
    const urlInput = document.getElementById('configUrl').value.trim();
    const cleanUrl = urlInput.replace(/^https?:\/\//, '').replace(/\/$/, '');

    serviceConfigs['seerr'] = {
        protocol,
        url: cleanUrl
    };

    if (seerrAuthMethod === 'apikey') {
        serviceConfigs['seerr'].key = document.getElementById('configKey')?.value.trim() || '';
    } else if (seerrAuthMethod === 'local') {
        serviceConfigs['seerr'].email = document.getElementById('configEmail')?.value.trim() || '';
        serviceConfigs['seerr'].password = document.getElementById('configPassword')?.value.trim() || '';
    }

    serviceConfigs['seerr'].authMethod = seerrAuthMethod;
}

// Test Seerr connection in wizard
async function testSeerrAuth() {
    const statusEl = document.getElementById('testStatus');
    const protocol = document.getElementById('configProtocol').value;
    const urlInput = document.getElementById('configUrl').value.trim();

    if (!urlInput) {
        statusEl.innerHTML = '<span style="color: #fc8181;">URL required</span>';
        return;
    }

    const cleanUrl = urlInput.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const fullUrl = protocol + cleanUrl;
    statusEl.innerHTML = '<span style="color: var(--accent-primary);">Testing...</span>';

    try {
        // Request permission first
        const urlObj = new URL(fullUrl);
        await new Promise((resolve, reject) => {
            chrome.permissions.request({ origins: [`${urlObj.origin}/*`] }, (granted) => {
                if (granted) resolve();
                else reject(new Error('Permission denied'));
            });
        });

        if (seerrAuthMethod === 'apikey') {
            const apiKey = document.getElementById('configKey')?.value.trim();
            const res = await fetch(`${fullUrl}/api/v1/auth/me`, {
                headers: { 'X-Api-Key': apiKey }
            });
            if (res.ok) {
                const user = await res.json();
                statusEl.innerHTML = `<span style="color: #48bb78;">✓ ${escapeHtml(user.displayName || user.email)}</span>`;
            } else if (res.status === 401) {
                statusEl.innerHTML = '<span style="color: #fc8181;">Invalid API Key</span>';
            } else {
                statusEl.innerHTML = `<span style="color: #fc8181;">Error: ${escapeHtml(res.status)}</span>`;
            }
        } else if (seerrAuthMethod === 'plex') {
            const plexToken = serviceConfigs['seerr']?.plexToken;
            if (!plexToken) {
                statusEl.innerHTML = '<span style="color: #fc8181;">Please sign in with Plex first</span>';
                return;
            }
            // First authenticate with Plex token
            const authRes = await fetch(`${fullUrl}/api/v1/auth/plex`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authToken: plexToken })
            });
            if (authRes.ok) {
                const authData = await authRes.json();
                // Seerr returns user data directly (displayName, id, permissions, etc.)
                statusEl.innerHTML = `<span style="color: #48bb78;">✓ Connected as ${escapeHtml(authData.displayName || authData.plexUsername || authData.email || 'Authenticated')}</span>`;
            } else {
                statusEl.innerHTML = `<span style="color: #fc8181;">Plex auth failed: ${escapeHtml(authRes.status)}</span>`;
            }
        } else if (seerrAuthMethod === 'local') {
            const email = document.getElementById('configEmail')?.value.trim();
            const password = document.getElementById('configPassword')?.value.trim();
            if (!email || !password) {
                statusEl.innerHTML = '<span style="color: #fc8181;">Email and password required</span>';
                return;
            }
            const loginRes = await fetch(`${fullUrl}/api/v1/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            if (loginRes.ok) {
                const loginData = await loginRes.json();
                // Seerr returns user data directly
                statusEl.innerHTML = `<span style="color: #48bb78;">✓ Connected as ${escapeHtml(loginData.displayName || loginData.email || 'Authenticated')}</span>`;
            } else {
                const errorData = await loginRes.json().catch(() => ({}));
                statusEl.innerHTML = `<span style="color: #fc8181;">${escapeHtml(errorData.message || 'Login failed')}</span>`;
            }
        }
    } catch (e) {
        if (e.message === 'Permission denied') {
            statusEl.innerHTML = '<span style="color: #fc8181;">Permission required - please allow access</span>';
        } else {
            statusEl.innerHTML = `<span style="color: #fc8181;">${escapeHtml(e.message)}</span>`;
        }
    }
}

function saveCurrentPortainerInstance() {
    if (portainerInstances.length === 0) return;
    
    const nameEl = document.getElementById('configName');
    const protocolEl = document.getElementById('configProtocol');
    const urlEl = document.getElementById('configUrl');
    const keyEl = document.getElementById('configKey');
    
    if (!urlEl) return;
    
    const instance = portainerInstances[currentPortainerInstanceIndex];
    instance.name = nameEl?.value?.trim() || '';
    instance.protocol = protocolEl?.value || 'http://';
    instance.url = urlEl?.value?.trim()?.replace(/^https?:\/\//, '')?.replace(/\/$/, '') || '';
    instance.key = keyEl?.value?.trim() || '';
}

async function testConnection(service) {
    const protocol = document.getElementById('configProtocol').value;
    const urlInput = document.getElementById('configUrl').value.trim().replace(/\/$/, '');
    const apiKey = document.getElementById('configKey').value.trim();
    const statusEl = document.getElementById('testStatus');
    
    if (!urlInput) {
        statusEl.className = 'test-status error';
        statusEl.textContent = '❌ Please enter a URL';
        return;
    }
    
    const cleanUrl = urlInput.replace(/^https?:\/\//, '');
    const fullUrl = protocol + cleanUrl;
    
    statusEl.className = 'test-status loading';
    statusEl.innerHTML = '<span class="loading-spinner"></span> Testing...';
    
    let testUrl = '';
    let options = { method: 'GET' };
    
    try {
        new URL(fullUrl);
    } catch {
        statusEl.className = 'test-status error';
        statusEl.textContent = '❌ Invalid URL';
        return;
    }
    
    // Build test URL based on service
    switch(service.id) {
        case 'sabnzbd':
            testUrl = `${fullUrl}/api?mode=queue&output=json&apikey=${apiKey}&limit=1`;
            break;
        case 'sonarr':
            testUrl = `${fullUrl}/api/v3/system/status?apikey=${apiKey}`;
            break;
        case 'radarr':
            testUrl = `${fullUrl}/api/v3/system/status?apikey=${apiKey}`;
            break;
        case 'tautulli':
            testUrl = `${fullUrl}/api/v2?apikey=${apiKey}&cmd=get_activity`;
            break;
        case 'seerr':
            testUrl = `${fullUrl}/api/v1/status`;
            options.headers = { 'X-Api-Key': apiKey };
            break;
        case 'prowlarr':
            testUrl = `${fullUrl}/api/v1/health?apikey=${apiKey}`;
            break;
        case 'wizarr':
            testUrl = `${fullUrl}/api/status`;
            options.headers = { 'X-API-Key': apiKey, 'accept': 'application/json' };
            break;
        case 'tracearr':
            testUrl = `${fullUrl}/api/v1/public/health`;
            options.headers = { 'Authorization': `Bearer ${apiKey}` };
            break;
        case 'portainer':
            testUrl = `${fullUrl}/api/status`;
            options.headers = { 'X-API-Key': apiKey, 'accept': 'application/json' };
            break;
        case 'plex':
            testUrl = fullUrl + (apiKey ? `/?X-Plex-Token=${apiKey}` : '');
            break;
        case 'unraid':
            testUrl = fullUrl;
            if (apiKey) {
                options.method = 'POST';
                options.headers = { 'Content-Type': 'application/json', 'X-API-Key': apiKey };
                options.body = JSON.stringify({ query: "{ info { versions { core { unraid } } } }" });
                testUrl = `${fullUrl}/graphql`;
            } else {
                options.mode = 'no-cors';
            }
            break;
        default:
            testUrl = fullUrl;
    }
    
    try {
        // First, request permission for this origin
        const urlObj = new URL(fullUrl);
        
        await new Promise((resolve, reject) => {
            chrome.permissions.request({ origins: [`${urlObj.origin}/*`] }, (granted) => {
                if (granted) resolve();
                else reject(new Error('Permission denied'));
            });
        });
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        options.signal = controller.signal;
        
        const response = await fetch(testUrl, options);
        clearTimeout(timeoutId);
        
        if (response.ok || (service.id === 'unraid' && !apiKey)) {
            statusEl.className = 'test-status success';
            statusEl.textContent = '✓ Connection successful!';
        } else {
            statusEl.className = 'test-status error';
            statusEl.textContent = `❌ Error: ${response.status}`;
        }
    } catch (err) {
        statusEl.className = 'test-status error';
        if (err.message === 'Permission denied') {
            statusEl.textContent = '❌ Permission denied';
        } else {
            statusEl.textContent = '❌ Connection failed';
        }
        console.error('Test connection error:', err);
    }
}

function saveCurrentConfig() {
    if (configQueue.length === 0) return true;
    
    const service = configQueue[currentConfigIndex];
    
    // Special handling for Portainer
    if (service.id === 'portainer') {
        saveCurrentPortainerInstance();
        return true;
    }
    
    // Special handling for Seerr (multi-auth)
    if (service.id === 'seerr') {
        const protocol = document.getElementById('configProtocol')?.value || 'http://';
        const urlInput = document.getElementById('configUrl')?.value?.trim() || '';
        
        if (!urlInput) return true; // Skip if no URL
        
        const cleanUrl = urlInput.replace(/^https?:\/\//, '').replace(/\/$/, '');
        
        serviceConfigs['seerr'] = serviceConfigs['seerr'] || {};
        serviceConfigs['seerr'].protocol = protocol;
        serviceConfigs['seerr'].url = cleanUrl;
        serviceConfigs['seerr'].fullUrl = protocol + cleanUrl;
        serviceConfigs['seerr'].authMethod = seerrAuthMethod;
        
        if (seerrAuthMethod === 'apikey') {
            serviceConfigs['seerr'].key = document.getElementById('configKey')?.value?.trim() || '';
        } else if (seerrAuthMethod === 'local') {
            serviceConfigs['seerr'].email = document.getElementById('configEmail')?.value?.trim() || '';
            serviceConfigs['seerr'].password = document.getElementById('configPassword')?.value || '';
        }
        // Plex token is saved in startWizardPlexOAuth
        
        return true;
    }
    
    const protocol = document.getElementById('configProtocol')?.value || 'http://';
    const urlInput = document.getElementById('configUrl')?.value?.trim() || '';
    const key = document.getElementById('configKey')?.value?.trim() || '';
    
    // Allow skipping if no URL entered
    if (!urlInput) {
        return true; // Skip this service
    }
    
    const cleanUrl = urlInput.replace(/^https?:\/\//, '').replace(/\/$/, '');
    
    serviceConfigs[service.id] = {
        protocol,
        url: cleanUrl,
        key,
        fullUrl: protocol + cleanUrl
    };
    
    return true;
}

function showFinalStep() {
    // Hide all steps, show final
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.querySelector('.step[data-step="final"]').classList.add('active');
    
    // Update progress
    currentStep = 'final';
    progressFill.style.width = '100%';
    document.querySelectorAll('.progress-step').forEach(step => {
        step.classList.remove('active');
        step.classList.add('completed');
    });
    
    // Render summary
    renderSummary();
    updateNavigation();
}

function renderSummary() {
    const summaryList = document.getElementById('summaryList');
    
    const enabledServices = SERVICES.filter(s => selectedServices.has(s.id));
    
    summaryList.innerHTML = enabledServices.map(service => {
        const config = serviceConfigs[service.id];
        const isConfigured = config && config.url;
        
        return `
            <div class="summary-item">
                <div class="summary-item-left">
                    <div class="summary-item-icon">${service.icon}</div>
                    <span class="summary-item-name">${service.name}</span>
                </div>
                <span class="summary-status ${isConfigured || !service.hasConfig ? 'configured' : 'skipped'}">
                    ${!service.hasConfig ? 'Enabled' : (isConfigured ? 'Configured' : 'Skipped')}
                </span>
            </div>
        `;
    }).join('');
}

function nextStep() {
    if (currentStep === 1) {
        // Go to service selection
        currentStep = 2;
        showStep(2);
    } else if (currentStep === 2) {
        // Build config queue and start configuring
        buildConfigQueue();
        if (configQueue.length > 0) {
            currentStep = 3;
            showStep(3);
            renderConfigStep();
        } else {
            showFinalStep();
        }
    } else if (currentStep === 3) {
        // Save current config and go to next service or finish
        saveCurrentConfig();
        currentConfigIndex++;
        
        if (currentConfigIndex < configQueue.length) {
            renderConfigStep();
        } else {
            showFinalStep();
        }
    } else if (currentStep === 'final') {
        // Complete setup
        completeSetup();
    }
    
    updateProgress();
    updateNavigation();
}

function prevStep() {
    if (currentStep === 2) {
        currentStep = 1;
        showStep(1);
    } else if (currentStep === 3) {
        saveCurrentConfig();
        if (currentConfigIndex > 0) {
            currentConfigIndex--;
            renderConfigStep();
        } else {
            currentStep = 2;
            showStep(2);
        }
    } else if (currentStep === 'final') {
        // Go back to last config step
        if (configQueue.length > 0) {
            currentStep = 3;
            currentConfigIndex = configQueue.length - 1;
            showStep(3);
            renderConfigStep();
        } else {
            currentStep = 2;
            showStep(2);
        }
    }
    
    updateProgress();
    updateNavigation();
}

function showStep(stepNum) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.querySelector(`.step[data-step="${stepNum}"]`)?.classList.add('active');
}

function updateNavigation() {
    // Back button
    btnBack.style.visibility = currentStep === 1 ? 'hidden' : 'visible';
    
    // Next button text
    if (currentStep === 'final') {
        btnNext.innerHTML = `
            Complete Setup
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        `;
    } else if (currentStep === 3 && currentConfigIndex === configQueue.length - 1) {
        btnNext.innerHTML = `
            Finish
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        `;
    } else {
        btnNext.innerHTML = `
            Next
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        `;
    }
}

async function completeSetup() {
    // Save all configurations to Chrome Storage
    const dataToSave = {
        setupCompleted: true,
        setupCompletedAt: new Date().toISOString()
    };
    
    // Save enabled state for each service
    SERVICES.forEach(service => {
        dataToSave[`${service.id}Enabled`] = selectedServices.has(service.id);
    });
    
    // Save service configurations (except Portainer which uses instances)
    for (const [serviceId, config] of Object.entries(serviceConfigs)) {
        if (serviceId === 'portainer') continue; // Handled separately

        // Save URL (from fullUrl or construct from protocol + url)
        if (config.fullUrl) {
            dataToSave[`${serviceId}Url`] = config.fullUrl;
        } else if (config.protocol && config.url) {
            dataToSave[`${serviceId}Url`] = config.protocol + config.url;
        }

        if (config.key) {
            // Special handling for Plex (uses plexToken)
            if (serviceId === 'plex') {
                dataToSave['plexToken'] = config.key;
                // Set Plex redirect mode based on configuration
                dataToSave['plexRedirectMode'] = 'app'; // If configured with URL, use app mode
            } else {
                dataToSave[`${serviceId}Key`] = config.key;
            }
        }
        
        // Special handling for Seerr multi-auth
        if (serviceId === 'seerr' && config.authMethod) {
            dataToSave['seerrAuthMethod'] = config.authMethod;
            
            if (config.authMethod === 'local') {
                if (config.email) dataToSave['seerrEmail'] = config.email;
                if (config.password) dataToSave['seerrPassword'] = config.password;
            } else if (config.authMethod === 'plex' && config.plexToken) {
                dataToSave['seerrPlexToken'] = config.plexToken;
            }
        }
        
        // Special handling for Plex redirect mode if URL is configured but no token
        if (serviceId === 'plex' && config.fullUrl && !dataToSave.plexRedirectMode) {
            dataToSave['plexRedirectMode'] = 'app';
        }
    }
    
    // Only set Plex redirect mode if Plex was actually selected (don't overwrite existing settings)
    if (selectedServices.has('plex') && !dataToSave.plexRedirectMode) {
        dataToSave['plexRedirectMode'] = serviceConfigs['plex']?.fullUrl ? 'app' : 'web';
    }
    // If Plex is NOT selected, we do NOT touch plexRedirectMode - keep existing value
    
    // Save Portainer instances (format compatible with options.js)
    if (selectedServices.has('portainer') && portainerInstances.length > 0) {
        const validInstances = portainerInstances
            .filter(inst => inst.url) // Only save instances with URLs
            .map(inst => ({
                id: inst.id,
                name: inst.name || 'Portainer',
                url: inst.protocol + inst.url,
                key: inst.key || '',
                icon: ''
            }));
        
        if (validInstances.length > 0) {
            dataToSave.portainerInstances = validInstances;
        }
    }
    
    // Save service order (enabled services first, with Portainer instances)
    const enabledOrder = [];
    SERVICES.forEach(s => {
        if (selectedServices.has(s.id)) {
            if (s.id === 'portainer' && portainerInstances.length > 0) {
                // Add each Portainer instance
                portainerInstances.filter(inst => inst.url).forEach(inst => {
                    enabledOrder.push('portainer_' + inst.id);
                });
            } else {
                enabledOrder.push(s.id);
            }
        }
    });
    dataToSave.serviceOrder = enabledOrder;
    
    // Request host permissions for all configured URLs
    const originsToRequest = [];
    for (const config of Object.values(serviceConfigs)) {
        if (config.fullUrl) {
            try {
                const urlObj = new URL(config.fullUrl);
                originsToRequest.push(`${urlObj.origin}/*`);
            } catch {}
        }
    }
    
    // Add Portainer instance URLs
    portainerInstances.forEach(inst => {
        if (inst.url) {
            try {
                const fullUrl = inst.protocol + inst.url;
                const urlObj = new URL(fullUrl);
                originsToRequest.push(`${urlObj.origin}/*`);
            } catch {}
        }
    });
    
    if (originsToRequest.length > 0) {
        await new Promise(resolve => {
            chrome.permissions.request({ origins: originsToRequest }, resolve);
        });
    }
    
    // Save to storage
    await new Promise(resolve => {
        chrome.storage.sync.set(dataToSave, resolve);
    });
    
    // Notify background to update Portainer rules
    chrome.runtime.sendMessage({ action: 'UPDATE_PORTAINER_RULES' });
    
    // Close this tab and open the extension popup or options
    // For better UX, we'll redirect to the options page with a success message
    window.location.href = 'options.html?setup=complete';
}
