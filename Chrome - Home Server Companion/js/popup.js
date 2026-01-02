import { initSabnzbd } from "./ui/sabnzbd.js";
import { initSonarr } from "./ui/sonarr.js";
import { initRadarr } from "./ui/radarr.js";
import { initTautulli } from "./ui/tautulli.js";
import { initOverseerr } from "./ui/overseerr.js";
import { initUnraid } from "./ui/unraid.js";
import { initProwlarr } from "./ui/prowlarr.js";
import { initWizarr } from "./ui/wizarr.js";
import { initDashboard } from "./ui/dashboard.js";
import { initPortainer } from "./ui/portainer.js";
import { checkAndShowChangelog } from "./utils.js";

/**
 * Updates the Portainer sidebar item with custom name and icon from instances.
 */
function updatePortainerSidebarDisplay(items) {
    const navItem = document.querySelector('.nav-item[data-target="portainer"]');
    if (!navItem) return;

    let instances = [];
    if (items.portainerInstances && items.portainerInstances.length > 0) {
        instances = items.portainerInstances.filter(i => i.url && i.key);
    }

    if (instances.length === 0) return;

    // Get selected instance or first one
    const selectedId = localStorage.getItem('portainer_selected_instance');
    const selectedInst = instances.find(i => i.id === selectedId) || instances[0];

    // Update title attribute and text
    const customName = selectedInst.name || 'Portainer';
    navItem.setAttribute('title', customName);

    // Update the span text if it exists
    const nameSpan = navItem.querySelector('span');
    if (nameSpan) {
        nameSpan.textContent = customName;
    }

    // Update icon if custom icon exists
    if (selectedInst.icon) {
        const iconContainer = navItem.querySelector('.nav-icon');
        if (iconContainer) {
            // Replace default icon with custom one
            iconContainer.innerHTML = `<img src="${selectedInst.icon}" style="width: 20px; height: 20px; border-radius: 4px; object-fit: cover;" />`;
        }
    }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Check for updates first
  await checkAndShowChangelog();

  // Fullscreen Mode Detection - check if opened as standalone window
  if (new URLSearchParams(window.location.search).get('fullscreen') === 'true') {
    document.body.classList.add('fullscreen-mode');
  }

  // Fullscreen Button Handler - opens extension as standalone dashboard tab
  document.getElementById('fullscreen-btn')?.addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup.html?fullscreen=true')
    });
    window.close();
  });

  // State
  const state = {
    configs: {},
    activeService: "sabnzbd",
    expandedSessions: new Set(), // Track expanded Tautulli sessions
    refreshInterval: null,
    storageCardState: {}, // Add this for Unraid storage persistence
    badgeIntervals: {}, // Track background badge update intervals
  };

  const EXCLUDED_FROM_PERSISTENCE = ["tautulli"];

  // Elements
  const views = document.querySelectorAll(".view");
  const headerTitle = document.getElementById("page-title");
  const errorMsg = document.getElementById("error-msg");
  const navItems = document.querySelectorAll(".sidebar .nav-item[data-target]");

  // --- Initialization ---
  chrome.storage.sync.get(null, (items) => {
    state.configs = items;

    // Determine Service Order
    let order = [
      "dashboard",
      "unraid",
      "sabnzbd",
      "sonarr",
      "radarr",
      "tautulli",
      "overseerr",
      "prowlarr",
      "wizarr",
    ];
    if (items.serviceOrder && Array.isArray(items.serviceOrder)) {
      order = items.serviceOrder;
    }
    
    // Safety: Ensure Dashboard is always in the order (it might be missing in custom sorts)
    if (!order.includes('dashboard')) {
        order.unshift('dashboard');
    }

    // Reorder Sidebar
    const sidebar = document.querySelector(".sidebar");
    const spacer = sidebar.querySelector(".spacer");

    order.forEach((service) => {
      // Check if service is enabled (default true)
      if (items[`${service}Enabled`] !== false) {
        const el = sidebar.querySelector(`.nav-item[data-target="${service}"]`);
        if (el) sidebar.insertBefore(el, spacer);
      } else {
        // Hide if disabled
        const el = sidebar.querySelector(`.nav-item[data-target="${service}"]`);
        if (el) el.style.display = "none";
      }
    });

    // Update Portainer name and icon from instances
    updatePortainerSidebarDisplay(items);

    // Re-calculate visible order for defaulting
    const visibleOrder = order.filter((s) => items[`${s}Enabled`] !== false);

    // Default to first service in order
    let defaultService = visibleOrder.length > 0 ? visibleOrder[0] : "dashboard";

    // START PAGE LOGIC
    // Options: 'last-active' (default) or specific service id
    const startPage = items.startPage || (items.enablePersistence === false ? 'dashboard' : 'last-active');

    if (startPage === 'last-active') {
        const lastService = localStorage.getItem("lastActiveService");
        if (
            lastService &&
            items[`${lastService}Enabled`] !== false &&
            order.includes(lastService)
        ) {
            defaultService = lastService;
        }
    } else {
        // Specific start page requested
        if (
            items[`${startPage}Enabled`] !== false &&
            order.includes(startPage)
        ) {
            defaultService = startPage;
        }
    }

    initNavigation();

    // Reset all views to hidden initially to prevent overlap/splitscreen
    views.forEach(v => {
        v.classList.remove('active');
        v.classList.add('hidden');
    });

    state.activeService = defaultService;
    
    // Load local storage states for sub-tabs before loading service
    restoreView(defaultService);

    // Load Default Service
    loadService(defaultService);

    // BADGE PRE-LOAD: Load other services in background to show badges
    ["sabnzbd", "radarr", "sonarr", "tautulli"].forEach((svc) => {
      if (svc !== defaultService && items[`${svc}Enabled`] !== false) {
        const svcUrl = items[`${svc}Url`];
        const svcKey = items[`${svc}Key`];
        if (svcUrl && svcKey) {
          // Pre-fetch in background with slight delay to not block main service
          setTimeout(async () => {
            try {
              if (svc === "tautulli") {
                await initTautulli(svcUrl, svcKey, state);
              } else if (svc === "sabnzbd") {
                await initSabnzbd(svcUrl, svcKey, state);
              } else if (svc === "sonarr") {
                await initSonarr(svcUrl, svcKey, state);
              } else if (svc === "radarr") {
                await initRadarr(svcUrl, svcKey, state);
              }
            } catch (e) {
              console.debug(`[Pre-fetch] ${svc} failed:`, e.message);
            }
          }, 500);
        }
      }
    });

    // Start background badge updates
    startBackgroundBadgeUpdates();

    // --- CHECK FOR PENDING SEARCH (Context Menu) ---
    chrome.storage.local.get(['pendingSearch'], (result) => {
        const searchQuery = result.pendingSearch;
        
        if (searchQuery) {
            // Clear immediately
            chrome.storage.local.remove('pendingSearch');

            // Trigger Unified Search
            import("./ui/searchUI.js").then((module) => {
                // Ensure UI is initialized
                module.initSearchUI(state).then(() => {
                    module.openSearch();
                    
                    setTimeout(() => {
                        const input = document.getElementById('unified-search-input');
                        if (input) {
                            input.value = searchQuery;
                            // Trigger input event to fire the debounce listener
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }, 100);
                });
            });
        }

        // Start background badge updates
        startBackgroundBadgeUpdates();

        // Initialize Search UI (Background Warmup)
        import("./ui/searchUI.js").then((module) => {
            module.initSearchUI(state);
        });
    });
  });
  function startBackgroundBadgeUpdates() {
    // Clear any existing intervals
    Object.values(state.badgeIntervals).forEach((interval) =>
      clearInterval(interval)
    );
    state.badgeIntervals = {};

    // Get configured interval (default 5000ms)
    const interval = state.configs.badgeCheckInterval || 5000;

    // Services Definition
    const services = [
      { id: "sabnzbd", module: "./ui/sabnzbd.js", badgeFn: "updateSabnzbdBadge" },
      { id: "sonarr", module: "./ui/sonarr.js", badgeFn: "updateSonarrBadge" },
      { id: "radarr", module: "./ui/radarr.js", badgeFn: "updateRadarrBadge" },
      { id: "tautulli", module: "./ui/tautulli.js", badgeFn: "updateTautulliBadge" },
      { id: "portainer", module: "./ui/portainer.js", badgeFn: "updatePortainerBadge_Dashboard" },
    ];

    // Track consecutive failures per service (for error indication)
    const failureCounts = {};
    const MAX_FAILURES_BEFORE_WARNING = 3;

    // Stagger interval offset to prevent all services updating simultaneously
    const STAGGER_OFFSET = 1000; // 1 second between each service

    services.forEach((svc, index) => {
        if (
            state.configs[`${svc.id}Enabled`] !== false &&
            state.configs[`${svc.id}Url`] &&
            state.configs[`${svc.id}Key`]
        ) {
            failureCounts[svc.id] = 0;

            const updateFn = async () => {
                // SKIP if this is the active service (already being polled by main loop)
                if (state.activeService === svc.id) return;

                try {
                    const module = await import(svc.module);
                    if (module[svc.badgeFn]) {
                        await module[svc.badgeFn](
                            state.configs[`${svc.id}Url`],
                            state.configs[`${svc.id}Key`]
                        );
                    }
                    // Reset failure count on success
                    failureCounts[svc.id] = 0;
                    // Remove error indicator if present
                    const navItem = document.querySelector(`.nav-item[data-target="${svc.id}"]`);
                    if (navItem) navItem.classList.remove('badge-error');
                } catch (e) {
                    failureCounts[svc.id]++;

                    // Log error occasionally (not every time to avoid spam)
                    if (failureCounts[svc.id] === 1 || failureCounts[svc.id] % 10 === 0) {
                        console.warn(`[Badge] ${svc.id} update failed (${failureCounts[svc.id]}x):`, e.message);
                    }

                    // Add visual indicator after multiple failures
                    if (failureCounts[svc.id] >= MAX_FAILURES_BEFORE_WARNING) {
                        const navItem = document.querySelector(`.nav-item[data-target="${svc.id}"]`);
                        if (navItem) navItem.classList.add('badge-error');
                    }
                }
            };

            // Staggered initial call and interval to prevent simultaneous updates
            const staggerDelay = index * STAGGER_OFFSET;
            setTimeout(() => {
                updateFn(); // Initial call (staggered)
                state.badgeIntervals[svc.id] = setInterval(updateFn, interval);
            }, staggerDelay);
        }
    });
  }


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
    // Shared navigation handler
    const handleNavigation = (item) => {
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
        views.forEach((v) => {
            v.classList.remove("active");
            v.classList.add("hidden");
        });
        const targetView = document.getElementById(`${target}-view`);
        targetView.classList.remove("hidden"); // Ensure hidden is removed
        targetView.classList.add("active");

        // Update Header
        state.activeService = target;
        headerTitle.textContent =
          target.charAt(0).toUpperCase() + target.slice(1);

        // PERSISTENCE: Save Active Service (Always save, so 'Last Active' option works if selected)
        localStorage.setItem("lastActiveService", target);

        // Load Content
        hideError();
        loadService(target);
        restoreView(target);

        // GLIDER FIX: Force update glider for the active tab in this view
        // We need a slight delay to ensure the view is rendered and has width
        setTimeout(() => {
             const activeBtn = targetView.querySelector('.tab-btn.active, .sub-tab-btn.active');
             if (activeBtn) {
                 updateGlider(activeBtn);
             }
        }, 50);
    };

    // Bind click and keyboard events for accessibility
    navItems.forEach((item) => {
      item.addEventListener("click", () => handleNavigation(item));

      // Keyboard support: Enter and Space activate navigation
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleNavigation(item);
        }
      });
    });

    // --- Unraid Storage Toggle ---
    // Note: Toggle logic is now handled within initUnraid / renderUnraidSystem in unraid.js.

    // --- Omnibox Logic (Global Search) ---
    const omniboxContainer = document.getElementById("omnibox-container");
    const omniboxInput = document.getElementById("omnibox-input");
    const omniboxClose = document.getElementById("omnibox-close");
    const searchToggleBtn = document.getElementById("search-toggle-btn");
    const pageTitle = document.getElementById("page-title");
    const headerActions = document.getElementById("header-actions");

    if (searchToggleBtn) {
        searchToggleBtn.addEventListener("click", () => {
             // Show Omnibox, hide Title
             if (omniboxContainer.classList.contains("hidden")) {
                 omniboxContainer.classList.remove("hidden");
                 pageTitle.style.display = "none";
                 omniboxInput.focus();
                 // Hide other actions buttons if needed for space, but flex helps
             } else {
                 closeOmnibox();
             }
        });
    }

    if (omniboxClose) {
        omniboxClose.addEventListener("click", closeOmnibox);
    }

    function closeOmnibox() {
        // Don't hide the omnibox - just clear the input and blur
        omniboxInput.value = "";
        omniboxInput.blur();
    }

    if (omniboxInput) {
        // Auto-switch to Unified Search Overlay when typing Prowlarr syntax "n:" or "n;"
        omniboxInput.addEventListener("input", (e) => {
            const query = omniboxInput.value;
            if (/^n[;:]/i.test(query)) {
                import("./ui/searchUI.js").then((module) => {
                    module.initSearchUI(state);
                    module.openSearch();
                    
                    const searchInput = document.getElementById('unified-search-input');
                    if (searchInput) {
                        searchInput.value = query;
                        searchInput.focus();
                        // Trigger input handler in searchUI to show filters
                        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    closeOmnibox();
                });
            }
        });

        omniboxInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                const query = omniboxInput.value.trim();
                
                // New Unified Search Logic
                import("./ui/searchUI.js").then((module) => {
                    module.initSearchUI(state); // Ensure initialized
                    module.openSearch();
                    
                    // Pre-fill if typed in omnibox
                    const searchInput = document.getElementById('unified-search-input');
                    if (searchInput && query) {
                        searchInput.value = query;
                        
                        // Check if it is a Prowlarr query which requires Enter
                        if (/^n[;:]/i.test(query)) {
                            // Dispatch Enter Keydown to force trigger
                            searchInput.dispatchEvent(new KeyboardEvent('keydown', {
                                key: 'Enter',
                                code: 'Enter',
                                keyCode: 13,
                                which: 13,
                                bubbles: true
                            }));
                        } else {
                            // Standard Input Trigger
                            searchInput.dispatchEvent(new Event('input', { bubbles: true })); 
                        }
                    }
                });
                
                closeOmnibox();
            }
        });
    }

    // --- Global Ctrl+S Shortcut for Unified Search ---
    document.addEventListener("keydown", (e) => {
        // Ctrl+S to open Unified Search
        if (e.ctrlKey && e.key === "s") {
            e.preventDefault(); // Prevent browser save dialog
            
            import("./ui/searchUI.js").then((module) => {
                module.initSearchUI(state);
                module.openSearch();
                
                // Focus search input for immediate typing
                setTimeout(() => {
                    const searchInput = document.getElementById('unified-search-input');
                    if (searchInput) searchInput.focus();
                }, 50);
            });
        }
    });


    // --- Overseerr Search Listener (Global) ---
    // Search input elements are static in popup.html.
    // We delegate the search action to the overseerr module.
    const overseerrSearchBtn = document.getElementById("overseerr-search-btn");
    const overseerrSearchInput = document.getElementById(
      "overseerr-search-input"
    );

    if (overseerrSearchBtn) {
      overseerrSearchBtn.addEventListener("click", () => {
        const url = state.configs.overseerrUrl;
        const key = state.configs.overseerrKey;
        const query = overseerrSearchInput.value;
        import("./ui/overseerr.js").then((module) => {
          module.doSearch(url, key, query);
        });
      });
    }

    if (overseerrSearchInput) {
      overseerrSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const url = state.configs.overseerrUrl;
          const key = state.configs.overseerrKey;
          const query = overseerrSearchInput.value;
          import("./ui/overseerr.js").then((module) => {
            module.doSearch(url, key, query);
          });
        }
      });
    }

    // --- Glider Logic (Global Helper) ---
    function updateGlider(btn, retryCount = 0) {
      if (!btn) return;
      // Anti-Race Condition: Only update if the button is effectively active
      if (!btn.classList.contains("active")) return;
      const container = btn.parentElement;
      const glider = container.querySelector(".tab-glider");
      if (!glider) return;

      // Force check visibility or width
      // If width is 0, we can't position correctly. Retry.
      // Limit retries to avoid infinite loops (e.g. 20 retries * 30ms = 600ms)
      if (btn.offsetWidth === 0) {
        // Retry if element has no width (e.g. still rendering)
        if (retryCount < 20) {
          requestAnimationFrame(() => {
            setTimeout(() => updateGlider(btn, retryCount + 1), 30);
          });
        }
        return;
      }

      // Apply styles if we have dimensions
      glider.style.width = `${btn.offsetWidth}px`;
      glider.style.transform = `translateX(${btn.offsetLeft - 5}px)`;
    }

    // --- Generic Sub-Tabs (Unraid & Overseerr) ---
    const subTabBtns = document.querySelectorAll(".sub-tab-btn");

    subTabBtns.forEach((btn) => {
      // Initial check - delay slightly to allow entering the DOM/layout
      if (btn.classList.contains("active")) {
        setTimeout(() => updateGlider(btn), 50);
        // Also listen for window resize/load
        window.addEventListener("load", () => updateGlider(btn));
      }

      btn.addEventListener("click", (e) => {
        // Find parent view to scope the toggle
        const parentView =
          btn.closest(".view") || document.getElementById("unraid-view");

        // Remove active from siblings in this container
        const container = btn.parentElement;
        container
          .querySelectorAll(".sub-tab-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        // Update Glider (NOW that it is active)
        updateGlider(btn);

        // Hide all sub-views/tab-content in this View
        parentView
          .querySelectorAll(".sub-view, .overseerr-tab-content")
          .forEach((view) => {
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
          if (targetId.includes("search")) {
            const input = targetView.querySelector("input");
            if (input) input.focus();
          }
        }

        // Overseerr Filter Visibility Logic
        if (state.activeService === "overseerr") {
          const filterContainer = document.getElementById(
            "overseerr-filter-container"
          );
          if (filterContainer) {
            if (targetId === "overseerr-requests-tab") {
              filterContainer.classList.remove("hidden");
              filterContainer.style.display = "block";
            } else {
              filterContainer.classList.add("hidden");
              filterContainer.style.display = "none";
            }
          }
        }

        // PERSISTENCE: Sub-tabs
        if (!EXCLUDED_FROM_PERSISTENCE.includes(state.activeService)) {
             localStorage.setItem(
               `${state.activeService}_last_sub_tab`,
               targetId
             );
        }

        // Trigger Load
        loadService(state.activeService);
      });
    });

    // Tab Switching within Views
    const tabBtns = document.querySelectorAll(".tab-btn");

    tabBtns.forEach((btn) => {
      if (btn.classList.contains("active")) {
        setTimeout(() => updateGlider(btn), 50);
        window.addEventListener("load", () => updateGlider(btn));
      }

      btn.addEventListener("click", (e) => {
        const parentView = btn.closest(".view");
        const tabName = btn.dataset.tab;

        // Toggle Buttons
        parentView
          .querySelectorAll(".tab-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        // Update Glider (After active set)
        updateGlider(btn);

        // Toggle Sub-views
        parentView
          .querySelectorAll(".sub-view")
          .forEach((sv) => sv.classList.add("hidden"));

        let prefix = state.activeService;
        if (prefix === "sabnzbd") prefix = "sab";

        const targetSubView = parentView.querySelector(`#${prefix}-${tabName}`);
        if (targetSubView) {
          targetSubView.classList.remove("hidden");
          targetSubView.classList.add("active");
        }

        if (!EXCLUDED_FROM_PERSISTENCE.includes(state.activeService)) {
            localStorage.setItem(`${state.activeService}_last_tab`, tabName);
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
    if (state.configs.enablePersistence === false) return;

    // 1. Restore standard tabs (.tab-btn)
    const lastTab = localStorage.getItem(`${service}_last_tab`);
    if (lastTab) {
      const view = document.getElementById(`${service}-view`);
      if (view) {
        const btn = view.querySelector(`.tab-btn[data-tab="${lastTab}"]`);
        if (btn) {
          btn.click();
        }
      }
    }

    // 2. Restore sub-tabs (.sub-tab-btn)
    const lastSubTabId = localStorage.getItem(`${service}_last_sub_tab`);
    if (lastSubTabId) {
      const view = document.getElementById(`${service}-view`);
      if (view) {
        const btn = view.querySelector(
          `.sub-tab-btn[data-target="${lastSubTabId}"]`
        );
        if (btn) {
          btn.click(); // This triggers the listener which calls updateGlider
          // We don't need manual force update if the listener calls logic that handles async
          // But let's trigger a resize event to be sure
          setTimeout(() => {
            window.dispatchEvent(new Event("resize"));
          }, 100);
        }
      }
    }
  }

  // --- Service Loaders ---
  async function loadService(service) {
    const url = state.configs[`${service}Url`];
    const key = state.configs[`${service}Key`];

    // Update State
    state.activeService = service;

    // Update Sidebar Active State
    navItems.forEach(item => {
       if (item.dataset.target === service) item.classList.add('active');
       else item.classList.remove('active');
    });

    // Update View Visibility
    views.forEach(v => {
       if (v.id === `${service}-view`) {
           v.classList.remove('hidden');
           v.classList.add('active');
       } else {
           v.classList.remove('active');
           v.classList.add('hidden');
       }
    });

    // Update Header
    if (headerTitle) {
        // Special case: use custom Portainer instance name
        if (service === 'portainer') {
            const instances = state.configs.portainerInstances || [];
            const selectedId = localStorage.getItem('portainer_selected_instance');
            const selectedInst = instances.find(i => i.id === selectedId) || instances[0];
            headerTitle.textContent = (selectedInst && selectedInst.name) || 'Portainer';
        } else {
            headerTitle.textContent = service.charAt(0).toUpperCase() + service.slice(1);
        }
    }

    if (service !== "dashboard" && service !== "unraid" && service !== "wizarr" && (!url || !key)) {
      showError(`Please configure ${service} in settings.`);
      return;
    }
    if (service === "unraid" && !url) {
      showError(`Please configure Unraid in settings.`);
      return;
    }

    try {
      switch (service) {
        case "dashboard":
          await initDashboard(state);
          break;
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
        case "prowlarr": 
          await initProwlarr(url, key, state);
          break;
        case "wizarr":
          await initWizarr(url || '', key || '', state);
          break;
        case "portainer":
          await initPortainer(url, key, state);
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
