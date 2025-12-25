import * as Prowlarr from "../../services/prowlarr.js";

// --- PROWLARR UI LOGIC ---

export async function initProwlarr(url, apiKey, state) {


    const indexersContainer = document.getElementById("prowlarr-indexers");
    
    if (indexersContainer) {
         indexersContainer.replaceChildren();
         const loadingDiv = document.createElement('div');
         loadingDiv.className = 'loading-spinner';
         loadingDiv.style.cssText = 'padding: 20px; text-align: center; color: var(--text-secondary);';
         loadingDiv.textContent = 'Loading Prowlarr...';
         indexersContainer.appendChild(loadingDiv);
    } else {
        console.error("Critical: prowlarr-indexers container not found!");
        return;
    }

    // Initialize Search UI immediately (listeners & state restore)
    initProwlarrSearch(url, apiKey);

    // Initial Load
    await loadProwlarrData(url, apiKey);

    state.refreshInterval = setInterval(() => {
        loadProwlarrData(url, apiKey);
    }, 60000);
}

const loadProwlarrData = async (url, apiKey) => {
    const errorMsg = document.getElementById("error-msg");
    if (errorMsg) errorMsg.classList.add("hidden");

    // 1. CACHE CHECK (Stale-while-revalidate)
    const CACHE_KEY = "prowlarr_cache";
    const cachedData = localStorage.getItem(CACHE_KEY);
    
    if (cachedData) {
        try {
            const parsed = JSON.parse(cachedData);
            // Render cached data properly
            // Old cache might not have statuses
            const cachedStatuses = parsed.statuses || []; 
            renderIndexers(parsed.indexers, cachedStatuses);
            renderStats(parsed.stats, parsed.indexers);
        } catch (e) {
            console.warn("Invalid Prowlarr cache", e);
        }
    }

    try {
        // 2. NETWORK FETCH
        // Parallel Fetch
        const [indexers, stats, statuses] = await Promise.all([
            Prowlarr.getProwlarrIndexers(url, apiKey),
            Prowlarr.getProwlarrStats(url, apiKey),
            Prowlarr.getProwlarrIndexerStatuses(url, apiKey)
        ]);

        // 3. UPDATE UI
        renderIndexers(indexers, statuses);
        renderStats(stats, indexers);

        // 4. UPDATE CACHE
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            indexers: indexers,
            stats: stats,
            statuses: statuses
        }));

    } catch (error) {
        console.error("Prowlarr Load Error:", error);
        if (errorMsg) {
            errorMsg.textContent = `Prowlarr Error: ${error.message}`;
            errorMsg.classList.remove("hidden");
        }
        
        // Show error only if we have NO cache (otherwise old data is better than error)
        if (!cachedData) {
             const container = document.getElementById("prowlarr-indexers");
             if (container) {
                 container.replaceChildren();
                 const errDiv = document.createElement('div');
                 errDiv.className = 'error-state';
                 errDiv.textContent = `Failed to load: ${error.message}`;
                 container.appendChild(errDiv);
             }
        }
    }
};

