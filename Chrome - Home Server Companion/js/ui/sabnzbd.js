import * as Sabnzbd from "../../services/sabnzbd.js";
import { showNotification, showConfirmModal } from "../utils.js";

/** How often the history list is refetched, in ms. The queue polls every 1s. */
const HISTORY_POLL_MS = 5000;

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

/**
 * Formats a transfer rate given in KB/s, switching unit so the number stays
 * short enough to read at display size.
 * @param {number} kbPerSec
 * @returns {string}
 */
function formatSabSpeed(kbPerSec) {
    if (kbPerSec >= 1024) return `${(kbPerSec / 1024).toFixed(1)} MB/s`;
    return `${Math.round(kbPerSec)} KB/s`;
}

/**
 * Renders the SABnzbd header: the transfer rate is the primary figure, with
 * time and volume as a supporting line. Idle and paused states replace the
 * figure entirely rather than showing zeroes.
 * @param {Object} queue - Raw queue object from the SABnzbd API
 * @param {number} kbPerSec - Current speed in KB/s
 */
function renderSabHeader(queue, kbPerSec) {
    const heroEl = document.getElementById("sab-hero");
    const subEl = document.getElementById("sab-subline");
    if (!heroEl || !subEl) return;

    const slots = parseInt(queue.noofslots, 10) || 0;
    const sizeLeft = (queue.sizeleft || "").trim();
    const sizeTotal = (queue.size || "").trim();
    const fileCount = slots > 1 ? ` · ${slots} files` : "";

    heroEl.classList.remove("is-idle", "is-paused");

    if (queue.paused) {
        heroEl.classList.add("is-paused");
        heroEl.textContent = "Paused";
        const resumesIn = queue.pause_int && queue.pause_int !== "0"
            ? `Resumes in ${queue.pause_int}`
            : "Paused indefinitely";
        subEl.textContent = slots > 0
            ? `${resumesIn} · ${sizeLeft || "0 B"} remaining${fileCount}`
            : resumesIn;
        return;
    }

    if (kbPerSec > 0) {
        heroEl.textContent = formatSabSpeed(kbPerSec);
        const parts = [];
        if (queue.timeleft && queue.timeleft !== "0:00:00") {
            parts.push(`${queue.timeleft} left`);
        }
        if (sizeLeft && sizeTotal) {
            parts.push(`${sizeLeft} of ${sizeTotal}`);
        } else if (sizeLeft) {
            parts.push(`${sizeLeft} remaining`);
        }
        if (slots > 1) parts.push(`${slots} files`);
        subEl.textContent = parts.join(" · ") || "Downloading";
        return;
    }

    heroEl.classList.add("is-idle");
    heroEl.textContent = "Idle";
    subEl.textContent = slots > 0
        ? `${slots} queued · ${sizeLeft || sizeTotal || "0 B"} remaining`
        : "Queue empty";
}

/**
 * Builds the right-hand meta text for a queue row. The status word is only
 * included when it says something the progress bar cannot - "Downloading" is
 * already implied by a bar that is moving.
 * @param {Object} item - Queue slot from the SABnzbd API
 * @param {number} percent - Completion percentage
 * @returns {string}
 */
function sabItemMeta(item, percent) {
    const parts = [`${percent}%`];

    const status = (item.status || "").trim();
    if (status && status.toLowerCase() !== "downloading") {
        parts.push(status);
    }

    if (item.timeleft && item.timeleft !== "0:00:00") {
        parts.push(item.timeleft);
    }

    return parts.join(" · ");
}

