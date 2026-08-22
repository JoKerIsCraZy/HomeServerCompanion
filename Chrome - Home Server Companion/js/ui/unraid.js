import {
  getSystemData,
  getCachedSystemData,
  controlContainer,
  updateContainer,
  updateAllContainers,
  controlParityCheck,
  getVms,
  controlVm
} from "../../services/unraid.js";
import { showNotification, showConfirmModal, validateUrl, openUrlSafely } from "../utils.js";

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
                 // Also fetch system data for status card (version, license)
                 const data = await getSystemData(url, key);
                 if (!data._error) {
                     updateStatusCard(data);
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
        let debounceTimer;
        searchInput.addEventListener("input", () => {
             clearTimeout(debounceTimer);
             debounceTimer = setTimeout(triggerUpdate, 300); // 300ms debounce
        });
        searchInput.dataset.initListener = "true";
    }

    // Instant render from cache (stale-while-revalidate) — avoids blank UI on popup open
    try {
        const cached = await getCachedSystemData(url);
        if (cached?.data && !lastData) {
            lastData = cached.data;
            renderUnraidSystem(cached.data, url, key, state);
        }
    } catch (e) {
        console.debug("Unraid cache read skipped:", e.message);
    }

    await update();
    state.serviceIntervals = state.serviceIntervals || {};
    if (state.serviceIntervals.unraid) clearInterval(state.serviceIntervals.unraid);
    state.serviceIntervals.unraid = setInterval(update, 5000);
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

function updateStatusCard(data) {
    const card = document.getElementById("unraid-status-card");
    if (!card) return;

    // Clear and rebuild for vertical stack (Status -> License -> Version)
    card.replaceChildren();
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.justifyContent = "center";
    card.style.alignItems = "flex-end";

    // 1. Status
    const ind = document.createElement("div");
    ind.className = "status-indicator online";
    ind.textContent = "ONLINE";
    ind.style.marginBottom = "2px";
    card.appendChild(ind);

    // 2. License
    if (data.system && data.system.registration) {
        const licenseDiv = document.createElement("div");
        licenseDiv.className = "server-name";
        licenseDiv.style.opacity = "0.7";
        licenseDiv.style.fontWeight = "400";
        licenseDiv.style.marginBottom = "2px";
        licenseDiv.textContent = data.system.registration;
        card.appendChild(licenseDiv);
    }

    // 3. Version
    if (data.system && data.system.version) {
        const versionDiv = document.createElement("div");
        versionDiv.className = "server-name";
        versionDiv.textContent = `Unraid v${data.system.version}`;
        card.appendChild(versionDiv);
    }
}

