import * as Prowlarr from "../../services/prowlarr.js";

// --- PROWLARR UI LOGIC ---

export async function initProwlarr(url, apiKey, state) {


    const indexersContainer = document.getElementById("prowlarr-indexers");
    
    if (indexersContainer) {
         indexersContainer.innerHTML = '<div class="loading-spinner" style="padding: 20px; text-align: center; color: var(--text-secondary);">Loading Prowlarr...</div>';
    } else {
        console.error("Critical: prowlarr-indexers container not found!");
        return;
    }

    // Initial Load
    await loadProwlarrData(url, apiKey);

    // Setup Refresh Interval (e.g. every 60 seconds)
    if (state.refreshInterval) clearInterval(state.refreshInterval);
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
                 container.innerHTML = `<div class="error-state"></div>`;
                 container.querySelector('.error-state').textContent = `Failed to load: ${error.message}`;
             }
        }
    }
};

const renderIndexers = (indexers, statuses = []) => {
    const container = document.getElementById("prowlarr-indexers");
    if (!container) return;
    
    container.innerHTML = "";

    if (!Array.isArray(indexers)) {
        console.error("Prowlarr Indexers is not an array:", indexers);
        container.innerHTML = '<div class="error-state">Invalid data received</div>';
        return;
    }

    if (indexers.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px; text-align: center; color: #888;">No indexers found.</div>';
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
    mainContainer.innerHTML = '<div class="stats-grid"></div><div id="prowlarr-stats-tables"></div>';
    
    const grid = mainContainer.querySelector(".stats-grid");
    const tablesContainer = mainContainer.querySelector("#prowlarr-stats-tables");

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
            tbody.innerHTML = "";
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
