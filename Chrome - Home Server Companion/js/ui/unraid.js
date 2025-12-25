import {
  checkUnraidStatus,
  getSystemData,
  controlContainer,
  getVms,
  controlVm
} from "../../services/unraid.js";

/**
 * Initializes the Unraid service view.
 * - Polls for system data (CPU, RAM, Array, Docker).
 * - Renders Dashboard, Storage, Docker, and VM tabs.
 * @param {string} url - Unraid URL (root or Unraid Connect URL)
 * @param {string} key - API Key (Unraid API Plugin)
 * @param {object} state - App state
 */
export async function initUnraid(url, key, state) {
    if (!key) {
      const statusCard = document.getElementById("unraid-status-card");
      if(statusCard) {
          statusCard.textContent = "";
          const d = document.createElement('div');
          d.className = "status-indicator offline";
          d.textContent = "Please set Unraid API Key in Options";
          statusCard.appendChild(d);
      }
      return;
    }

    let lastData = null;

    const update = async () => {
         const activeSubTab = document.querySelector("#unraid-view .sub-tab-btn.active");
         const target = activeSubTab ? activeSubTab.dataset.target : 'unraid-tab-system';

         try {
             if (target === 'unraid-tab-vms') {
                 await renderUnraidVms(url, key);
                 const card = document.getElementById("unraid-status-card");
                 if (card && card.querySelector(".status-indicator").textContent === "CONNECTION ERROR") {
                      card.querySelector(".status-indicator").textContent = "ONLINE";
                      card.querySelector(".status-indicator").className = "status-indicator online";
                 }
             } else {
                 const data = await getSystemData(url, key);
                 if (data._error) throw new Error(data._error);
                 lastData = data; // Cache for sorting
                 renderUnraidSystem(data, url, key, state);
             }
         } catch (e) {
            console.error("Unraid Sync Error", e);
            const card = document.getElementById("unraid-status-card");
            if (card) {
                const indicator = card.querySelector(".status-indicator");
                if (indicator) {
                    indicator.textContent = "CONNECTION ERROR";
                    indicator.className = "status-indicator offline";
                }
            }
         }
    };

    // Sort & Search Listeners
    const triggerUpdate = () => {
        if (lastData && lastData.dockers) {
            renderUnraidDocker(lastData.dockers, url, key);
        } else {
            update(); 
        }
    };

    const sortSelect = document.getElementById("unraid-docker-sort");
    if (sortSelect && !sortSelect.dataset.initListener) {
        sortSelect.addEventListener("change", triggerUpdate);
        sortSelect.dataset.initListener = "true";
    }

    const searchInput = document.getElementById("unraid-docker-search");
    if (searchInput && !searchInput.dataset.initListener) {
        searchInput.addEventListener("input", triggerUpdate);
        searchInput.dataset.initListener = "true";
    }

    await update();
    if (state.refreshInterval) clearInterval(state.refreshInterval);
    state.refreshInterval = setInterval(update, 5000);
}

// Utils
const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const getUptime = (iso) => {
  if (!iso) return "--";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return `${days}d ${hours}h`;
};

