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
