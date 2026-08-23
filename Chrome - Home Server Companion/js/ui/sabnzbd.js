import * as Sabnzbd from "../../services/sabnzbd.js";
import { showNotification, showConfirmModal } from "../utils.js";
import poller from "../core/Poller.js";

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

/**
 * Builds one compact row-action button. It borrows `.delete-btn` so the row
 * keeps a single visual language and one hover/focus reveal rule.
 * @param {string} glyph - Character shown in the button
 * @param {string} label - Accessible name and tooltip
 * @returns {HTMLButtonElement}
 */
function makeRowAction(glyph, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'delete-btn sab-row-action';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.textContent = glyph;
    return btn;
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
        delBtn.style.cssText = 'background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:16px; padding:2px 6px; line-height:1; min-width: 24px; min-height: 24px;'; // Added min-width to ensure clickability
        delBtn.textContent = '\u00D7'; // Multiplication sign (x)

        // Reordering: SABnzbd works the queue top-down, so moving an item is
        // the most common action on it after removing one.
        const topBtn = makeRowAction('⇈', 'Move to top');
        const upBtn = makeRowAction('↑', 'Move up');
        const downBtn = makeRowAction('↓', 'Move down');

        // Actions first, status last: the figure that changes every second
        // stays pinned to the right edge, so it does not shift sideways as the
        // buttons fade in on hover.
        statusDiv.appendChild(topBtn);
        statusDiv.appendChild(upBtn);
        statusDiv.appendChild(downBtn);
        statusDiv.appendChild(delBtn);
        statusDiv.appendChild(metaText);
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


      // Reorder actions. The position is read from the DOM at click time, not
      // captured when the row is built: the 1s poll keeps rewriting the queue
      // underneath, so a captured index goes stale immediately.
      const moveTo = async (resolveTarget, btn) => {
          const rows = [...container.querySelectorAll('.sab-queue-item')];
          const current = rows.indexOf(div);
          if (current === -1) return;
          const target = resolveTarget(current);
          if (target === current || target < 0 || target >= rows.length) return;

          btn.disabled = true;
          try {
              await Sabnzbd.moveQueueItem(url, key, item.nzo_id, target);
          } catch (err) {
              showNotification('Could not reorder the queue', 'error');
          } finally {
              btn.disabled = false;
          }
      };

      topBtn.onclick = (e) => { e.stopPropagation(); moveTo(() => 0, topBtn); };
      upBtn.onclick = (e) => { e.stopPropagation(); moveTo((i) => i - 1, upBtn); };
      downBtn.onclick = (e) => { e.stopPropagation(); moveTo((i) => i + 1, downBtn); };

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
      delBtn.style.cssText = 'background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:16px; padding:2px 6px; line-height:1; min-width: 24px; min-height: 24px;';
      delBtn.textContent = '\u00D7';
      
      // Same order as the queue rows: action left, status pinned right.
      statusDiv.appendChild(delBtn);
      statusDiv.appendChild(statusText);
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
 * Full-rate cache in bytes/s, derived from any observed (percent, absolute)
 * pair. It lets an optimistic label carry its MB/s suffix, so applying a limit
 * changes the chip once instead of twice.
 * @type {number|null}
 */
let sabFullRateBytes = null;

/**
 * Reads SABnzbd's `speedlimit` field, which arrives as "", "0", "50", "80%"
 * or an absolute rate. Server 0 (and empty) mean "no throttle".
 * @param {string|number|undefined} raw
 * @returns {number|null} Percentage 0-100, or null when it is not a percentage
 */
function parseSpeedLimit(raw) {
    const text = String(raw ?? "").trim();
    if (!text || text === "0") return 0;
    const num = parseFloat(text.replace("%", "").trim());
    if (!Number.isFinite(num)) return null;
    return Math.min(Math.max(Math.round(num), 0), 100);
}

/**
 * Words, not a bare number: 0 and 100 both mean "not throttled", and a naked
 * "0%" next to a full-speed download is the contradiction this replaces.
 * @param {number|null} percent
 * @param {string|number|undefined} absolute - SAB's speedlimit_abs, in BYTES/s
 * @returns {string}
 */
function formatLimitLabel(percent, absolute) {
    if (percent === null) return "Limited";
    // Server 0 and 100% are the same outcome - no throttle in force - so they
    // share one label and one slider position instead of sitting at opposite
    // ends of the scale meaning the same thing.
    if (percent === 0 || percent >= 100) return "No limit";
    // speedlimit_abs is bytes/s; formatSabSpeed takes KB/s.
    const absBytes = parseFloat(absolute);
    const suffix = Number.isFinite(absBytes) && absBytes > 0
        ? ` · ${formatSabSpeed(absBytes / 1024)}`
        : "";
    return `${percent}%${suffix}`;
}

/**
 * Paints the limit chip and marks the matching preset. A limit that is actually
 * in force gets colour, so "am I throttled?" is answerable from any tab.
 * @param {number|null} percent
 * @param {string|number|undefined} absolute
 */
function renderLimitChip(percent, absolute) {
    const absBytes = parseFloat(absolute);
    if (percent !== null && percent > 0 && Number.isFinite(absBytes) && absBytes > 0) {
        sabFullRateBytes = absBytes / (percent / 100);
    }

    const chip = document.getElementById("sab-limit-chip");
    if (!chip || chip.dataset.pending === "true") return;

    chip.textContent = formatLimitLabel(percent, absolute);
    const throttled = percent !== null && percent > 0 && percent < 100;
    chip.classList.toggle("is-active", throttled);
    chip.dataset.value = percent === null ? "" : String(percent);

    const effective = percent === 0 ? 100 : percent;
    document.querySelectorAll(".sab-limit-preset").forEach((btn) => {
        const isCurrent = Number(btn.dataset.value) === effective;
        btn.classList.toggle("is-current", isCurrent);
        btn.setAttribute("aria-pressed", isCurrent ? "true" : "false");
    });

    // Never yank the slider out from under a drag: `sliderDirty` is set on
    // interaction and cleared once the value has been written and confirmed.
    const slider = document.getElementById("sab-limit-slider");
    if (slider && slider.dataset.dirty !== "true") {
        // 0 (unlimited) has no position of its own any more; it is the top.
        const shown = percent === null || percent === 0 ? 100 : percent;
        slider.value = String(shown);
        renderLimitReadout(shown);
    }
}

/**
 * Writes the slider's live value into its readout, in the same words the chip
 * uses so the popover and the header never disagree.
 * @param {number} percent
 */
function renderLimitReadout(percent) {
    const readout = document.getElementById("sab-limit-readout");
    if (!readout) return;
    const abs = sabFullRateBytes !== null ? sabFullRateBytes * (percent / 100) : null;
    readout.textContent = formatLimitLabel(percent, abs);
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
    let consecutiveFailures = 0;
    let lastOkAt = null;

    /**
     * Marks the view as showing data that is no longer being refreshed.
     * @param {boolean} isStale
     */
    const setStale = (isStale) => {
        const view = document.getElementById("sabnzbd-view");
        if (!view || view.classList.contains("is-stale") === isStale) return;
        view.classList.toggle("is-stale", isStale);
        const hero = document.getElementById("sab-hero");
        const subline = document.getElementById("sab-subline");
        if (isStale && hero && subline) {
            hero.textContent = "Unreachable";
            const seen = lastOkAt
                ? lastOkAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "never";
            subline.textContent = `No response from SABnzbd · last update ${seen}`;
        }
    };

    const update = async () => {
        if (updateInFlight) return;
        updateInFlight = true;
        try {
            const queue = await Sabnzbd.getSabnzbdQueue(url, key);
            if (!queue) return;

            const kb = parseFloat(queue.kbpersec) || 0;
            renderSabHeader(queue, kb);

            // Speed limit: the chip is the readout, so it renders the value the
            // server actually holds, never a staged edit.
            renderLimitChip(parseSpeedLimit(queue.speedlimit), queue.speedlimit_abs);

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

            // A tick that got all the way here is a healthy one.
            if (consecutiveFailures !== 0) {
                consecutiveFailures = 0;
                lastOkAt = new Date();
                setStale(false);
            } else {
                lastOkAt = new Date();
            }

        } catch(e) {
            // Without this the last good render stays on screen forever and a
            // dead backend is pixel-identical to a healthy one - the worst
            // failure mode for a view people act on.
            console.error(e);
            consecutiveFailures++;
            if (consecutiveFailures >= 2) setStale(true);
        } finally {
            updateInFlight = false;
        }
    };

    // --- Bind Logic Listeners (Run Once) ---
    const mainBtn = document.getElementById("sab-pause-main");
    const arrowBtn = document.getElementById("sab-pause-arrow");
    const menu = document.getElementById("sab-pause-menu");
    // Slider Controls
    const limitChip = document.getElementById("sab-limit-chip");
    const limitMenu = document.getElementById("sab-limit-menu");
    const limitSlider = document.getElementById("sab-limit-slider");
    const sortBtn = document.getElementById("sab-sort-btn");
    const sortMenu = document.getElementById("sab-sort-menu");

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
            arrowBtn.setAttribute("aria-expanded",
                menu.classList.contains("hidden") ? "false" : "true");
            if (limitMenu) {
                limitMenu.classList.add("hidden");
                limitChip.setAttribute("aria-expanded", "false");
            }
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

        // 4. Speed Limit
        if (limitChip && limitMenu) {
            const closeLimitMenu = (refocus) => {
                limitMenu.classList.add("hidden");
                limitChip.setAttribute("aria-expanded", "false");
                if (refocus) limitChip.focus();
            };

            /**
             * Writes a limit and confirms it against the next poll rather than
             * claiming success up front - setSpeedLimit swallows failures, so
             * an unconditional toast could report a write that never landed.
             * @param {number} percent
             */
            const applyLimit = async (percent) => {
                const value = Math.min(Math.max(Math.round(percent), 0), 100);
                closeLimitMenu(true);

                limitChip.dataset.pending = "true";
                limitChip.setAttribute("aria-busy", "true");
                limitChip.classList.add("is-pending");
                // Text and colour flip together. Setting only the text left the
                // chip briefly showing the new value in the old state's colour.
                const optimisticAbs = sabFullRateBytes !== null
                    ? sabFullRateBytes * (value / 100)
                    : null;
                limitChip.textContent = formatLimitLabel(value, optimisticAbs);
                limitChip.classList.toggle("is-active", value > 0 && value < 100);
                limitChip.dataset.value = String(value);

                try {
                    // 100% and 0 mean the same to SABnzbd; write the canonical
                    // one so a later read cannot report the other.
                    await Sabnzbd.setSpeedLimit(url, key, value >= 100 ? "0" : `${value}%`);
                } catch (err) {
                    console.error("Failed to set speed limit:", err);
                }

                setTimeout(async () => {
                    limitChip.dataset.pending = "false";
                    limitChip.removeAttribute("aria-busy");
                    limitChip.classList.remove("is-pending");
                    await update();
                    // The chip now shows whatever the server reports. Only speak
                    // up when that disagrees with what was asked for.
                    const reported = Number(limitChip.dataset.value);
                    const settled = reported === 0 ? 100 : reported;
                    if (settled !== value) {
                        showNotification("SABnzbd kept its own limit — showing the server value", "error");
                    }
                }, 400);
            };

            limitChip.addEventListener("click", (e) => {
                e.stopPropagation();
                const opening = limitMenu.classList.contains("hidden");
                menu.classList.add("hidden");
                arrowBtn.setAttribute("aria-expanded", "false");
                limitMenu.classList.toggle("hidden", !opening);
                limitChip.setAttribute("aria-expanded", opening ? "true" : "false");
                if (opening && limitSlider) {
                    limitSlider.dataset.dirty = "false";
                    limitSlider.focus();
                }
            });

            limitMenu.querySelectorAll(".sab-limit-preset").forEach((btn) => {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    applyLimit(Number(btn.dataset.value));
                });
            });

            if (limitSlider) {
                // `input` fires continuously while dragging: update the readout
                // only, no network. `change` fires once on release and on
                // arrow-key settle, and that is the commit - which removes the
                // staged-versus-applied ambiguity a separate Apply button had.
                limitSlider.addEventListener("pointerdown", () => {
                    limitSlider.dataset.dirty = "true";
                });
                limitSlider.addEventListener("keydown", () => {
                    limitSlider.dataset.dirty = "true";
                });
                limitSlider.addEventListener("input", () => {
                    limitSlider.dataset.dirty = "true";
                    renderLimitReadout(Number(limitSlider.value));
                });
                limitSlider.addEventListener("change", () => {
                    limitSlider.dataset.dirty = "false";
                    applyLimit(Number(limitSlider.value));
                });
            }

            limitMenu.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    e.stopPropagation();
                    closeLimitMenu(true);
                }
            });
        }

        // 4b. Queue sorting. SABnzbd sorts server-side, so this rewrites the
        // real download order, not just the view.
        if (sortBtn && sortMenu) {
            sortBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const opening = sortMenu.classList.contains("hidden");
                menu.classList.add("hidden");
                arrowBtn.setAttribute("aria-expanded", "false");
                if (limitMenu) {
                    limitMenu.classList.add("hidden");
                    limitChip.setAttribute("aria-expanded", "false");
                }
                sortMenu.classList.toggle("hidden", !opening);
                sortBtn.setAttribute("aria-expanded", opening ? "true" : "false");
            });

            // Each entry is a one-shot action, not a view mode: the sort is
            // applied to the queue once and anything added afterwards lands
            // unsorted. Nothing is remembered, because there is no ongoing
            // state to remember - a highlighted "current column" would claim
            // an order the queue stops having on the next addition.
            sortMenu.addEventListener("click", async (e) => {
                const btn = e.target.closest(".sab-sort-go");
                if (!btn) return;
                e.stopPropagation();

                sortMenu.classList.add("hidden");
                sortBtn.setAttribute("aria-expanded", "false");
                sortBtn.disabled = true;
                try {
                    await Sabnzbd.sortQueue(url, key, btn.dataset.sort, btn.dataset.dir);
                    await update();
                } catch (err) {
                    showNotification("Could not sort the queue", "error");
                } finally {
                    sortBtn.disabled = false;
                }
            });

            sortMenu.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    e.stopPropagation();
                    sortMenu.classList.add("hidden");
                    sortBtn.setAttribute("aria-expanded", "false");
                    sortBtn.focus();
                }
            });
        }

        // 5. Outside Click / Escape
        document.body.addEventListener("click", (e) => {
            if (!menu.classList.contains("hidden") && !menu.contains(e.target) && !arrowBtn.contains(e.target)) {
                 menu.classList.add("hidden");
                 arrowBtn.setAttribute("aria-expanded", "false");
            }
            if (limitMenu && !limitMenu.classList.contains("hidden")
                && !limitMenu.contains(e.target) && !limitChip.contains(e.target)) {
                limitMenu.classList.add("hidden");
                limitChip.setAttribute("aria-expanded", "false");
            }
            if (sortMenu && !sortMenu.classList.contains("hidden")
                && !sortMenu.contains(e.target) && !sortBtn.contains(e.target)) {
                sortMenu.classList.add("hidden");
                sortBtn.setAttribute("aria-expanded", "false");
            }
        });

        mainBtn.dataset.bound = "true"; 
    }

    // Same 1s cadence as before while the page is visible; the scheduler adds
    // the pause-when-hidden, error backoff and overlap guard.
    poller.register('sabnzbd', update, { interval: 1000 });
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
