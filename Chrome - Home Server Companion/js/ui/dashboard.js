export async function initDashboard(state) {
    const container = document.getElementById('dashboard-view');
    // Clear existing content (or reuse if we implement diffing later)
    container.textContent = '';

    // 1. Header / Greeting
    const header = document.createElement('div');
    header.className = 'dashboard-header';
    
    // Build header with DOM API
    const headerContent = document.createElement('div');
    headerContent.className = 'header-content';
    headerContent.style.cssText = 'display: flex; justify-content: space-between; align-items: center; width: 100%;';
    
    const greetingContainer = document.createElement('div');
    greetingContainer.className = 'greeting-container';
    const h1 = document.createElement('h1');
    h1.id = 'greeting-text';
    h1.textContent = 'Good Day';
    const pSubtitle = document.createElement('p');
    pSubtitle.className = 'date-subtitle';
    pSubtitle.textContent = 'Welcome Back';
    greetingContainer.appendChild(h1);
    greetingContainer.appendChild(pSubtitle);
    
    const clockCard = document.createElement('div');
    clockCard.className = 'clock-card';
    clockCard.style.cssText = 'text-align: right; min-width: 150px;';
    const timeDiv = document.createElement('div');
    timeDiv.id = 'dashboard-time';
    timeDiv.style.cssText = 'font-size: 32px; font-weight: 700; color: #fff; line-height: 1;';
    timeDiv.textContent = '--:--';
    const dateDiv = document.createElement('div');
    dateDiv.id = 'dashboard-date';
    dateDiv.style.cssText = 'font-size: 13px; color: rgba(255,255,255,0.6); margin-top: 5px; font-weight: 500;';
    dateDiv.textContent = '--';
    clockCard.appendChild(timeDiv);
    clockCard.appendChild(dateDiv);
    
    headerContent.appendChild(greetingContainer);
    headerContent.appendChild(clockCard);
    header.appendChild(headerContent);
    container.appendChild(header);

    // Start Clock
    startClock(state);

    const grid = document.createElement('div');
    grid.className = 'dashboard-grid';
    const loadingSpinner = document.createElement('div');
    loadingSpinner.className = 'loading-spinner';
    loadingSpinner.textContent = 'Loading System Status...';
    grid.appendChild(loadingSpinner);
    container.appendChild(grid);

    // 3. Trigger Parallel Status Checks
    // We'll populate this in the next step
    renderServiceGrid(grid, state);

    // 4. Auto Refresh Loop
    // Use configured interval or default 5000ms
    const intervalTime = parseInt(state.configs.refreshInterval) || 5000;
    
    // Clear any existing interval to be safe (though popup.js usually handles view transitions)
    if (state.refreshInterval) clearInterval(state.refreshInterval);

    state.refreshInterval = setInterval(() => {
        // Only refresh if Dashboard is actually active/visible in DOM
        if (document.getElementById('dashboard-view')) {
            // We use 'quiet' updates often, but renderServiceGrid replaces innerHTML currently.
            // For smoother updates, we should implementation diffing or just update values.
            // For now, full re-render is acceptable as per previous design, but let's be careful.
            // Actually, `renderServiceGrid` clears innerHTML: `container.innerHTML = '';`
            // This causes flickering. We should optimize `renderServiceGrid` to UPDATE if exists.
            
            // Re-render
            renderServiceGrid(grid, state, true); // Pass 'true' for update mode
        } else {
            clearInterval(state.refreshInterval);
        }
    }, intervalTime);
}

// Imports from Service APIs
import * as Sabnzbd from "../../services/sabnzbd.js";
import * as Sonarr from "../../services/sonarr.js";
import * as Radarr from "../../services/radarr.js";
import * as Tautulli from "../../services/tautulli.js";
import * as Overseerr from "../../services/overseerr.js";
import * as Unraid from "../../services/unraid.js";
import * as Prowlarr from "../../services/prowlarr.js";
import * as Wizarr from "../../services/wizarr.js";

