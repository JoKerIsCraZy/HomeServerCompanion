import * as Radarr from "../../services/radarr.js";
import { formatSize } from "../../services/utils.js";

export async function initRadarr(url, key, state) {
    try {
        // Calendar
        const calendar = await Radarr.getRadarrCalendar(url, key);
        renderRadarrCalendar(calendar, state);

        // Load Queue
        const queue = await Radarr.getRadarrMovies(url, key);
        renderRadarrQueue(queue.records || [], state);

        // Initial Badge Update
        await updateRadarrBadge(url, key);

        // Load Recent (History)

        // Load Recent (History)
        const history = await Radarr.getRadarrHistory(url, key);
        renderRadarrRecent(history.records || [], state);
    } catch (e) {
        console.error("Radarr loading error", e);
        throw e;
    }
}




function renderRadarrCalendar(movies, state) {
    const container = document.getElementById("radarr-calendar");
    if (!container) return;
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

      // If date is invalid or past, defaulting to InCinemas or Today
      if (isNaN(dateObj.getTime())) dateObj = new Date();

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

      // Grid Container
      const grid = document.createElement("div");
      grid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; padding: 5px;";

      grouped[dateKey].forEach((movie) => {
        // Find Image
        let posterUrl = 'icons/icon48.png';
        if (movie.images) {
             const posterObj = movie.images.find(img => img.coverType.toLowerCase() === 'poster');
             if (posterObj) {
                if (posterObj.url) {
                     // Local URL (needs auth usually)
                     let baseUrl = state.configs.radarrUrl || "";
                     if(baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
                     
                     let imgPath = posterObj.url;
                     if(!imgPath.startsWith('http')) {
                         if (!imgPath.startsWith('/')) imgPath = '/' + imgPath;
                         posterUrl = `${baseUrl}${imgPath}`;
                         
                         const joinChar = posterUrl.includes('?') ? '&' : '?';
                         posterUrl += `${joinChar}apikey=${state.configs.radarrKey}`;
                     } else {
                         posterUrl = imgPath;
                     }
                } else if (posterObj.remoteUrl) {
                    // Remote URL (direct link)
                    posterUrl = posterObj.remoteUrl;
                }
            }
        }

        const card = document.createElement("div");
        card.style.cssText = "background: var(--card-bg); border-radius: 8px; overflow: hidden; position: relative; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: transform 0.2s;";
        card.onmouseover = () => card.style.transform = "translateY(-2px)";
        card.onmouseout = () => card.style.transform = "translateY(0)";

        // Poster
        const imgDiv = document.createElement("div");
        // Use aspect-ratio to keep poster shape (2:3 is standard)
        imgDiv.style.cssText = "width: 100%; aspect-ratio: 2/3; overflow: hidden;";
        const img = document.createElement("img");
        img.src = posterUrl;
        img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
        
        img.addEventListener('error', () => { 
            if (img.src !== 'icons/icon48.png') img.src = 'icons/icon48.png'; 
        });
        imgDiv.appendChild(img);

        // Overlay Info
        const infoDiv = document.createElement("div");
        // Stronger gradient for better readability
        infoDiv.style.cssText = "padding: 8px; position: absolute; bottom: 0; width: 100%; background: linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 50%, transparent 100%); color: white; text-shadow: 1px 1px 2px black;";

        const title = document.createElement("div");
        title.textContent = movie.title;
        title.style.cssText = "font-weight: bold; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
        
        const studio = document.createElement("div");
        studio.textContent = movie.studio || "";
        studio.style.cssText = "font-size: 0.75em; opacity: 0.8;";

        // Release Type Tag
        let releaseType = "Cinema";
        if (movie.digitalRelease && new Date(movie.digitalRelease).toDateString() === dateObj.toDateString()) releaseType = "Digital";
        else if (movie.physicalRelease && new Date(movie.physicalRelease).toDateString() === dateObj.toDateString()) releaseType = "Physical";
        
        const typeDiv = document.createElement("div");
        typeDiv.textContent = releaseType;
        typeDiv.style.cssText = "font-size: 0.7em; text-transform: uppercase; color: #ffeb3b; margin-top: 2px;";

        infoDiv.appendChild(title);
        infoDiv.appendChild(studio);
        infoDiv.appendChild(typeDiv);

        // Status Ribbon
        let statusColor = "#9e9e9e";
        if (movie.hasFile) statusColor = "#4caf50"; // Downloaded
        else if (movie.isAvailable) statusColor = "#2196f3"; // Available
        else statusColor = "#ff9800"; // Upcoming/Cinema

        const ribbon = document.createElement("div");
        ribbon.style.cssText = `position: absolute; top: 8px; right: 8px; width: 10px; height: 10px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 5px ${statusColor};`;
        ribbon.title = movie.hasFile ? "Downloaded" : (movie.isAvailable ? "Available" : "In Cinemas/Upcoming");

        card.appendChild(imgDiv);
        card.appendChild(infoDiv);
        card.appendChild(ribbon);

        // Click
        if (movie.titleSlug) {
          card.style.cursor = "pointer";
          card.addEventListener("click", (e) => {
            e.stopPropagation();
            const url = state.configs.radarrUrl;
            chrome.tabs.create({ url: `${url}/movie/${movie.titleSlug}` });
          });
        }
        
        grid.appendChild(card);
      });
      dateGroup.appendChild(grid);
      container.appendChild(dateGroup);
    });
}

