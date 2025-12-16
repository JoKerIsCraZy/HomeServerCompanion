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

    // Load Theme
    if (items.darkMode) {
      document.body.classList.add("dark-mode");
      document.getElementById("theme-toggle").textContent = "☀️";
    }

    // Determine Service Order
    let order = [
      "sabnzbd",
      "sonarr",
      "radarr",
      "tautulli",
      "overseerr",
      "unraid",
    ];
    if (items.serviceOrder && Array.isArray(items.serviceOrder)) {
      order = items.serviceOrder;
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

    // Re-calculate visible order for defaulting
    const visibleOrder = order.filter((s) => items[`${s}Enabled`] !== false);

    // Default to first service in order
    let defaultService = visibleOrder.length > 0 ? visibleOrder[0] : "sabnzbd";

    // PERSISTENCE: Restore Last Active Service
    // Only if enablePersistence is NOT false (default true)
    if (items.enablePersistence !== false) {
      const lastService = localStorage.getItem("lastActiveService");
      // Verify it still exists and is enabled
      if (
        lastService &&
        items[`${lastService}Enabled`] !== false &&
        order.includes(lastService)
      ) {
        defaultService = lastService;
      }
    }

    initNavigation();

    state.activeService = defaultService;

    // Simulate click on active to init view
    const activeEl = sidebar.querySelector(
      `.nav-item[data-target="${defaultService}"]`
    );
    if (activeEl) activeEl.click();
    else loadService(defaultService); // Fallback

    // BADGE PRE-LOAD: Load other services in background to show badges
    ["sabnzbd", "radarr", "sonarr"].forEach((svc) => {
      if (svc !== defaultService && items[`${svc}Enabled`] !== false) {
        loadService(svc);
      }
    });

    // Start background badge updates
    startBackgroundBadgeUpdates();
  });

  // Background Badge Update System
  function startBackgroundBadgeUpdates() {
    // Clear any existing intervals
    Object.values(state.badgeIntervals).forEach((interval) =>
      clearInterval(interval)
    );
    state.badgeIntervals = {};

    // Get configured interval (default 5000ms)
    const interval = state.configs.badgeCheckInterval || 5000;

    // Sabnzbd Badge Update
    if (
      state.configs.sabnzbdEnabled !== false &&
      state.configs.sabnzbdUrl &&
      state.configs.sabnzbdKey
    ) {
      const updateSabnzbd = async () => {
        try {
          const { updateSabnzbdBadge } = await import("./ui/sabnzbd.js");
          await updateSabnzbdBadge(
            state.configs.sabnzbdUrl,
            state.configs.sabnzbdKey
          );
        } catch (e) {
          console.error("Background Sabnzbd badge update failed", e);
        }
      };
      updateSabnzbd(); // Initial call
      state.badgeIntervals.sabnzbd = setInterval(updateSabnzbd, interval);
    }

    // Sonarr Badge Update
    if (
      state.configs.sonarrEnabled !== false &&
      state.configs.sonarrUrl &&
      state.configs.sonarrKey
    ) {
      const updateSonarr = async () => {
        try {
          const { updateSonarrBadge } = await import("./ui/sonarr.js");
          await updateSonarrBadge(
            state.configs.sonarrUrl,
            state.configs.sonarrKey
          );
        } catch (e) {
          console.error("Background Sonarr badge update failed", e);
        }
      };
      updateSonarr(); // Initial call
      state.badgeIntervals.sonarr = setInterval(updateSonarr, interval);
    }

    // Radarr Badge Update
    if (
      state.configs.radarrEnabled !== false &&
      state.configs.radarrUrl &&
      state.configs.radarrKey
    ) {
      const updateRadarr = async () => {
        try {
          const { updateRadarrBadge } = await import("./ui/radarr.js");
          await updateRadarrBadge(
            state.configs.radarrUrl,
            state.configs.radarrKey
          );
        } catch (e) {
          console.error("Background Radarr badge update failed", e);
        }
      };
      updateRadarr(); // Initial call
      state.badgeIntervals.radarr = setInterval(updateRadarr, interval);
    }

    // Tautulli Badge Update
    if (
      state.configs.tautulliEnabled !== false &&
      state.configs.tautulliUrl &&
      state.configs.tautulliKey
    ) {
      const updateTautulli = async () => {
        try {
          const { updateTautulliBadge } = await import("./ui/tautulli.js");
          await updateTautulliBadge(
            state.configs.tautulliUrl,
            state.configs.tautulliKey
          );
        } catch (e) {
          console.error("Background Tautulli badge update failed", e);
        }
      };
      updateTautulli(); // Initial call
      state.badgeIntervals.tautulli = setInterval(updateTautulli, interval);
    }
  }

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
        const targetView = document.getElementById(`${target}-view`);
        targetView.classList.add("active");

        // Update Header
        state.activeService = target;
        headerTitle.textContent =
          target.charAt(0).toUpperCase() + target.slice(1);

        // PERSISTENCE: Save Active Service
        if (state.configs.enablePersistence !== false) {
          localStorage.setItem("lastActiveService", target);
        }

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
      });
    });

    // --- Unraid Storage Toggle ---
    // Note: Toggle logic is now handled within initUnraid / renderUnraidSystem in unraid.js.

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

        // PERSISTENCE
        if (!EXCLUDED_FROM_PERSISTENCE.includes(state.activeService)) {
          if (state.configs.enablePersistence !== false) {
            localStorage.setItem(
              `${state.activeService}_last_sub_tab`,
              targetId
            );
          }
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
