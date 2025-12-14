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

    // 1. UNRAID INFO CARD
    const infoCard = document.createElement("div");
    infoCard.className = "system-card";
    infoCard.innerHTML = `
                <div class="uk-header">
                    <div class="uk-icon info"></div>
                    <div class="uk-title-section">
                        <div class="uk-title">UNRAID</div>
                        <div class="uk-subtitle">Version: ${
                          data.system.version
                        }</div>
                    </div>
                </div>
                <div class="uk-info-row">
                    <span class="uk-info-icon">🪪</span>
                    <span>Registration: Unraid OS <strong>${
                      data.system.registration
                    }</strong></span>
                </div>
                <div class="uk-info-row">
                    <span class="uk-info-icon">🕒</span>
                    <span>Uptime: ${getUptime(
                      data.system.uptimeBoot
                    )}</span>
                </div>
                <div class="uk-info-row">
                    <span class="uk-info-icon">💾</span>
                    <span>Array: <span class="green-text">${
                      data.array.status === "STARTED"
                        ? "Started"
                        : data.array.status
                    }</span></span>
                </div>
            `;
    systemTab.appendChild(infoCard);

    // 2. ARRAY CAPACITY CARD
    const arrayPct = (data.array.used / data.array.total) * 100 || 0;
    const capCard = document.createElement("div");
    capCard.className = "system-card";
    capCard.innerHTML = `
                <div class="uk-header">
                    <div class="uk-icon array"></div>
                    <div class="uk-title-section">
                        <div class="uk-title">ARRAY CAPACITY</div>
                        <div class="uk-subtitle">${formatBytes(
                          data.array.total
                        )} Total</div>
                    </div>
                </div>
                <div class="uk-progress-lg-track">
                    <div class="uk-progress-lg-fill" style="width: ${arrayPct}%"></div>
                    <div class="uk-progress-text text-shadow">${formatBytes(
                      data.array.used
                    )} / ${formatBytes(data.array.total)}</div>
                </div>
            `;
    systemTab.appendChild(capCard);

    // 3. SYSTEM CARD (CPU/RAM)
    const sysCard = document.createElement("div");
    sysCard.className = "system-card";
    sysCard.innerHTML = `
                <div class="uk-header">
                    <div class="uk-icon system"></div>
                    <div class="uk-title-section">
                        <div class="uk-title">SYSTEM</div>
                        <div class="uk-subtitle"></div>
                    </div>
                </div>
                
                <!-- CPU -->
                <div class="cpu-row" style="margin-bottom: 12px;">
                    <div style="flex: 0 0 160px; display:flex; justify-content:space-between; padding-right:15px; align-items:center;">
                        <span>CPU Load:</span>
                        <span style="font-weight:bold;">${Math.round(
                          data.cpu
                        )}%</span>
                    </div>
                    <div class="cpu-track">
                        <div class="cpu-fill ${
                          data.cpu > 80 ? "critical" : ""
                        }" style="width: ${data.cpu}%"></div>
                    </div>
                </div>

                <!-- RAM -->
                <div class="cpu-row">
                     <div style="flex: 0 0 160px; display:flex; justify-content:space-between; padding-right:15px; align-items:center;">
                        <span>RAM:</span>
                        <div style="text-align:right;">
                            <span style="font-weight:bold;">${Math.round(
                              data.ram
                            )}%</span>
                            <span style="font-size:0.8em; color:var(--text-secondary); margin-left:4px;">/ ${formatBytes(
                              data.system.memoryTotal
                            )}</span>
                        </div>
                    </div>
                    <div class="cpu-track">
                        <div class="cpu-fill ${
                          data.ram > 80
                            ? "critical"
                            : data.ram > 60
                            ? "warning"
                            : ""
                        }" style="width: ${data.ram}%"></div>
                    </div>
                </div>
            `;
    systemTab.appendChild(sysCard);
    
    // Storage Tab Populating
    const storageTab = document.getElementById("unraid-tab-storage");

    // Helper to create a Storage Card
    const createCard = (title, used, total, free, items) => {
      // Check persistent state (default to false/closed)
      const isOpen =
        state.storageCardState && state.storageCardState[title];
      // Ensure state object exists
      if (!state.storageCardState) state.storageCardState = {};

      const pct = total > 0 ? (used / total) * 100 : 0;
      // If free is not provided, derive it
      const displayFree = free !== undefined ? free : total - used;

      const card = document.createElement("div");
      card.className = "storage-card";
      card.innerHTML = `
                     <div class="storage-header" style="cursor: pointer; display: flex; justify-content: space-between;">
                         <div style="display: flex; align-items: center; gap: 10px;">
                             <div class="storage-icon"></div>
                             <span>${title}</span>
                         </div>
                         <div class="dropdown-arrow" style="transition: transform 0.3s; transform: rotate(${
                           isOpen ? "180deg" : "0deg"
                         });">▼</div>
                     </div>
                     <div class="storage-usage-text">
                        <span style="color:var(--text-primary);">${formatBytes(
                          displayFree
                        )} free</span>
                        <span style="opacity:0.7;"> / ${formatBytes(
                          total
                        )} total</span>
                     </div>
                     <div class="progress-track" style="margin-bottom: 15px;">
                         <div class="progress-fill ${
                           pct > 90 ? "critical" : pct > 70 ? "warning" : ""
                         }" style="width: ${pct}%"></div>
                     </div>
                     
                     <div class="storage-details-dropdown ${
                       isOpen ? "" : "hidden"
                     }" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                        ${items
                          .map((disk) => {
                            let usageHtml = "";
                            if (disk.type === "Parity" || !disk.total) {
                              // Parity or simple devices
                              usageHtml = `<div style="font-size:0.8em; color:#2196f3;">${
                                disk.status || "OK"
                              }</div>`;
                            } else {
                              const dPct = (disk.used / disk.total) * 100;
                              usageHtml = `
                                    <div class="disk-mini-track">
                                        <div class="disk-mini-fill" style="width: ${dPct}%"></div>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; margin-top:2px; font-size:0.75em; color:var(--text-secondary);">
                                        <span>${formatBytes(
                                          disk.used
                                        )}</span>
                                        <span style="color:var(--text-primary);">${formatBytes(
                                          disk.free
                                        )} free</span>
                                    </div>
                                `;
                            }
                            return `
                                <div class="disk-row">
                                    <div class="disk-meta">
                                        <span class="disk-name">${
                                          disk.name
                                        }</span>
                                        <span class="disk-temp ${
                                          disk.temp > 45 ? "hot" : ""
                                        }">${disk.temp || "--"}°C</span>
                                    </div>
                                    ${usageHtml}
                                </div>
                            `;
                          })
                          .join("")}
                     </div>
                `;

      // Toggle Logic
      const header = card.querySelector(".storage-header");
      header.addEventListener("click", () => {
        const list = card.querySelector(".storage-details-dropdown");
        const arrow = card.querySelector(".dropdown-arrow");

        const isHidden = list.classList.contains("hidden");
        if (isHidden) {
          list.classList.remove("hidden");
          arrow.style.transform = "rotate(180deg)";
          state.storageCardState[title] = true; // Save open state
        } else {
          list.classList.add("hidden");
          arrow.style.transform = "rotate(0deg)";
          state.storageCardState[title] = false; // Save closed state
        }
      });

      return card;
    };

    if (storageTab) {
        // Clear and Rebuild (preserving state concept via the helper)
        storageTab.innerHTML = "";

        // 1. Array Pool
        const arrayDisks = [...data.array.parities, ...data.array.disks];
        storageTab.appendChild(
          createCard(
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
            createCard(
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
            createCard(
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