function renderRadarrQueue(records, state) {
    const container = document.getElementById("radarr-queue");
    if (!container) return;
    container.innerHTML = "";

    // Helper to refresh queue
    const refreshQueue = async () => {
        const btn = container.querySelector('.refresh-btn');
        if(btn) {
             btn.textContent = "Loading...";
             btn.disabled = true;
        }
        try {
            const newQueue = await Radarr.getRadarrMovies(state.configs.radarrUrl, state.configs.radarrKey);
            await updateRadarrBadge(state.configs.radarrUrl, state.configs.radarrKey);
            renderRadarrQueue(newQueue.records || [], state);
        } catch(e) {
            if(btn) {
                btn.textContent = "Error";
                setTimeout(() => { 
                    btn.textContent = "↻ Refresh"; 
                    btn.disabled = false; 
                }, 2000);
            }
        }
    };

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = "display: flex; justify-content: flex-end; margin-bottom: 10px; padding: 0 5px;";
    const refreshBtn = document.createElement('button');
    refreshBtn.className = "refresh-btn";
    refreshBtn.textContent = "↻ Refresh";
    refreshBtn.style.cssText = "background: var(--card-bg); color: var(--text-primary); border: 1px solid var(--border-color); padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 0.9em;";
    refreshBtn.onclick = refreshQueue;
    toolbar.appendChild(refreshBtn);
    container.appendChild(toolbar);

    if (records.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.innerHTML = '<div class="card"><div class="card-header">Queue Empty</div></div>';
      container.appendChild(emptyMsg);
      return;
    }

    const tmpl = document.getElementById("sab-queue-item");
    if (!tmpl) return;

    records.forEach((item) => {
      const clone = tmpl.content.cloneNode(true);
      const itemEl = clone.firstElementChild; // Capture the actual element
      itemEl.querySelector(".filename").textContent = item.title;
      let percent = 0;
      if (item.size > 0) {
         percent = 100 - (item.sizeleft / item.size) * 100;
      }
      itemEl.querySelector(".percentage").textContent = `${Math.round(percent)}%`;
      itemEl.querySelector(".progress-bar-fill").style.width = `${percent}%`;
      itemEl.querySelector(".size").textContent = formatSize(item.sizeleft);
      const statusEl = itemEl.querySelector(".status");
      // Check for warning status
      const tStatus = (item.trackedDownloadStatus || '').toLowerCase();
      let isWarning = false;
      if (tStatus === 'warning' || tStatus === 'error') {
          isWarning = true;
          statusEl.textContent = item.statusMessages && item.statusMessages.length > 0 
              ? item.statusMessages[0].title // e.g. "Manual Import Needed"
              : "Attention Needed";
          statusEl.style.color = "#ff9800"; // Orange
          statusEl.style.fontWeight = "bold";
      } else {
          statusEl.textContent = item.status;
      }
      
      const delBtn = itemEl.querySelector(".delete-btn");
      if(delBtn) {
          // Standard Delete Button Logic (Menu)
          delBtn.style.display = "block";
          delBtn.innerHTML = "&times;"; // Standard X
          
          delBtn.onclick = (e) => {
              e.stopPropagation();
              
              if (delBtn.dataset.confirming === "true") return; 
              
              console.log("Debug: Queue Item to Delete", item); // DEBUG LOG

              // Create container for options
              const optionsDiv = document.createElement('div');
              optionsDiv.style.cssText = "display: flex; gap: 5px; margin-left: auto; align-items: center;";
              
              const btnRemove = document.createElement('button');
              btnRemove.textContent = "🗑️";
              btnRemove.title = "Remove from Client";
              btnRemove.style.cssText = "background: #f44336; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;";
              
              const btnBlock = document.createElement('button');
              btnBlock.textContent = "🚫🔎"; // Block & Search
              btnBlock.title = "Remove, Blocklist & Search";
              btnBlock.style.cssText = "background: #ff9800; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;";
              
              const cancel = document.createElement('button');
              cancel.innerHTML = "&times;";
              cancel.style.cssText = "background: #9e9e9e; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;";

              // Actions
              btnRemove.onclick = async (ev) => {
                  ev.stopPropagation();
                  if(!confirm("Remove from queue?")) return;
                  try {
                      await Radarr.deleteQueueItem(state.configs.radarrUrl, state.configs.radarrKey, item.id, true, false);
                      // In a real app we'd remove the element or reload. For now, hide/reload via UI refresh loop usually happens or user triggers it.
                      // Let's hide the row
                      itemEl.remove(); 
                      // The refresh interval will clean it up. We can just hide the buttons.
                      delBtn.style.display = 'block';
                      optionsDiv.remove();
                  } catch(e) { 
                      if (e.message.includes('404')) {
                          alert("Item not found (404). It may have been removed or the Radarr URL/Port is incorrect.");
                          itemEl.remove(); // Optimistically remove using element reference
                      } else {
                          alert("Error removing item: " + e.message); 
                      }
                  }
                  // Auto-refresh after 3 seconds
                  setTimeout(refreshQueue, 250);
              };

              btnBlock.onclick = async (ev) => {
                  ev.stopPropagation();
                  if(!confirm("Remove, Blocklist release and Search for new one?")) return;
                  try {
                    await Radarr.deleteQueueItem(state.configs.radarrUrl, state.configs.radarrKey, item.id, true, true);
                    delBtn.style.display = 'block';
                    optionsDiv.remove();
                  } catch(e) { 
                      if (e.message.includes('404')) {
                          alert("Item not found (404). check settings or web UI.");
                          itemEl.remove();
                      } else {
                          alert("Error blocking item: " + e.message); 
                      }
                  }
                  // Auto-refresh after 3 seconds
                  setTimeout(refreshQueue, 250);
              };

              cancel.onclick = (ev) => {
                  ev.stopPropagation();
                  delBtn.style.display = 'block';
                  delBtn.style.visibility = 'visible'; // Ensure visible
                  optionsDiv.remove();
              };
              
              optionsDiv.appendChild(btnRemove);
              optionsDiv.appendChild(btnBlock);
              optionsDiv.appendChild(cancel);
              
              delBtn.style.display = "none";
              delBtn.parentNode.insertBefore(optionsDiv, delBtn); 
          };

          // WARNING Extra Button
          if (isWarning) {
              const openBtn = document.createElement('button');
              openBtn.innerHTML = "&#x2197;"; // NE Arrow
              openBtn.title = "Open Activity Queue (Fix Issue)";
              // Add margin-right to separate from delete button
              openBtn.style.cssText = "background: none; border: none; color: #ff9800; cursor: pointer; font-size: 16px; margin-right: 8px;";
              openBtn.onclick = (e) => {
                  e.stopPropagation();
                  const cleanUrl = state.configs.radarrUrl.replace(/\/$/, '');
                  chrome.tabs.create({ url: `${cleanUrl}/activity/queue` });
              };
              // Insert BEFORE the delete button
              delBtn.parentNode.insertBefore(openBtn, delBtn);
          }
      }

      container.appendChild(clone);
    });
}

