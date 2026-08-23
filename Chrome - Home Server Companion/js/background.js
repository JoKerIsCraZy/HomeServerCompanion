// Background Script

// Initialize Context Menu & Handle Setup Wizard
chrome.runtime.onInstalled.addListener(async (details) => {
    // Create context menu
    chrome.contextMenus.create({
        id: "search-hsc",
        title: "Search in Home Server Companion",
        contexts: ["selection"]
    });
    
    // Setup Wizard Logic: Only show on fresh install, not on updates
    if (details.reason === 'install') {
        // Fresh install - open setup wizard
        chrome.tabs.create({ url: 'setup.html' });
    } else if (details.reason === 'update') {
        // Update - check if user has any configured services
        // If they do, mark setup as complete so they never see the wizard
        chrome.storage.sync.get(null, (items) => {
            // Check if setup was already completed
            if (items.setupCompleted) return;
            
            // Check if user has any configured services (existing user)
            const hasConfig = items.sabnzbdUrl || items.sonarrUrl || items.radarrUrl || 
                              items.tautulliUrl || items.unraidUrl || items.seerrUrl ||
                              items.prowlarrUrl || items.wizarrUrl || items.portainerUrl ||
                              (items.portainerInstances && items.portainerInstances.length > 0);
            
            if (hasConfig) {
                // Existing user with config - mark setup as complete
                chrome.storage.sync.set({ 
                    setupCompleted: true,
                    setupCompletedAt: 'migrated-from-update'
                });
            }
            // If no config, user can manually run setup from options page
        });
    }
});

// Handle Context Menu Click
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "search-hsc") {
        const query = info.selectionText;
        if (query) {
             // Store the query and open the native popup
             chrome.storage.local.set({ pendingSearch: query }, () => {
                 chrome.action.openPopup();
             });
        }
    }
});

// --- Portainer Header Spoofing (Fix for 403 Forbidden) ---
//
// Portainer rejects API calls whose Origin does not match the server, and an
// extension sends `chrome-extension://...`. These rules rewrite Origin and
// Referer to the instance's own origin for requests aimed at it.
//
// The rules used to be keyed on `portainerUrl`. Nothing writes that key —
// options.js reads it once to migrate a pre-4.0 profile into
// `portainerInstances` and it is never written back — so the lookup always
// came up empty, the function removed its rule and returned, and the feature
// had been inert for every user since the multi-instance rewrite.
//
// One rule per configured instance now, because Portainer is the one service
// that can be configured more than once.
const PORTAINER_RULE_ID_BASE = 1;
const PORTAINER_MAX_RULES = 20;

/** Services whose base URL is stored as `<id>Url`, Portainer aside. */
const OTHER_SERVICE_IDS = [
    'sabnzbd', 'sonarr', 'radarr', 'tautulli', 'seerr',
    'unraid', 'prowlarr', 'wizarr', 'tracearr', 'plex'
];

/**
 * Origins belonging to services that are not Portainer.
 *
 * Used to refuse a rule that would reach one of them. Rewriting Origin turns
 * a privileged extension fetch into a CORS-checked request, so a rule that
 * matches another service's traffic does not degrade it - it stops it dead.
 * @param {Object} items - A `chrome.storage.sync` snapshot.
 * @returns {Set<string>}
 */
function collectOtherServiceOrigins(items) {
    const origins = new Set();
    for (const id of OTHER_SERVICE_IDS) {
        const url = items[`${id}Url`];
        if (!url) continue;
        try {
            origins.add(new URL(url).origin);
        } catch {
            // A malformed stored URL cannot collide with anything.
        }
    }
    return origins;
}

/**
 * Collects the configured Portainer origins, newest storage layout first.
 * @param {Object} items - A `chrome.storage.sync` snapshot.
 * @returns {string[]} Unique origins, at most PORTAINER_MAX_RULES of them.
 */
function collectPortainerOrigins(items) {
    const raw = [];

    if (Array.isArray(items.portainerInstances)) {
        for (const instance of items.portainerInstances) {
            if (instance && instance.url) raw.push(instance.url);
        }
    }
    // Pre-4.0 single-instance layout, for a profile that has not opened
    // Options since the upgrade and so has not been migrated yet.
    if (raw.length === 0 && items.portainerUrl) {
        raw.push(items.portainerUrl);
    }

    const shared = collectOtherServiceOrigins(items);
    const origins = [];
    for (const candidate of raw) {
        let origin;
        try {
            origin = new URL(candidate).origin;
        } catch {
            console.warn("Skipping unparseable Portainer URL:", candidate);
            continue;
        }
        // Another service answers on this origin. Sonarr, Radarr, Prowlarr and
        // Tautulli all serve under /api/ as well, so even the path-scoped rule
        // below could catch their traffic on a path-routed reverse proxy. No
        // rule is safe on a shared origin, so none is written.
        if (shared.has(origin)) {
            console.warn(
                `Not setting Portainer headers for ${origin}: another configured ` +
                `service uses the same origin, and the rule would break it.`
            );
            continue;
        }
        if (!origins.includes(origin)) origins.push(origin);
        if (origins.length >= PORTAINER_MAX_RULES) break;
    }
    return origins;
}

async function updatePortainerRules() {
    const items = await chrome.storage.sync.get(['portainerInstances', 'portainerUrl']);
    const origins = collectPortainerOrigins(items);

    // Always clear the whole block. Removing only the ids we are about to add
    // would leave the rules of a deleted instance in place.
    const removeRuleIds = Array.from(
        { length: PORTAINER_MAX_RULES },
        (_, i) => PORTAINER_RULE_ID_BASE + i
    );

    const addRules = origins.map((origin, i) => ({
        id: PORTAINER_RULE_ID_BASE + i,
        priority: 1,
        action: {
            type: "modifyHeaders",
            requestHeaders: [
                { header: "Origin", operation: "set", value: origin },
                { header: "Referer", operation: "set", value: origin + "/" }
            ]
        },
        condition: {
            // `|` anchors to the start of the URL. The path matters as much as
            // the origin: every Portainer call in services/portainer.js goes
            // through one helper, `${baseUrl}/api${endpoint}`, so /api/ is
            // exactly the traffic that needs the rewritten header.
            //
            // Anchoring on the origin alone matched every path on the host,
            // which broke an Unraid server reachable at the same domain — its
            // /graphql requests had their Origin rewritten, and that is enough
            // to push an extension fetch out of the privileged path and into a
            // CORS check the server has no reason to satisfy.
            urlFilter: `|${origin}/api/`,
            resourceTypes: ["xmlhttprequest"]
        }
    }));

    try {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
    } catch (e) {
        // Reached when host permissions for the instance have not been
        // granted yet. Portainer will answer 403 until they are; the rules
        // are rebuilt on the next storage change, which is what granting
        // them produces.
        console.error("Portainer rule update failed:", e.message);
    }
}

// Initial update
chrome.runtime.onStartup.addListener(updatePortainerRules);
chrome.runtime.onInstalled.addListener(updatePortainerRules);

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'sync') return;
    if (changes.portainerInstances || changes.portainerUrl) {
        updatePortainerRules();
    }
});

// Allow popup to force update rules
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'UPDATE_PORTAINER_RULES') {
        updatePortainerRules().then(() => {
            sendResponse({ success: true });
        });
        return true; // Keep channel open for async response
    }
});
