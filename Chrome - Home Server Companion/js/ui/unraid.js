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
        const ind = card.querySelector(".status-indicator");
        if(ind) {
            ind.textContent = "ONLINE";
            ind.className = "status-indicator online";
        }
        // Update Server Name with Version/License
        const nameEl = card.querySelector(".server-name");
        if (nameEl && data.system) {
            nameEl.textContent = `Unraid v${data.system.version} `;
            const regSpan = document.createElement('span');
            regSpan.style.cssText = "opacity:0.6; margin-left:4px;";
            regSpan.textContent = data.system.registration;
            nameEl.appendChild(regSpan);
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
        arrayVal.style.color = '#4caf50';
        arrayCard.appendChild(arrayVal);
        statsGrid.appendChild(arrayCard);
        
        // Space Used
        const spaceCard = mkDiv('unraid-card system-stat-card');
        spaceCard.appendChild(mkDiv('stat-label', 'SPACE USED'));
        const spaceVal = mkDiv('stat-value', '0%');
        spaceVal.id = 'dash-space-text';
        spaceCard.appendChild(spaceVal);
        statsGrid.appendChild(spaceCard);
        
        sectionWrap.appendChild(statsGrid);
        
        systemTab.appendChild(sectionWrap);
    }

    // Update Values
    // CPU
    const cpuVal = parseFloat(data.cpu || 0);
    const cpuRing = document.getElementById('dash-cpu-ring');
    if (cpuRing) {
        const offset = 100 - cpuVal;
        cpuRing.style.strokeDashoffset = offset;
        cpuRing.style.stroke = cpuVal > 80 ? '#f44336' : (cpuVal > 50 ? '#ff9800' : '#2196f3');
    }
    document.getElementById('dash-cpu-text').textContent = `${Math.round(cpuVal)}%`;

    // RAM
    const ramUse = parseFloat(data.ram || 0);
    const ramBar = document.getElementById('dash-ram-bar');
    if (ramBar) {
        ramBar.style.width = `${ramUse}%`;
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
        arrayStatus.style.color = (data.array.status === 'STARTED') ? '#4caf50' : '#f44336';
    }
    
    // Space
    const usedBytes = data.array.used || 0;
    const totalBytes = data.array.total || 0;
    const spacePct = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
    
    const spaceText = document.getElementById('dash-space-text');
    if(spaceText) {
        spaceText.textContent = `${Math.round(spacePct)}%`;
        spaceText.title = `${formatBytes(usedBytes)} / ${formatBytes(totalBytes)}`;
    }

    // Sub-renders
    renderUnraidStorage(data);
    renderUnraidDocker(data.dockers, url, key);
}

function renderUnraidStorage(data) {
    const storageTab = document.getElementById("unraid-tab-storage");
    if (!storageTab || storageTab.classList.contains('hidden')) return; 

    const containerId = 'storage-list-container';
    let container = document.getElementById(containerId);
    
    if(!container) {
         storageTab.textContent = "";
         const wrap = document.createElement('div');
         wrap.className = "unraid-section-wrapper";
         wrap.id = containerId;
         storageTab.appendChild(wrap);
         container = wrap;
    }
    
    container.innerHTML = '';
    
    const diskGroups = [
        { title: 'Array', disks: [...(data.array.parities || []), ...(data.array.disks || [])] },
        { title: 'Cache / Pools', disks: data.array.caches },
        { title: 'Boot', disks: data.array.boot ? [data.array.boot] : [] }
    ];
    
    diskGroups.forEach(group => {
         if(!group.disks || group.disks.length === 0) return;
         
         const header = document.createElement('h3');
         header.textContent = group.title;
         header.style.cssText = "font-size:12px; font-weight:700; color:var(--text-secondary); margin:15px 0 5px 0; text-transform:uppercase;";
         container.appendChild(header);
         
         group.disks.forEach(disk => {
             const div = document.createElement('div');
             div.className = 'unraid-card storage-disk-row';
             
             const used = disk.used || 0;
             const total = disk.total || 0;
             const percent = total > 0 ? (used / total) * 100 : 0;

             let colorClass = 'ok';
             if(percent > 80) colorClass = 'warn';
             if(percent > 90) colorClass = 'crit';

             // Securely build the disk card
             // 1. Meta Row
             const meta = document.createElement('div');
             meta.className = 'storage-disk-meta';
             const nameSpan = document.createElement('span');
             nameSpan.style.fontWeight = '700';
             nameSpan.textContent = disk.name;
             const tempSpan = document.createElement('span');
             tempSpan.style.fontSize = '11px';
             tempSpan.style.opacity = '0.8';
             tempSpan.textContent = disk.temp ? disk.temp + '°C' : '';
             meta.appendChild(nameSpan);
             meta.appendChild(tempSpan);

             // 2. Track
             const track = document.createElement('div');
             track.className = 'storage-track';
             const fill = document.createElement('div');
             fill.className = `storage-fill ${colorClass}`;
             fill.style.width = `${percent}%`;
             track.appendChild(fill);

             // 3. Stats Row
             const stats = document.createElement('div');
             stats.style.cssText = "font-size:11px; color:var(--text-secondary); margin-top:4px; display:flex; justify-content:space-between;";
             const usedSpan = document.createElement('span');
             usedSpan.textContent = `${formatBytes(used)} Used`;
             const totalSpan = document.createElement('span');
             totalSpan.textContent = formatBytes(total);
             stats.appendChild(usedSpan);
             stats.appendChild(totalSpan);

             div.appendChild(meta);
             div.appendChild(track);
             div.appendChild(stats);
             container.appendChild(div);
         });
    });
}