async function renderServiceGrid(container, state, isUpdate = false) {
    // Only clear if NOT updating
    if (!isUpdate) container.textContent = '';

    // Define services and their specific check functions
    const services = [
        {
            id: 'unraid',
            name: 'Unraid',
            icon: 'unraid.png',
            check: async (url, key) => {
                const data = await Unraid.getSystemData(url, key);
                const cpu = Math.round(data.cpu || 0);
                const ram = Math.round(data.ram || 0);
                return {
                    status: 'online',
                    metric: { cpu, ram }, // Structured object for safe DOM rendering
                    label: '' // Label is now integrated
                };
            }
        },
        { 
            id: 'sabnzbd', 
            name: 'SABnzbd', 
            icon: 'sabnzbd.png',
            check: async (url, key) => {
                const queue = await Sabnzbd.getSabnzbdQueue(url, key);
                const count = queue.noofslots || 0;
                const speed = queue.speed || '0 B/s';
                return { status: 'online', metric: count, label: 'In Queue', sub: speed };
            }
        },
        { 
            id: 'sonarr', 
            name: 'Sonarr', 
            icon: 'sonarr.png',
            check: async (url, key) => {
                const queue = await Sonarr.getSonarrQueue(url, key);
                return { status: 'online', metric: queue.totalRecords || 0, label: 'In Queue' };
            }
        },
        { 
            id: 'radarr', 
            name: 'Radarr', 
            icon: 'radarr.png',
            check: async (url, key) => {
                const queue = await Radarr.getRadarrQueue(url, key);
                return { status: 'online', metric: queue.totalRecords || 0, label: 'In Queue' };
            }
        },
        { 
            id: 'tautulli', 
            name: 'Tautulli', 
            icon: 'tautulli.png', 
            check: async (url, key) => {
                const activity = await Tautulli.getTautulliActivity(url, key);
                return { status: 'online', metric: activity.stream_count || 0, label: 'Streams' };
            }
        },
        { 
            id: 'overseerr', 
            name: 'Overseerr', 
            icon: 'overseerr.png',
            check: async (url, key) => {
                const requests = await Overseerr.getRequests(url, key);
                // Filter for pending
                const pending = requests.results ? requests.results.filter(r => r.status === 1).length : 0; 
                return { status: 'online', metric: pending, label: 'Pending' };
            }
        },
        {
            id: 'prowlarr',
            name: 'Prowlarr',
            icon: 'prowlarr.png',
            check: async (url, key) => {
               await Prowlarr.getProwlarrIndexers(url, key);
               return { status: 'online', metric: 'OK', label: 'Status' };
            }
        },
        {
            id: 'wizarr',
            name: 'Wizarr',
            icon: 'wizarr.png',
            check: async (url, key) => {
               // Wizarr doesn't always have simple stats, just check connection
               await Wizarr.getInvitations(url, key);
               return { status: 'online', metric: 'OK', label: 'Status' };
            }
        }
    ];

    // Filter enabled services
    let enabledServices = services.filter(svc => state.configs[`${svc.id}Enabled`] !== false);

    // Apply Custom Sort Order if present
    if (state.configs.serviceOrder && Array.isArray(state.configs.serviceOrder)) {
        const orderMap = new Map();
        state.configs.serviceOrder.forEach((id, index) => orderMap.set(id, index));
        
        enabledServices.sort((a, b) => {
            const indexA = orderMap.has(a.id) ? orderMap.get(a.id) : 999;
            const indexB = orderMap.has(b.id) ? orderMap.get(b.id) : 999;
            return indexA - indexB;
        });
    }

    // Create placeholders ONLY if not updating
    if (!isUpdate) {
        enabledServices.forEach(svc => {
            const card = document.createElement('div');
            card.className = 'service-card';
            card.id = `card-${svc.id}`;
            card.onclick = () => {
                 const navItem = document.querySelector(`.nav-item[data-target="${svc.id}"]`);
                 if (navItem) navItem.click();
            };
            // Build card with DOM API
            const cardHeader = document.createElement('div');
            cardHeader.className = 'service-card-header';
            
            const iconImg = document.createElement('img');
            iconImg.src = 'icons/' + svc.icon;
            iconImg.className = 'service-icon';
            iconImg.alt = svc.name;
            cardHeader.appendChild(iconImg);
            
            const statusDot = document.createElement('div');
            statusDot.className = 'status-dot casting-shadow';
            statusDot.id = 'status-' + svc.id;
            cardHeader.appendChild(statusDot);
            
            const serviceName = document.createElement('div');
            serviceName.className = 'service-name';
            serviceName.textContent = svc.name;
            
            const serviceMetric = document.createElement('div');
            serviceMetric.className = 'service-metric';
            serviceMetric.id = 'metric-' + svc.id;
            serviceMetric.textContent = '--';
            
            const serviceLabel = document.createElement('div');
            serviceLabel.className = 'service-metric-label';
            serviceLabel.id = 'label-' + svc.id;
            serviceLabel.textContent = 'Checking...';
            
            card.appendChild(cardHeader);
            card.appendChild(serviceName);
            card.appendChild(serviceMetric);
            card.appendChild(serviceLabel);
            container.appendChild(card);
        });
    }

    // Run checks in parallel
    const checks = enabledServices.map(async (svc) => {
        const url = state.configs[`${svc.id}Url`];
        const key = state.configs[`${svc.id}Key`];

        // Validation for Unraid/Wizarr which might not have keys or different logic
        if (svc.id !== 'unraid' && svc.id !== 'wizarr' && (!url || !key)) {
             updateCard(svc.id, 'offline', 'Cfg', 'Missing Config');
             return;
        }

        try {
            const result = await svc.check(url, key);
            updateCard(svc.id, result.status, result.metric, result.label);

            // Smart Navigation: Go to Queue if items are pending
            if ((svc.id === 'sonarr' || svc.id === 'radarr') && result.metric > 0) {
                const card = document.getElementById(`card-${svc.id}`);
                if (card) {
                    card.onclick = () => {
                         // 1. Switch to Service
                         const navItem = document.querySelector(`.nav-item[data-target="${svc.id}"]`);
                         if (navItem) navItem.click();
                         
                         // 2. Force Switch to Queue Tab (Overrides restoreView)
                         setTimeout(() => {
                             const view = document.getElementById(`${svc.id}-view`);
                             if (view) {
                                 const queueBtn = view.querySelector(`.tab-btn[data-tab="queue"]`);
                                 if (queueBtn) queueBtn.click();
                             }
                         }, 150);
                    };
                }
            } else if (svc.id === 'sabnzbd' && parseInt(result.metric) > 0) {
            }
            
        } catch (e) {
            updateCard(svc.id, 'offline', 'ERR', 'Offline');
        }
    });
    
    await Promise.allSettled(checks);
}