function renderUnraidSystem(data, url, key, state) {
    updateStatusCard(data);

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

        // --- Uptime Card (next to RAM) ---
        const uptimeCard = mkDiv('unraid-card system-stat-card');
        uptimeCard.appendChild(mkDiv('stat-label', 'UPTIME'));

        const uptimeVal = mkDiv('stat-value', '--');
        uptimeVal.style.fontSize = '18px';
        uptimeVal.id = 'dash-uptime';
        uptimeCard.appendChild(uptimeVal);

        const uptimeIcon = mkDiv('stat-sub', '⏱ System Uptime');
        uptimeCard.appendChild(uptimeIcon);

        dashGrid.appendChild(uptimeCard);

        // --- CPU Temperature Card (Unraid API v4.30+) — hidden until data arrives ---
        const cpuTempCard = mkDiv('unraid-card system-stat-card hidden');
        cpuTempCard.id = 'dash-cpu-temp-card';
        const cpuTempLabel = mkDiv('stat-label', 'CPU TEMP');
        cpuTempLabel.id = 'dash-cpu-temp-label';
        cpuTempCard.appendChild(cpuTempLabel);

        const cpuTempVal = mkDiv('stat-value', '--');
        cpuTempVal.id = 'dash-cpu-temp-value';
        cpuTempCard.appendChild(cpuTempVal);

        dashGrid.appendChild(cpuTempCard);

        // --- Motherboard Temperature Card — hidden until data arrives ---
        const mbTempCard = mkDiv('unraid-card system-stat-card hidden');
        mbTempCard.id = 'dash-mb-temp-card';
        const mbTempLabel = mkDiv('stat-label', 'MB TEMP');
        mbTempLabel.id = 'dash-mb-temp-label';
        mbTempCard.appendChild(mbTempLabel);

        const mbTempVal = mkDiv('stat-value', '--');
        mbTempVal.id = 'dash-mb-temp-value';
        mbTempCard.appendChild(mbTempVal);

        dashGrid.appendChild(mbTempCard);

        // --- Hottest Disk/NVMe Temperature Card — hidden until data arrives ---
        const diskTempCard = mkDiv('unraid-card system-stat-card hidden');
        diskTempCard.id = 'dash-disk-temp-card';
        const diskTempLabel = mkDiv('stat-label', 'HOTTEST DISK');
        diskTempLabel.id = 'dash-disk-temp-label';
        diskTempCard.appendChild(diskTempLabel);

        const diskTempVal = mkDiv('stat-value', '--');
        diskTempVal.id = 'dash-disk-temp-value';
        diskTempCard.appendChild(diskTempVal);

        dashGrid.appendChild(diskTempCard);

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
        const parityCard = mkDiv('unraid-card system-stat-card');
        parityCard.id = 'dash-parity-card';
        const parityLabel = mkDiv('stat-label', 'PARITY CHECK');
        parityCard.appendChild(parityLabel);
        const parityStatus = mkDiv('stat-value', 'No check running');
        parityStatus.id = 'dash-parity-status';
        parityCard.appendChild(parityStatus);
        const parityDetail = mkDiv('stat-sub', '');
        parityDetail.id = 'dash-parity-detail';
        parityCard.appendChild(parityDetail);

        // Controls. Handlers are bound here because url/key are in scope; the
        // refresh pass below only toggles labels and visibility.
        const parityActions = mkDiv('parity-actions');

        const mkParityBtn = (id, label) => {
            const btn = document.createElement('button');
            btn.id = id;
            btn.className = 'parity-btn hidden';
            btn.textContent = label;
            parityActions.appendChild(btn);
            return btn;
        };

        const actionBtn = mkParityBtn('parity-action-btn', 'Start');
        const cancelBtn = mkParityBtn('parity-cancel-btn', 'Cancel');

        const runParityAction = async (action, btn) => {
            const previousLabel = btn.textContent;
            btn.disabled = true;
            btn.textContent = '…';
            try {
                await controlParityCheck(url, key, action);
                showNotification(`Parity check ${action === 'cancel' ? 'cancelled' : action + 'ed'}`, 'success');
            } catch (e) {
                showNotification(`Parity ${action} failed: ${e.message}`, 'error');
                btn.textContent = previousLabel;
            } finally {
                btn.disabled = false;
            }
        };

        actionBtn.onclick = async () => {
            const action = actionBtn.dataset.action || 'start';
            // Starting a check pins the disks for hours - always confirm it.
            if (action === 'start') {
                const ok = await showConfirmModal(
                    'Start Parity Check',
                    'This reads every disk in the array and can run for several hours. Start now?',
                    'Start',
                    '#2196f3'
                );
                if (!ok) return;
            }
            await runParityAction(action, actionBtn);
        };

        cancelBtn.onclick = async () => {
            const ok = await showConfirmModal(
                'Cancel Parity Check',
                'Progress will be lost and the check starts from the beginning next time. Cancel it?',
                'Cancel Check',
                '#f44336'
            );
            if (ok) await runParityAction('cancel', cancelBtn);
        };

        parityCard.appendChild(parityActions);
        healthGrid.appendChild(parityCard);

        // SMART Status
        const smartCard = mkDiv('unraid-card system-stat-card');
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

    // Temperature (v4.30+) — three cards: CPU, Motherboard, Hottest Disk
    const cpuTempCard = document.getElementById('dash-cpu-temp-card');
    const cpuTempValEl = document.getElementById('dash-cpu-temp-value');
    const cpuTempLabelEl = document.getElementById('dash-cpu-temp-label');
    const mbTempCard = document.getElementById('dash-mb-temp-card');
    const mbTempValEl = document.getElementById('dash-mb-temp-value');
    const mbTempLabelEl = document.getElementById('dash-mb-temp-label');
    const diskTempCard = document.getElementById('dash-disk-temp-card');
    const diskTempValEl = document.getElementById('dash-disk-temp-value');
    const diskTempLabelEl = document.getElementById('dash-disk-temp-label');
    const cpuTemp = data.system?.cpuTemp;
    const summary = data.system?.temperatureSummary;
    const sensors = data.system?.temperatures || [];

    // Sensor selection across all supported Unraid setups.
    //
    // Some chip drivers (e.g. nct6798) expose voltages and fan RPMs in the
    // same payload and the Unraid API currently tags them all with unit
    // CELSIUS, so the selection has to be defensive:
    //   - filter to values in a plausible temperature range
    //   - ignore sensors whose name hints at voltage ("in0".."inN") or fan
    const unit = sensors[0]?.unit;
    const degree = unit === 'FAHRENHEIT' ? '°F' : '°C';
    const minReasonable = unit === 'FAHRENHEIT' ? 50 : 15;
    const maxReasonable = unit === 'FAHRENHEIT' ? 250 : 120;

    const isPlausibleTemp = (s) => {
        if (typeof s.value !== 'number') return false;
        if (s.value < minReasonable || s.value > maxReasonable) return false;
        const name = (s.name || '').toLowerCase();
        if (/\bin\d+\b/.test(name)) return false;
        if (/\b(fan|rpm|vddgfx|vddnb|vcore|vbat)\b/.test(name)) return false;
        return true;
    };

    const matchesName = (s, pattern) =>
        isPlausibleTemp(s) && pattern.test((s.name || '').toLowerCase());

    // Strip lm-sensors chip prefix "driver-bus-address Name" → "Name"
    // e.g. "nct6798-isa-0290 CPU Temp" → "CPU Temp", "k10temp-pci-00c3 Tctl" → "Tctl"
    const cleanName = (raw) => (raw || '').replace(/^[a-z0-9]+-[a-z0-9-]+\s+/i, '').trim();

    // --- CPU sensor selection ---
    // Priority: explicit "CPU" label from superio chip (most accurate on systems
    // that have both nct6xxx and k10temp), then Intel Package/Core, then AMD
    // Tctl/Tdie as the last resort for systems without a superio CPU sensor.
    let cpuPick = null;
    if (typeof cpuTemp === 'number') {
        cpuPick = { value: cpuTemp, name: 'CPU' };
    } else if (sensors.length > 0) {
        cpuPick =
            sensors.find(s => matchesName(s, /\bcpu\s*temp\b/)) ||
            sensors.find(s => matchesName(s, /\bcpu\b/)) ||
            sensors.find(s => matchesName(s, /\bpackage\s*id\b/)) ||
            sensors.find(s => matchesName(s, /\bpackage\b/)) ||
            sensors.find(s => matchesName(s, /\bcore\s*\d/)) ||
            sensors.find(s => matchesName(s, /\b(tctl|tdie)\b/)) ||
            null;
    }

    // --- Motherboard sensor selection ---
    // Priority: explicit "MB" label, then MOTHERBOARD sensor type, then common
    // superio ambient labels (SYSTIN = system temperature internal).
    const mbPick =
        sensors.find(s => matchesName(s, /\bmb\b|motherboard/)) ||
        sensors.find(s => s.type === 'MOTHERBOARD' && isPlausibleTemp(s)) ||
        sensors.find(s => matchesName(s, /\bsystin\b/)) ||
        null;

    // --- Hottest Disk/NVMe selection ---
    // Prefer named drives (drive model) over generic chip-internal sensors like
    // "Composite" or "Sensor 1/2/3", fall back to whatever is available.
    const diskCandidates = sensors.filter(s =>
        (s.type === 'DISK' || s.type === 'NVME') && isPlausibleTemp(s)
    );
    const namedDrives = diskCandidates.filter(s => {
        const name = (s.name || '').toLowerCase();
        return !/\b(composite|sensor\s*\d)\b/.test(name);
    });
    const diskPool = namedDrives.length > 0 ? namedDrives : diskCandidates;
    const diskPick = diskPool.slice().sort((a, b) => b.value - a.value)[0] || null;

    // Colour helper — drives red/orange/green off API status where available
    const colourClass = (sensorStatus) => {
        if (sensorStatus === 'CRITICAL') return 'text-red';
        if (sensorStatus === 'WARNING') return 'text-orange';
        return 'text-green';
    };

    // Suppress redundant sensor names so the card doesn't read "CPU TEMP · CPU Temp"
    const isRedundantName = (name, kind) => {
        const n = (name || '').toLowerCase().trim();
        if (!n) return true;
        if (kind === 'cpu') return /^(cpu|cpu\s*temp|cpu\s*temperature)$/.test(n);
        if (kind === 'mb')  return /^(mb|mb\s*temp|motherboard|board)$/.test(n);
        return false;
    };

    const buildLabel = (title, sensorName, kind) => {
        const clean = cleanName(sensorName);
        if (!clean || isRedundantName(clean, kind)) return title;
        return `${title} · ${clean}`;
    };

    // --- Render CPU card ---
    if (cpuTempCard && cpuTempValEl && cpuTempLabelEl) {
        if (cpuPick) {
            cpuTempLabelEl.textContent = buildLabel('CPU TEMP', cpuPick.name, 'cpu');
            cpuTempValEl.textContent = `${Math.round(cpuPick.value)}${degree}`;
            cpuTempValEl.className = 'stat-value ' + colourClass(cpuPick.status);
            cpuTempCard.classList.remove('hidden');
        } else {
            cpuTempCard.classList.add('hidden');
        }
    }

    // --- Render MB card ---
    if (mbTempCard && mbTempValEl && mbTempLabelEl) {
        if (mbPick) {
            mbTempLabelEl.textContent = buildLabel('MB TEMP', mbPick.name, 'mb');
            mbTempValEl.textContent = `${Math.round(mbPick.value)}${degree}`;
            mbTempValEl.className = 'stat-value ' + colourClass(mbPick.status);
            mbTempCard.classList.remove('hidden');
        } else {
            mbTempCard.classList.add('hidden');
        }
    }

    // --- Render Hottest Disk card ---
    if (diskTempCard && diskTempValEl && diskTempLabelEl) {
        if (diskPick) {
            diskTempLabelEl.textContent = buildLabel('HOTTEST DISK', diskPick.name, 'disk');
            diskTempValEl.textContent = `${Math.round(diskPick.value)}${degree}`;
            diskTempValEl.className = 'stat-value ' + colourClass(diskPick.status);
            diskTempCard.classList.remove('hidden');
        } else {
            diskTempCard.classList.add('hidden');
        }
    }

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
    
    // Button state follows the parity status: one primary action plus Cancel,
    // which only exists while a check is in flight.
    const parityActionBtn = document.getElementById('parity-action-btn');
    const parityCancelBtn = document.getElementById('parity-cancel-btn');
    const setParityButtons = (action, label, showCancel) => {
        if (parityActionBtn) {
            parityActionBtn.dataset.action = action;
            parityActionBtn.textContent = label;
            parityActionBtn.classList.remove('hidden');
        }
        if (parityCancelBtn) {
            parityCancelBtn.classList.toggle('hidden', !showCancel);
        }
    };

    if (parityStatusEl && data.array.parity) {
        const parity = data.array.parity;
        if (parity.status === 'paused') {
            parityStatusEl.textContent = `Paused at ${Math.round(parity.percent || 0)}%`;
            parityStatusEl.className = 'stat-value text-orange';
            if (parityCard) parityCard.style.borderLeftColor = '#ff9800';
            parityDetailEl.textContent = `Errors: ${parity.errors || 0}`;
            setParityButtons('resume', 'Resume', true);
        } else if (parity.status === 'running' || parity.status === 'RUNNING') {
            parityStatusEl.textContent = `Checking... ${Math.round(parity.percent || 0)}%`;
            parityStatusEl.className = 'stat-value text-blue';
            if(parityCard) parityCard.style.borderLeftColor = '#2196f3'; // Blue border
            parityDetailEl.textContent = `Errors: ${parity.errors || 0} | Speed: ${parity.speed || 'N/A'}`;
            setParityButtons('pause', 'Pause', true);
        } else {
            setParityButtons('start', 'Start', false);
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

/**
 * Severity for a filesystem, based on absolute free space first.
 *
 * Percentage alone is the wrong signal on Unraid: the array fills disks
 * sequentially by design, so a healthy 18 TB disk sits at 95%+ for most of its
 * life. Colouring that red trains the user to ignore the colour entirely.
 * What actually matters is whether there is room left for the next write.
 * @param {number} freeBytes
 * @param {number} percent
 * @returns {'ok'|'warn'|'crit'}
 */
function storageSeverity(freeBytes, percent) {
    const GB = 1024 ** 3;
    if (freeBytes < 25 * GB) return 'crit';
    if (freeBytes < 150 * GB) return 'warn';
    // A nearly-full device with lots of absolute room left is still worth a nudge.
    if (percent >= 99) return 'warn';
    return 'ok';
}

/**
 * Temperature band. Returns an empty string below the warm threshold so a
 * normal temperature stays visually silent instead of adding another colour.
 * @param {number|string} temp
 * @returns {string}
 */
function tempSeverity(temp) {
    const t = parseFloat(temp);
    if (isNaN(t)) return '';
    if (t >= 50) return 'hot';
    if (t >= 42) return 'warm';
    return '';
}

/**
 * Renders the Storage tab: an array summary, then one flat row per device,
 * parity handled separately, then shares.
 * @param {object} data - Normalized system data from getSystemData()
 */
function renderUnraidStorage(data) {
    const storageTab = document.getElementById("unraid-tab-storage");
    if (!storageTab || storageTab.classList.contains('hidden')) return;

    const parities = data.array.parities || [];
    const disks = data.array.disks || [];
    const caches = data.array.caches || [];
    const boot = data.array.boot ? [data.array.boot] : [];
    const shares = data.shares || [];

    // Rebuild the skeleton only when the device set changes, so a 5s poll does
    // not blow away scroll position or cause flicker.
    const signature = [
        parities.map(d => d.name).join(','),
        disks.map(d => d.name).join(','),
        caches.map(d => d.name).join(','),
        boot.map(d => d.name).join(','),
        shares.map(s => s.name).join(',')
    ].join('|');

    let wrap = document.getElementById('storage-list-container');
    if (!wrap || wrap.dataset.signature !== signature) {
        storageTab.replaceChildren();
        wrap = document.createElement('div');
        wrap.className = 'unraid-storage-wrapper';
        wrap.id = 'storage-list-container';
        wrap.dataset.signature = signature;
        storageTab.appendChild(wrap);
        buildStorageSkeleton(wrap, { parities, disks, caches, boot, shares });
    }

    // ---- Array summary -------------------------------------------------
    const total = data.array.total || 0;
    const used = data.array.used || 0;
    const free = data.array.free || Math.max(total - used, 0);
    const percent = total > 0 ? (used / total) * 100 : 0;

    const freeEl = document.getElementById('storage-summary-free');
    const subEl = document.getElementById('storage-summary-sub');
    const fillEl = document.getElementById('storage-summary-fill');
    if (freeEl && subEl && fillEl) {
        freeEl.textContent = formatBytes(free, 1);
        subEl.textContent = `free of ${formatBytes(total, 1)} · ${Math.round(percent)}% used`;
        fillEl.style.width = `${Math.min(percent, 100)}%`;
        fillEl.className = `storage-bar-fill sev-${storageSeverity(free, percent)}`;
    }

    // ---- Devices -------------------------------------------------------
    [...disks, ...caches, ...boot].forEach(updateStorageRow);
    parities.forEach(updateParityRow);
    shares.forEach(updateShareRow);
}

/**
 * Slug for a row id. Device and share names come from the server.
 * @param {string} prefix
 * @param {string} name
 * @returns {string}
 */
const storageRowId = (prefix, name) =>
    `${prefix}-${String(name).replace(/[^a-zA-Z0-9]/g, '')}`;

/**
 * Creates one device/share row. Values are filled in by the update pass.
 * @param {string} id
 * @param {string} name
 * @param {boolean} withBar
 * @returns {HTMLElement}
 */
function buildStorageRow(id, name, withBar = true) {
    const row = document.createElement('div');
    row.className = 'storage-row';
    row.id = id;

    const head = document.createElement('div');
    head.className = 'storage-row-head';

    const nameEl = document.createElement('span');
    nameEl.className = 'storage-row-name';
    nameEl.textContent = name;
    nameEl.title = name;

    const metaEl = document.createElement('span');
    metaEl.className = 'storage-row-meta';

    head.appendChild(nameEl);
    head.appendChild(metaEl);
    row.appendChild(head);

    if (withBar) {
        const track = document.createElement('div');
        track.className = 'storage-bar-track';
        const fill = document.createElement('div');
        fill.className = 'storage-bar-fill';
        track.appendChild(fill);
        row.appendChild(track);
    }

    return row;
}

/**
 * Builds the static structure once per device-set change.
 * @param {HTMLElement} wrap
 * @param {{parities:Array,disks:Array,caches:Array,boot:Array,shares:Array}} groups
 */
function buildStorageSkeleton(wrap, groups) {
    // Summary
    const summary = document.createElement('div');
    summary.className = 'storage-summary';

    const free = document.createElement('div');
    free.className = 'storage-summary-free';
    free.id = 'storage-summary-free';
    free.textContent = '--';

    const sub = document.createElement('div');
    sub.className = 'storage-summary-sub';
    sub.id = 'storage-summary-sub';

    const track = document.createElement('div');
    track.className = 'storage-bar-track storage-summary-track';
    const fill = document.createElement('div');
    fill.className = 'storage-bar-fill';
    fill.id = 'storage-summary-fill';
    track.appendChild(fill);

    summary.appendChild(free);
    summary.appendChild(sub);
    summary.appendChild(track);
    wrap.appendChild(summary);

    const section = (title) => {
        const h = document.createElement('div');
        h.className = 'storage-section-title';
        h.textContent = title;
        wrap.appendChild(h);
    };

    if (groups.disks.length) {
        section('Array');
        groups.disks.forEach(d => wrap.appendChild(buildStorageRow(storageRowId('sdisk', d.name), d.name)));
    }

    // Parity has no filesystem - a capacity bar for it would always read 0%.
    if (groups.parities.length) {
        section('Parity');
        groups.parities.forEach(d => wrap.appendChild(buildStorageRow(storageRowId('sparity', d.name), d.name, false)));
    }

    if (groups.caches.length) {
        section('Pools');
        groups.caches.forEach(d => wrap.appendChild(buildStorageRow(storageRowId('scache', d.name), d.name)));
    }

    if (groups.boot.length) {
        section('Boot');
        groups.boot.forEach(d => wrap.appendChild(buildStorageRow(storageRowId('sboot', d.name), d.name)));
    }

    if (groups.shares.length) {
        section('Shares');
        groups.shares.forEach(s => wrap.appendChild(buildStorageRow(storageRowId('sshare', s.name), s.name)));
    }
}

/**
 * Updates a device row. Free space is the primary figure - it is what you need
 * before starting a download; "used" requires mental subtraction.
 * @param {object} disk
 */
function updateStorageRow(disk) {
    const prefix = disk.type === 'cache' ? 'scache' : (disk.type === 'boot' ? 'sboot' : 'sdisk');
    let row = document.getElementById(storageRowId(prefix, disk.name));
    // Pool and boot devices reuse the same mapper, so fall back across prefixes.
    if (!row) {
        row = document.getElementById(storageRowId('sdisk', disk.name))
            || document.getElementById(storageRowId('scache', disk.name))
            || document.getElementById(storageRowId('sboot', disk.name));
    }
    if (!row) return;

    const total = disk.total || 0;
    const used = disk.used || 0;
    const free = disk.free !== undefined ? disk.free : Math.max(total - used, 0);
    const percent = total > 0 ? (used / total) * 100 : 0;
    const severity = storageSeverity(free, percent);

    const parts = [];
    const tempBand = tempSeverity(disk.temp);
    if (disk.temp !== undefined && disk.temp !== null && disk.temp !== '') {
        parts.push(`${disk.temp}°C`);
    }
    parts.push(`${formatBytes(free, 1)} free`);

    const meta = row.querySelector('.storage-row-meta');
    meta.textContent = parts.join(' · ');
    meta.className = `storage-row-meta${tempBand ? ' temp-' + tempBand : ''}`;
    row.title = `${formatBytes(used, 1)} used of ${formatBytes(total, 1)} (${Math.round(percent)}%)`;

    const fill = row.querySelector('.storage-bar-fill');
    if (fill) {
        fill.style.width = `${Math.min(percent, 100)}%`;
        fill.className = `storage-bar-fill sev-${severity}`;
    }

    row.classList.toggle('is-idle', disk.spinning === false);
}

/**
 * Updates a parity row. Parity carries no filesystem, so this reports health
 * and temperature rather than capacity.
 * @param {object} disk
 */
function updateParityRow(disk) {
    const row = document.getElementById(storageRowId('sparity', disk.name));
    if (!row) return;

    const parts = [];
    if (disk.temp !== undefined && disk.temp !== null && disk.temp !== '') {
        parts.push(`${disk.temp}°C`);
    }
    parts.push(disk.status ? String(disk.status).replace(/_/g, ' ') : 'Unknown');
    if (disk.spinning === false) parts.push('standby');

    const meta = row.querySelector('.storage-row-meta');
    const tempBand = tempSeverity(disk.temp);
    meta.textContent = parts.join(' · ');
    meta.className = `storage-row-meta${tempBand ? ' temp-' + tempBand : ''}`;
}

/**
 * Updates a share row.
 * @param {object} share
 */
function updateShareRow(share) {
    const row = document.getElementById(storageRowId('sshare', share.name));
    if (!row) return;

    const total = share.sizeBytes || 0;
    const used = share.usedBytes || 0;
    const free = share.freeBytes !== undefined ? share.freeBytes : Math.max(total - used, 0);
    const percent = total > 0 ? (used / total) * 100 : 0;

    const meta = row.querySelector('.storage-row-meta');
    meta.textContent = `${formatBytes(used, 1)} used`;
    meta.className = 'storage-row-meta';
    row.title = share.comment
        ? `${share.comment} — ${formatBytes(free, 1)} free`
        : `${formatBytes(free, 1)} free`;

    const fill = row.querySelector('.storage-bar-fill');
    if (fill) {
        fill.style.width = `${Math.min(percent, 100)}%`;
        fill.className = `storage-bar-fill sev-${storageSeverity(free, percent)}`;
    }
}

/**
 * Renders the "Update All" bar above the container list. It only exists while
 * something is actually updatable, so the Docker tab stays clean otherwise.
 * @param {number} count - Number of containers with a pending update
 * @param {string} url
 * @param {string} key
 */
function renderUpdateAllBar(count, url, key) {
    const list = document.getElementById("unraid-docker-list");
    if (!list || !list.parentNode) return;

    let bar = document.getElementById('unraid-update-all-bar');

    if (count === 0) {
        if (bar) bar.remove();
        return;
    }

    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'unraid-update-all-bar';
        bar.className = 'unraid-update-all-bar';

        const label = document.createElement('span');
        label.className = 'update-all-label';
        bar.appendChild(label);

        const btn = document.createElement('button');
        btn.id = 'unraid-update-all-btn';
        btn.className = 'update-all-btn';
        btn.textContent = 'Update All';
        bar.appendChild(btn);

        list.parentNode.insertBefore(bar, list);
    }

    bar.querySelector('.update-all-label').textContent =
        `${count} update${count === 1 ? '' : 's'} available`;

    const btn = bar.querySelector('.update-all-btn');
    // Rebind every pass: url/key and the count are captured in the closure.
    btn.onclick = async () => {
        if (btn.dataset.busy) return;
        const ok = await showConfirmModal(
            'Update All Containers',
            `Pull the latest image for ${count} container${count === 1 ? '' : 's'} and recreate them? Each one restarts.`,
            'Update All',
            '#2196f3'
        );
        if (!ok) return;

        btn.dataset.busy = '1';
        btn.disabled = true;
        btn.textContent = 'Updating…';
        try {
            await updateAllContainers(url, key);
            showNotification('All containers updated', 'success');
        } catch (e) {
            showNotification(`Update all failed: ${e.message}`, 'error');
        } finally {
            btn.textContent = 'Update All';
            btn.disabled = false;
            delete btn.dataset.busy;
        }
    };
}

/**
 * Shows how many containers have a pending image update on the Docker sub-tab,
 * so it is visible without opening the tab and scrolling the list.
 * @param {Array} containers
 */
function updateDockerTabBadge(containers, url, key) {
    const count = (containers || []).filter(c => c.updateAvailable).length;
    renderUpdateAllBar(count, url, key);

    const tabBtn = document.querySelector('#unraid-view .sub-tab-btn[data-target="unraid-tab-docker"]');
    if (!tabBtn) return;

    let badge = tabBtn.querySelector('.tab-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'tab-badge hidden';
        badge.style.background = 'var(--accent-unraid)';
        badge.style.color = '#fff';
        tabBtn.appendChild(badge);
    }

    if (count > 0) {
        badge.textContent = count;
        badge.title = `${count} container update${count === 1 ? '' : 's'} available`;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function renderUnraidDocker(containers, url, key) {
    const list = document.getElementById("unraid-docker-list");
    if (!list) return;

    updateDockerTabBadge(containers, url, key);

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
    const filterValue = searchInput ? searchInput.value : "";
    if (filterValue) {
        const term = filterValue.toLowerCase();
        containers = containers.filter(c => c.name.toLowerCase().includes(term));
    }

    // Empty state after filtering
    if (containers.length === 0) {
        list.textContent = "";
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'queue-empty';
        emptyDiv.innerHTML = `
            <div class="queue-empty-icon">🐳</div>
            <div class="queue-empty-text">${filterValue ? 'No containers match filter' : 'No containers found'}</div>
        `;
        list.appendChild(emptyDiv);
        return;
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
    
    // Icon — prefer template icon from API (v4.30+), fall back to name initials
    const iconDiv = card.querySelector('.card-icon');
    const existingImg = iconDiv.querySelector('img');
    if (container.icon) {
        if (!existingImg || existingImg.src !== container.icon) {
            iconDiv.textContent = '';
            const img = document.createElement('img');
            img.src = container.icon;
            img.alt = '';
            img.setAttribute('aria-hidden', 'true');
            img.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:4px;';
            img.onerror = () => {
                // Template icon unreachable — fall back to initials
                iconDiv.textContent = container.name.substring(0, 2).toUpperCase();
            };
            iconDiv.appendChild(img);
        }
    } else {
        const iconLetter = container.name.substring(0, 2).toUpperCase();
        if (iconDiv.textContent !== iconLetter || existingImg) {
            iconDiv.textContent = iconLetter;
            if (!iconDiv.style.display) {
                iconDiv.style.display = "flex";
                iconDiv.style.alignItems = "center";
                iconDiv.style.justifyContent = "center";
                iconDiv.style.backgroundColor = "rgba(255,255,255,0.1)";
                iconDiv.style.fontSize = "10px";
                iconDiv.style.fontWeight = "bold";
            }
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
    // Marks the whole row, so a pending update is visible while scanning the
    // list rather than only when the small badge is read.
    card.classList.toggle('has-update', !!container.updateAvailable);
    if (container.updateAvailable) {
         if(badge.classList.contains('hidden')) badge.classList.remove('hidden');

    } else {
         if(!badge.classList.contains('hidden')) badge.classList.add('hidden');
    }

    // Update action. The badge stays a pure status label - the trigger is a real
    // button in the action row, next to start/stop/restart, so it is findable.
    const updateBtn = card.querySelector('.update-btn');
    if (updateBtn) {
        updateBtn.classList.toggle('hidden', !container.updateAvailable);

        // updateDockerCard() runs on every poll, so bind only once per card.
        if (container.updateAvailable && !updateBtn.dataset.bound) {
            updateBtn.dataset.bound = '1';
            updateBtn.onclick = async () => {
                if (updateBtn.dataset.busy) return;
                const name = container.name || 'this container';
                const ok = await showConfirmModal(
                    'Update Container',
                    `Pull the latest image for "${name}" and recreate it? The container restarts.`,
                    'Update',
                    '#2196f3'
                );
                if (!ok) return;

                updateBtn.dataset.busy = '1';
                updateBtn.disabled = true;
                const previousLabel = updateBtn.textContent;
                updateBtn.textContent = '…';
                try {
                    await updateContainer(url, key, container.id);
                    showNotification(`${name} updated`, 'success');
                } catch (e) {
                    showNotification(`Update failed: ${e.message}`, 'error');
                } finally {
                    updateBtn.textContent = previousLabel;
                    updateBtn.disabled = false;
                    delete updateBtn.dataset.busy;
                }
            };
        }
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
         card.classList.add('loading');
         startBtn.classList.add('btn-loading');
         dot.className = 'status-dot paused'; 
         try {
             await controlContainer(url, key, container.id, 'start');
             showNotification(`Container "${container.name}" started`, 'success');
         } catch (err) {
             showNotification(`Failed to start "${container.name}": ${err.message}`, 'error');
             dot.className = 'status-dot stopped';
         } finally {
             card.classList.remove('loading');
             startBtn.classList.remove('btn-loading');
             startBtn.blur();
         }
    };
    stopBtn.onclick = async (e) => {
         e.stopPropagation();
         card.classList.add('loading');
         stopBtn.classList.add('btn-loading');
         dot.className = 'status-dot paused';
         try {
             await controlContainer(url, key, container.id, 'stop');
             showNotification(`Container "${container.name}" stopped`, 'success');
         } catch (err) {
             showNotification(`Failed to stop "${container.name}": ${err.message}`, 'error');
             dot.className = 'status-dot started';
         } finally {
             card.classList.remove('loading');
             stopBtn.classList.remove('btn-loading');
             stopBtn.blur();
         }
    };
    restartBtn.onclick = async (e) => {
         e.stopPropagation();
         card.classList.add('loading');
         restartBtn.classList.add('btn-loading');
         dot.className = 'status-dot paused';
         try {
             await controlContainer(url, key, container.id, 'restart');
             showNotification(`Container "${container.name}" restarted`, 'success');
         } catch (err) {
             showNotification(`Failed to restart "${container.name}": ${err.message}`, 'error');
             dot.className = 'status-dot started';
         } finally {
             card.classList.remove('loading');
             restartBtn.classList.remove('btn-loading');
             restartBtn.blur();
         }
    };
    webBtn.onclick = (e) => {
         e.stopPropagation();
         e.preventDefault();
         if (container.webui) {
             // WebUI URL is pulled from Docker labels / template — a compromised
             // container can point this at anything. openUrlSafely prompts the
             // user if the host isn't local/private and isn't the Unraid server.
             openUrlSafely(container.webui, { unraidUrl: url }, 'Docker container');
         } else {
             if (validateUrl(url)) chrome.tabs.create({ url: url, active: true });
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

            if (isRunning) {
                startBtn.style.display = 'none';
            } else {
                stopBtn.style.display = 'none';
            }

            startBtn.onclick = async (e) => {
                e.stopPropagation();
                card.classList.add('loading');
                startBtn.classList.add('btn-loading');
                dot.className = 'status-dot paused';
                try {
                    await controlVm(url, key, vm.id, 'start');
                    showNotification(`VM "${vm.name}" started`, 'success');
                } catch (err) {
                    showNotification(`Failed to start "${vm.name}": ${err.message}`, 'error');
                    dot.className = 'status-dot stopped';
                } finally {
                    card.classList.remove('loading');
                    startBtn.classList.remove('btn-loading');
                    startBtn.blur();
                }
            };
            stopBtn.onclick = async (e) => {
                e.stopPropagation();
                card.classList.add('loading');
                stopBtn.classList.add('btn-loading');
                dot.className = 'status-dot paused';
                try {
                    await controlVm(url, key, vm.id, 'stop');
                    showNotification(`VM "${vm.name}" stopped`, 'success');
                } catch (err) {
                    showNotification(`Failed to stop "${vm.name}": ${err.message}`, 'error');
                    dot.className = 'status-dot started';
                } finally {
                    card.classList.remove('loading');
                    stopBtn.classList.remove('btn-loading');
                    stopBtn.blur();
                }
            };
            
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