function renderUnraidSystem(data, url, key, state) {
    const card = document.getElementById("unraid-status-card");
    if (card) {
        // Clear and rebuild for vertical stack (Status -> License -> Version)
        card.innerHTML = "";
        card.style.display = "flex";
        card.style.flexDirection = "column";
        card.style.justifyContent = "center"; // Vertical center
        card.style.alignItems = "flex-end";   // Right align (as defined in CSS usually, or center?)
        // CSS says text-align: right. Let's align flex items to flex-end.

        // 1. Status
        const ind = document.createElement("div");
        ind.className = "status-indicator online";
        ind.textContent = "ONLINE";
        ind.style.marginBottom = "2px";
        card.appendChild(ind);

        // 2. License
        if (data.system && data.system.registration) {
            const licenseDiv = document.createElement("div");
            licenseDiv.className = "server-name"; // Reuse style for font/color
            licenseDiv.style.opacity = "0.7";     // Slightly dimmer
            licenseDiv.style.fontWeight = "400";
            licenseDiv.style.marginBottom = "2px";
            licenseDiv.textContent = data.system.registration; 
            card.appendChild(licenseDiv);
        }

        // 3. Version
        if (data.system && data.system.version) {
            const versionDiv = document.createElement("div");
            versionDiv.className = "server-name"; // Reuse style
            versionDiv.textContent = `Unraid v${data.system.version}`;
            card.appendChild(versionDiv);
        }
    }

    // --- Render System Tab (DASHBOARD) ---
    const systemTab = document.getElementById("unraid-tab-system");
    if (!systemTab) return;
    
    // Dashboard Grid Structure
    if (!systemTab.querySelector('.unraid-dashboard-grid')) {
        systemTab.textContent = ''; // Clear ID

        // Helper: Create element with class and text
        const mkDiv = (cls, txt) => {
            const d = document.createElement('div');
            if(cls) d.className = cls;
            if(txt) d.textContent = txt;
            return d;
        };

        const dashGrid = mkDiv('unraid-dashboard-grid');

        // --- CPU Card ---
        const cpuCard = mkDiv('unraid-card system-stat-card');
        cpuCard.appendChild(mkDiv('stat-label', 'CPU LOAD'));
        
        const cpuRingCont = mkDiv('cpu-ring-container');
        // SVG creation requires createElementNS
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute('class', 'cpu-ring-svg');
        svg.setAttribute('viewBox', '0 0 36 36');
        
        const pathBg = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathBg.setAttribute('class', 'cpu-ring-bg');
        pathBg.setAttribute('d', 'M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831');
        
        const pathVal = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathVal.setAttribute('class', 'cpu-ring-value');
        pathVal.setAttribute('id', 'dash-cpu-ring');
        pathVal.setAttribute('d', 'M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831');
        
        svg.appendChild(pathBg);
        svg.appendChild(pathVal);
        cpuRingCont.appendChild(svg);
        
        const cpuText = mkDiv('cpu-text-center', '0%');
        cpuText.id = 'dash-cpu-text';
        cpuRingCont.appendChild(cpuText);
        
        cpuCard.appendChild(cpuRingCont);
        
        const cpuModel = mkDiv('stat-sub', 'Total Load');
        cpuModel.id = 'dash-cpu-model';
        cpuCard.appendChild(cpuModel);
        
        dashGrid.appendChild(cpuCard);

        // --- RAM Card ---
        const ramCard = mkDiv('unraid-card system-stat-card');
        ramCard.appendChild(mkDiv('stat-label', 'RAM USAGE'));
        
        const ramText = mkDiv('stat-value', '0%');
        ramText.id = 'dash-ram-text';
        ramCard.appendChild(ramText);
        
        const ramBarCont = mkDiv('ram-bar-container');
        const ramBarFill = mkDiv('ram-bar-fill');
        ramBarFill.id = 'dash-ram-bar';
        ramBarCont.appendChild(ramBarFill);
        ramCard.appendChild(ramBarCont);
        
        const ramDetail = mkDiv('stat-sub', '0 GB / 0 GB');
        ramDetail.id = 'dash-ram-detail';
        ramCard.appendChild(ramDetail);
        
        dashGrid.appendChild(ramCard);

        // --- Uptime Card ---
        const uptimeCard = mkDiv('unraid-card full-width-card');
        const uptimeFlex = document.createElement('div');
        uptimeFlex.style.cssText = "display:flex; align-items:center; gap:10px;";
        
        const clockIcon = document.createElement('span');
        clockIcon.style.fontSize = '20px';
        clockIcon.textContent = '⏱';
        
        const uptimeInfo = document.createElement('div');
        const uptimeLabel = mkDiv('stat-label', 'UPTIME');
        uptimeLabel.style.textAlign = 'left';
        
        const uptimeVal = mkDiv('stat-value', '--');
        uptimeVal.style.fontSize = '16px';
        uptimeVal.id = 'dash-uptime';
        
        uptimeInfo.appendChild(uptimeLabel);
        uptimeInfo.appendChild(uptimeVal);
        
        uptimeFlex.appendChild(clockIcon);
        uptimeFlex.appendChild(uptimeInfo);
        uptimeCard.appendChild(uptimeFlex);
        
        dashGrid.appendChild(uptimeCard);

        systemTab.appendChild(dashGrid);

        // --- Quick Stats Section ---
        const sectionWrap = mkDiv('unraid-section-wrapper');
        const h3 = document.createElement('h3');
        h3.textContent = 'Quick Stats';
        sectionWrap.appendChild(h3);
        
        const statsGrid = mkDiv('unraid-dashboard-grid');
        
        // Array Status
        const arrayCard = mkDiv('unraid-card system-stat-card');
        arrayCard.appendChild(mkDiv('stat-label', 'ARRAY STATUS'));
        const arrayVal = mkDiv('stat-value', 'Started');
        arrayVal.id = 'dash-array-status';
        arrayVal.id = 'dash-array-status';
        arrayVal.classList.add('text-green');
        arrayCard.appendChild(arrayVal);
        statsGrid.appendChild(arrayCard);
        
        // Space Used
        const spaceCard = mkDiv('unraid-card system-stat-card');
        spaceCard.appendChild(mkDiv('stat-label', 'SPACE USED'));
        const spaceVal = mkDiv('stat-value', '0 B');
        spaceVal.id = 'dash-space-text';
        spaceCard.appendChild(spaceVal);
        const spaceSub = mkDiv('stat-sub', '0 B Free');
        spaceSub.id = 'dash-space-detail';
        spaceCard.appendChild(spaceSub);
        statsGrid.appendChild(spaceCard);

        // Docker Count
        const dockerCard = mkDiv('unraid-card system-stat-card');
        dockerCard.appendChild(mkDiv('stat-label', 'DOCKER'));
        const dockerVal = mkDiv('stat-value', '0 / 0');
        dockerVal.id = 'dash-docker-count';
        dockerCard.appendChild(dockerVal);
        const dockerSub = mkDiv('stat-sub', 'Running / Total');
        dockerCard.appendChild(dockerSub);
        statsGrid.appendChild(dockerCard);

        // VM Count
        const vmCard = mkDiv('unraid-card system-stat-card');
        vmCard.appendChild(mkDiv('stat-label', 'VIRTUAL MACHINES'));
        const vmVal = mkDiv('stat-value', '0 / 0');
        vmVal.id = 'dash-vm-count';
        vmCard.appendChild(vmVal);
        const vmSub = mkDiv('stat-sub', 'Running / Total');
        vmCard.appendChild(vmSub);
        statsGrid.appendChild(vmCard);
        
        sectionWrap.appendChild(statsGrid);
        
        systemTab.appendChild(sectionWrap);

        // --- Array Health Section ---
        const healthSection = mkDiv('unraid-section-wrapper');
        const h3Health = document.createElement('h3');
        h3Health.textContent = 'Array Health';
        healthSection.appendChild(h3Health);

        const healthGrid = mkDiv('unraid-dashboard-grid');

        // Parity Check Status
        const parityCard = mkDiv('unraid-card full-width-card');
        parityCard.id = 'dash-parity-card';
        const parityLabel = mkDiv('stat-label', 'PARITY CHECK');
        parityCard.appendChild(parityLabel);
        const parityStatus = mkDiv('stat-value', 'No check running');
        parityStatus.id = 'dash-parity-status';
        parityCard.appendChild(parityStatus);
        const parityDetail = mkDiv('stat-sub', '');
        parityDetail.id = 'dash-parity-detail';
        parityCard.appendChild(parityDetail);
        healthGrid.appendChild(parityCard);

        // SMART Status
        const smartCard = mkDiv('unraid-card full-width-card');
        smartCard.id = 'dash-smart-card'; // Added ID for border styling
        smartCard.appendChild(mkDiv('stat-label', 'DISK HEALTH (SMART)'));
        const smartStatus = mkDiv('stat-value', 'All Healthy');
        smartStatus.id = 'dash-smart-status';
        smartStatus.classList.add('text-green');
        smartCard.appendChild(smartStatus);
        const smartDetail = mkDiv('stat-sub', '');
        smartDetail.id = 'dash-smart-detail';
        smartCard.appendChild(smartDetail);
        healthGrid.appendChild(smartCard);

        healthSection.appendChild(healthGrid);
        systemTab.appendChild(healthSection);
    }

    // Update Values
    // CPU
    const cpuVal = parseFloat(data.cpu || 0);
    const cpuRing = document.getElementById('dash-cpu-ring');
    if (cpuRing) {
        const offset = 100 - cpuVal;
        cpuRing.style.strokeDashoffset = offset;
        // Keep stroke color on ring for now, or move to class if needed, but ring is SVG
        cpuRing.style.stroke = cpuVal > 80 ? '#f44336' : (cpuVal > 50 ? '#ff9800' : '#2196f3');
    }
    document.getElementById('dash-cpu-text').textContent = `${Math.round(cpuVal)}%`;

    // RAM
    const ramUse = parseFloat(data.ram || 0);
    const ramBar = document.getElementById('dash-ram-bar');
    if (ramBar) {
        ramBar.style.width = `${ramUse}%`;
        // Keep background on bar
        ramBar.style.background = ramUse > 85 ? '#f44336' : '#4caf50';
    }
    document.getElementById('dash-ram-text').textContent = `${Math.round(ramUse)}%`;
    
    // RAM Details
    const totalMem = data.system.memoryTotal || 0;
    const usedMem = (ramUse / 100) * totalMem;
    const ramDetail = document.getElementById('dash-ram-detail');
    if(ramDetail && totalMem > 0) {
        ramDetail.textContent = `${formatBytes(usedMem, 1)} / ${formatBytes(totalMem, 1)}`;
    }

    // Uptime
    document.getElementById('dash-uptime').textContent = getUptime(data.system.uptimeBoot);

    // Array Status
    const arrayStatus = document.getElementById('dash-array-status');
    if(arrayStatus) {
        arrayStatus.textContent = data.array.status || 'Unknown';
        arrayStatus.className = 'stat-value'; // Reset classes
        arrayStatus.classList.add((data.array.status === 'STARTED') ? 'text-green' : 'text-red');
    }
    
    // Space
    const usedBytes = data.array.used || 0;
    const totalBytes = data.array.total || 0;
    const freeBytes = totalBytes - usedBytes;
    const spacePct = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
    
    const spaceText = document.getElementById('dash-space-text');
    if(spaceText) {
        spaceText.textContent = `${formatBytes(usedBytes)} (${Math.round(spacePct)}%)`;
        
        let spaceDetail = document.getElementById('dash-space-detail');
        if (!spaceDetail) {
             spaceDetail = document.createElement('div');
             spaceDetail.className = 'stat-sub';
             spaceDetail.id = 'dash-space-detail';
             spaceText.parentNode.appendChild(spaceDetail);
        }
        const freePct = 100 - spacePct;
        spaceDetail.textContent = `${formatBytes(freeBytes)} (${Math.round(freePct)}%) Free`;
    }

    // Docker Count
    const dockerCountEl = document.getElementById('dash-docker-count');
    if (dockerCountEl && data.dockers) {
        const running = data.dockers.filter(d => d.running).length;
        const total = data.dockers.length;
        dockerCountEl.textContent = `${running} / ${total}`;
        dockerCountEl.className = 'stat-value';
        dockerCountEl.classList.add(running > 0 ? 'text-green' : 'text-orange');
    }

    // VM Count (fetch separately as it's async)
    const vmCountEl = document.getElementById('dash-vm-count');
    if (vmCountEl) {
        getVms(url, key).then(vms => {
            const running = vms.filter(v => v.running).length;
            const total = vms.length;
            vmCountEl.textContent = `${running} / ${total}`;
            vmCountEl.className = 'stat-value';
            vmCountEl.classList.add(running > 0 ? 'text-green' : 'text-orange');
        }).catch(() => {
            vmCountEl.textContent = '-- / --';
        });
    }

    // Parity Check Status
    const parityStatusEl = document.getElementById('dash-parity-status');
    const parityDetailEl = document.getElementById('dash-parity-detail');
    const parityCard = document.getElementById('dash-parity-card'); // Get card for border color
    
    if (parityStatusEl && data.array.parity) {
        const parity = data.array.parity;
        if (parity.status === 'running' || parity.status === 'RUNNING') {
            parityStatusEl.textContent = `Checking... ${Math.round(parity.percent || 0)}%`;
            parityStatusEl.className = 'stat-value text-blue';
            if(parityCard) parityCard.style.borderLeftColor = '#2196f3'; // Blue border
            parityDetailEl.textContent = `Errors: ${parity.errors || 0} | Speed: ${parity.speed || 'N/A'}`;
        } else {
            parityStatusEl.textContent = 'No check running';
            parityStatusEl.className = 'stat-value text-green';
            if(parityCard) parityCard.style.borderLeftColor = '#4caf50'; // Green border
            
            if (parity.errors && parity.errors > 0) {
                parityDetailEl.textContent = `Last check had ${parity.errors} errors`;
                parityDetailEl.classList.add('text-red');
                if(parityCard) parityCard.style.borderLeftColor = '#f44336'; // Red border if errors
            } else {
                parityDetailEl.textContent = 'Last check: OK';
                parityDetailEl.classList.remove('text-red');
            }
        }
    }

    // SMART Status
    const smartStatusEl = document.getElementById('dash-smart-status');
    const smartDetailEl = document.getElementById('dash-smart-detail');
    const smartCard = document.getElementById('dash-smart-card'); // Get card for border color

    if (smartStatusEl) {
        const allDisks = [
            ...(data.array.parities || []),
            ...(data.array.disks || []),
            ...(data.array.caches || [])
        ];
        
        const unhealthy = allDisks.filter(d => 
            d.smartStatus && (d.smartStatus === 'FAILED' || d.smartStatus === 'WARNING')
        );
        
        if (unhealthy.length > 0) {
            smartStatusEl.textContent = `${unhealthy.length} Disk(s) Need Attention`;
            smartStatusEl.className = 'stat-value text-red';
            if(smartCard) smartCard.style.borderLeftColor = '#f44336'; // Red border
            
            smartDetailEl.textContent = unhealthy.map(d => `${d.name}: ${d.smartStatusText || d.smartStatus}`).join(', ');
            smartDetailEl.classList.add('text-red');
        } else {
            smartStatusEl.textContent = 'All Healthy';
            smartStatusEl.className = 'stat-value text-green';
            if(smartCard) smartCard.style.borderLeftColor = '#4caf50'; // Green border
            
            smartDetailEl.textContent = `${allDisks.length} disks monitored`;
            smartDetailEl.classList.remove('text-red');
        }
    }

    // Sub-renders
    renderUnraidStorage(data);
    renderUnraidDocker(data.dockers, url, key);
}

