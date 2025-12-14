import {
  checkUnraidStatus,
  getSystemData,
  controlContainer,
  getVms,
  controlVm
} from "../../services/unraid.js";

export async function initUnraid(url, key, state) {
    if (!key) {
      const statusCard = document.getElementById("unraid-status-card");
      if(statusCard) statusCard.innerHTML = '<div class="status-indicator offline">Please set Unraid API Key in Options</div>';
      return;
    }

    const update = async () => {
         const activeSubTab = document.querySelector("#unraid-view .sub-tab-btn.active");
         const target = activeSubTab ? activeSubTab.dataset.target : 'unraid-tab-system';

         try {
             if (target === 'unraid-tab-vms') {
                 await renderUnraidVms(url, key);
                 // Clear system error if any
                 const card = document.getElementById("unraid-status-card");
                 if (card && card.querySelector(".status-indicator").textContent === "CONNECTION ERROR") {
                      card.querySelector(".status-indicator").textContent = "ONLINE";
                      card.querySelector(".status-indicator").className = "status-indicator online";
                 }
             } else {
                 const data = await getSystemData(url, key);
                 if (data._error) {
                    throw new Error(data._error);
                 }
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

    await update();
    // Auto-refresh 5s
    if (state.refreshInterval) clearInterval(state.refreshInterval);
    state.refreshInterval = setInterval(update, 5000);
}

// Helper function to render system, array, cpu, ram, and storage
function renderUnraidSystem(data, url, key, state) {
    const card = document.getElementById("unraid-status-card");
    if (card) {
        const ind = card.querySelector(".status-indicator");
        if(ind) {
            ind.textContent = "ONLINE";
            ind.className = "status-indicator online";
        }
    }

    // --- Render System Tab ---
    const systemTab = document.getElementById("unraid-tab-system");
    if (!systemTab) return;
    systemTab.innerHTML = ""; // Clear

    // Utils
    const getUptime = (iso) => {
      if (!iso) return "--";
      const diff = Date.now() - new Date(iso).getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return `${days} days, ${hours} hours, ${mins} minutes`;
    };

    // Helper for system cards
    const createSystemCard = (iconClass, title, subtitle) => {
        const div = document.createElement('div');
        div.className = 'system-card';
        
        const header = document.createElement('div');
        header.className = 'uk-header';
        
        const icon = document.createElement('div');
        icon.className = `uk-icon ${iconClass}`;
        
        const titleSection = document.createElement('div');
        titleSection.className = 'uk-title-section';
        
        const t = document.createElement('div');
        t.className = 'uk-title';
        t.textContent = title;
        
        const s = document.createElement('div');
        s.className = 'uk-subtitle';
        s.textContent = subtitle;
        
        titleSection.appendChild(t);
        titleSection.appendChild(s);
        
        header.appendChild(icon);
        header.appendChild(titleSection);
        
        div.appendChild(header);
        return { card: div, header, titleSection };
    };

    // 1. UNRAID INFO CARD
    const { card: infoCard } = createSystemCard('info', 'UNRAID', `Version: ${data.system.version}`);
    
    // Registration
    const regRow = document.createElement('div');
    regRow.className = 'uk-info-row';
    const regIcon = document.createElement('span');
    regIcon.className = 'uk-info-icon';
    regIcon.textContent = '🪪';
    const regText = document.createElement('span');
    regText.textContent = 'Registration: Unraid OS ';
    const regStrong = document.createElement('strong');
    regStrong.textContent = data.system.registration;
    regText.appendChild(regStrong);
    regRow.appendChild(regIcon);
    regRow.appendChild(regText);
    infoCard.appendChild(regRow);

    // Uptime
    const uptimeRow = document.createElement('div');
    uptimeRow.className = 'uk-info-row';
    const uptimeIcon = document.createElement('span');
    uptimeIcon.className = 'uk-info-icon';
    uptimeIcon.textContent = '🕒';
    const uptimeText = document.createElement('span');
    uptimeText.textContent = `Uptime: ${getUptime(data.system.uptimeBoot)}`;
    uptimeRow.appendChild(uptimeIcon);
    uptimeRow.appendChild(uptimeText);
    infoCard.appendChild(uptimeRow);

    // Array Status
    const statusRow = document.createElement('div');
    statusRow.className = 'uk-info-row';
    const statusIcon = document.createElement('span');
    statusIcon.className = 'uk-info-icon';
    statusIcon.textContent = '💾';
    const statusText = document.createElement('span');
    statusText.textContent = 'Array: ';
    const statusVal = document.createElement('span');
    statusVal.className = 'green-text';
    const statusStr = data.array.status === "STARTED" ? "Started" : data.array.status;
    statusVal.textContent = statusStr;
    statusText.appendChild(statusVal);
    statusRow.appendChild(statusIcon);
    statusRow.appendChild(statusText);
    infoCard.appendChild(statusRow);
    
    systemTab.appendChild(infoCard);

    // 2. ARRAY CAPACITY CARD
    const arrayPct = (data.array.used / data.array.total) * 100 || 0;
    const arrayFree = data.array.total - data.array.used;
    
    // Disk Runway Calculation
    const avg1080p = 10 * 1024 * 1024 * 1024; // 10 GB
    const avg4K = 55 * 1024 * 1024 * 1024;    // 55 GB
    const count1080p = Math.floor(arrayFree / avg1080p);
    const count4K = Math.floor(arrayFree / avg4K);

    const { card: capCard } = createSystemCard('array', 'ARRAY CAPACITY', `${formatBytes(data.array.total)} Total`);
    
    // Progress Bar
    const progTrack = document.createElement('div');
    progTrack.className = 'uk-progress-lg-track';
    
    const progFill = document.createElement('div');
    progFill.className = 'uk-progress-lg-fill';
    progFill.style.width = `${arrayPct}%`;
    
    const progText = document.createElement('div');
    progText.className = 'uk-progress-text text-shadow';
    progText.textContent = `${formatBytes(data.array.used)} / ${formatBytes(data.array.total)}`;
    
    // Runway Info
    const runwayDiv = document.createElement('div');
    runwayDiv.style.cssText = "display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); margin-top: 6px; padding: 0 4px;";
    
    const runwayLeft = document.createElement('span');
    runwayLeft.textContent = `Free: ${formatBytes(arrayFree)}`;
    
    const runwayRight = document.createElement('span');
    runwayRight.textContent = `~${count1080p}x 1080p  |  ~${count4K}x 4K`;
    runwayRight.title = "based on 10GB (1080p) and 55GB (4K) avg size";
    runwayRight.style.cursor = "help";

    runwayDiv.appendChild(runwayLeft);
    runwayDiv.appendChild(runwayRight);

    progTrack.appendChild(progFill);
    progTrack.appendChild(progText);
    
    capCard.appendChild(progTrack);
    capCard.appendChild(runwayDiv); // Add the new info below the bar

    systemTab.appendChild(capCard);

    // 3. SYSTEM CARD (CPU/RAM)
    const { card: sysCard } = createSystemCard('system', 'SYSTEM', '');
    
    // CPU
    const cpuRow = document.createElement('div');
    cpuRow.className = 'cpu-row';
    cpuRow.style.marginBottom = '12px';
    
    const cpuLabel = document.createElement('div');
    cpuLabel.style.cssText = "flex: 0 0 160px; display:flex; justify-content:space-between; padding-right:15px; align-items:center;";
    const cpuSpan = document.createElement('span');
    cpuSpan.textContent = 'CPU Load:';
    const cpuVal = document.createElement('span');
    cpuVal.style.fontWeight = 'bold';
    cpuVal.textContent = `${Math.round(data.cpu)}%`;
    cpuLabel.appendChild(cpuSpan);
    cpuLabel.appendChild(cpuVal);
    
    const cpuTrack = document.createElement('div');
    cpuTrack.className = 'cpu-track';
    const cpuFill = document.createElement('div');
    cpuFill.className = `cpu-fill ${data.cpu > 80 ? 'critical' : ''}`;
    cpuFill.style.width = `${data.cpu}%`;
    cpuTrack.appendChild(cpuFill);
    
    cpuRow.appendChild(cpuLabel);
    cpuRow.appendChild(cpuTrack);
    sysCard.appendChild(cpuRow);

    // RAM
    const ramRow = document.createElement('div');
    ramRow.className = 'cpu-row';
    
    const ramLabel = document.createElement('div');
    ramLabel.style.cssText = "flex: 0 0 160px; display:flex; justify-content:space-between; padding-right:15px; align-items:center;";
    const ramSpan = document.createElement('span');
    ramSpan.textContent = 'RAM:';
    
    const ramRight = document.createElement('div');
    ramRight.style.textAlign = 'right';
    const ramVal = document.createElement('span');
    ramVal.style.fontWeight = 'bold';
    ramVal.textContent = `${Math.round(data.ram)}%`;
    const ramTotal = document.createElement('span');
    ramTotal.style.fontSize = '0.8em';
    ramTotal.style.color = 'var(--text-secondary)';
    ramTotal.style.marginLeft = '4px';
    ramTotal.textContent = `/ ${formatBytes(data.system.memoryTotal)}`;
    
    ramRight.appendChild(ramVal);
    ramRight.appendChild(ramTotal);
    ramLabel.appendChild(ramSpan);
    ramLabel.appendChild(ramRight);
    
    const ramTrack = document.createElement('div');
    ramTrack.className = 'cpu-track';
    const ramFill = document.createElement('div');
    let ramClass = '';
    if (data.ram > 80) ramClass = 'critical';
    else if (data.ram > 60) ramClass = 'warning';
    
    ramFill.className = `cpu-fill ${ramClass}`;
    ramFill.style.width = `${data.ram}%`;
    ramTrack.appendChild(ramFill);
    
    ramRow.appendChild(ramLabel);
    ramRow.appendChild(ramTrack);
    sysCard.appendChild(ramRow);
    
    systemTab.appendChild(sysCard);
    
    // Storage Tab Populating
    const storageTab = document.getElementById("unraid-tab-storage");

    // Helper to create a Storage Card
    const createStorageCard = (title, used, total, free, items) => {
      // Check persistent state
      const isOpen = state.storageCardState && state.storageCardState[title];
      if (!state.storageCardState) state.storageCardState = {};

      const pct = total > 0 ? (used / total) * 100 : 0;
      const displayFree = free !== undefined ? free : total - used;

      const card = document.createElement("div");
      card.className = "storage-card";
      
      const header = document.createElement("div");
      header.className = "storage-header";
      header.style.cssText = "cursor: pointer; display: flex; justify-content: space-between;";
      
      const headerLeft = document.createElement("div");
      headerLeft.style.cssText = "display: flex; align-items: center; gap: 10px;";
      const icon = document.createElement("div");
      icon.className = "storage-icon";
      const titleSpan = document.createElement("span");
      titleSpan.textContent = title;
      headerLeft.appendChild(icon);
      headerLeft.appendChild(titleSpan);
      
      const arrow = document.createElement("div");
      arrow.className = "dropdown-arrow";
      arrow.style.cssText = `transition: transform 0.3s; transform: rotate(${isOpen ? "180deg" : "0deg"});`;
      arrow.textContent = "▼";
      
      header.appendChild(headerLeft);
      header.appendChild(arrow);
      
      const usageText = document.createElement("div");
      usageText.className = "storage-usage-text";
      const freeSpan = document.createElement("span");
      freeSpan.style.color = "var(--text-primary)";
      freeSpan.textContent = `${formatBytes(displayFree)} free`;
      const totalSpan = document.createElement("span");
      totalSpan.style.opacity = "0.7";
      totalSpan.textContent = ` / ${formatBytes(total)} total`;
      usageText.appendChild(freeSpan);
      usageText.appendChild(totalSpan);
      
      const track = document.createElement("div");
      track.className = "progress-track";
      track.style.marginBottom = "15px";
      const fill = document.createElement("div");
      let fillClass = "";
      if (pct > 90) fillClass = "critical";
      else if (pct > 70) fillClass = "warning";
      fill.className = `progress-fill ${fillClass}`;
      fill.style.width = `${pct}%`;
      track.appendChild(fill);
      
      const dropdown = document.createElement("div");
      dropdown.className = `storage-details-dropdown ${isOpen ? "" : "hidden"}`;
      dropdown.style.cssText = "margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;";
      
      items.forEach(disk => {
          const row = document.createElement("div");
          row.className = "disk-row";
          
          const meta = document.createElement("div");
          meta.className = "disk-meta";
          const nameS = document.createElement("span");
          nameS.className = "disk-name";
          nameS.textContent = disk.name;
          const tempS = document.createElement("span");
          tempS.className = `disk-temp ${disk.temp > 45 ? "hot" : ""}`;
          tempS.textContent = `${disk.temp || "--"}°C`;
          meta.appendChild(nameS);
          meta.appendChild(tempS);
          
          row.appendChild(meta);
          
          if (disk.type === "Parity" || !disk.total) {
              const statusDiv = document.createElement("div");
              statusDiv.style.cssText = "font-size:0.8em; color:#2196f3;";
              statusDiv.textContent = disk.status || "OK";
              row.appendChild(statusDiv);
          } else {
              const dPct = (disk.used / disk.total) * 100;
              const miniTrack = document.createElement("div");
              miniTrack.className = "disk-mini-track";
              const miniFill = document.createElement("div");
              miniFill.className = "disk-mini-fill";
              miniFill.style.width = `${dPct}%`;
              miniTrack.appendChild(miniFill);
              
              const stats = document.createElement("div");
              stats.style.cssText = "display:flex; justify-content:space-between; margin-top:2px; font-size:0.75em; color:var(--text-secondary);";
              const usedDisk = document.createElement("span");
              usedDisk.textContent = formatBytes(disk.used);
              const freeDisk = document.createElement("span");
              freeDisk.style.color = "var(--text-primary)";
              freeDisk.textContent = `${formatBytes(disk.free)} free`;
              
              stats.appendChild(usedDisk);
              stats.appendChild(freeDisk);
              
              row.appendChild(miniTrack);
              row.appendChild(stats);
          }
          
          dropdown.appendChild(row);
      });

      card.appendChild(header);
      card.appendChild(usageText);
      card.appendChild(track);
      card.appendChild(dropdown);

      // Toggle Logic
      header.addEventListener("click", () => {
        const isHidden = dropdown.classList.contains("hidden");
        if (isHidden) {
          dropdown.classList.remove("hidden");
          arrow.style.transform = "rotate(180deg)";
          state.storageCardState[title] = true;
        } else {
          dropdown.classList.add("hidden");
          arrow.style.transform = "rotate(0deg)";
          state.storageCardState[title] = false;
        }
      });

      return card;
    };

    if (storageTab) {
        storageTab.innerHTML = "";

        // 1. Array Pool
        const arrayDisks = [...data.array.parities, ...data.array.disks];
        storageTab.appendChild(
          createStorageCard(
            "Array",
            data.array.used,
            data.array.total,
            data.array.free,
            arrayDisks
          )
        );

        // 2. Cache Pool (Aggregate)
        if (data.array.caches && data.array.caches.length > 0) {
          const cacheUsed = data.array.caches.reduce(
            (acc, d) => acc + d.used,
            0
          );
          const cacheTotal = data.array.caches.reduce(
            (acc, d) => acc + d.total,
            0
          );
          const cacheFree = data.array.caches.reduce(
            (acc, d) => acc + d.free,
            0
          );
          storageTab.appendChild(
            createStorageCard(
              "Cache / Pools",
              cacheUsed,
              cacheTotal,
              cacheFree,
              data.array.caches
            )
          );
        }

        // 3. Boot / Flash
        if (data.array.boot) {
          storageTab.appendChild(
            createStorageCard(
              "Boot / Flash",
              data.array.boot.used,
              data.array.boot.total,
              data.array.boot.free,
              [data.array.boot]
            )
          );
        }
    }

    // Render Dockers
    renderDockers(data.dockers, url, key, state);
}

function renderDockers(dockers, url, key, state) {
    const container = document.getElementById("unraid-docker-list");
    if (!container) return;
    container.innerHTML = "";
    const tmpl = document.getElementById("docker-card");
    if (!tmpl) return;

    dockers.forEach((docker) => {
      const clone = tmpl.content.cloneNode(true);

      clone.querySelector(".docker-name").textContent = docker.name;
      clone.querySelector(".docker-image").textContent = docker.image;

      const dot = clone.querySelector(".status-dot");
      dot.className = `status-dot ${docker.running ? "running" : "stopped"}`;
      dot.title = docker.status;

      // Bind Controls
      const btnStart = clone.querySelector(".start-btn");
      const btnStop = clone.querySelector(".stop-btn");
      const btnRestart = clone.querySelector(".restart-btn");

      if (docker.running) {
        btnStart.style.display = "none";
        btnStop.onclick = async () => {
          await controlContainer(url, key, docker.id, "stop");
          initUnraid(url, key, state);
        };
        btnRestart.onclick = async () => {
          await controlContainer(url, key, docker.id, "restart");
          initUnraid(url, key, state);
        };
      } else {
        btnStop.style.display = "none";
        btnRestart.style.display = "none";
        btnStart.onclick = async () => {
          await controlContainer(url, key, docker.id, "start");
          initUnraid(url, key, state);
        };
      }

      container.appendChild(clone);
    });
}

async function renderUnraidVms(url, key) {
    const container = document.getElementById('unraid-vm-list');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-spinner"></div>';
    
    try {
        const vms = await getVms(url, key);
        
        container.innerHTML = '';
        
        if (vms.length === 0) {
            container.innerHTML = '<div style="padding: 10px; color: var(--text-secondary); text-align: center;">No VMs found.</div>';
            return;
        }
        
        const tmpl = document.getElementById("docker-card");
        if (!tmpl) {
             console.error("Docker Card Template not found!");
             container.innerHTML = "Error: Template missing";
             return;
        }

        vms.forEach(vm => {
            const clone = tmpl.content.cloneNode(true);
            
            const nameEl = clone.querySelector(".docker-name");
            if (nameEl) nameEl.textContent = vm.name;
            
            const imgEl = clone.querySelector(".docker-image");
            if (imgEl) imgEl.textContent = "Virtual Machine";

            const dot = clone.querySelector(".status-dot");
            if (dot) {
                 const isRunning = vm.state === 'RUNNING';
                 const isPaused = vm.state === 'PAUSED';
                 dot.className = `status-dot ${isRunning ? "running" : (isPaused ? "paused" : "stopped")}`;
                 dot.title = vm.state;
            }

            // Bind Actions
            const btnStart = clone.querySelector(".start-btn");
            const btnStop = clone.querySelector(".stop-btn");
            const btnRestart = clone.querySelector(".restart-btn");

            if (vm.state === 'RUNNING' || vm.state === 'PAUSED') {
                 if(btnStart) btnStart.style.display = 'none';
                 
                 if(btnStop) {
                     btnStop.onclick = async () => {
                        btnStop.textContent = '...';
                        await controlVm(url, key, vm.id, "stop");
                        renderUnraidVms(url, key);
                     };
                 }
                 
                 if(btnRestart) btnRestart.style.display = 'none'; 

            } else {
                 if(btnStop) btnStop.style.display = 'none';
                 if(btnRestart) btnRestart.style.display = 'none';
                 
                 if(btnStart) {
                     btnStart.onclick = async () => {
                        btnStart.textContent = '...';
                        await controlVm(url, key, vm.id, "start");
                        renderUnraidVms(url, key);
                     };
                 }
            }
            
            container.appendChild(clone);
        });
    } catch (e) {
        console.error("Error rendering VMs:", e);
        container.innerHTML = `<div style="color:red">Error: ${e.message}</div>`;
    }
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
