import * as Sabnzbd from "../services/sabnzbd.js";
import * as Sonarr from "../services/sonarr.js";
import * as Radarr from "../services/radarr.js";
import * as Tautulli from "../services/tautulli.js";
import * as Overseerr from "../services/overseerr.js";
import * as Unraid from "../services/unraid.js";
import { formatSize } from "../services/utils.js";

document.addEventListener("DOMContentLoaded", () => {
  // State
  const state = {
    configs: {},
    activeService: "sabnzbd",
    expandedSessions: new Set() // Track expanded Tautulli sessions
  };

  const EXCLUDED_FROM_PERSISTENCE = ['sonarr', 'radarr', 'tautulli'];

  // Elements
  const views = document.querySelectorAll(".view");
  const headerTitle = document.getElementById("page-title");
  const errorMsg = document.getElementById("error-msg");
  const navItems = document.querySelectorAll(".sidebar .nav-item[data-target]");

  // --- Initialization ---
  chrome.storage.sync.get(null, (items) => {
    state.configs = items;

    // Load Theme
    if (items.darkMode) {
      document.body.classList.add("dark-mode");
      document.getElementById("theme-toggle").textContent = "☀️";
    }

    // Determine Service Order
    let order = ['sabnzbd', 'sonarr', 'radarr', 'tautulli', 'overseerr', 'unraid'];
    if (items.serviceOrder && Array.isArray(items.serviceOrder)) {
        order = items.serviceOrder;
    }

    // Reorder Sidebar
    const sidebar = document.querySelector('.sidebar');
    const spacer = sidebar.querySelector('.spacer');
    // Remove existing nav items (except settings/spacer if needed, but easier to just re-append)
    // Actually we can just re-append them in order, DOM will move them.
    order.forEach(service => {
        // Check if service is enabled (default true)
        if (items[`${service}Enabled`] !== false) {
             const el = sidebar.querySelector(`.nav-item[data-target="${service}"]`);
             if (el) sidebar.insertBefore(el, spacer);
        } else {
             // Hide if disabled
             const el = sidebar.querySelector(`.nav-item[data-target="${service}"]`);
             if (el) el.style.display = 'none';
        }
    });

    // Re-calculate visible order for defaulting
    const visibleOrder = order.filter(s => items[`${s}Enabled`] !== false);
    
    // Default to first service in order
    let defaultService = visibleOrder.length > 0 ? visibleOrder[0] : 'sabnzbd';

    // PERSISTENCE: Restore Last Active Service
    // Only if enablePersistence is NOT false (default true)
    if (items.enablePersistence !== false) {
        const lastService = localStorage.getItem('lastActiveService');
        // Verify it still exists and is enabled
        if (lastService && items[`${lastService}Enabled`] !== false && order.includes(lastService)) {
            defaultService = lastService;
        }
    }
    
    initNavigation();
    
    state.activeService = defaultService;
    
    // Simulate click on active to init view
    const activeEl = sidebar.querySelector(`.nav-item[data-target="${defaultService}"]`);
    if (activeEl) activeEl.click();
    else loadService(defaultService); // Fallback
  });

  // Theme Toggle Logic
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark-mode");
    document.getElementById("theme-toggle").textContent = isDark ? "☀️" : "🌙";

    // Save preference
    chrome.storage.sync.set({ darkMode: isDark });
  });

  // Open Web Interface Logic
  document.getElementById("open-link-btn").addEventListener("click", () => {
    const service = state.activeService;
    const url = state.configs[`${service}Url`];
    if (url) {
      chrome.tabs.create({ url: url });
    } else {
      console.error("No URL configured for", service);
    }
  });

  // --- Navigation ---
  function initNavigation() {
    navItems.forEach((item) => {
      item.addEventListener("click", () => {
        // Clear any auto-refresh intervals
        if (state.refreshInterval) {
          clearInterval(state.refreshInterval);
          state.refreshInterval = null;
        }
        const target = item.dataset.target;

        // Update Sidebar
        navItems.forEach((el) => el.classList.remove("active"));
        item.classList.add("active");

        // Update View
        views.forEach((v) => v.classList.remove("active"));
        document.getElementById(`${target}-view`).classList.add("active");

        // Update Header
        state.activeService = target;
        headerTitle.textContent =
          target.charAt(0).toUpperCase() + target.slice(1);

        // PERSISTENCE: Save Active Service
        if (state.configs.enablePersistence !== false) {
             localStorage.setItem('lastActiveService', target);
        }

        // Load Content
        hideError();
        loadService(target);
        restoreView(target);
      });
    });

    // --- Unraid Storage Toggle ---
    const storageToggle = document.getElementById("storage-toggle");
    if (storageToggle) {
      storageToggle.addEventListener("click", () => {
        const list = document.getElementById("storage-details-dropdown");
        const arrow = storageToggle.querySelector(".dropdown-arrow");

        if (list.classList.contains("hidden")) {
          list.classList.remove("hidden");
          arrow.style.transform = "rotate(180deg)";
        } else {
          list.classList.add("hidden");
          arrow.style.transform = "rotate(0deg)";
        }
      });
    }

    // --- Overseerr Search Listener (Global) ---
    const overseerrSearchBtn = document.getElementById('overseerr-search-btn');
    const overseerrSearchInput = document.getElementById('overseerr-search-input');

    if (overseerrSearchBtn) {
        overseerrSearchBtn.addEventListener('click', () => {
             const url = state.configs.overseerrUrl;
             const key = state.configs.overseerrKey;
             const query = overseerrSearchInput.value;
             doSearch(url, key, query);
        });
    }

    if (overseerrSearchInput) {
        overseerrSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                 const url = state.configs.overseerrUrl;
                 const key = state.configs.overseerrKey;
                 const query = overseerrSearchInput.value;
                 doSearch(url, key, query);
            }
        });
    }

    // --- Generic Sub-Tabs (Unraid & Overseerr) ---
    const subTabBtns = document.querySelectorAll(".sub-tab-btn");
    subTabBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        // Find parent view to scope the toggle
        const parentView = btn.closest('.view') || document.getElementById('unraid-view'); // Fallback for safety if structure differs
        
        // Remove active from siblings in this container
        const container = btn.parentElement;
        container.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add("active");

        // Hide all sub-views/tab-content in this View
        // Unraid uses .sub-view, Overseerr uses .overseerr-tab-content. 
        // Let's normalize or target both.
        parentView.querySelectorAll(".sub-view, .overseerr-tab-content").forEach((view) => {
          view.classList.add("hidden");
          view.classList.remove("active"); // Remove active class if used
        });

        // Show target
        const targetId = btn.getAttribute("data-target");
        const targetView = document.getElementById(targetId);
        if (targetView) {
            targetView.classList.remove("hidden");
            targetView.classList.add("active");
             // If search tab, auto-focus
            if (targetId.includes('search')) {
                const input = targetView.querySelector('input');
                if(input) input.focus();
            }
        }

        // PERSISTENCE
        // We only persist if the current ACTIVE SERVICE is not excluded AND persistence is enabled
        if (!EXCLUDED_FROM_PERSISTENCE.includes(state.activeService)) {
             if (state.configs.enablePersistence !== false) { // Default to true if undefined
                 localStorage.setItem(`${state.activeService}_last_sub_tab`, targetId);
             }
        }
      });
    });

    // Tab Switching within Views
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const parentView = btn.closest(".view");
        const tabName = btn.dataset.tab;

        // Toggle Buttons
        parentView
          .querySelectorAll(".tab-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        // Toggle Sub-views
        parentView
          .querySelectorAll(".sub-view")
          .forEach((sv) => sv.classList.add("hidden"));

        // Handle prefix mismatch (sabnzbd vs sab)
        let prefix = state.activeService;
        if (prefix === "sabnzbd") prefix = "sab";

        const targetSubView = parentView.querySelector(`#${prefix}-${tabName}`); // e.g. sab-queue, sonarr-calendar
        if (targetSubView) targetSubView.classList.remove("hidden");

        // PERSISTENCE
        if (!EXCLUDED_FROM_PERSISTENCE.includes(state.activeService)) {
             if (state.configs.enablePersistence !== false) {
                 localStorage.setItem(`${state.activeService}_last_tab`, tabName);
             }
        }
      });
    });

    // Settings Button
    document.getElementById("settings-btn").addEventListener("click", () => {
      if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
      else window.open("options.html");
    });

  }

  function restoreView(service) {
      if (EXCLUDED_FROM_PERSISTENCE.includes(service)) return;
      if (state.configs.enablePersistence === false) return; // Respect setting

      // 1. Restore standard tabs (.tab-btn)
      const lastTab = localStorage.getItem(`${service}_last_tab`);
      if (lastTab) {
           // We need to find the button inside the active view
           const view = document.getElementById(`${service}-view`);
           if (view) {
               const btn = view.querySelector(`.tab-btn[data-tab="${lastTab}"]`);
               if (btn) btn.click();
           }
      }

      // 2. Restore sub-tabs (.sub-tab-btn) like in Overseerr / Unraid
      const lastSubTabId = localStorage.getItem(`${service}_last_sub_tab`);
      if (lastSubTabId) {
          const view = document.getElementById(`${service}-view`);
          if (view) {
              const btn = view.querySelector(`.sub-tab-btn[data-target="${lastSubTabId}"]`);
              if (btn) {
                   // Avoid double-clicking if already active? 
                   // The click handler manages UI state, so clicking is the safest way to ensure Consistency.
                   btn.click(); 
              }
          }
      }
  }

  // --- Service Loaders ---
  async function loadService(service) {
    const url = state.configs[`${service}Url`];
    const key = state.configs[`${service}Key`];

    if (service !== "unraid" && (!url || !key)) {
      showError(`Please configure ${service} in settings.`);
      return;
    }
    if (service === "unraid" && !url) {
      showError(`Please configure Unraid in settings.`);
      return;
    }

    try {
      switch (service) {
        case "sabnzbd":
          await loadSabnzbd(url, key);
          break;
        case "sonarr":
          await loadSonarr(url, key);
          break;
        case "radarr":
          await loadRadarr(url, key);
          break;
        case "tautulli":
          await loadTautulli(url, key);
          break;
        case "overseerr":
          await loadOverseerr(url, key);
          break;
        case "unraid":
          await loadUnraid(url, key);
          break;
      }
    } catch (error) {
      console.error(error);
      showError(`Failed to load ${service}: ${error.message}`);
    }
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove("hidden");
  }
  function hideError() {
    errorMsg.classList.add("hidden");
  }

  // --- Implementation: SABnzbd ---
  // --- Implementation: SABnzbd ---
  // --- Implementation: SABnzbd ---
  async function loadSabnzbd(url, key) {
    // Queue function to handle fetching and rendering
    const update = async () => {
      try {
        // Load Queue (contains stats)
        const queue = await Sabnzbd.getSabnzbdQueue(url, key);

        // Check if queue exists (avoid errors during partial loads)
        if (!queue) return;

        // Render Stats (Convert KB/s to MB/s)
        const kb = parseFloat(queue.kbpersec) || 0;
        const mb = (kb / 1024).toFixed(1);
        document.getElementById("sab-speed").textContent = `${mb} MB/s`;

        document.getElementById("sab-timeleft").textContent =
          queue.timeleft || "00:00:00";

        // Pause Button logic
        const pauseBtn = document.getElementById("sab-pause-btn");
        const isPaused = queue.paused;
        pauseBtn.textContent = isPaused ? "▶️" : "⏸️";
        pauseBtn.title = isPaused ? "Resume Queue" : "Pause Queue";
        if (isPaused) pauseBtn.classList.add("paused");
        else pauseBtn.classList.remove("paused");

        // Button Click Listener (Ensure single listener)
        pauseBtn.onclick = async () => {
          if (isPaused) await Sabnzbd.resumeQueue(url, key);
          else await Sabnzbd.pauseQueue(url, key);
          // Immediate update will happen on next interval tick or we can force one
          setTimeout(update, 200);
        };

        renderSabnzbdQueue(queue.slots || []);

        // Load History (optional to refresh every second, but maybe okay for responsiveness)
        // If history is heavy, we might want to move it out of the fast loop.
        // For now, keeping it in sync.
        const historyData = await Sabnzbd.getSabnzbdHistory(url, key);
        renderSabnzbdHistory(historyData.slots || []);
      } catch (e) {
        console.error("Auto-refresh error", e);
      }
    };

    // Initial Run
    await update();

    // Clear existing interval if any
    if (state.refreshInterval) clearInterval(state.refreshInterval);

    // Set new interval (1 second)
    state.refreshInterval = setInterval(update, 1000);
  }

  function renderSabnzbdQueue(slots) {
    const container = document.getElementById("sab-queue");
    container.innerHTML = "";
    if (slots.length === 0) {
      container.innerHTML =
        '<div class="card"><div class="card-header">Queue Empty</div></div>';
      return;
    }

    const tmpl = document.getElementById("sab-queue-item");
    slots.forEach((slot) => {
      const clone = tmpl.content.cloneNode(true);
      clone.querySelector(".filename").textContent = slot.filename;
      clone.querySelector(".percentage").textContent = `${slot.percentage}%`;
      clone.querySelector(
        ".progress-bar-fill"
      ).style.width = `${slot.percentage}%`;
      clone.querySelector(
        ".size"
      ).textContent = `${slot.mbleft} MB / ${slot.mb} MB`;
      clone.querySelector(".status").textContent = slot.status;

      // Delete Action
      const deleteBtn = clone.querySelector(".delete-btn");
      deleteBtn.onclick = async () => {
        if (confirm(`Delete "${slot.filename}"?`)) {
          await Sabnzbd.deleteQueueItem(
            state.configs.sabnzbdUrl,
            state.configs.sabnzbdKey,
            slot.nzo_id
          );
          // The auto-refresh loop will pick up the change
        }
      };

      container.appendChild(clone);
    });
  }

  function renderSabnzbdHistory(slots) {
    const container = document.getElementById("sab-history");
    container.innerHTML = "";
    const tmpl = document.getElementById("sab-history-item");
    slots.forEach((slot) => {
      const clone = tmpl.content.cloneNode(true);
      clone.querySelector(".filename").textContent = slot.name;
      clone.querySelector(".status-badge").textContent = slot.status;
      clone.querySelector(".status-badge").classList.add(slot.status);
      clone.querySelector(".size").textContent = slot.size;
      clone.querySelector(".time").textContent = slot.action_line || "";
      container.appendChild(clone);
    });
  }

  // --- Implementation: Sonarr ---
  async function loadSonarr(url, key) {
    // Calendar
    const calendar = await Sonarr.getSonarrCalendar(url, key);
    renderSonarrCalendar(calendar);

    // Queue
    const queue = await Sonarr.getSonarrQueue(url, key);
    renderSonarrQueue(queue.records || []);

    // History (Recent)
    const history = await Sonarr.getSonarrHistory(url, key);
    renderSonarrHistory(history.records || []);
  }

  function renderSonarrCalendar(episodes) {
    const container = document.getElementById("sonarr-calendar");
    container.innerHTML = "";
    if (episodes.length === 0) {
      container.innerHTML =
        '<div class="card"><div class="card-header">No upcoming episodes</div></div>';
      return;
    }

    // Group by Date
    const grouped = {};
    episodes.forEach((ep) => {
      const dateStr = new Date(ep.airDateUtc).toLocaleDateString();
      if (!grouped[dateStr]) grouped[dateStr] = [];
      grouped[dateStr].push(ep);
    });

    Object.keys(grouped).forEach((dateStr) => {
      // Header
      const dateGroup = document.createElement("div");
      dateGroup.className = "date-group";

      // Nice Header Text (Today/Tomorrow checks)
      let headerText = dateStr;
      const dateObj = new Date(grouped[dateStr][0].airDateUtc);
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);

      if (dateObj.toDateString() === today.toDateString()) headerText = "Today";
      else if (dateObj.toDateString() === tomorrow.toDateString())
        headerText = "Tomorrow";
      else
        headerText = dateObj.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });

      const header = document.createElement("div");
      header.className = "date-header";
      header.textContent = headerText;
      dateGroup.appendChild(header);

      // Items
      grouped[dateStr].forEach((ep) => {
        const item = document.createElement("div");
        item.className = "calendar-item";

        const airTime = new Date(ep.airDateUtc);
        const timeStr = airTime.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        // const period = airTime.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', hour12: true}).slice(-2); // AM/PM if needed, or just remove

        let statusClass = "status-Unaired";
        let statusText = "Unaired";

        if (ep.hasFile) {
          statusClass = "status-Downloaded";
          statusText = "Downloaded";
        } else if (new Date() > airTime) {
          statusClass = "status-Missing";
          statusText = "Missing";
        } else {
          statusClass = "status-Airing";
          statusText = "Airing";
        }

        item.innerHTML = `
                    <div class="calendar-left">
                        <div class="cal-time">${timeStr}</div>
                    </div>
                    <div class="calendar-main">
                        <div class="cal-title clickable-link" data-slug="${
                          ep.series ? ep.series.titleSlug : ""
                        }">${ep.series ? ep.series.title : "Unknown"}</div>
                        <div class="cal-meta">S${ep.seasonNumber}E${
          ep.episodeNumber
        } - ${ep.title}</div>
                    </div>
                    <div class="status-badge ${statusClass}" style="margin-left: 10px;">${statusText}</div>
                `;

        // Add click listener
        const link = item.querySelector(".clickable-link");
        if (link && ep.series && ep.series.titleSlug) {
          link.addEventListener("click", (e) => {
            e.stopPropagation();
            const url = state.configs.sonarrUrl;
            chrome.tabs.create({ url: `${url}/series/${ep.series.titleSlug}` });
          });
        }

        dateGroup.appendChild(item);
      });

      container.appendChild(dateGroup);
    });
  }

  function renderSonarrQueue(records) {
    const container = document.getElementById("sonarr-queue");
    container.innerHTML = "";
    if (records.length === 0) {
      container.innerHTML =
        '<div class="card"><div class="card-header">Queue Empty</div></div>';
      return;
    }

    const tmpl = document.getElementById("sab-queue-item"); // Re-using queue item template
    records.forEach((item) => {
      const clone = tmpl.content.cloneNode(true);
      clone.querySelector(".filename").textContent = item.title;
      const percent = 100 - (item.sizeleft / item.size) * 100;
      clone.querySelector(".percentage").textContent = `${Math.round(
        percent
      )}%`;
      clone.querySelector(".progress-bar-fill").style.width = `${percent}%`;
      clone.querySelector(".size").textContent = formatSize(item.sizeleft);
      clone.querySelector(".status").textContent = item.status;
      container.appendChild(clone);
    });
  }

  function renderSonarrHistory(records) {
    const container = document.getElementById("sonarr-history");
    container.innerHTML = "";

    // Filter for only 'downloadFolderImported' (Completed Downloads)
    const filtered = records
      .filter((r) => r.eventType === "downloadFolderImported")
      .slice(0, 15);

    if (filtered.length === 0) {
      container.innerHTML =
        '<div class="card"><div class="card-header">No recent downloads</div></div>';
      return;
    }

    const tmpl = document.getElementById("sab-history-item");
    filtered.forEach((item) => {
      const clone = tmpl.content.cloneNode(true);
      const seriesTitle = item.series ? item.series.title : "Unknown";

      let epString = "";
      if (item.episode) {
        epString = ` - S${item.episode.seasonNumber}E${item.episode.episodeNumber}`;
      }

      const filenameEl = clone.querySelector(".filename");
      filenameEl.textContent = `${seriesTitle}${epString}`;
      
      if (item.series && item.series.titleSlug) {
          filenameEl.classList.add('clickable-link');
          filenameEl.addEventListener('click', (e) => {
              e.stopPropagation();
              const url = state.configs.sonarrUrl;
              chrome.tabs.create({ url: `${url}/series/${item.series.titleSlug}` });
          });
      }

      const badge = clone.querySelector(".status-badge");
      // Friendly name
      badge.textContent = "Imported";
      badge.classList.add("Completed");

      if (item.quality)
        clone.querySelector(".size").textContent = item.quality.quality.name;
      clone.querySelector(".time").textContent = new Date(
        item.date
      ).toLocaleDateString();

      container.appendChild(clone);
    });
  }

  // --- Implementation: Radarr ---
  async function loadRadarr(url, key) {
    // Calendar
    const calendar = await Radarr.getRadarrCalendar(url, key);
    renderRadarrCalendar(calendar);

    // Load Queue
    const queue = await Radarr.getRadarrMovies(url, key);
    renderRadarrQueue(queue.records || []);

    // Load Recent (History)
    const history = await Radarr.getRadarrHistory(url, key);
    renderRadarrRecent(history.records || []);
  }

  function renderRadarrCalendar(movies) {
    const container = document.getElementById("radarr-calendar");
    container.innerHTML = "";
    if (movies.length === 0) {
      container.innerHTML =
        '<div class="card"><div class="card-header">No upcoming movies</div></div>';
      return;
    }

    // Determine effective date and group
    const grouped = {};
    movies.forEach((movie) => {
      let dateObj = new Date(movie.inCinemas);
      if (movie.digitalRelease && new Date(movie.digitalRelease) > new Date())
        dateObj = new Date(movie.digitalRelease);
      else if (
        movie.physicalRelease &&
        new Date(movie.physicalRelease) > new Date()
      )
        dateObj = new Date(movie.physicalRelease);
      else if (movie.inCinemas && new Date(movie.inCinemas) > new Date())
        dateObj = new Date(movie.inCinemas);

      // If date is invalid or past, logic might be tricky, defaulting to InCinemas or Today
      if (isNaN(dateObj)) dateObj = new Date();

      const dateStr = dateObj.toDateString();
      if (!grouped[dateStr]) grouped[dateStr] = [];

      // Attach formatted date object for rendering
      movie._effectiveDate = dateObj;
      grouped[dateStr].push(movie);
    });

    // SORT KEYS BY DATE
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      return grouped[a][0]._effectiveDate - grouped[b][0]._effectiveDate;
    });

    sortedKeys.forEach((dateKey) => {
      const dateGroup = document.createElement("div");
      dateGroup.className = "date-group";

      let headerText = dateKey;
      const dateObj = grouped[dateKey][0]._effectiveDate;
      const today = new Date();
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);

      if (dateObj.toDateString() === today.toDateString()) headerText = "Today";
      else if (dateObj.toDateString() === tomorrow.toDateString())
        headerText = "Tomorrow";
      else
        headerText = dateObj.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });

      const header = document.createElement("div");
      header.className = "date-header";
      header.textContent = headerText;
      dateGroup.appendChild(header);

      grouped[dateKey].forEach((movie) => {
        const item = document.createElement("div");
        item.className = "calendar-item";

        let type = "Cinema";
        if (
          movie.digitalRelease &&
          new Date(movie.digitalRelease).toDateString() ===
            dateObj.toDateString()
        )
          type = "Digital";
        else if (
          movie.physicalRelease &&
          new Date(movie.physicalRelease).toDateString() ===
            dateObj.toDateString()
        )
          type = "Physical";

        let statusClass = "status-Airing";
        let statusText = "Upcoming";

        if (movie.hasFile) {
          statusClass = "status-Downloaded";
          statusText = "Downloaded";
        } else if (movie.isAvailable) {
          statusClass = "status-Airing";
          statusText = "Available";
        } else {
          statusClass = "status-Unaired";
          statusText = "Upcoming";
        }

        item.innerHTML = `
                    <div class="calendar-left">
                        <div class="cal-time" style="font-size:11px; text-transform:uppercase;">${type}</div>
                    </div>
                    <div class="calendar-main">
                        <div class="cal-title clickable-link" data-slug="${
                          movie.titleSlug
                        }">${movie.title}</div>
                        <div class="cal-meta">${movie.studio || ""}</div>
                    </div>
                     <div class="status-badge ${statusClass}" style="margin-left: 10px;">${statusText}</div>
                `;

        // Add click listener
        const link = item.querySelector(".clickable-link");
        if (link && movie.titleSlug) {
          link.addEventListener("click", (e) => {
            e.stopPropagation();
            const url = state.configs.radarrUrl;
            chrome.tabs.create({ url: `${url}/movie/${movie.titleSlug}` });
          });
        }

        dateGroup.appendChild(item);
      });
      container.appendChild(dateGroup);
    });
  }

  function renderRadarrQueue(records) {
    const container = document.getElementById("radarr-queue");
    container.innerHTML = "";
    if (records.length === 0) {
      container.innerHTML =
        '<div class="card"><div class="card-header">Queue Empty</div></div>';
      return;
    }

    const tmpl = document.getElementById("sab-queue-item");
    records.forEach((item) => {
      const clone = tmpl.content.cloneNode(true);
      clone.querySelector(".filename").textContent = item.title;
      const percent = 100 - (item.sizeleft / item.size) * 100;
      clone.querySelector(".percentage").textContent = `${Math.round(
        percent
      )}%`;
      clone.querySelector(".progress-bar-fill").style.width = `${percent}%`;
      clone.querySelector(".size").textContent = formatSize(item.sizeleft);
      clone.querySelector(".status").textContent = item.status;
      container.appendChild(clone);
    });
  }

  function renderRadarrRecent(records) {
    const container = document.getElementById("radarr-movies");
    container.innerHTML = "";

    // Filter for only 'downloadFolderImported'
    const filtered = records
      .filter((r) => r.eventType === "downloadFolderImported")
      .slice(0, 15);

    if (filtered.length === 0) {
      container.innerHTML =
        '<div class="card"><div class="card-header">No recent downloads</div></div>';
      return;
    }

    const tmpl = document.getElementById("sab-history-item");
    filtered.forEach((item) => {
      const clone = tmpl.content.cloneNode(true);
      const filenameEl = clone.querySelector(".filename");
      filenameEl.textContent = item.movie ? item.movie.title : item.sourceTitle;
      
      if (item.movie && item.movie.titleSlug) {
          filenameEl.classList.add('clickable-link');
          filenameEl.addEventListener('click', (e) => {
              e.stopPropagation();
              const url = state.configs.radarrUrl;
              chrome.tabs.create({ url: `${url}/movie/${item.movie.titleSlug}` });
          });
      }

      const badge = clone.querySelector(".status-badge");
      badge.textContent = "Imported";
      badge.classList.add("Completed");

      if (item.quality)
        clone.querySelector(".size").textContent = item.quality.quality.name;
      clone.querySelector(".time").textContent = new Date(
        item.date
      ).toLocaleDateString();

      container.appendChild(clone);
    });
  }

  // --- Implementation: Tautulli ---
  // --- Implementation: Tautulli ---
  async function loadTautulli(url, key) {
    const update = async () => {
      try {
        const activity = await Tautulli.getTautulliActivity(url, key);
        renderTautulliActivity(activity.sessions || [], url, key);
      } catch (e) {
        console.error("Tautulli Auto-refresh error", e);
      }
    };

    // Initial Run
    await update();

    // Clear existing interval if any
    if (state.refreshInterval) clearInterval(state.refreshInterval);

    // Set new interval (2 seconds)
    state.refreshInterval = setInterval(update, 2000);
  }

  function renderTautulliActivity(sessions, url, key) {
    const container = document.getElementById("tautulli-activity");
    container.innerHTML = "";
    if (sessions.length === 0) {
      container.innerHTML =
        '<div class="card"><div class="card-header">No active streams</div></div>';
      return;
    }

    const tmpl = document.getElementById("tautulli-card");
    sessions.forEach((session) => {
      const clone = tmpl.content.cloneNode(true);
      const card = clone.querySelector('.tautulli-item');

      // --- Main Info ---
      // Title logic: Grandparent - Title (Series) or Title (Movie)
      const title = session.grandparent_title
        ? session.grandparent_title
        : session.title;
      const subtitle = session.grandparent_title 
        ? `${session.parent_media_index}x${session.media_index} • ${session.title}`
        : session.year || '';
        
      clone.querySelector(".media-title").textContent = title;
      clone.querySelector(".media-subtitle").textContent = subtitle;

      // User & Time
      clone.querySelector(".user-name").textContent = session.user || session.username;
      
      // Time Left Calculation
      // duration (ms) - view_offset (ms)
      let timeText = "";
      if (session.duration && session.view_offset) {
          const leftMs = session.duration - session.view_offset;
          const leftMins = Math.round(leftMs / 1000 / 60);
          timeText = `${leftMins}m left`;
      }
      clone.querySelector(".time-left").textContent = timeText;

      // Meta Row: Direct Play • 7.7 Mbps • Original
      const streamDecision = session.transcode_decision === 'direct play' ? 'Direct Play' : 'Transcode';
      clone.querySelector(".stream-decision").textContent = streamDecision;
      
      const bandwidth = session.bandwidth ? `${(session.bandwidth / 1000).toFixed(1)} Mbps` : '';
      clone.querySelector(".bandwidth").textContent = bandwidth;
      
      const quality = session.quality_profile || session.video_resolution || "";
      clone.querySelector(".quality").textContent = quality;

      // Progress Bar
      clone.querySelector(".progress-bar-fill").style.width = `${session.progress_percent}%`;
      
      // State Border Color (Optional, maybe color the progress bar?)
      // session.state is 'playing', 'paused', 'buffering'
      
      // Images (Auth required for proxied images)
      if (session.art) {
        const backdropUrl = `${url}/pms_image_proxy?img=${session.art}&width=800&opacity=100&background=000000&apikey=${key}`;
        clone.querySelector(".tautulli-backdrop").style.backgroundImage = `url('${backdropUrl}')`;
      }
      
      // --- Poster ---
      const posterImg = session.grandparent_thumb || session.thumb;
      if (posterImg) {
        const posterUrl = `${url}/pms_image_proxy?img=${posterImg}&width=300&apikey=${key}`;
        clone.querySelector(".poster-img").src = posterUrl;
      } else {
        clone.querySelector(".tautulli-poster").style.display = "none";
      }

      // --- Hidden Details ---
      // Stream
      clone.querySelector('.val-container').textContent = `${streamDecision} (${session.container.toUpperCase()})`;
      clone.querySelector('.val-video').textContent = `${session.stream_video_decision.toUpperCase()} (${session.video_codec.toUpperCase()} ${session.video_resolution}p)`;
      clone.querySelector('.val-audio').textContent = `${session.stream_audio_decision.toUpperCase()} (${session.audio_language.toUpperCase()} - ${session.audio_codec.toUpperCase()} ${session.audio_channels})`;
      
      // Subs
      const subText = session.subtitle_decision === 'burn' ? 'Burn' : (session.selected_subtitle_codec ? 'Direct' : 'None');
      clone.querySelector('.val-subs').textContent = subText;

      // Player
      clone.querySelector('.val-platform').textContent = session.platform;
      clone.querySelector('.val-product').textContent = session.product;
      clone.querySelector('.val-player').textContent = session.player;

      // User / Network
      clone.querySelector('.val-username').textContent = session.user || session.username;
      
      const isLan = session.ip_address_public === session.ip_address; // Simple check, Tautulli usually provides 'relayed' or 'local' flags but ip check is decent proxy if undefined
      // Tautulli session object has `session.location` = 'lan' or 'wan'
      const netText = session.location ? session.location.toUpperCase() : 'WAN';
      clone.querySelector('.val-network').textContent = netText;
      
      if (session.secure !== '1' && session.secure !== true) {
          clone.querySelector('.secure-icon').textContent = '🔓';
          clone.querySelector('.secure-icon').title = 'Insecure';
      }
      
      clone.querySelector('.val-ip').textContent = session.ip_address;


      // --- Interactivity ---
      // Toggle
      const mainDiv = clone.querySelector('.tautulli-main');
      const detailsDiv = clone.querySelector('.tautulli-details');
      const toggleBtn = clone.querySelector('.details-toggle');
      
      // Check persistent state
      if (state.expandedSessions.has(session.session_id)) {
          detailsDiv.classList.remove('hidden');
          card.classList.add('expanded');
      }

      const toggleDetails = () => {
          const isHidden = detailsDiv.classList.contains('hidden');
          if (isHidden) {
              detailsDiv.classList.remove('hidden');
              card.classList.add('expanded');
              state.expandedSessions.add(session.session_id);
          } else {
              detailsDiv.classList.add('hidden');
              card.classList.remove('expanded');
              state.expandedSessions.delete(session.session_id);
          }
      };

      mainDiv.addEventListener('click', toggleDetails); // Whole card clickable for ease

      // Terminate Logic (Both button and icon)
      const terminateLogic = async (e) => {
        e.stopPropagation(); // Don't toggle
        const reason = prompt(
          `Kill stream for user "${session.user || session.username}"?\nEnter a reason (optional):`,
          "Terminated via Chrome Extension"
        );
        if (reason !== null) {
          await Tautulli.terminateSession(url, key, session.session_id, reason);
          setTimeout(() => loadTautulli(url, key), 1000);
        }
      };

      const killIcon = clone.querySelector('.kill-icon-btn');
      if (killIcon) killIcon.addEventListener('click', terminateLogic);

      container.appendChild(clone);
    });
  }

  // --- Implementation: Overseerr ---
  let overseerrTab = 'requests'; // requests | search

  async function loadOverseerr(url, key) {
    console.log("loadOverseerr called with", url);
    if (!url || !key) {
        showError("Please configure Overseerr in options.");
        return;
    }
    
    // Setup Filter Listener (Ensure single binding)
    const filterSelect = document.getElementById('overseerr-filter');
    
    // Set initial value from saved config
    // Default to 'all' as requested by user ("damit man es bei einem neustart... automatic bei all requests") 
    // Wait, user asks to SAVE it. So default can be 'pending' or whatever, but if they chose 'all', it should be 'all'.
    if (filterSelect) {
        if (state.configs.overseerrFilter) {
            filterSelect.value = state.configs.overseerrFilter;
        } else {
             // Default if nothing saved. 
             // "All requests wird gespeichert" implies they want the capability.
             // Let's stick with 'pending' as default-default unless they change it.
        }
    }

    if (filterSelect && !filterSelect.dataset.listenerAttached) {
        filterSelect.addEventListener('change', () => {
             // Save preference
             const newVal = filterSelect.value;
             state.configs.overseerrFilter = newVal; // Update local state
             chrome.storage.sync.set({ overseerrFilter: newVal });

             loadRequests();
        });
        filterSelect.dataset.listenerAttached = "true";
    }

    // Initial Load
    loadRequests();
    
    async function loadRequests() {
         const container = document.getElementById('overseerr-requests');
         const filter = filterSelect ? filterSelect.value : 'pending';
         const cacheKey = `overseerr_hydrated_${filter}`;
         
         // 1. Try Cache (Hydrated Data)
         const cached = localStorage.getItem(cacheKey);
         if (cached) {
             try {
                const hydratedData = JSON.parse(cached);
                console.log("Rendering Overseerr from Hydrated Cache");
                renderHydratedRequests(hydratedData, url, key);
             } catch(e) { console.error("Cache parse error", e); }
         } else {
             if (container) container.innerHTML = `<div class="loading">Loading ${filter} requests...</div>`;
         }
         
         try {
            // 2. Fetch Fresh Raw Data
            const rawData = await Overseerr.getRequests(url, key, filter);
            const requests = rawData.results || [];

            // 3. Hydrate Data (Fetch Details)
            const hydratedRequests = await hydrateRequests(requests, url, key);

            // 4. Save Cache & Render
            localStorage.setItem(cacheKey, JSON.stringify(hydratedRequests));
            renderHydratedRequests(hydratedRequests, url, key);

        } catch (e) {
            console.error(e);
            if (!cached && container) container.innerHTML = `<div class="error-banner">Failed to load requests: ${e.message}</div>`;
        }
    }
  }

  async function doSearch(url, key, query) {
      console.log("doSearch called with:", { url, key: key ? '***' : 'missing', query });
      if (!query) {
          console.warn("doSearch aborted: No query");
          return;
      }
      const container = document.getElementById('overseerr-search-results');
      if (container) container.innerHTML = '<div class="loading">Searching...</div>';
      else console.error("Search results container not found!");
      
      try {
        console.log("Calling Overseerr.search...");
        const results = await Overseerr.search(url, key, query);
        console.log("Search results received:", results);
        renderOverseerrSearch(results, url, key);
      } catch (e) {
        console.error("Search failed in doSearch:", e);
        if (container) container.innerHTML = `<div class="error">Search Error: ${e.message}</div>`;
      }
  }

  function renderOverseerrSearch(results, url, key) {
      const container = document.getElementById('overseerr-search-results');
      container.innerHTML = '';
      
      if (results.length === 0) {
          container.innerHTML = '<div class="card"><div class="card-header">No results found</div></div>';
          return;
      }

      const tmpl = document.getElementById('overseerr-search-card');

      results.filter(item => item.mediaType === 'movie' || item.mediaType === 'tv').forEach(item => {
          const clone = tmpl.content.cloneNode(true);
          
          // Image
          const posterImg = clone.querySelector('.poster-img');
          if (item.posterPath) {
             const posterUrl = `https://image.tmdb.org/t/p/w200${item.posterPath}`;
             posterImg.src = posterUrl;
          } else {
             // Fallback if no path initially
             posterImg.src = 'icons/icon48.png';
          }
          // Error Handler
          posterImg.addEventListener('error', () => {
              posterImg.src = 'icons/icon48.png';
          });

          if (item.backdropPath) {
               const backdropUrl = `https://image.tmdb.org/t/p/w500${item.backdropPath}`;
               clone.querySelector('.overseerr-backdrop').style.backgroundImage = `url('${backdropUrl}')`;
          }

          // Title
          const title = item.title || item.name || 'Unknown';
          const year = item.releaseDate ? item.releaseDate.split('-')[0] : (item.firstAirDate ? item.firstAirDate.split('-')[0] : '');
          
          clone.querySelector('.media-title').textContent = title;
          clone.querySelector('.media-year').textContent = year;
          clone.querySelector('.media-type').textContent = item.mediaType === 'movie' ? 'Movie' : 'TV';

          // Status / Button
          // Check mediaInfo to see if already available/requested?
          // item.mediaInfo.status (2=Pending, 3=Processing, 4=Partially Available, 5=Available)
          // If available, show "Available" and hide request btn.
          
          const btn = clone.querySelector('.request-btn');
          const statusDiv = clone.querySelector('.search-status-container');
          
          let statusText = "";
          let canRequest = true;

          if (item.mediaInfo) {
              if (item.mediaInfo.status === 5) {
                  statusText = "Available";
                  statusDiv.innerHTML = `<span class="request-status" style="color:#4caf50; border-color: #4caf50; background: rgba(76,175,80,0.1);">${statusText}</span>`;
                  canRequest = false;
              } else if (item.mediaInfo.status === 2 || item.mediaInfo.status === 3) {
                   statusText = "Requested";
                   statusDiv.innerHTML = `<span class="request-status">${statusText}</span>`;
                   canRequest = false;
              }
          }
          
          if (!canRequest) {
              btn.style.display = 'none';
          } else {
              btn.onclick = async () => {
                  btn.textContent = "⏳";
                  btn.disabled = true;
                  try {
                      // Request Payload
                      // Defaulting rootFolder and profileId is tricky. 
                      // Try sending minimal payload. If 500/400, catch.
                      await Overseerr.request(url, key, {
                          mediaId: item.id,
                          mediaType: item.mediaType
                      });
                      btn.textContent = "✔";
                      btn.title = "Requested";
                  } catch (e) {
                      console.error(e);
                      btn.textContent = "❌";
                      btn.title = "Failed: " + e.message;
                      alert("Failed to request: " + e.message + "\nCheck Overseerr defaults.");
                  }
              };
          }

          container.appendChild(clone);
      });
  }

  // Helper: Fetch details for all requests (Parallel)
  async function hydrateRequests(requests, url, key) {
      if (!requests) return [];
      return await Promise.all(requests.map(async (req) => {
          // Clone req to avoid mutating original if needed
          const enhancedReq = { ...req }; 
          const media = req.media;
          
          enhancedReq.details = {
              title: "Unknown",
              posterPath: "",
              backdropPath: "",
              year: ""
          };

          try {
             if (req.type === 'movie') {
                 // media.tmdbId is reliable for movies
                 const d = await Overseerr.getMovie(url, key, media.tmdbId);
                 if (d) {
                     enhancedReq.details.title = d.title;
                     enhancedReq.details.posterPath = d.posterPath;
                     enhancedReq.details.backdropPath = d.backdropPath;
                     enhancedReq.details.year = d.releaseDate ? d.releaseDate.split('-')[0] : "";
                 }
             } else if (req.type === 'tv') {
                 const d = await Overseerr.getTv(url, key, media.tmdbId);
                 if (d) {
                     enhancedReq.details.title = d.name;
                     enhancedReq.details.posterPath = d.posterPath;
                     enhancedReq.details.backdropPath = d.backdropPath;
                     enhancedReq.details.year = d.firstAirDate ? d.firstAirDate.split('-')[0] : "";
                 }
             }
          } catch (e) {
              console.error("Hydration failed for", req.id, e);
          }
          return enhancedReq;
      }));
  }

  // Render function that expects already-hydrated data (no async fetching inside)
  function renderHydratedRequests(requests, url, key) {
      const container = document.getElementById('overseerr-requests');
      container.innerHTML = '';

      if (requests.length === 0) {
          container.innerHTML = '<div class="card"><div class="card-header">No pending requests</div></div>';
          return;
      }

      const tmpl = document.getElementById('overseerr-card');

  // Helper: Fetch details for all requests (Parallel)


      // Process requests (Synchronous, using hydrated details)
      requests.forEach((req) => {
          const clone = tmpl.content.cloneNode(true);
          const media = req.media;
          const details = req.details || {}; 
          
          const title = details.title || "Loading...";
          const posterPath = details.posterPath || "";
          const backdropPath = details.backdropPath || "";
          const year = details.year || "";
          
          
          const posterImg = clone.querySelector('.poster-img');
          if (posterPath) {
             const posterUrl = `https://image.tmdb.org/t/p/w200${posterPath}`;
             posterImg.src = posterUrl;

             if (backdropPath) {
                 const backdropUrl = `https://image.tmdb.org/t/p/w500${backdropPath}`;
                 clone.querySelector('.overseerr-backdrop').style.backgroundImage = `url('${backdropUrl}')`;
             }
          } else {
             posterImg.src = 'icons/icon48.png';
          }
          // Error Handler
          posterImg.addEventListener('error', () => {
              posterImg.src = 'icons/icon48.png';
          });

          clone.querySelector('.media-title').textContent = title;
          // You might want to add year if your template supports it
          // querySelector('.media-year').textContent = year; 
          
          const requester = req.requestedBy ? (req.requestedBy.displayName || req.requestedBy.email) : 'Unknown';
          const dateStr = new Date(req.createdAt).toLocaleDateString();
          
          const titleEl = clone.querySelector('.media-title');
          titleEl.textContent = title;
          titleEl.classList.add('clickable-link');
          titleEl.addEventListener('click', (e) => {
              e.stopPropagation();
              let baseUrl = url;
              if (!baseUrl.startsWith('http')) { baseUrl = 'http://' + baseUrl; }
              if (baseUrl.endsWith('/')) { baseUrl = baseUrl.slice(0, -1); }

              let targetUrl = '';
              if (req.type === 'movie') {
                  targetUrl = `${baseUrl}/movie/${media.tmdbId}`;
              } else if (req.type === 'tv') {
                  targetUrl = `${baseUrl}/tv/${media.tmdbId}`;
              }

              if (targetUrl) {
                  chrome.tabs.create({ url: targetUrl });
              }
          });
          clone.querySelector('.requester-name').textContent = requester;
          clone.querySelector('.request-date').textContent = dateStr;

          // Request Status / Type
          let statusText = "Pending Approval";
          let statusColor = "#ffc107"; // Yellow
          let statusBg = "rgba(255, 193, 7, 0.2)";
          let statusBorder = "rgba(255, 193, 7, 0.4)";

          // Request Status: 1=Pending, 2=Approved, 3=Declined
          if (req.status === 1) {
              statusText = "Pending Approval";
          } else if (req.status === 2) {
              statusText = "Approved";
              statusColor = "#2196f3"; // Blue
              statusBg = "rgba(33, 150, 243, 0.2)";
              statusBorder = "rgba(33, 150, 243, 0.4)";

              // Check Media Status if Approved
              // MediaStatus: 1=Unknown, 2=Pending, 3=Processing, 4=Partial, 5=Available
              if (media) {
                  if (media.status === 3) {
                      statusText = "Processing";
                  } else if (media.status === 4) {
                      statusText = "Partially Available";
                      statusColor = "#4caf50"; 
                      statusBg = "rgba(76, 175, 80, 0.2)";
                      statusBorder = "rgba(76, 175, 80, 0.4)";
                  } else if (media.status === 5) {
                      statusText = "Available";
                      statusColor = "#4caf50"; // Green
                      statusBg = "rgba(76, 175, 80, 0.2)";
                      statusBorder = "rgba(76, 175, 80, 0.4)";
                  }
              }
          } else if (req.status === 3) {
              statusText = "Declined";
              statusColor = "#f44336"; // Red
              statusBg = "rgba(244, 67, 54, 0.2)";
              statusBorder = "rgba(244, 67, 54, 0.4)";
          }
          
          const statusEl = clone.querySelector('.request-status');
          statusEl.textContent = statusText;
          statusEl.style.color = statusColor;
          statusEl.style.background = statusBg;
          statusEl.style.borderColor = statusBorder;

          // Actions - Only show if Pending (1)
          const actionsDiv = clone.querySelector('.overseerr-actions');
          if (req.status !== 1) {
              actionsDiv.style.display = 'none';
          } else {
              const approveBtn = clone.querySelector('.approve-btn');
              const declineBtn = clone.querySelector('.decline-btn');

              if (approveBtn) {
                 approveBtn.onclick = async () => {
                    approveBtn.disabled = true;
                    const success = await Overseerr.approveRequest(url, key, req.id);
                    if (success) {
                        loadOverseerr(url, key);
                    }
                 };
              }

              if (declineBtn) {
                  declineBtn.onclick = async () => {
                      declineBtn.disabled = true;
                      if (confirm(`Decline request for ${title}?`)) {
                          const success = await Overseerr.declineRequest(url, key, req.id);
                          if (success) {
                               loadOverseerr(url, key);
                          }
                      } else {
                          declineBtn.disabled = false;
                      }
                  };
              }
          }

          container.appendChild(clone);
      });
  }

  // --- Implementation: Unraid ---
  async function loadUnraid(url, key) {
    if (!key) {
      document.getElementById("unraid-status-card").innerHTML =
        '<div class="status-indicator offline">Please set Unraid API Key in Options</div>';
      return;
    }

    const update = async () => {
      try {
        // Fetch Data: System & Dockers
        const data = await Unraid.getSystemData(url, key);

        // Render Status Card
        const card = document.getElementById("unraid-status-card");
        card.querySelector(".status-indicator").textContent = "ONLINE";
        card.querySelector(".status-indicator").className =
          "status-indicator online";
        // --- Render System Tab (Screenshot Match) ---
        const systemTab = document.getElementById("unraid-tab-system");
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

        // CPU/RAM render moved to System Tab
        // document.getElementById('unraid-cpu').textContent = Math.round(data.cpu) + '%';
        // document.getElementById('unraid-cpu').style.color = data.cpu > 80 ? '#f44336' : 'inherit';

        // document.getElementById('unraid-ram').textContent = Math.round(data.ram) + '%';

        // Render Dockers
        renderDockers(data.dockers, url, key);
      } catch (e) {
        console.error("Unraid Error", e);
        const card = document.getElementById("unraid-status-card");
        card.querySelector(".status-indicator").textContent =
          "CONNECTION ERROR";
        card.querySelector(".status-indicator").className =
          "status-indicator offline";
      }
    };

    await update();
    // Auto-refresh 5s
    if (state.refreshInterval) clearInterval(state.refreshInterval);
    state.refreshInterval = setInterval(update, 5000);
  }

  function renderDockers(dockers, url, key) {
    const container = document.getElementById("unraid-docker-list");
    container.innerHTML = "";
    const tmpl = document.getElementById("docker-card");

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
          await Unraid.controlContainer(url, key, docker.id, "stop");
          loadUnraid(url, key);
        };
        btnRestart.onclick = async () => {
          await Unraid.controlContainer(url, key, docker.id, "restart");
          loadUnraid(url, key);
        };
      } else {
        btnStop.style.display = "none";
        btnRestart.style.display = "none";
        btnStart.onclick = async () => {
          await Unraid.controlContainer(url, key, docker.id, "start");
          loadUnraid(url, key);
        };
      }

      container.appendChild(clone);
    });
  }

  function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }
});