const renderIndexers = (indexers, statuses = []) => {
    const container = document.getElementById("prowlarr-indexers");
    if (!container) return;
    
    container.replaceChildren();

    if (!Array.isArray(indexers)) {
        console.error("Prowlarr Indexers is not an array:", indexers);
        const errDiv = document.createElement('div');
        errDiv.className = 'error-state';
        errDiv.textContent = 'Invalid data received';
        container.replaceChildren(errDiv);
        return;
    }

    if (indexers.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.style.cssText = 'padding: 20px; text-align: center; color: #888;';
        emptyDiv.textContent = 'No indexers found.';
        container.replaceChildren(emptyDiv);
        return;
    }

    const template = document.getElementById("prowlarr-indexer-card");
    if (!template) {
        console.error("Template #prowlarr-indexer-card not found");
        return;
    }

    // Sort by priority or name? Let's sort by name
    indexers.sort((a, b) => a.name.localeCompare(b.name));

    indexers.forEach(indexer => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector(".card");

        // Name & Icon
        const nameEl = card.querySelector(".indexer-name");
        nameEl.textContent = indexer.name;
        
        const iconEl = card.querySelector(".indexer-icon");
        // Try to get domain for favicon
        let domain = "";
        try {
            // Priority: indexerUrl -> url -> definitionUrl -> fields
            let rawUrl = indexer.indexerUrl || indexer.url || indexer.definitionUrl;
            
            // Sometimes URL is hidden in fields
            if (!rawUrl && Array.isArray(indexer.fields)) {
                const urlField = indexer.fields.find(f => f.name === "baseUrl" || f.name === "base_url");
                if (urlField) rawUrl = urlField.value;
            }

            if (rawUrl) {
                const urlObj = new URL(rawUrl);
                domain = urlObj.hostname;
                
                // Set Link
                nameEl.href = rawUrl;
                nameEl.title = `Go to ${domain}`;
                nameEl.style.cursor = "pointer";
                nameEl.onmouseover = () => { nameEl.style.textDecoration = "underline"; };
                nameEl.onmouseout = () => { nameEl.style.textDecoration = "none"; };
            } else {
                 // If no URL, disable link look
                 nameEl.removeAttribute("href");
                 nameEl.style.cursor = "default";
            }
        } catch (e) {
            // silent fail
        }

        if (domain) {
            // Use Google's service (reliable)
            iconEl.src = `https://favicone.com/${domain}?s=32`;
            iconEl.style.display = "block";
            iconEl.onerror = () => { iconEl.style.display = "none"; }; 
        } else {
            iconEl.style.display = "none";
        }

        // --- Status Logic (Badge Only) ---
        const isEnabled = (indexer.enable !== undefined ? indexer.enable : true);
        const indexerStatus = statuses.find(s => s.indexerId === indexer.id);
        const disabledTillDate = (indexerStatus && indexerStatus.disabledTill) ? new Date(indexerStatus.disabledTill) : null;
        const isTemporarilyDisabled = disabledTillDate && disabledTillDate > new Date();

        // Right Side Grouping (Countdown + Badge)
        const header = card.querySelector(".card-header");
        const badge = card.querySelector(".indexer-status-badge");
        
        const rightGroup = document.createElement("div");
        rightGroup.style.display = "flex";
        rightGroup.style.alignItems = "center";
        rightGroup.style.gap = "8px";
        
        // Move badge into group
        if (badge && header) {
            header.insertBefore(rightGroup, badge);
            rightGroup.appendChild(badge);
        }

        // Status Badge Content & Countdown
        if (isTemporarilyDisabled) {
            badge.textContent = "UNAVAILABLE (FAILURE)"; // Explicit text
            badge.style.background = "#e74c3c"; // Red
            badge.title = `Unavailable until ${disabledTillDate.toLocaleString()}`;
            nameEl.style.opacity = "0.7";

            // Countdown
            const diffMs = disabledTillDate - new Date();
            const diffMins = Math.ceil(diffMs / (1000 * 60));
            let timeText = "";
            if (diffMins > 60) {
                const h = Math.floor(diffMins / 60);
                const m = diffMins % 60;
                timeText = `${h}h ${m}m`;
            } else {
                timeText = `${diffMins}m`;
            }

            const countdownEl = document.createElement("span");
            countdownEl.textContent = timeText;
            countdownEl.style.cssText = "font-size: 11px; font-weight: bold; color: #e74c3c; background: rgba(231, 76, 60, 0.1); padding: 2px 6px; border-radius: 4px;";
            countdownEl.title = "Time remaining until retry";
            
            // Insert left of badge
            rightGroup.insertBefore(countdownEl, badge);

        } else if (!isEnabled) {
            badge.textContent = "DISABLED";
            badge.style.background = "#7f8c8d"; // Gray
            nameEl.style.opacity = "0.5";
        } else {
            badge.textContent = "ENABLED";
            badge.style.background = "#4caf50"; // Green
            nameEl.style.opacity = "1";
        }

        // Details
        let protocol = indexer.protocol || "Unknown";
        // Prowlarr sometimes returns 'implementation' or 'protocol'
        card.querySelector(".indexer-protocol").textContent = protocol;
        card.querySelector(".indexer-priority").textContent = `P: ${indexer.priority}`;

        // VIP Expiration Timer
        if (Array.isArray(indexer.fields)) {
            // Field names can vary: 'vipExpiration', 'expiration', 'cookie_expires'
            // We look for a field that contains "Expiration" in its name and looks like a date
            const expField = indexer.fields.find(f => 
                f.name && (f.name.toLowerCase().includes("expiration") || f.name.toLowerCase().includes("expires")) && f.value
            );

            if (expField) {
                const expDate = new Date(expField.value);
                if (!isNaN(expDate.getTime())) {
                    const now = new Date();
                    const diffTime = expDate - now;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    const timer = document.createElement("span");
                    timer.className = "indexer-vip-timer";
                    
                    if (diffDays > 0) {
                        timer.textContent = `VIP: ${diffDays}d`;
                        timer.title = `Expires: ${expDate.toLocaleDateString()}`;
                        if (diffDays <= 7) timer.classList.add("warning"); // Red/Orange if < 7 days
                    } else {
                        timer.textContent = "VIP Expired";
                        timer.classList.add("expired");
                    }
                    
                    // Add it to details row
                    card.querySelector(".card-details").appendChild(timer);
                }
            }
        }

        container.appendChild(card);
    });
};