function renderUnraidDocker(containers, url, key) {
    const list = document.getElementById("unraid-docker-list");
    if (!list) return;
    
    // Changed to vertical list as requested
    list.className = 'unraid-vertical-list';
    list.innerHTML = "";

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
             // Stopped First (Running = 1, Stopped = 0 -> 1 > 0 -> swap)
             return a.running ? 1 : -1;
        } else {
             // Default: Running First
             return a.running ? -1 : 1; 
        }
    });

    containers.forEach(container => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.docker-card');
        
        // Add row class for styling
        card.classList.add('row-layout');
        
        const dot = card.querySelector('.status-dot');
        const isRunning = container.running;
        dot.className = `status-dot ${isRunning ? 'started' : 'stopped'}`;
        
        const iconDiv = card.querySelector('.card-icon');
        // Simple icon placeholder (first letter) if no image
        iconDiv.textContent = container.name.substring(0,2).toUpperCase();
        iconDiv.style.display = "flex";
        iconDiv.style.alignItems = "center";
        iconDiv.style.justifyContent = "center";
        iconDiv.style.backgroundColor = "rgba(255,255,255,0.1)";
        iconDiv.style.fontSize = "10px";
        iconDiv.style.fontWeight = "bold";

        const titleEl = card.querySelector('.card-title');
        titleEl.textContent = container.name;
        // Tooltip still useful
        titleEl.setAttribute('data-title', container.name);

        card.querySelector('.card-meta').textContent = container.image || "Unknown Image";

        const startBtn = card.querySelector('.start-btn');
        const stopBtn = card.querySelector('.stop-btn');
        const restartBtn = card.querySelector('.restart-btn');
        const webBtn = card.querySelector('.webui-btn');

        if (isRunning) {
            startBtn.style.display = 'none';
        } else {
            stopBtn.style.display = 'none';
            restartBtn.style.display = 'none';
            webBtn.style.display = 'none';
        }
        
        startBtn.onclick = async () => {
             dot.className = 'status-dot paused'; 
             await controlContainer(url, key, container.id, 'start');
        };
        stopBtn.onclick = async () => {
             dot.className = 'status-dot paused';
             await controlContainer(url, key, container.id, 'stop');
        };
        restartBtn.onclick = async () => {
             dot.className = 'status-dot paused';
             await controlContainer(url, key, container.id, 'restart');
        };
        webBtn.onclick = (e) => {
             e.preventDefault();
             if (container.webui) {
                 chrome.tabs.create({ url: container.webui, active: true });
             } else {
                 // Fallback to Unraid Dashboard
                 chrome.tabs.create({ url: url, active: true });
             }
        };

        list.appendChild(card);
    });
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
        list.innerHTML = "";

        if (!vms || vms.length === 0) {
             list.innerHTML = "";
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
