import * as Sabnzbd from "../../services/sabnzbd.js";

// Helper to update glider position
function updateSabGlider(container, activeBtn, glider) {
    if (!activeBtn || !glider) return;
    
    const rect = activeBtn.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    const left = rect.left - containerRect.left; // relative left
    const width = rect.width;
    
    glider.style.width = `${width}px`;
    glider.style.transform = `translateX(${left}px)`;
}

// Render Queue Cards (Smart Update)
function renderSabnzbdQueue(queue, state, url, key) {
  const container = document.getElementById("sab-queue");
  if (!container) return;

  if (queue.length === 0) {
    if (!container.querySelector('.empty-state')) {
        container.textContent = "";
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.style.cssText = 'padding:20px; text-align:center; color:var(--text-secondary);';
        emptyState.textContent = 'Queue is empty';
        container.appendChild(emptyState);
    }
    return;
  }

  // Check if we are currently showing empty state
  if (container.querySelector('.empty-state')) {
      container.textContent = '';
  }

  // 1. Mark all existing items
  const existingItems = new Map();
  container.querySelectorAll('.sab-queue-item').forEach(el => {
      existingItems.set(el.dataset.id, el);
  });

  // 2. Iterate new data
  queue.forEach((item, index) => {
    // Progress calculation
    const mb = parseFloat(item.mb) || 0;
    const mbleft = parseFloat(item.mbleft) || 0;
    const total = mb; 
    const done = total - mbleft;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    const id = item.nzo_id;

    let div = existingItems.get(id);

    if (div) {
        // UPDATE Existing
        existingItems.delete(id); // Mark as visited
        
        // Only touch innerDOM if values changed? Or just simple replace of content parts to be safe.
        // Updating text content is cheap.
        
        // Title
        const titleEl = div.querySelector('.sab-item-title');
        if (titleEl.textContent !== item.filename) {
            titleEl.textContent = item.filename;
            titleEl.title = item.filename;
        }

        // Status
        div.querySelector('.sab-item-status').textContent = item.status;

        // Progress Fill
        div.querySelector('.sab-progress-fill').style.width = `${percent}%`;

        // Details
        const detailsSpans = div.querySelectorAll('.sab-item-details span');
        if(detailsSpans[0]) detailsSpans[0].textContent = `${percent}%`;
        if(detailsSpans[1]) detailsSpans[1].textContent = `${item.timeleft} left`;

    } else {
        // CREATE New
        div = document.createElement("div");
        div.className = "sab-queue-item";
        div.dataset.id = id;
        div.innerHTML = ''; // Clear just in case
        
        const header = document.createElement('div');
        header.className = 'sab-item-header';
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'sab-item-title';
        titleDiv.title = item.filename;
        titleDiv.textContent = item.filename;
        
        const statusDiv = document.createElement('div');
        statusDiv.style.cssText = 'display:flex; align-items:center; gap:8px;';
        
        const statusText = document.createElement('div');
        statusText.className = 'sab-item-status';
        statusText.textContent = item.status;
        
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.title = 'Remove from Queue';
        delBtn.style.cssText = 'background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:16px; visibility:hidden; padding:0; line-height:1; min-width: 14px;'; // Added min-width to ensure clickability
        delBtn.textContent = '\u00D7'; // Multiplication sign (x)
        
        statusDiv.appendChild(statusText);
        statusDiv.appendChild(delBtn);
        header.appendChild(titleDiv);
        header.appendChild(statusDiv);
        
        const track = document.createElement('div');
        track.className = 'sab-progress-track';
        const fill = document.createElement('div');
        fill.className = 'sab-progress-fill';
        fill.style.width = `${percent}%`;
        track.appendChild(fill);
        
        const details = document.createElement('div');
        details.className = 'sab-item-details';
        const pSpan = document.createElement('span');
        pSpan.textContent = `${percent}%`;
        const tSpan = document.createElement('span');
        tSpan.textContent = `${item.timeleft} left`;
        details.appendChild(pSpan);
        details.appendChild(tSpan);
        
        div.appendChild(header);
        div.appendChild(track);
        div.appendChild(details);
        
        // Hover effect to show delete button
        div.onmouseenter = () => { div.querySelector('.delete-btn').style.visibility = 'visible'; };
        div.onmouseleave = () => { div.querySelector('.delete-btn').style.visibility = 'hidden'; };

        // Delete Action
        // delBtn is already available in this scope
        delBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Remove "${item.filename}" from queue?`)) {
                delBtn.textContent = "⏳";
                await Sabnzbd.deleteQueueItem(url, key, item.nzo_id);
                div.remove();
            }
        };

        container.appendChild(div);
    }
    
    // Ensure Order (simple append moves it to end if not already)
    // If order matters and might change, we might need insertBefore.
    // For now, allow append to just sort by arrival/priority logic from API.
    // However, if we reuse elements, they stay in old DOM order.
    // Let's enforce DOM order to match Array order.
    if (container.children[index] !== div) {
        if (index < container.children.length) {
            container.insertBefore(div, container.children[index]);
        } else {
            container.appendChild(div);
        }
    }
  });

  // 3. Remove whatever is left in existingItems (deleted from queue)
  existingItems.forEach(el => el.remove());
}

// Render History Cards
function renderSabnzbdHistory(history, state, url, key) {
  const container = document.getElementById("sab-history");
  if (!container) return;
  container.textContent = "";

  if (!history || history.length === 0) {
      if (!container.querySelector('.empty-state')) {
          container.textContent = "";
          const emptyState = document.createElement('div');
          emptyState.className = 'empty-state';
          emptyState.style.cssText = 'padding:20px; text-align:center; color:var(--text-secondary);';
          emptyState.textContent = 'History is empty';
          container.appendChild(emptyState);
      }
      return;
  }

  history.slice(0, 10).forEach((item) => {
      const div = document.createElement("div");
      // ...
      div.className = `sab-history-item ${item.status === 'Completed' ? 'completed' : 'failed'}`;
      
      const date = new Date(item.completed * 1000).toLocaleDateString();
      
      div.textContent = "";

      const header = document.createElement('div');
      header.className = 'sab-item-header';
      
      const titleDiv = document.createElement('div');
      titleDiv.className = 'sab-item-title';
      titleDiv.title = item.name;
      titleDiv.textContent = item.name;
      
      const statusDiv = document.createElement('div');
      statusDiv.style.cssText = 'display:flex; align-items:center; gap:8px;';
      
      const statusText = document.createElement('div');
      statusText.className = 'sab-item-status';
      statusText.style.cssText = 'background:transparent; border:1px solid rgba(255,255,255,0.1);';
      statusText.textContent = item.status;
      
      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.title = 'Remove from History';
      delBtn.style.cssText = 'background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:16px; visibility:hidden; padding:0; line-height:1; min-width: 14px;';
      delBtn.textContent = '\u00D7';
      
      statusDiv.appendChild(statusText);
      statusDiv.appendChild(delBtn);
      header.appendChild(titleDiv);
      header.appendChild(statusDiv);
      
      const details = document.createElement('div');
      details.className = 'sab-item-details';
      const sSpan = document.createElement('span');
      sSpan.textContent = item.size;
      const dSpan = document.createElement('span');
      dSpan.textContent = date;
      details.appendChild(sSpan);
      details.appendChild(dSpan);

      div.appendChild(header);
      div.appendChild(details);

      // Hover effect to show delete button
      div.onmouseenter = () => { delBtn.style.visibility = 'visible'; };
      div.onmouseleave = () => { delBtn.style.visibility = 'hidden'; };

      // Delete Action
      // delBtn is already defined above
      delBtn.onclick = async (e) => {
          e.stopPropagation();
          if (confirm(`Remove "${item.name}" from history?`)) {
               delBtn.textContent = "⏳";
               await Sabnzbd.deleteHistoryItem(url, key, item.nzo_id);
               div.remove();
          }
      };

      container.appendChild(div);
  });
}

function initSabTabs() {
    const view = document.getElementById("sabnzbd-view");
    if (!view || view.dataset.tabsInit) return;

    const tabsContainer = view.querySelector(".tabs");
    const glider = view.querySelector(".tab-glider");
    const btns = view.querySelectorAll(".tab-btn");

    if (!tabsContainer || !glider) return;

    // --- PERSISTENCE LOGIC START ---
    let activeTabName = localStorage.getItem("sabnzbd_active_tab") || "queue";
    
    // Validate that the stored tab exists
    let activeBtn = Array.from(btns).find(b => b.dataset.tab === activeTabName);
    if (!activeBtn) {
        activeTabName = "queue";
        activeBtn = view.querySelector('.tab-btn[data-tab="queue"]');
    }

    // Apply Active State (Visual + Content)
    btns.forEach(b => b.classList.remove("active"));
    if (activeBtn) activeBtn.classList.add("active");

    const subViews = view.querySelectorAll(".sub-view");
    subViews.forEach(sv => sv.classList.add("hidden"));
    subViews.forEach(sv => sv.classList.remove("active")); // Ensure cleanliness

    const targetSubView = document.getElementById(`sab-${activeTabName}`);
    if (targetSubView) {
        targetSubView.classList.remove("hidden");
        targetSubView.classList.add("active");
    }

    // Initial Glider Position
    if (activeBtn) {
         setTimeout(() => updateSabGlider(tabsContainer, activeBtn, glider), 50);
    }
    // --- PERSISTENCE LOGIC END ---

    btns.forEach(btn => {
        btn.addEventListener("click", () => {
            // UI Switch
            btns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            // Glider
            updateSabGlider(tabsContainer, btn, glider);

            // View Switch
            const tabName = btn.dataset.tab;
            const targetId = `sab-${tabName}`;
            
            view.querySelectorAll(".sub-view").forEach(sv => {
                sv.classList.add("hidden");
                sv.classList.remove("active");
            });
            
            const targetView = document.getElementById(targetId);
            if(targetView) {
                targetView.classList.remove("hidden");
                targetView.classList.add("active");
            }

            // Save State
            localStorage.setItem("sabnzbd_active_tab", tabName);
        });
    });

    view.dataset.tabsInit = "true";
}

/**
 * Initializes the SABnzbd service view.
 * - Sets up tabs and persistence.
 * - Starts the polling loop for queue/history data.
 * - Binds control listeners (Pause/Resume, Speed Limit, etc.).
 * @param {string} url - The base URL of the SABnzbd instance.
 * @param {string} key - The API key.
 * @param {object} state - Global application state.
 */
export async function initSabnzbd(url, key, state) {
    // Init Tabs
    initSabTabs();

    const update = async () => {
        try {
            const queue = await Sabnzbd.getSabnzbdQueue(url, key);
            if (!queue) return;

            // Updated Stats for new Header
            const kb = parseFloat(queue.kbpersec) || 0;
            const mb = (kb / 1024).toFixed(1);
            const speedEl = document.getElementById("sab-speed");
            if (speedEl) speedEl.textContent = `${mb} MB/s`;

            const timeEl = document.getElementById("sab-timeleft");
            if (timeEl) timeEl.textContent = queue.timeleft || "00:00:00";

            // Status Bubble Logic
            const statusBubble = document.getElementById("sab-status-bubble");
            if (statusBubble) {
                statusBubble.className = "status-bubble"; // Reset
                if (queue.paused) {
                    statusBubble.classList.add("bubble-paused");
                    // pause_int might be "0" or "0:14:59"
                    if (queue.pause_int && queue.pause_int !== "0") {
                        statusBubble.textContent = `Paused (${queue.pause_int})`;
                    } else {
                         statusBubble.textContent = "Paused";
                    }
                } else if (kb > 0) {
                     statusBubble.classList.add("bubble-active");
                     statusBubble.textContent = "Downloading";
                } else {
                     statusBubble.classList.add("bubble-idle");
                     statusBubble.textContent = "Idle";
                }
            }

            // Paused State Update (Icon only)
            const mainBtn = document.getElementById("sab-pause-main");
            const isPaused = queue.paused;
            if (mainBtn) {
                 mainBtn.textContent = isPaused ? "▶️" : "⏸️";
                 mainBtn.title = isPaused ? "Resume Queue" : "Pause Queue";
                 if (isPaused) mainBtn.classList.add("paused");
                 else mainBtn.classList.remove("paused");
            }
            
            // Badge
            updateSabnzbdBadge(url, key);

            renderSabnzbdQueue(queue.slots || [], state, url, key);
            
            // Fetch History
            const historyData = await Sabnzbd.getSabnzbdHistory(url, key);
            renderSabnzbdHistory(historyData.slots || [], state, url, key);

        } catch(e) { console.error(e); }
    };

    // --- Bind Logic Listeners (Run Once) ---
    const mainBtn = document.getElementById("sab-pause-main");
    const arrowBtn = document.getElementById("sab-pause-arrow");
    const menu = document.getElementById("sab-pause-menu");

    if (mainBtn && arrowBtn && menu && !mainBtn.dataset.bound) {
        
        // 1. Main Button Click
        mainBtn.addEventListener("click", async (e) => {
             e.stopPropagation();
             // We need to know current state. We could check classList or re-fetch.
             // Class list is sync with UI, so it's a good proxy.
             const isPaused = mainBtn.classList.contains("paused");
             if (isPaused) await Sabnzbd.resumeQueue(url, key);
             else await Sabnzbd.pauseQueue(url, key);
             setTimeout(update, 200);
        });
        
        // 2. Arrow Button Click
        arrowBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            menu.classList.toggle("hidden");
        });

        // 3. Menu Items
        menu.querySelectorAll(".menu-item").forEach(item => {
            item.addEventListener("click", async (e) => {
                e.stopPropagation();
                const time = item.dataset.time;
                menu.classList.add("hidden");
                
                if (time === "0") await Sabnzbd.pauseQueue(url, key);
                else await Sabnzbd.pauseQueue(url, key, time);

                setTimeout(update, 200);
            });
        });

        // 4. Outside Click
        document.body.addEventListener("click", (e) => {
            if (!menu.classList.contains("hidden") && !menu.contains(e.target) && !arrowBtn.contains(e.target)) {
                 menu.classList.add("hidden");
            }
        });

        mainBtn.dataset.bound = "true"; 
    }

    update();
    if(state.refreshInterval) clearInterval(state.refreshInterval);
    state.refreshInterval = setInterval(update, 1000);
}

// Background Badge Update
export async function updateSabnzbdBadge(url, key) {
  try {
    const queue = await Sabnzbd.getSabnzbdQueue(url, key);
    if (!queue) return;

    const sabNavItem = document.querySelector('.nav-item[data-target="sabnzbd"]');
    if (sabNavItem) {
      let badge = sabNavItem.querySelector('.nav-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'nav-badge hidden';
        sabNavItem.appendChild(badge);
      }
      
      const count = queue.slots ? queue.slots.length : 0;
      if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch(e) { }
}
