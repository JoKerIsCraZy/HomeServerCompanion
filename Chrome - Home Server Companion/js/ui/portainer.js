import * as Portainer from "../../services/portainer.js";
import { showNotification } from "../utils.js";

// Cache settings
const CACHE_KEY = "portainer_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const SELECTED_INSTANCE_KEY = "portainer_selected_instance";

// Global state for instances
let portainerInstances = [];
let currentInstanceId = null;

/**
 * Initializes the Portainer service view.
 * Now supports multiple instances.
 */
export async function initPortainer(url, token, state) {
    try {
        // Ensure background rules are up to date
        chrome.runtime.sendMessage({ action: 'UPDATE_PORTAINER_RULES' });

        // Load instances from storage
        const items = await chrome.storage.sync.get(['portainerInstances', 'portainerUrl', 'portainerKey']);

        if (items.portainerInstances && items.portainerInstances.length > 0) {
            portainerInstances = items.portainerInstances.filter(i => i.url && i.key);
        } else if (items.portainerUrl && items.portainerKey) {
            // Migration from old format
            portainerInstances = [{
                id: 'legacy',
                name: 'Portainer',
                url: items.portainerUrl,
                key: items.portainerKey,
                icon: ''
            }];
        }

        if (portainerInstances.length === 0) {
            throw new Error("No Portainer instances configured");
        }

        // Get previously selected instance or use first
        const savedInstanceId = localStorage.getItem(SELECTED_INSTANCE_KEY);
        const savedInstance = portainerInstances.find(i => i.id === savedInstanceId);
        currentInstanceId = savedInstance ? savedInstance.id : portainerInstances[0].id;

        // Render instance selector
        renderInstanceSelector(state);

        // Load selected instance
        await loadInstance(currentInstanceId, state);

    } catch (error) {
        console.error("Portainer loading error:", error);
        const containerTab = document.getElementById("portainer-containers");
        if (containerTab) {
            containerTab.innerHTML = `<div class="queue-empty"><div class="queue-empty-icon">⚠️</div><div class="queue-empty-text">Failed to load Portainer: ${error.message}</div></div>`;
        }
    }
}

/**
 * Renders instance selector dropdown if multiple instances exist.
 */
function renderInstanceSelector(state) {
    const containerTab = document.getElementById("portainer-containers");
    if (!containerTab) return;

    // Remove existing selector
    const existing = document.getElementById('portainer-instance-selector');
    if (existing) existing.remove();

    // Only show if more than 1 instance
    if (portainerInstances.length <= 1) return;

    const selectorDiv = document.createElement('div');
    selectorDiv.id = 'portainer-instance-selector';
    selectorDiv.className = 'instance-selector';

    const select = document.createElement('select');
    select.id = 'portainer-instance-select';

    portainerInstances.forEach(inst => {
        const option = document.createElement('option');
        option.value = inst.id;
        option.textContent = inst.name || 'Portainer';
        if (inst.id === currentInstanceId) option.selected = true;
        select.appendChild(option);
    });

    select.onchange = async (e) => {
        const newId = e.target.value;
        currentInstanceId = newId;
        localStorage.setItem(SELECTED_INSTANCE_KEY, newId);
        await loadInstance(newId, state);
    };

    selectorDiv.appendChild(select);
    containerTab.insertBefore(selectorDiv, containerTab.firstChild);
}

/**
 * Loads data for a specific instance.
 */
