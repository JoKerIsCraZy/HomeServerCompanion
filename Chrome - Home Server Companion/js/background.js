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

    const origins = [];
    for (const candidate of raw) {
        let origin;
        try {
            origin = new URL(candidate).origin;
        } catch {
            console.warn("Skipping unparseable Portainer URL:", candidate);
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
            // `|` anchors to the start of the URL, so this matches the
            // instance's own origin and nothing else. The previous
            // `*://host/*` form relied on a substring match that a URL
            // carrying the host elsewhere — in a query string, say — could
            // also satisfy.
            urlFilter: `|${origin}/`,
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