const renderStats = (stats, indexers = []) => {
    const container = document.querySelector("#prowlarr-stats .stats-grid");
    if (!container) return; // Note: We might need to target the parent #prowlarr-stats if we want tables outside the grid
    
    // Clear the main container (we will rebuild grid + tables)
    const mainContainer = document.getElementById("prowlarr-stats");
    mainContainer.replaceChildren();
    const gridDiv = document.createElement('div');
    gridDiv.className = 'stats-grid';
    const tablesDiv = document.createElement('div');
    tablesDiv.id = 'prowlarr-stats-tables';
    mainContainer.appendChild(gridDiv);
    mainContainer.appendChild(tablesDiv);
    
    const grid = gridDiv;
    const tablesContainer = tablesDiv;

    // 1. Basic Counts from Indexer List
    let total = indexers.length;
    let available = indexers.filter(i => i.enable).length;
    let disabled = indexers.filter(i => !i.enable).length;
    
    // 2. Metrics from Stats API
    let totalQueries = 0;
    let totalGrabs = 0;
    let avgResp = 0;
    
    
    // Use 'hosts' for Accurate Totals (User feedback: 114k vs 7k)
    // The 'indexers' array only sums up stats per indexer, which might differ from global 'hosts' stats
    if (stats && Array.isArray(stats.hosts)) {
         totalQueries = stats.hosts.reduce((acc, curr) => acc + (curr.numberOfQueries || 0), 0);
         totalGrabs = stats.hosts.reduce((acc, curr) => acc + (curr.numberOfGrabs || 0), 0);
    } 
    // Fallback to indexers if hosts is missing
    else if (stats && Array.isArray(stats.indexers)) {
        totalQueries = stats.indexers.reduce((acc, curr) => acc + (curr.numberOfQueries || 0), 0);
        totalGrabs = stats.indexers.reduce((acc, curr) => acc + (curr.numberOfGrabs || 0), 0);
    }

    if (stats && Array.isArray(stats.indexers)) {
        // Calculate Global Average Response Time
        const activeIndexers = stats.indexers.filter(i => i.averageResponseTime > 0);
        if (activeIndexers.length > 0) {
            const sumResp = activeIndexers.reduce((acc, curr) => acc + curr.averageResponseTime, 0);
            avgResp = Math.round(sumResp / activeIndexers.length);
        }
    }

    // 3. Advanced Metrics
    let topClient = "N/A";
    if (stats && Array.isArray(stats.userAgents) && stats.userAgents.length > 0) {
        const sortedUA = stats.userAgents.sort((a, b) => b.numberOfQueries - a.numberOfQueries);
        if (sortedUA[0]) {
            topClient = `${sortedUA[0].userAgent} (${sortedUA[0].numberOfQueries.toLocaleString()})`;
        }
    }

    let topIndexer = "N/A";
    let bestGrabber = "N/A";
    if (stats && Array.isArray(stats.indexers) && stats.indexers.length > 0) {
        const sortedIdx = [...stats.indexers].sort((a, b) => b.numberOfQueries - a.numberOfQueries);
        if (sortedIdx[0]) {
            topIndexer = sortedIdx[0].indexerName;
        }

        const sortedGrabs = [...stats.indexers].sort((a, b) => b.numberOfGrabs - a.numberOfGrabs);
        if (sortedGrabs[0] && sortedGrabs[0].numberOfGrabs > 0) {
            bestGrabber = sortedGrabs[0].indexerName;
        }
    }

    // --- Render Cards ---
    const metrics = [
        { label: "Total Indexers", value: total },
        { label: "Available / Disabled", value: `${available} / ${disabled}` },
        { label: "Total Queries", value: totalQueries.toLocaleString() },
        { label: "Total Grabs", value: totalGrabs.toLocaleString() }, 
        { label: "Top Indexer (Queries)", value: topIndexer },
        { label: "Top Indexer (Grabs)", value: bestGrabber },
        { label: "Top Client", value: topClient },
        { label: "Avg Response", value: `${avgResp} ms` }
    ];

    metrics.forEach(metric => {
        const card = document.createElement("div");
        card.className = "stat-card";
        
        const valDiv = document.createElement("div");
        valDiv.className = "stat-value";
        if (typeof metric.value === 'string' && metric.value.length > 10) {
             valDiv.style.fontSize = "16px";
             valDiv.style.wordBreak = "break-word";
        }
        valDiv.textContent = metric.value;
        
        const labelDiv = document.createElement("div");
        labelDiv.className = "stat-label";
        labelDiv.textContent = metric.label;
        
        card.appendChild(valDiv);
        card.appendChild(labelDiv);
        grid.appendChild(card);
    });

    // --- Render Tables ---
    
    // Helper for table
    const createTable = (title, headers, rows) => {
        const wrapper = document.createElement("div");
        wrapper.className = "stats-table-wrapper";
        
        const h3 = document.createElement("h4");
        h3.textContent = title;
        h3.style.color = "var(--text-primary)";
        h3.style.marginBottom = "10px";
        h3.style.marginTop = "20px";
        h3.style.borderLeft = "3px solid #e66100";
        h3.style.paddingLeft = "10px";
        
        const table = document.createElement("table");
        table.className = "stats-table";
        
        // State for sorting
        let sortCol = -1;
        let sortAsc = false;
        
        // Header
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        
        headers.forEach((h, index) => {
             const th = document.createElement("th");
             th.textContent = h;
             th.style.cursor = "pointer"; // Indicate clickable
             th.title = "Click to sort";
             
             // Sort Logic
             th.addEventListener("click", () => {
                 // Toggle direction if clicking same column, otherwise default to Descending (usually better for stats)
                 if (sortCol === index) {
                     sortAsc = !sortAsc;
                 } else {
                     sortCol = index;
                     sortAsc = false; // Default to Descending for high numbers
                 }
                 
                 // Sort Rows
                 rows.sort((a, b) => {
                     let valA = a[index];
                     let valB = b[index];
                     
                     // Clean numeric strings: "1,234" -> 1234, "1.234" -> 1234 (DE), "50 ms" -> 50, "-" -> 0
                     const parseVal = (v) => {
                        if (v === "-" || v === "N/A") return -1;
                        if (typeof v === 'string') {
                            // Remove dots AND commas to handle 1.000 (DE) vs 1,000 (EN)
                            // Also remove " ms" unit
                            // We assume integer statistics here (Queries, Grabs, Time)
                            let clean = v.replace(/[.,]/g, "").replace(" ms", "");
                            let num = parseFloat(clean);
                            return isNaN(num) ? v.toLowerCase() : num;
                        }
                        return v;
                     };
                     
                     let pA = parseVal(valA);
                     let pB = parseVal(valB);
                     
                     if (pA < pB) return sortAsc ? -1 : 1;
                     if (pA > pB) return sortAsc ? 1 : -1;
                     return 0;
                 });
                 
                 // Re-render Body
                 renderBody();
                 updateHeaderIcons();
             });
             
             headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Body
        const tbody = document.createElement("tbody");
        
        const renderBody = () => {
            tbody.replaceChildren();
            rows.forEach(row => {
                const tr = document.createElement("tr");
                row.forEach(cell => {
                    const td = document.createElement("td");
                    td.textContent = cell;
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
        };
        
        const updateHeaderIcons = () => {
            const ths = headerRow.querySelectorAll("th");
            ths.forEach((th, idx) => {
                th.textContent = headers[idx]; // Reset text
                if (idx === sortCol) {
                    th.textContent += sortAsc ? " ▲" : " ▼";
                }
            });
        };

        renderBody();
        table.appendChild(tbody);
        
        wrapper.appendChild(h3);
        wrapper.appendChild(table);
        return wrapper;
    };

    // 1. Indexers Breakdown
    if (stats && Array.isArray(stats.indexers)) {
        const sortedIndexers = [...stats.indexers].sort((a, b) => b.numberOfQueries - a.numberOfQueries);
        const headers = ["Indexer", "Queries", "RSS", "Grabs", "Time", "Fail"];
        const rows = sortedIndexers.map(idx => {
            const fails = (idx.numberOfFailedQueries || 0) + (idx.numberOfFailedGrabs || 0);
            return [
                idx.indexerName,
                idx.numberOfQueries.toLocaleString(),
                (idx.numberOfRssQueries || 0).toLocaleString(),
                idx.numberOfGrabs.toLocaleString(),
                `${idx.averageResponseTime} ms`,
                fails > 0 ? `${fails}` : "-"
            ];
        });
        tablesContainer.appendChild(createTable("Indexer Performance", headers, rows));
    }

    // 2. Clients Breakdown
    if (stats && Array.isArray(stats.userAgents)) {
        const sortedClients = [...stats.userAgents].sort((a, b) => b.numberOfQueries - a.numberOfQueries);
        const headers = ["Client (User Agent)", "Queries", "Grabs"];
        const rows = sortedClients.map(ua => [
            ua.userAgent,
            ua.numberOfQueries.toLocaleString(),
            ua.numberOfGrabs.toLocaleString()
        ]);
        tablesContainer.appendChild(createTable("Client Activity", headers, rows));
    }
};

async function initProwlarrSearch(url, apiKey) {
    const searchBtn = document.getElementById("prowlarr-search-btn");
    const searchInput = document.getElementById("prowlarr-search-input");
    const categorySelect = document.getElementById("prowlarr-search-category");
    const indexerTrigger = document.getElementById("indexer-dropdown-trigger");
    const indexerOptions = document.getElementById("indexer-dropdown-options");

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
        if (indexerTrigger && indexerOptions && !indexerTrigger.contains(e.target) && !indexerOptions.contains(e.target)) {
            indexerOptions.classList.add("hidden");
        }
    });

    if (indexerTrigger) {
        indexerTrigger.onclick = () => indexerOptions.classList.toggle("hidden");
    }

    // Keep Last Search Logic variables
    const keepSearchCheckbox = document.getElementById("prowlarr-keep-search");
    const STORAGE_KEY_STATE = "prowlarr_search_state";
    const SEARCH_ENABLED_KEY = "prowlarr_keep_search_enabled";

    // Helper to save state (Defined early for listeners)
    const saveSearchState = (resultsOverride = null) => {
        if (!keepSearchCheckbox || !keepSearchCheckbox.checked) return;
        
        const currentQuery = searchInput ? searchInput.value : "";
        const currentCategory = categorySelect ? categorySelect.value : "";
        let currentIndexerIds = null;
        
        if (document.getElementById("idx-all") && !document.getElementById("idx-all").checked) {
             const checked = Array.from(document.querySelectorAll("#indexer-dropdown-options .indexer-checkbox:checked"));
             if (checked.length > 0) currentIndexerIds = checked.map(cb => cb.value);
        }

        // Check if we can preserve existing results
        let resultsToSave = resultsOverride;
        if (!resultsToSave) {
            try {
                const oldStateStr = localStorage.getItem(STORAGE_KEY_STATE);
                if (oldStateStr) {
                    const oldState = JSON.parse(oldStateStr);
                    // If parameters match, keep the old results
                    const idxMatch = JSON.stringify(oldState.indexerIds) === JSON.stringify(currentIndexerIds);
                    if (oldState.query === currentQuery && oldState.category === currentCategory && idxMatch) {
                        resultsToSave = oldState.results;
                    }
                }
            } catch(e) {}
        }

        const state = {
            query: currentQuery,
            category: currentCategory,
            indexerIds: currentIndexerIds,
            timestamp: Date.now(),
            results: resultsToSave
        };
        localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state));
    };

    // Restore Checkbox State Immediately & Reliably
    if (keepSearchCheckbox) {
        // Load checkbox state preference
        const keepEnabled = localStorage.getItem(SEARCH_ENABLED_KEY) === "true";
        keepSearchCheckbox.checked = keepEnabled;

        keepSearchCheckbox.onchange = () => {
             // Force boolean conversion for storage
             const isChecked = keepSearchCheckbox.checked;
             localStorage.setItem(SEARCH_ENABLED_KEY, String(isChecked));
             
             if (!isChecked) {
                localStorage.removeItem(STORAGE_KEY_STATE);
             } else {
                saveSearchState();
             }
        };
    }
    
    // Toggle Checkbox Visibility based on Tab
    const toggleSearchCheckbox = () => {
        const searchTabBtn = document.querySelector('#prowlarr-view .tab-btn[data-tab="search"]');
        const checkboxContainer = document.querySelector('.keep-search-container');
        if (searchTabBtn && checkboxContainer) {
            if (searchTabBtn.classList.contains("active")) {
                checkboxContainer.style.display = "flex";
            } else {
                checkboxContainer.style.display = "none";
            }
        }
    };
    
    // Initial check (force visible if active)
    requestAnimationFrame(toggleSearchCheckbox);

    // Listen to tab clicks
    const tabBtns = document.querySelectorAll('#prowlarr-view .tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
             // Use setTimeout to allow class update
            setTimeout(toggleSearchCheckbox, 50); 
        });
    });

    // Populate Categories (Cache for 1 day)
    if (categorySelect) {
        let categories = [];
        const CACHE_KEY = "prowlarr_categories";
        const cached = localStorage.getItem(CACHE_KEY);
        
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp < 86400000) categories = parsed.data;
            } catch(e) {}
        }
        
        if (categories.length === 0) {
            try {
                categories = await Prowlarr.getProwlarrCategories(url, apiKey);
                localStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    data: categories
                }));
            } catch (e) {
                console.warn("Failed to fetch categories", e);
            }
        }
        
        if (categories.length > 0) {
             categorySelect.replaceChildren();
             const defaultOpt = document.createElement('option');
             defaultOpt.value = '';
             defaultOpt.textContent = 'All Categories';
             categorySelect.appendChild(defaultOpt);
             categories.sort((a,b) => (a.name || "").localeCompare(b.name || ""));
             categories.forEach(cat => {
                 const opt = document.createElement("option");
                 opt.value = cat.id;
                 opt.textContent = cat.name;
                 categorySelect.appendChild(opt);
             });
        }
    }
    
    // Populate Indexers (from main Prowlarr cache)
    if (indexerOptions) {
        const CACHE_KEY_INDEXERS = "prowlarr_cache";
        const cachedIndexers = localStorage.getItem(CACHE_KEY_INDEXERS);
        if (cachedIndexers) {
             try {
                 const parsed = JSON.parse(cachedIndexers);
                 const indexers = parsed.indexers || [];
                 if (indexers.length > 0) {
                     indexerOptions.replaceChildren();
                     
                     // "All" Option - built with DOM API
                     const allDiv = document.createElement("div");
                     allDiv.className = "dropdown-item";
                     const allCheckbox = document.createElement('input');
                     allCheckbox.type = 'checkbox';
                     allCheckbox.checked = true;
                     const allLabel = document.createElement('label');
                     allLabel.textContent = 'All Indexers';
                     allDiv.appendChild(allCheckbox);
                     allDiv.appendChild(document.createTextNode(' '));
                     allDiv.appendChild(allLabel);
                     indexerOptions.appendChild(allDiv);
                     
                     indexers.sort((a,b) => a.name.localeCompare(b.name));
                     
                     indexers.forEach(idx => {
                         const div = document.createElement("div");
                         div.className = "dropdown-item";
                         // XSS FIX: Use DOM API instead of innerHTML
                         const checkbox = document.createElement('input');
                         checkbox.type = 'checkbox';
                         checkbox.value = idx.id;
                         checkbox.className = 'indexer-checkbox';
                         const label = document.createElement('label');
                         label.textContent = idx.name;
                         div.appendChild(checkbox);
                         div.appendChild(document.createTextNode(' '));
                         div.appendChild(label);
                         div.onclick = (e) => {
                             if (e.target.tagName !== 'INPUT') {
                                 const cb = div.querySelector('input');
                                 cb.checked = !cb.checked;
                                 // manually trigger change event if needed, or just call update logic
                                 updateIndexerSelection();
                             } else {
                                 updateIndexerSelection();
                             }
                         };
                         indexerOptions.appendChild(div);
                     });
                     
                     allDiv.onclick = (e) => {
                         if (e.target.tagName !== 'INPUT') {
                             allCheckbox.checked = !allCheckbox.checked;
                         }
                         
                         const otherCbs = indexerOptions.querySelectorAll(".indexer-checkbox");
                         if (allCheckbox.checked) {
                              otherCbs.forEach(cb => cb.checked = false);
                         }
                         updateIndexerTriggerText();
                     };
                     
                     // Add event listener to individual checkboxes to uncheck "All"
                     const otherCbs = indexerOptions.querySelectorAll(".indexer-checkbox");
                     otherCbs.forEach(cb => {
                         cb.addEventListener("change", () => {
                             if (cb.checked) allCheckbox.checked = false;
                             updateIndexerSelection();
                         });
                     });
                     
                     function updateIndexerSelection() {
                         const checked = Array.from(indexerOptions.querySelectorAll(".indexer-checkbox:checked"));
                         if (checked.length === 0) {
                             allCheckbox.checked = true;
                         } else if (allCheckbox.checked && checked.length > 0) {
                              // If specific selected, uncheck All (already handled by event)
                              allCheckbox.checked = false; 
                         }
                         updateIndexerTriggerText();
                     }
                     
                     function updateIndexerTriggerText() {
                         const checked = Array.from(indexerOptions.querySelectorAll(".indexer-checkbox:checked"));
                         if (allCheckbox.checked || checked.length === 0) {
                             indexerTrigger.textContent = "All Indexers";
                         } else if (checked.length === 1) {
                             // Find name
                             const name = checked[0].parentElement.querySelector("label").textContent;
                             indexerTrigger.textContent = name;
                         } else {
                             indexerTrigger.textContent = `${checked.length} Indexers`;
                         }
                     }
                 }
             } catch (e) { console.warn("Indexers cache parse error", e); }
        }
    }
    
    // Restore Search Data if enabled and data exists (Post-load)
    if (keepSearchCheckbox && keepSearchCheckbox.checked) {
         // We do this check again here because Indexers/Categories might have just finished populating
         // Wait a moment for DOM to accept values
         setTimeout(() => {
            const savedState = localStorage.getItem(STORAGE_KEY_STATE);
            if (savedState) {
                try {
                    const state = JSON.parse(savedState);
                    if (state.query && searchInput) searchInput.value = state.query;
                    if (state.category && categorySelect) categorySelect.value = state.category;
                    
                    if (state.indexerIds && indexerOptions) {
                        // Restore checkboxes
                        const checkboxes = indexerOptions.querySelectorAll(".indexer-checkbox");
                        let allChecked = true;
                        checkboxes.forEach(cb => {
                            if (state.indexerIds.includes(cb.value)) {
                                cb.checked = true;
                            } else {
                                cb.checked = false;
                                allChecked = false;
                            }
                        });
                        
                        const allCb = document.getElementById("idx-all");
                        if (state.indexerIds && state.indexerIds.length > 0) {
                             if (allCb) allCb.checked = false;
                             if (indexerTrigger) {
                                 const count = state.indexerIds.length;
                                 indexerTrigger.textContent = count === 1 ? "1 Indexer" : `${count} Indexers`;
                             }
                        }
                    }
                    
                    // Restore results or trigger search
                    if (state.results && Array.isArray(state.results) && state.results.length > 0) {
                        // Use cached results
                        renderSearchResults(state.results);
                    } else if (state.query) {
                        // Fallback to fetch
                        setTimeout(() => executeSearch(url, apiKey, saveSearchState), 200);
                    }
                } catch (e) { console.warn("Failed to restore search state", e); }
            }
         }, 500); // 500ms delay to ensure categories/indexers populated
    }
    
    // Clear Button Logic
    const clearBtn = document.getElementById("prowlarr-search-clear");
    
    const updateClearBtn = () => {
        if (!clearBtn) return;
        const hasInput = searchInput && searchInput.value.trim() !== "";
        const hasResults = document.getElementById("prowlarr-search-results").children.length > 0;
        // Show if input exists OR if we have results (meaning a search was done)
        clearBtn.style.display = (hasInput || hasResults) ? "flex" : "none";
    };

    if (clearBtn) {
        clearBtn.onclick = () => {
            // Clear Input
            if (searchInput) {
                searchInput.value = "";
                searchInput.focus();
            }
            
            // Clear Results
            const resultsContainer = document.getElementById("prowlarr-search-results");
            if (resultsContainer) resultsContainer.replaceChildren();
            
            // Clear LocalStorage State
            localStorage.removeItem(STORAGE_KEY_STATE);
            
            // Hide Button
            updateClearBtn();
        };
    }
    
    // Add Reactive Listeners
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            saveSearchState();
            updateClearBtn();
        });
    }
    if (categorySelect) categorySelect.addEventListener("change", saveSearchState);
    if (indexerOptions) {
        // Use delegation for dynamic checkboxes
        indexerOptions.addEventListener("change", saveSearchState);
    }
    
    if (searchBtn) {
        searchBtn.onclick = async () => {
            await executeSearch(url, apiKey, saveSearchState);
            updateClearBtn();
        };
    }
    if (searchInput) {
        searchInput.onkeydown = async (e) => {
            if (e.key === "Enter") {
                await executeSearch(url, apiKey, saveSearchState);
                updateClearBtn();
            }
        };
    }
    
    // Check initial visibility after potential restore
    setTimeout(updateClearBtn, 600);
}