function renderUnraidStorage(data) {
    const storageTab = document.getElementById("unraid-tab-storage");
    if (!storageTab || storageTab.classList.contains('hidden')) return; 

    // Helper for clearing
    const containerId = 'storage-list-container';
    let container = document.getElementById(containerId);
    
    if(!container) {
         storageTab.textContent = "";
         const wrap = document.createElement('div');
         wrap.className = "unraid-storage-wrapper";
         wrap.id = containerId;
         storageTab.appendChild(wrap);
         container = wrap;
    }
    
    // Sort groups
    const diskGroups = [
        { title: 'Array Devices', id: 'grp-array', type: 'array', disks: [...(data.array.parities || []), ...(data.array.disks || [])] },
        { title: 'Pool Devices', id: 'grp-pool', type: 'pool', disks: data.array.caches },
        { title: 'Boot Device', id: 'grp-boot', type: 'boot', disks: data.array.boot ? [data.array.boot] : [] }
    ];
    
    diskGroups.forEach(group => {
         if(!group.disks || group.disks.length === 0) {
             const oldGrp = document.getElementById(`storage-${group.id}`);
             if (oldGrp) oldGrp.style.display = 'none';
             return;
         }
         
         // 1. Check/Create Group Container
         let groupContainer = document.getElementById(`storage-${group.id}`);
         let grid;
         
         if (!groupContainer) {
             groupContainer = document.createElement('div');
             groupContainer.id = `storage-${group.id}`;
             
             // Group Header
             const header = document.createElement('div');
             header.className = 'storage-group-header';
             const title = document.createElement('div');
             title.className = 'storage-group-title';
             title.textContent = group.title;
             header.appendChild(title);
             groupContainer.appendChild(header);
             
             // Grid
             grid = document.createElement('div');
             grid.className = 'unraid-storage-grid';
             groupContainer.appendChild(grid);
             
             container.appendChild(groupContainer);
         } else {
             groupContainer.style.display = 'block';
             grid = groupContainer.querySelector('.unraid-storage-grid');
         }

         // 2. Update/Create Disks
         group.disks.forEach(disk => {
             const diskId = `disk-${disk.name.replace(/[^a-zA-Z0-9]/g, '')}`; 
             let card = document.getElementById(diskId);
             
             // Calculations
             const used = disk.used || 0;
             const total = disk.total || 0;
             const free = disk.free !== undefined ? disk.free : (total - used);
             const percent = total > 0 ? (used / total) * 100 : 0;
             
             // Status Logic
             const isSpinning = disk.spinning; 
             const temp = disk.temp; 
             
             // Color Logic
             let barClass = '';
             if (percent > 80) barClass = 'warn';
             if (percent > 90) barClass = 'crit';

             // Temp Color logic
             let tempClass = 'cool';
             const tempNum = parseFloat(temp);
             if (!isNaN(tempNum)) {
                 if (tempNum >= 40) tempClass = 'warm';
                 if (tempNum >= 50) tempClass = 'hot';
             }
             
             // Icon Selection
             let iconChar = '💾'; 
             if (group.type === 'boot') iconChar = '🔌'; 
             if (group.type === 'pool') iconChar = '⚡'; 

             if (!card) {
                 // CREATE NEW
                 card = document.createElement('div');
                 card.className = 'storage-card';
                 card.id = diskId;
                 
                 card.innerHTML = `
                    <div class="disk-header">
                        <div class="disk-info">
                            <span class="disk-icon ${isSpinning ? 'spinning-icon' : 'sleeping-icon'}">${iconChar}</span>
                            <span class="disk-name">${disk.name}</span>
                            <span class="disk-temp ${tempClass}" style="display:none">0°C</span>
                        </div>
                    </div>
                    
                    <div class="disk-usage-section">
                        <div class="disk-pct">0%</div>
                        <div class="disk-bar-bg">
                            <div class="disk-bar-fill" style="width: 0%"></div>
                        </div>
                        <div class="disk-stats">
                            <span class="disk-used">0 B / 0 B</span>
                            <span class="disk-free">0 B Free</span>
                        </div>
                    </div>
                 `;
                 grid.appendChild(card);
             }

             // UPDATE EXISTING (Smart Update)
             // Icon
             const iconEl = card.querySelector('.disk-icon');
             if (iconEl) {
                 iconEl.className = `disk-icon ${isSpinning ? 'spinning-icon' : 'sleeping-icon'}`;
                 iconEl.textContent = iconChar;
             }
             
             // Temp update - forcing display if valid
             const tempEl = card.querySelector('.disk-temp');
             if (tempEl) {
                 if (temp !== undefined && temp !== null && temp !== "") {
                     tempEl.textContent = `${temp}°C`;
                     tempEl.className = `disk-temp ${tempClass}`;
                     tempEl.style.display = 'inline-block';
                 } else {
                     tempEl.style.display = 'none';
                 }
             }
             
             // Pct
             const pctEl = card.querySelector('.disk-pct');
             if (pctEl) pctEl.textContent = `${Math.round(percent)}%`;
             
             // Bar
             const barEl = card.querySelector('.disk-bar-fill');
             if (barEl) {
                 barEl.className = `disk-bar-fill ${barClass}`;
                 barEl.style.width = `${percent}%`;
             }
             
             // Stats
             const usedEl = card.querySelector('.disk-used');
             if (usedEl) usedEl.textContent = `${formatBytes(used)} / ${formatBytes(total)}`;
             
             const freeEl = card.querySelector('.disk-free');
             if (freeEl) freeEl.textContent = `${formatBytes(free)} Free`;
         });
    });
}

