// Background Script

// Initialize Context Menu
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "search-hsc",
        title: "Search in Home Server Companion",
        contexts: ["selection"]
    });
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
const PORTAINER_RULE_ID = 1;

async function updatePortainerRules() {
    // Check both sync and local storage
    const syncItems = await chrome.storage.sync.get(['portainerUrl']);
    const localItems = await chrome.storage.local.get(['portainerUrl']);
    const url = syncItems.portainerUrl || localItems.portainerUrl;

    if (!url) {
        // Remove rule if no URL
        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [PORTAINER_RULE_ID]
        });
        return;
    }

    try {
        const urlObj = new URL(url);
        const origin = urlObj.origin;

        // Extract host and port for urlFilter
        // Format: ||host:port/* matches all paths on this host
        const hostWithPort = urlObj.host; // includes port if specified
        const urlFilter = `*://${hostWithPort}/*`;

        console.log("Setting Portainer Rule for:", urlFilter, "with Origin:", origin);

        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [PORTAINER_RULE_ID],
            addRules: [{
                id: PORTAINER_RULE_ID,
                priority: 1,
                action: {
                    type: "modifyHeaders",
                    requestHeaders: [
                        { header: "Origin", operation: "set", value: origin },
                        { header: "Referer", operation: "set", value: origin + "/" }
                    ]
                },
                condition: {
                    urlFilter: urlFilter,
                    resourceTypes: ["xmlhttprequest"]
                }
            }]
        }, () => {
            if (chrome.runtime.lastError) {
                console.error("Rule update failed:", chrome.runtime.lastError);
            } else {
                console.log("Portainer rules updated successfully for:", origin);
            }
        });
    } catch (e) {
        console.error("Invalid Portainer URL for rules:", e);
    }
}

// Initial update
chrome.runtime.onStartup.addListener(updatePortainerRules);
chrome.runtime.onInstalled.addListener(updatePortainerRules);

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.portainerUrl) {
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