async function executeSearch(url, apiKey, saveCallback) {
    const input = document.getElementById("prowlarr-search-input");
    const categorySelect = document.getElementById("prowlarr-search-category");
    const container = document.getElementById("prowlarr-search-results");
    
    if (!input || !container) return;
    
    const query = input.value.trim();
    if (!query) return;

    const category = categorySelect ? categorySelect.value : null;
    
    // Gather Indexer IDs
    let indexerIds = null;
    const allCheckbox = document.getElementById("idx-all");
    if (allCheckbox && !allCheckbox.checked) {
        const checked = Array.from(document.querySelectorAll("#indexer-dropdown-options .indexer-checkbox:checked"));
        if (checked.length > 0) {
            indexerIds = checked.map(cb => cb.value);
        }
    }

    container.replaceChildren();
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-spinner';
    loadingDiv.style.cssText = 'padding: 20px; text-align: center; color: var(--text-secondary);';
    loadingDiv.textContent = 'Searching...';
    container.appendChild(loadingDiv);
    
    try {
        // Define Checkbox inside this scope
        const keepSearchCheckbox = document.getElementById("prowlarr-keep-search");
        
        // Save State if enabled
        if (keepSearchCheckbox && keepSearchCheckbox.checked) {
            // Wait for results
        }

        const results = await Prowlarr.searchProwlarr(url, apiKey, query, category, indexerIds);
        
        // Save State (with results) if enabled
        if (keepSearchCheckbox && keepSearchCheckbox.checked && typeof saveCallback === 'function') {
             saveCallback(results);
        }

        renderSearchResults(results);
    } catch (e) {
        container.replaceChildren();
        const errDiv = document.createElement('div');
        errDiv.className = 'error-state';
        errDiv.style.cssText = 'padding: 20px; text-align: center; color: #e74c3c;';
        errDiv.textContent = `Search failed: ${e.message}`;
        container.appendChild(errDiv);
    }
}