function renderUnraidDocker(containers, url, key) {
    const list = document.getElementById("unraid-docker-list");
    if (!list) return;
    
    // Changed to vertical list as requested
    if (list.className !== 'unraid-vertical-list') {
        list.className = 'unraid-vertical-list';
    }

    if (!containers || containers.length === 0) {
        list.textContent = "";
        const div = document.createElement('div');
        div.style.cssText = "text-align:center; padding:20px; color:#aaa;";
        div.textContent = "No containers found";
        list.appendChild(div);
        return;
    }

    const template = document.getElementById('docker-card-template');

    // FILTERING LOGIC
    const searchInput = document.getElementById("unraid-docker-search");
    if (searchInput && searchInput.value) {
        const term = searchInput.value.toLowerCase();
        containers = containers.filter(c => c.name.toLowerCase().includes(term));
    }

    // SORTING LOGIC
    const sortSelect = document.getElementById("unraid-docker-sort");
    const sortMode = sortSelect ? sortSelect.value : 'status-asc';
    
    containers.sort((a, b) => {
        // ALWAYS sort alphabetically if status is same
        if (a.running === b.running) {
            return a.name.localeCompare(b.name);
        }
        
        // Status sort
        if (sortMode === 'status-desc') {
             return a.running ? 1 : -1;
        } else {
             return a.running ? -1 : 1; 
        }
    });

    const existingCards = new Set();
    
    containers.forEach((container, index) => {
        const cardId = `docker-card-${container.id}`;
        existingCards.add(cardId);
        
        let card = document.getElementById(cardId);

        if (!card) {
            // CREATE NEW
            const clone = template.content.cloneNode(true);
            card = clone.querySelector('.docker-card');
            card.id = cardId;
            card.classList.add('row-layout');
            updateDockerCard(card, container, url, key);
            
            // Insert at correct position
            if (index < list.children.length) {
                list.insertBefore(card, list.children[index]);
            } else {
                list.appendChild(card);
            }
        } else {
            // UPDATE EXISTING
            updateDockerCard(card, container, url, key);
            
            // Check position: Is this card at the current index?
            const currentChild = list.children[index];
            if (currentChild !== card) {
                // Not in correct position, move it
                if (index < list.children.length) {
                    list.insertBefore(card, list.children[index]);
                } else {
                    list.appendChild(card);
                }
            }
        }
    });

    // 3. Remove stale
    Array.from(list.children).forEach(child => {
        if (child.id && child.id.startsWith('docker-card-') && !existingCards.has(child.id)) {
            child.remove();
        }
    });
}

