
import { initSabnzbd } from "./ui/sabnzbd.js";
import { initSonarr } from "./ui/sonarr.js";
import { initRadarr } from "./ui/radarr.js";
import { initTautulli } from "./ui/tautulli.js";
import { initOverseerr } from "./ui/overseerr.js";
import { initUnraid } from "./ui/unraid.js";

document.addEventListener("DOMContentLoaded", () => {
  // State
  const state = {
    configs: {},
    activeService: "sabnzbd",
    expandedSessions: new Set(), // Track expanded Tautulli sessions
    refreshInterval: null,
    storageCardState: {} // Add this for Unraid storage persistence
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
    // Moved to unraid.js logic, but initialization of global listeners (if any shared) usually stays here.
    // However, the toggle logic was specific to the DOM created by renderUnraidSystem, 
    // so it is now handled inside initUnraid / renderUnraidSystem in unraid.js.

    // --- Overseerr Search Listener (Global) ---
    // These input elements exist statically in popup.html? 
    // Yes, #overseerr-search-btn and #overseerr-search-input are in popup.html.
    // We should delegate the search action to the overseerr module.
    const overseerrSearchBtn = document.getElementById('overseerr-search-btn');
    const overseerrSearchInput = document.getElementById('overseerr-search-input');

    if (overseerrSearchBtn) {
        overseerrSearchBtn.addEventListener('click', () => {
             const url = state.configs.overseerrUrl;
             const key = state.configs.overseerrKey;
             const query = overseerrSearchInput.value;
             import('./ui/overseerr.js').then(module => {
                 module.doSearch(url, key, query);
             });
        });
    }

    if (overseerrSearchInput) {
        overseerrSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                 const url = state.configs.overseerrUrl;
                 const key = state.configs.overseerrKey;
                 const query = overseerrSearchInput.value;
                 import('./ui/overseerr.js').then(module => {
                     module.doSearch(url, key, query);
                 });
            }
        });
    }

    // --- Generic Sub-Tabs (Unraid & Overseerr) ---
    const subTabBtns = document.querySelectorAll(".sub-tab-btn");
    subTabBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        // Find parent view to scope the toggle
        const parentView = btn.closest('.view') || document.getElementById('unraid-view'); 
        
        // Remove active from siblings in this container
        const container = btn.parentElement;
        container.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add("active");

        // Hide all sub-views/tab-content in this View
        parentView.querySelectorAll(".sub-view, .overseerr-tab-content").forEach((view) => {
          view.classList.add("hidden");
          view.classList.remove("active"); 
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
             if (state.configs.enablePersistence !== false) { 
                 localStorage.setItem(`${state.activeService}_last_sub_tab`, targetId);
             }
        }
        
        // Trigger Load to refresh data for the new view (e.g. Unraid System -> VMs)
        loadService(state.activeService);
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
          await initSabnzbd(url, key, state);
          break;
        case "sonarr":
          await initSonarr(url, key, state);
          break;
        case "radarr":
          await initRadarr(url, key, state);
          break;
        case "tautulli":
          await initTautulli(url, key, state);
          break;
        case "overseerr":
          await initOverseerr(url, key, state);
          break;
        case "unraid":
          await initUnraid(url, key, state);
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

});