async function loadInstance(instanceId, state) {
    const instance = portainerInstances.find(i => i.id === instanceId);
    if (!instance) return;

    const { url, key: token } = instance;
    const cacheKey = `${CACHE_KEY}_${instanceId}`;

    // Show loading state
    const containerTab = document.getElementById("portainer-containers");
    const stacksTab = document.getElementById("portainer-stacks");

    // Check cache first
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        try {
            const parsed = JSON.parse(cachedData);
            if (parsed.timestamp && (Date.now() - parsed.timestamp < CACHE_TTL)) {
                renderContainers(parsed.containers, url, token, state, parsed.endpointId, instanceId);
                renderStacks(parsed.stacks, url, token, state, parsed.endpointId);
            }
        } catch (e) {
            console.warn("Invalid Portainer cache", e);
        }
    }

    try {
        // Fetch endpoints first to get ID
        const endpoints = await Portainer.getEndpoints(url, token);
        if (!endpoints || endpoints.length === 0) {
            throw new Error("No Portainer endpoints found");
        }

        const endpointId = endpoints[0].Id;
        console.log("Using Portainer Endpoint ID:", endpointId);

        // Fetch fresh data
        const [containers, stacks] = await Promise.all([
            Portainer.getContainers(url, token, endpointId),
            Portainer.getStacks(url, token)
        ]);

        renderContainers(containers, url, token, state, endpointId, instanceId);
        renderStacks(stacks, url, token, state, endpointId);

        // Update cache
        localStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            endpointId,
            containers,
            stacks
        }));

        // Update badge
        updatePortainerBadge(containers);

    } catch (error) {
        console.error("Portainer instance loading error:", error);
        if (containerTab) {
            // Keep instance selector, just update content
            const existingSelector = document.getElementById('portainer-instance-selector');
            containerTab.innerHTML = '';
            if (existingSelector) containerTab.appendChild(existingSelector);

            const errorDiv = document.createElement('div');
            errorDiv.className = 'queue-empty';
            errorDiv.innerHTML = `<div class="queue-empty-icon">⚠️</div><div class="queue-empty-text">Failed to load: ${error.message}</div>`;
            containerTab.appendChild(errorDiv);
        }
    }
}

// function initPortainerTabs() handled by global popup.js

/**
 * Renders the container list.
 */