function updateDockerCard(card, container, url, key) {
    const isRunning = container.running;
    
    // Dot
    const dot = card.querySelector('.status-dot');
    const dotClass = `status-dot ${isRunning ? 'started' : 'stopped'}`;
    if(dot.className !== dotClass) dot.className = dotClass; 
    
    // Icon
    const iconDiv = card.querySelector('.card-icon');
    const iconLetter = container.name.substring(0,2).toUpperCase();
    if (iconDiv.textContent !== iconLetter) {
         iconDiv.textContent = iconLetter;
         // Static styles that don't change frequently can typically stay in CSS or be set once
         // But ensuring they are set if we recreated the card (which we didn't) or if js overwrote them
         if(!iconDiv.style.display) {
             iconDiv.style.display = "flex";
             iconDiv.style.alignItems = "center";
             iconDiv.style.justifyContent = "center";
             iconDiv.style.backgroundColor = "rgba(255,255,255,0.1)";
             iconDiv.style.fontSize = "10px";
             iconDiv.style.fontWeight = "bold";
         }
    }

    // Title
    const titleEl = card.querySelector('.card-title');
    if(titleEl.textContent !== container.name) {
        titleEl.textContent = container.name;
        titleEl.setAttribute('data-title', container.name);
    }

    // Meta (Image)
    const meta = card.querySelector('.card-meta');
    const metaText = container.image || "Unknown Image";
    if(meta.textContent !== metaText) meta.textContent = metaText;

    // Badge
    const badge = card.querySelector('.update-badge');
    if (container.updateAvailable) {
         if(badge.classList.contains('hidden')) badge.classList.remove('hidden');
    } else {
         if(!badge.classList.contains('hidden')) badge.classList.add('hidden');
    }

    // Actions
    const startBtn = card.querySelector('.start-btn');
    const stopBtn = card.querySelector('.stop-btn');
    const restartBtn = card.querySelector('.restart-btn');
    const webBtn = card.querySelector('.webui-btn');

    // Display Logic - ONLY touch DOM if changed
    const startDisp = isRunning ? 'none' : 'flex';
    if(startBtn.style.display !== startDisp) startBtn.style.display = startDisp;

    const stopDisp = isRunning ? 'flex' : 'none';
    if(stopBtn.style.display !== stopDisp) stopBtn.style.display = stopDisp;

    const restartDisp = isRunning ? 'flex' : 'none';
    if(restartBtn.style.display !== restartDisp) restartBtn.style.display = restartDisp;

    const webDisp = isRunning ? 'flex' : 'none';
    if(webBtn.style.display !== webDisp) webBtn.style.display = webDisp;
    
    // Handlers - ONLY attach if missing (or use delegation in future, but this is fine)
    // To prevent "flicker" from handler re-attachment (unlikely but possible), 
    // we can attach once on creation. 
    // BUT since we are passing updated 'container' object (closure), we typically re-attach.
    // However, function references change every render.
    // Better: use card.dataset.id and a single delegated listener on list. 
    // For now: Just re-attach, it shouldn't cause visual flicker.
    // THE ISSUE was likely the appendChild moving the element.
    
    startBtn.onclick = async (e) => {
         e.stopPropagation();
         dot.className = 'status-dot paused'; 
         await controlContainer(url, key, container.id, 'start');
    };
    stopBtn.onclick = async (e) => {
         e.stopPropagation();
         dot.className = 'status-dot paused';
         await controlContainer(url, key, container.id, 'stop');
    };
    restartBtn.onclick = async (e) => {
         e.stopPropagation();
         dot.className = 'status-dot paused';
         await controlContainer(url, key, container.id, 'restart');
    };
    webBtn.onclick = (e) => {
         e.stopPropagation();
         e.preventDefault();
         if (container.webui) {
             chrome.tabs.create({ url: container.webui, active: true });
         } else {
             chrome.tabs.create({ url: url, active: true });
         }
    };
}