// Render Queue Cards (Smart Update)
function renderSabnzbdQueue(queue, state, url, key) {
  const container = document.getElementById("sab-queue");
  if (!container) return;

  if (queue.length === 0) {
    if (!container.querySelector('.queue-empty')) {
        container.textContent = "";
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'queue-empty';
        const iconDiv = document.createElement('div');
        iconDiv.className = 'queue-empty-icon';
        iconDiv.textContent = '📭';
        const textDiv = document.createElement('div');
        textDiv.className = 'queue-empty-text';
        textDiv.textContent = 'Queue is empty';
        emptyDiv.appendChild(iconDiv);
        emptyDiv.appendChild(textDiv);
        container.appendChild(emptyDiv);
    }
    return;
  }

  // Check if we are currently showing empty state
  if (container.querySelector('.queue-empty')) {
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

        // Progress Fill
        div.querySelector('.sab-progress-fill').style.width = `${percent}%`;

        // Meta (percentage, time, and any status other than plain downloading)
        div.querySelector('.sab-item-meta').textContent = sabItemMeta(item, percent);

    } else {
        // CREATE New
        div = document.createElement("div");
        div.className = "sab-queue-item";
        div.dataset.id = id;
        div.replaceChildren(); // Clear just in case
        
        const header = document.createElement('div');
        header.className = 'sab-item-header';
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'sab-item-title';
        titleDiv.title = item.filename;
        titleDiv.textContent = item.filename;
        
        const statusDiv = document.createElement('div');
        statusDiv.style.cssText = 'display:flex; align-items:center; gap:8px;';

        const metaText = document.createElement('div');
        metaText.className = 'sab-item-meta';
        metaText.textContent = sabItemMeta(item, percent);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.title = 'Remove from Queue';
        delBtn.style.cssText = 'background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:16px; visibility:hidden; padding:0; line-height:1; min-width: 14px;'; // Added min-width to ensure clickability
        delBtn.textContent = '\u00D7'; // Multiplication sign (x)

        statusDiv.appendChild(metaText);
        statusDiv.appendChild(delBtn);
        header.appendChild(titleDiv);
        header.appendChild(statusDiv);

        // Progress sits flush against the bottom edge of the row - the moving
        // bar is the status indicator, so no separate status pill is needed.
        const track = document.createElement('div');
        track.className = 'sab-progress-track';
        const fill = document.createElement('div');
        fill.className = 'sab-progress-fill';
        fill.style.width = `${percent}%`;
        track.appendChild(fill);

        div.appendChild(header);
        div.appendChild(track);

        // Hover effect to show delete button
        div.onmouseenter = () => { div.querySelector('.delete-btn').style.visibility = 'visible'; };
        div.onmouseleave = () => { div.querySelector('.delete-btn').style.visibility = 'hidden'; };

      // Delete Action
      // delBtn is already available in this scope
      delBtn.onclick = async (e) => {
          e.stopPropagation();
          const confirmed = await showConfirmModal(
              'Remove from Queue',
              `Remove "${item.filename}" from queue?`,
              'Remove',
              '#ffc107' // SABnzbd yellow
          );
          
          if (confirmed) {
              delBtn.textContent = "⏳";
              await Sabnzbd.deleteQueueItem(url, key, item.nzo_id);
              div.remove();
              showNotification(`Removed "${item.filename}"`, 'success');
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
      if (!container.querySelector('.queue-empty')) {
          container.textContent = "";
          const emptyDiv = document.createElement('div');
          emptyDiv.className = 'queue-empty';
          const iconDiv = document.createElement('div');
          iconDiv.className = 'queue-empty-icon';
          iconDiv.textContent = '📭';
          const textDiv = document.createElement('div');
          textDiv.className = 'queue-empty-text';
          textDiv.textContent = 'History is empty';
          emptyDiv.appendChild(iconDiv);
          emptyDiv.appendChild(textDiv);
          container.appendChild(emptyDiv);
      }
      return;
  }

  history.slice(0, 10).forEach((item) => {
      const div = document.createElement("div");
      // ...
      let statusClass = 'failed';
      const s = (item.status || '').toLowerCase();
      if (s === 'completed') statusClass = 'completed';
      else if (s === 'extracting' || s === 'verifying' || s === 'repairing' || s === 'running') statusClass = 'processing';
      else if (s === 'queued') statusClass = 'processing'; // Queued in history context?

      div.className = `sab-history-item ${statusClass}`;
      
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
          const confirmed = await showConfirmModal(
              'Remove from History',
              `Remove "${item.name}" from history?`,
              'Remove',
              '#ffc107' // SABnzbd yellow
          );

          if (confirmed) {
               delBtn.textContent = "⏳";
               await Sabnzbd.deleteHistoryItem(url, key, item.nzo_id);
               div.remove();
               showNotification(`Removed "${item.name}"`, 'success');
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

    // A single tick issues two serialised requests, so it can easily outlive its
    // 1s slot. Without this guard, overlapping runs resolve out of order and an
    // older response repaints the header with stale values - the status stops
    // looking live even though polling is running.
    let updateInFlight = false;
    let lastHistoryData = null;
    let lastHistoryFetch = 0;

    const update = async () => {
        if (updateInFlight) return;
        updateInFlight = true;
        try {
            const queue = await Sabnzbd.getSabnzbdQueue(url, key);
            if (!queue) return;

            const kb = parseFloat(queue.kbpersec) || 0;
            renderSabHeader(queue, kb);

            // Update Speed Limit Dropdown
            // Sync Speed Limit Slider/Input
            const speedSlider = document.getElementById("sab-speed-slider");
            const speedInput = document.getElementById("sab-speed-input");
            
            if (speedSlider && speedInput) {
                const isActive = (document.activeElement === speedSlider || document.activeElement === speedInput);
                if (!isActive) {
                    let currentLimit = (queue.speedlimit || "").trim(); // e.g. "50", "80%", "5 M", "65"
                    let val = "100"; // Default to 100% (No Limit)
                    
                    if (!currentLimit || currentLimit === "0") {
                        val = "100";
                    } else if (currentLimit.includes("%")) {
                        // Extract number from "80%"
                        val = currentLimit.replace("%", "").trim();
                    } else if (!isNaN(currentLimit)) {
                        // Plain number, assume it matches slider scale (percentage or raw value if SAB returns strict ints)
                        val = currentLimit;
                    }
                    
                    if (!isNaN(val)) {
                        speedSlider.value = val;
                        speedInput.value = val;
                    }
                }
            }

            // Paused State Update (Icon only)
            const mainBtn = document.getElementById("sab-pause-main");
            const isPaused = queue.paused;
            if (mainBtn) {
                 // Clear existing content
                 mainBtn.textContent = '';

                 // Create SVG element
                 const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                 svg.setAttribute("width", "16");
                 svg.setAttribute("height", "16");
                 svg.setAttribute("viewBox", "0 0 24 24");
                 svg.setAttribute("fill", "currentColor");

                 if (isPaused) {
                     // Play icon (triangle)
                     const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                     path.setAttribute("d", "M8 5v14l11-7z");
                     svg.appendChild(path);
                 } else {
                     // Pause icon (two bars)
                     const rect1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                     rect1.setAttribute("x", "6");
                     rect1.setAttribute("y", "4");
                     rect1.setAttribute("width", "4");
                     rect1.setAttribute("height", "16");
                     rect1.setAttribute("rx", "1");
                     const rect2 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                     rect2.setAttribute("x", "14");
                     rect2.setAttribute("y", "4");
                     rect2.setAttribute("width", "4");
                     rect2.setAttribute("height", "16");
                     rect2.setAttribute("rx", "1");
                     svg.appendChild(rect1);
                     svg.appendChild(rect2);
                 }

                 mainBtn.appendChild(svg);
                 mainBtn.title = isPaused ? "Resume Queue" : "Pause Queue";
                 if (isPaused) mainBtn.classList.add("paused");
                 else mainBtn.classList.remove("paused");
            }
            
            // Badge
            updateSabnzbdBadge(url, key, queue);

            renderSabnzbdQueue(queue.slots || [], state, url, key);

            // History changes rarely and doubles the request count on a 1s loop,
            // which is what pushed a tick past its slot. Poll it every 5s and
            // keep rendering the last response in between.
            if (Date.now() - lastHistoryFetch >= HISTORY_POLL_MS) {
                lastHistoryFetch = Date.now();
                lastHistoryData = await Sabnzbd.getSabnzbdHistory(url, key);
                renderSabnzbdHistory(lastHistoryData.slots || [], state, url, key);
            }
            const historyData = lastHistoryData;

            // --- Tab Badges ---
            const view = document.getElementById("sabnzbd-view");
            if (view) {
                // Queue Badge
                const queueBtn = view.querySelector('.tab-btn[data-tab="queue"]');
                if (queueBtn) {
                     let qBadge = queueBtn.querySelector('.tab-badge');
                     if (!qBadge) {
                         qBadge = document.createElement('span');
                         qBadge.className = 'tab-badge hidden';
                         // Style
                         qBadge.style.background = '#ffc107'; 
                         qBadge.style.color = '#000'; // Black text on yellow
                         queueBtn.appendChild(qBadge);
                     }
                     
                     const qCount = queue.noofslots || (queue.slots ? queue.slots.length : 0);
                     if (qCount > 0) {
                         qBadge.textContent = qCount;
                         qBadge.classList.remove('hidden');
                     } else {
                         qBadge.classList.add('hidden');
                     }
                }

                // History Badge
                const histBtn = historyData ? view.querySelector('.tab-btn[data-tab="history"]') : null;
                if (histBtn) {
                     let hBadge = histBtn.querySelector('.tab-badge');
                     if (!hBadge) {
                         hBadge = document.createElement('span');
                         hBadge.className = 'tab-badge hidden';
                         // Style
                         hBadge.style.background = '#ffc107'; 
                         hBadge.style.color = '#000'; // Black text on yellow
                         histBtn.appendChild(hBadge);
                     }
                     
                     const hCount = historyData.noofslots || (historyData.slots ? historyData.slots.length : 0);
                     if (hCount > 0) {
                         hBadge.textContent = hCount;
                         hBadge.classList.remove('hidden');
                     } else {
                         hBadge.classList.add('hidden');
                     }
                }
            }

        } catch(e) {
            console.error(e);
        } finally {
            updateInFlight = false;
        }
    };

    // --- Bind Logic Listeners (Run Once) ---
    const mainBtn = document.getElementById("sab-pause-main");
    const arrowBtn = document.getElementById("sab-pause-arrow");
    const menu = document.getElementById("sab-pause-menu");
    // Slider Controls
    const speedSlider = document.getElementById("sab-speed-slider");
    const speedInput = document.getElementById("sab-speed-input");
    const speedSetBtn = document.getElementById("sab-speed-set-btn");

    if (mainBtn && arrowBtn && menu && !mainBtn.dataset.bound) {
        
        // 1. Main Button Click
        mainBtn.addEventListener("click", async (e) => {
             e.stopPropagation();
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

        // 4. Speed Limit Slider Logic
        if (speedSlider && speedInput && speedSetBtn) {
            // Slider -> Input
            speedSlider.addEventListener("input", () => {
                speedInput.value = speedSlider.value;
            });
            
            // Input -> Slider
            speedInput.addEventListener("input", () => {
                let val = parseInt(speedInput.value);
                if (val > 100) val = 100;
                if (val < 0) val = 0;
                // Don't force value on input while typing, but update slider
                if (!isNaN(val)) speedSlider.value = val;
            });
            
            // Set Button
            speedSetBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                // Send value as percentage string
                const val = speedInput.value;
                await Sabnzbd.setSpeedLimit(url, key, `${val}%`);
                showNotification(`Speed Limit set to ${val}%`, 'success');
                setTimeout(update, 500);
            });
        }

        // 5. Outside Click
        document.body.addEventListener("click", (e) => {
            if (!menu.classList.contains("hidden") && !menu.contains(e.target) && !arrowBtn.contains(e.target)) {
                 menu.classList.add("hidden");
            }
        });

        mainBtn.dataset.bound = "true"; 
    }

    update();
    state.serviceIntervals = state.serviceIntervals || {};
    if (state.serviceIntervals.sabnzbd) clearInterval(state.serviceIntervals.sabnzbd);
    state.serviceIntervals.sabnzbd = setInterval(update, 1000);
}

// Background Badge Update
export async function updateSabnzbdBadge(url, key, existingQueue = null) {
  try {
    const queue = existingQueue || await Sabnzbd.getSabnzbdQueue(url, key);
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