function renderRadarrRecent(records, state) {
    const container = document.getElementById("radarr-movies");
    if (!container) return;
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
    if (!tmpl) return;

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

async function updateRadarrBadge(url, key) {
    const radarrNavItem = document.querySelector('.nav-item[data-target="radarr"]');
    if (!radarrNavItem) return;

    let badge = radarrNavItem.querySelector('.nav-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'nav-badge hidden';
        radarrNavItem.appendChild(badge);
    }
    
    try {
        const queue = await Radarr.getRadarrMovies(url, key);
        const records = queue.records || [];
        
        const issues = records.filter(item => {
            const tStatus = (item.trackedDownloadStatus || '').toLowerCase();
            const status = (item.status || '').toLowerCase();
            return tStatus === 'warning' || tStatus === 'error' || status === 'failed';
        });

        const count = issues.length;
        
        // Update navigation badge
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
        
        // Update Queue tab badge
        const radarrView = document.getElementById('radarr-view');
        if (radarrView) {
            const queueTabBtn = radarrView.querySelector('.tab-btn[data-tab="queue"]');
            if (queueTabBtn) {
                let tabBadge = queueTabBtn.querySelector('.tab-badge');
                if (!tabBadge) {
                    tabBadge = document.createElement('span');
                    tabBadge.className = 'tab-badge hidden';
                    queueTabBtn.appendChild(tabBadge);
                }
                
                if (count > 0) {
                    tabBadge.textContent = count;
                    tabBadge.classList.remove('hidden');
                } else {
                    tabBadge.classList.add('hidden');
                }
            }
        }
    } catch (e) {
        console.error("Radarr badge update error", e);
        badge.classList.add('hidden');
    }
}

// Export for background updates
export { updateRadarrBadge };