function renderContainers(containers, url, token, state, endpointId = 1) {
    const container = document.getElementById("portainer-containers");
    if (!container) return;
    
    // Get filter value
    const filterInput = document.getElementById("portainer-search");
    const filterValue = filterInput ? filterInput.value.toLowerCase() : "";
    
    // Filter containers
    let filtered = containers;
    if (filterValue) {
        filtered = containers.filter(c => {
            const name = (c.Names && c.Names[0]) ? c.Names[0].replace(/^\//, '') : '';
            return name.toLowerCase().includes(filterValue);
        });
    }
    
    // Sort: running first, then alphabetically
    filtered.sort((a, b) => {
        const aRunning = a.State === 'running';
        const bRunning = b.State === 'running';
        if (aRunning && !bRunning) return -1;
        if (!aRunning && bRunning) return 1;
        const aName = (a.Names && a.Names[0]) ? a.Names[0] : '';
        const bName = (b.Names && b.Names[0]) ? b.Names[0] : '';
        return aName.localeCompare(bName);
    });
    
    // Clear and render
    container.innerHTML = '';
    
    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    
    const linkBtn = document.createElement('button');
    linkBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    linkBtn.title = "Open Portainer";
    linkBtn.onclick = () => {
        let cleanUrl = url;
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        chrome.tabs.create({ url: cleanUrl });
    };
    
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'refresh-btn';
    refreshBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
    refreshBtn.title = "Refresh";
    refreshBtn.onclick = async () => {
        refreshBtn.classList.add('spinning');
        try {
            const newContainers = await Portainer.getContainers(url, token, endpointId);
            renderContainers(newContainers, url, token, state, endpointId);
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                containers: newContainers,
                stacks: JSON.parse(localStorage.getItem(CACHE_KEY) || '{}').stacks || []
            }));
        } finally {
            refreshBtn.classList.remove('spinning');
        }
    };
    
    toolbar.appendChild(linkBtn);
    toolbar.appendChild(refreshBtn);
    container.appendChild(toolbar);
    
    // Filter bar
    const filterBar = document.createElement('div');
    filterBar.className = 'filter-bar';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'portainer-search';
    searchInput.placeholder = 'Search containers...';
    searchInput.value = filterValue;
    searchInput.addEventListener('input', () => {
        renderContainers(containers, url, token, state, endpointId);
    });
    filterBar.appendChild(searchInput);
    container.appendChild(filterBar);

    // Restore focus to search input if it was active
    requestAnimationFrame(() => {
        const newSearchInput = document.getElementById('portainer-search');
        if (newSearchInput && filterValue) {
            newSearchInput.focus();
            newSearchInput.setSelectionRange(filterValue.length, filterValue.length);
        }
    });
    
    // Empty state
    if (filtered.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'queue-empty';
        emptyDiv.innerHTML = `
            <div class="queue-empty-icon">🐳</div>
            <div class="queue-empty-text">${filterValue ? 'No containers match filter' : 'No containers found'}</div>
        `;
        container.appendChild(emptyDiv);
        return;
    }
    
    // Container list
    const list = document.createElement('div');
    list.className = 'container-list';
    
    filtered.forEach(c => {
        const name = (c.Names && c.Names[0]) ? c.Names[0].replace(/^\//, '') : c.Id.substring(0, 12);
        const image = c.Image || 'Unknown';
        const status = c.Status || c.State || 'Unknown';
        const isRunning = c.State === 'running';
        const isPaused = c.State === 'paused';
        
        const card = document.createElement('div');
        card.className = `portainer-container-card ${isRunning ? 'running' : (isPaused ? 'paused' : 'stopped')}`;
        
        card.innerHTML = `
            <div class="status-dot ${isRunning ? 'running' : (isPaused ? 'paused' : 'stopped')}"></div>
            <div class="portainer-container-info">
                <div class="portainer-container-name" title="${name}">${name}</div>
                <div class="portainer-container-image" title="${image}">${image}</div>
                <div class="portainer-container-status">${status}</div>
            </div>
            <div class="portainer-container-actions">
                ${!isRunning ? `<button class="start-btn" title="Start"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>` : ''}
                ${isRunning ? `<button class="stop-btn" title="Stop"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg></button>` : ''}
                ${isRunning ? `<button class="restart-btn" title="Restart"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>` : ''}
            </div>
        `;
        
        // Action handlers
        const startBtn = card.querySelector('.start-btn');
        const stopBtn = card.querySelector('.stop-btn');
        const restartBtn = card.querySelector('.restart-btn');
        
        const statusDot = card.querySelector('.status-dot');

        if (startBtn) {
            startBtn.onclick = async (e) => {
                e.stopPropagation();
                card.classList.add('loading');
                startBtn.classList.add('btn-loading');
                if (statusDot) statusDot.className = 'status-dot paused';
                try {
                    await Portainer.controlContainer(url, token, endpointId, c.Id, 'start');
                    showNotification(`Container "${name}" started`, 'success');
                    const newContainers = await Portainer.getContainers(url, token, endpointId);
                    renderContainers(newContainers, url, token, state, endpointId);
                } catch (err) {
                    showNotification(`Failed to start: ${err.message}`, 'error');
                    if (statusDot) statusDot.className = 'status-dot stopped';
                } finally {
                    card.classList.remove('loading');
                    startBtn.classList.remove('btn-loading');
                    startBtn.blur();
                }
            };
        }

        if (stopBtn) {
            stopBtn.onclick = async (e) => {
                e.stopPropagation();
                card.classList.add('loading');
                stopBtn.classList.add('btn-loading');
                if (statusDot) statusDot.className = 'status-dot paused';
                try {
                    await Portainer.controlContainer(url, token, endpointId, c.Id, 'stop');
                    showNotification(`Container "${name}" stopped`, 'success');
                    const newContainers = await Portainer.getContainers(url, token, endpointId);
                    renderContainers(newContainers, url, token, state, endpointId);
                } catch (err) {
                    showNotification(`Failed to stop: ${err.message}`, 'error');
                    if (statusDot) statusDot.className = 'status-dot running';
                } finally {
                    card.classList.remove('loading');
                    stopBtn.classList.remove('btn-loading');
                    stopBtn.blur();
                }
            };
        }

        if (restartBtn) {
            restartBtn.onclick = async (e) => {
                e.stopPropagation();
                card.classList.add('loading');
                restartBtn.classList.add('btn-loading');
                if (statusDot) statusDot.className = 'status-dot paused';
                try {
                    await Portainer.controlContainer(url, token, endpointId, c.Id, 'restart');
                    showNotification(`Container "${name}" restarted`, 'success');
                    const newContainers = await Portainer.getContainers(url, token, endpointId);
                    renderContainers(newContainers, url, token, state, endpointId);
                } catch (err) {
                    showNotification(`Failed to restart: ${err.message}`, 'error');
                    if (statusDot) statusDot.className = 'status-dot running';
                } finally {
                    card.classList.remove('loading');
                    restartBtn.classList.remove('btn-loading');
                    restartBtn.blur();
                }
            };
        }
        
        list.appendChild(card);
    });
    
    container.appendChild(list);
}