function renderSearchResults(results) {
    const container = document.getElementById("prowlarr-search-results");
    if (!container) return;
    
    container.replaceChildren();
    
    if (!Array.isArray(results) || results.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.style.cssText = 'padding: 20px; text-align: center; color: var(--text-secondary);';
        emptyDiv.textContent = 'No results found.';
        container.appendChild(emptyDiv);
        return;
    }

    const template = document.getElementById("prowlarr-search-card");
    if (!template) return;

    results.forEach(res => {
        const clone = template.content.cloneNode(true);
        const card = clone.querySelector(".card");

        // Title
        // Title
        const titleEl = card.querySelector(".result-title");
        
        if (res.infoUrl || (res.guid && res.guid.startsWith("http"))) {
            const link = res.infoUrl || res.guid;
            
            // XSS FIX: Use DOM API instead of innerHTML
            const a = document.createElement('a');
            a.href = link;
            a.target = '_blank';
            a.style.cssText = 'color: inherit; text-decoration: none; transition: color 0.2s;';
            a.textContent = res.title; // Safe: textContent escapes HTML
            
            a.onmouseover = () => a.style.color = "var(--accent-prowlarr)";
            a.onmouseout = () => a.style.color = "inherit";
            
            titleEl.textContent = ''; // Clear existing
            titleEl.appendChild(a);
            titleEl.onclick = null;
            titleEl.style.cursor = "default"; // Let the anchor handle it
        } else {
            titleEl.textContent = res.title;
        }

        // Details
        card.querySelector(".result-indexer").textContent = res.indexer || "Unknown";
        
        // Category
        const catEl = card.querySelector(".result-category");
        let catText = "";
        
        if (Array.isArray(res.categories)) {
            catText = res.categories.map(c => c.name).filter(n => n && n.trim() !== "").map(n => n.replace(/\//g, " / ")).join(" / ");
        } else if (res.category) {
             // Sometimes it's a single object or string
             catText = (typeof res.category === 'object') ? res.category.name : res.category;
        } else if (res.categoryDesc) {
             catText = res.categoryDesc;
        }
        
        if (catText) {
            catEl.textContent = catText;
            catEl.style.display = "inline-block";
        } else {
            catEl.style.display = "none";
        }

        card.querySelector(".result-size").textContent = formatSize(res.size);
        card.querySelector(".result-age").textContent = formatAge(res.publishDate || res.age); // Prowlarr might return age or publishDate

        // Torrent specific
        if (res.seeders !== undefined || res.leechers !== undefined) {
             const torrentStats = card.querySelector(".is-torrent");
             torrentStats.classList.remove("hidden");
             card.querySelector(".peers").textContent = `S: ${res.seeders}`;
             // Finding the Leechers span (it's the second span in that group typically)
             const torrentSpans = torrentStats.querySelectorAll("span");
             const leechSpan = torrentStats.querySelector("span[style*='f44336']"); 
             if (leechSpan) leechSpan.textContent = `L: ${res.leechers}`;
        }
        
        // Actions
        const dlBtn = card.querySelector(".download-btn");
        if (res.downloadUrl) {
            dlBtn.href = res.downloadUrl;
        } else {
            dlBtn.style.display = "none";
        }
        
        container.appendChild(card);
    });
}

// Helper Functions
const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatAge = (dateStr) => {
    if (!dateStr) return "-";
    // If it's just a number (age in hours/days?), treat as such. Prowlarr returns age (int) in 'age' field
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        // Maybe it's an integer 'age' (often minutes in Arr apps)
        if (typeof dateStr === 'number') {
             const days = Math.floor(dateStr / 1440); // 24*60
             return days + "d";
        }
        return "?";
    }
    
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days < 1) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        return hours + "h";
    }
    return days + "d";
};