async function renderUnraidVms(url, key) {
    const list = document.getElementById("unraid-vm-list");
    if (!list) return;
    
    // Only show loading if empty
    if (list.children.length === 0) {
        list.textContent = "";
        const loading = document.createElement('div');
        loading.style.cssText = "padding:10px;text-align:center;color:#666;";
        loading.textContent = "Loading VMs...";
        list.appendChild(loading);
    }
    
    try {
        const vms = await getVms(url, key);
        // Changed directly to vertical list
        list.className = 'unraid-vertical-list';
        list.replaceChildren();

        if (!vms || vms.length === 0) {
             list.replaceChildren();
             const div = document.createElement('div');
             div.style.cssText = "text-align:center; padding:20px; color:#aaa;";
             div.textContent = "No VMs found";
             list.appendChild(div);
             return;
        }

        const template = document.getElementById('vm-card-template');
        vms.forEach(vm => {
             const clone = template.content.cloneNode(true);
             const card = clone.querySelector('.vm-card');

             card.classList.add('row-layout');

             const dot = card.querySelector('.status-dot');
             const isRunning = vm.running;
             dot.className = `status-dot ${isRunning ? 'started' : 'stopped'}`;

             const iconDiv = card.querySelector('.card-icon');
             if (vm.name.toLowerCase().includes('windows')) {
                 iconDiv.style.backgroundImage = 'url("icons/windows.svg")'; // Placeholder
                 iconDiv.style.backgroundColor = '#0078d7';
             } else {
                 iconDiv.style.backgroundColor = '#e95420'; 
             }

             const titleEl = card.querySelector('.card-title');
             titleEl.textContent = vm.name;
             titleEl.setAttribute('data-title', vm.name);
             
             card.querySelector('.card-meta').textContent = vm.state;

            const startBtn = card.querySelector('.start-btn');
            const stopBtn = card.querySelector('.stop-btn');
            const webBtn = card.querySelector('.webui-btn');

            if (isRunning) {
                startBtn.style.display = 'none';
            } else {
                stopBtn.style.display = 'none';
                webBtn.style.display = 'none';
            }

            startBtn.onclick = () => controlVm(url, key, vm.id, 'start');
            stopBtn.onclick = () => controlVm(url, key, vm.id, 'stop');
            
            list.appendChild(card);
        });

    } catch (e) {
        list.textContent = "";
        const err = document.createElement('div');
        err.style.cssText = "color:red;pad:10px;";
        err.textContent = `Error: ${e.message}`;
        list.appendChild(err);
    }
}