/**
 * Renders the stacks list.
 */
function renderStacks(stacks, url, token, state, endpointId = 1) {
    const container = document.getElementById("portainer-stacks");
    if (!container) return;

    container.innerHTML = '';

    if (!stacks || stacks.length === 0) {
        container.innerHTML = `
            <div class="queue-empty">
                <div class="queue-empty-icon">📦</div>
                <div class="queue-empty-text">No stacks found</div>
            </div>
        `;
        return;
    }

    stacks.forEach(stack => {
        const card = document.createElement('div');
        const isActive = stack.Status === 1;
        const statusText = isActive ? 'Active' : 'Inactive';
        const statusClass = isActive ? 'running' : 'stopped';
        card.className = `portainer-stack-card ${statusClass}`;

        card.innerHTML = `
            <div class="stack-icon">📦</div>
            <div class="status-dot ${statusClass}"></div>
            <div class="portainer-stack-info">
                <div class="portainer-stack-name">${stack.Name}</div>
                <div class="portainer-stack-status">${statusText} • ${stack.Type === 1 ? 'Swarm' : 'Compose'}</div>
            </div>
            <div class="portainer-stack-actions">
                ${!isActive ? `<button class="start-btn" title="Start"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>` : ''}
                ${isActive ? `<button class="stop-btn" title="Stop"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg></button>` : ''}
            </div>
        `;

        const statusDot = card.querySelector('.status-dot');
        const startBtn = card.querySelector('.start-btn');
        const stopBtn = card.querySelector('.stop-btn');

        if (startBtn) {
            startBtn.onclick = async (e) => {
                e.stopPropagation();
                card.classList.add('loading');
                startBtn.classList.add('btn-loading');
                if (statusDot) statusDot.className = 'status-dot paused';
                try {
                    await Portainer.controlStack(url, token, stack.Id, 'start', endpointId);
                    showNotification(`Stack "${stack.Name}" started`, 'success');
                    const newStacks = await Portainer.getStacks(url, token);
                    renderStacks(newStacks, url, token, state, endpointId);
                } catch (err) {
                    showNotification(`Failed to start: ${err.message}`, 'error');
                    if (statusDot) statusDot.className = 'status-dot stopped';
                } finally {
                    card.classList.remove('loading');
                    startBtn.classList.remove('btn-loading');
                    startBtn.blur();
                }
            };
        }

        if (stopBtn) {
            stopBtn.onclick = async (e) => {
                e.stopPropagation();
                card.classList.add('loading');
                stopBtn.classList.add('btn-loading');
                if (statusDot) statusDot.className = 'status-dot paused';
                try {
                    await Portainer.controlStack(url, token, stack.Id, 'stop', endpointId);
                    showNotification(`Stack "${stack.Name}" stopped`, 'success');
                    const newStacks = await Portainer.getStacks(url, token);
                    renderStacks(newStacks, url, token, state, endpointId);
                } catch (err) {
                    showNotification(`Failed to stop: ${err.message}`, 'error');
                    if (statusDot) statusDot.className = 'status-dot running';
                } finally {
                    card.classList.remove('loading');
                    stopBtn.classList.remove('btn-loading');
                    stopBtn.blur();
                }
            };
        }

        container.appendChild(card);
    });
}

/**
 * Updates the badge for Portainer nav item.
 */
function updatePortainerBadge(containers) {
    const navItem = document.querySelector('.nav-item[data-target="portainer"]');
    if (!navItem) return;
    
    // User requested to hide the badge
    let badge = navItem.querySelector('.badge');
    if (badge) {
        badge.classList.add('hidden');
    }
}

/**
 * Background badge update for dashboard.
 */
export async function updatePortainerBadge_Dashboard(url, token) {
    try {
        const endpoints = await Portainer.getEndpoints(url, token);
        const endpointId = (endpoints && endpoints.length > 0) ? endpoints[0].Id : 1;
        const containers = await Portainer.getContainers(url, token, endpointId);
        const running = containers.filter(c => c.State === 'running').length;
        return {
            status: 'online',
            metric: `${running} running`
        };
    } catch (error) {
        return { status: 'offline', metric: '--' };
    }
}