function updateCard(id, status, metric, label) {
    const dot = document.getElementById(`status-${id}`);
    const metricEl = document.getElementById(`metric-${id}`);
    const labelEl = document.getElementById(`label-${id}`);

    if (dot) {
        dot.className = `status-dot ${status}`;
        if (status === 'online') dot.classList.add('pulse');
    }
    if (metricEl) {
        metricEl.textContent = '';
        if (typeof metric === 'object' && metric !== null) {
            // Structured metric (e.g., Unraid with cpu/ram)
            if (metric.cpu !== undefined && metric.ram !== undefined) {
                const container = document.createElement('div');
                container.style.cssText = 'font-size: 16px; display: flex; flex-direction: column; gap: 2px;';

                const cpuDiv = document.createElement('div');
                cpuDiv.textContent = metric.cpu + '% ';
                const cpuLabel = document.createElement('span');
                cpuLabel.style.cssText = 'font-size: 10px; opacity: 0.7;';
                cpuLabel.textContent = 'CPU';
                cpuDiv.appendChild(cpuLabel);

                const ramDiv = document.createElement('div');
                ramDiv.textContent = metric.ram + '% ';
                const ramLabel = document.createElement('span');
                ramLabel.style.cssText = 'font-size: 10px; opacity: 0.7;';
                ramLabel.textContent = 'RAM';
                ramDiv.appendChild(ramLabel);

                container.appendChild(cpuDiv);
                container.appendChild(ramDiv);
                metricEl.appendChild(container);
            }
        } else {
            // Simple metric (number or string)
            metricEl.textContent = metric;
        }
    }
    if (labelEl) labelEl.textContent = label;
}

function startClock(state) {
    const update = () => {
        const now = new Date();
        const timeEl = document.getElementById('dashboard-time');
        const dateEl = document.getElementById('dashboard-date');
        const greetingEl = document.getElementById('greeting-text');
        
        if (timeEl && dateEl) {
            // Time: HH:MM
            const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
            timeEl.textContent = timeStr;
            
            // Date: Weekday, DD. Month YYYY
            const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            dateEl.textContent = dateStr;
        }

        if (greetingEl) {
            const hour = now.getHours();
            let greeting = 'Good Evening';
            if (hour < 12) greeting = 'Good Morning';
            else if (hour < 18) greeting = 'Good Afternoon';
            
            // Only update if changed to avoid flicker/selection loss (though unlikely on header)
            if (greetingEl.textContent !== greeting) {
                greetingEl.textContent = greeting;
            }
        }
    };

    update(); // Initial call
    state.refreshInterval = setInterval(update, 1000);
}
