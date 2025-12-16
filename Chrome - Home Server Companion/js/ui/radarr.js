import * as Radarr from "../../services/radarr.js";
import { formatSize } from "../../services/utils.js";

/**
 * Initializes the Radarr service view.
 * - Fetches and renders Calendar, Queue, and Recent Downloads.
 * - Updates the service badge.
 * @param {string} url - Radarr URL
 * @param {string} key - API Key
 * @param {object} state - App state
 */
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
    container.textContent = "";
    if (movies.length === 0) {
      const card = document.createElement('div');
      card.className = "card";
      const header = document.createElement('div');
      header.className = "card-header";
      header.textContent = "No upcoming movies";
      card.appendChild(header);
      container.appendChild(card);
      return;
    }

    // Determine effective date and group
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const isFutureOrToday = (d) => d && new Date(d) >= todayStart;

    const grouped = {};
    movies.forEach((movie) => {
      let dateObj = null;

      if (isFutureOrToday(movie.digitalRelease)) {
          dateObj = new Date(movie.digitalRelease);
      } else if (isFutureOrToday(movie.physicalRelease)) {
          dateObj = new Date(movie.physicalRelease);
      } else if (isFutureOrToday(movie.inCinemas)) {
          dateObj = new Date(movie.inCinemas);
      } else {
          // Fallback to InCinemas if everything is past (shouldn't happen often in calendar view)
          // or just default to today if null
          if (movie.inCinemas) dateObj = new Date(movie.inCinemas);
          else if (movie.digitalRelease) dateObj = new Date(movie.digitalRelease);
      }

      // If date is invalid, defaulting to Today
      if (!dateObj || isNaN(dateObj.getTime())) dateObj = new Date();

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

    sortedKeys.forEach((dateKey, index) => {
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
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.justifyContent = "space-between"; // Push link to right
      
      const spanText = document.createElement("span");
      spanText.textContent = headerText;
      header.appendChild(spanText);

      // Add Link to FIRST element ("Top element")
      if (index === 0) {
          const linkBtn = document.createElement('span');
          linkBtn.textContent = "\u2197"; // NE Arrow
          linkBtn.title = "Open Calendar";
          linkBtn.style.cssText = "cursor: pointer; font-size: 1.3em; margin-left: 10px; color: var(--text-secondary); opacity: 0.8; transition: opacity 0.2s;";
          linkBtn.onmouseover = () => linkBtn.style.opacity = "1";
          linkBtn.onmouseout = () => linkBtn.style.opacity = "0.8";
          linkBtn.onclick = (e) => {
              e.stopPropagation();
              let cleanUrl = state.configs.radarrUrl;
              if(cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
              chrome.tabs.create({ url: `${cleanUrl}/calendar` });
          };
          header.appendChild(linkBtn);
      }
      
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
    container.textContent = "";

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
    const linkBtn = document.createElement('button');
    linkBtn.textContent = "\u2197"; // NE Arrow
    linkBtn.title = "Open Activity Queue in Radarr";
    linkBtn.style.cssText = "background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 1.2em; margin-right: 15px; transition: color 0.2s;";
    linkBtn.onmouseover = () => linkBtn.style.color = "var(--primary-color)";
    linkBtn.onmouseout = () => linkBtn.style.color = "var(--text-secondary)";
    linkBtn.onclick = (e) => {
        e.stopPropagation();
        let cleanUrl = state.configs.radarrUrl;
        if(cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        chrome.tabs.create({ url: `${cleanUrl}/activity/queue` });
    };
    toolbar.appendChild(linkBtn);

    toolbar.appendChild(refreshBtn);
    container.appendChild(toolbar);

    if (records.length === 0) {
      const emptyMsg = document.createElement('div');
      const card = document.createElement('div');
      card.className = "card";
      const header = document.createElement('div');
      header.className = "card-header";
      header.textContent = "Queue Empty";
      card.appendChild(header);
      emptyMsg.appendChild(card);
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
          delBtn.textContent = "\u00D7"; // Standard X
          
          delBtn.onclick = (e) => {
              e.stopPropagation();
              
              if (delBtn.dataset.confirming === "true") return; 
              


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
              cancel.textContent = "\u00D7";
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
              openBtn.textContent = "\u2197"; // NE Arrow
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
      const card = document.createElement('div');
      card.className = "card";
      const header = document.createElement('div');
      header.className = "card-header";
      header.textContent = "No recent downloads";
      card.appendChild(header);
      container.appendChild(card);
      return;
    }

    // Grid Container for History
    const grid = document.createElement("div");
    // Same grid layout as Sonarr
    grid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px;";

    filtered.forEach((item) => {
        const movie = item.movie || {};
        const date = new Date(item.date).toLocaleDateString();
        const quality = item.quality && item.quality.quality ? item.quality.quality.name : "";

        // 1. Images (Poster & Banner)
        let posterUrl = 'icons/icon48.png';
        let bannerUrl = '';

        if (movie.images) {
            // Find Poster
            const posterObj = movie.images.find(img => img.coverType.toLowerCase() === 'poster');
            if(posterObj) {
                 if(posterObj.url) {
                      let baseUrl = state.configs.radarrUrl || "";
                      if(baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
                      if(!posterObj.url.startsWith('http')) { 
                          posterUrl = `${baseUrl}${posterObj.url.startsWith('/') ? '' : '/'}${posterObj.url}?apikey=${state.configs.radarrKey}`; 
                      } else { posterUrl = posterObj.url; }
                 } else if (posterObj.remoteUrl) { posterUrl = posterObj.remoteUrl; }
            }
            
            // Find Banner (or Fanart as fallback)
            const bannerObj = movie.images.find(img => img.coverType.toLowerCase() === 'banner') 
                           || movie.images.find(img => img.coverType.toLowerCase() === 'fanart');
            if(bannerObj) {
                if(bannerObj.url) {
                      let baseUrl = state.configs.radarrUrl || "";
                      if(baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
                      if(!bannerObj.url.startsWith('http')) { 
                          bannerUrl = `${baseUrl}${bannerObj.url.startsWith('/') ? '' : '/'}${bannerObj.url}?apikey=${state.configs.radarrKey}`; 
                      } else { bannerUrl = bannerObj.url; }
                 } else if (bannerObj.remoteUrl) { bannerUrl = bannerObj.remoteUrl; }
            }
        }

        // 2. Card DOM
        const card = document.createElement("div");
        card.className = "history-card";
        card.style.cssText = `
          position: relative; 
          border-radius: 12px; 
          overflow: hidden; 
          height: 140px; 
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
          background: var(--card-bg);
          transition: transform 0.2s;
          cursor: pointer;
        `;
        
        // Click to Movie
        if (movie.titleSlug) {
            card.onclick = () => {
                const url = state.configs.radarrUrl;
                chrome.tabs.create({ url: `${url}/movie/${movie.titleSlug}` });
            };
            card.onmouseenter = () => card.style.transform = "translateY(-3px)";
            card.onmouseleave = () => card.style.transform = "translateY(0)";
        }

        // 2a. Background (Banner)
        const bg = document.createElement("div");
        bg.style.cssText = `
            position: absolute; top:0; left:0; width:100%; height:100%;
            background-image: url('${bannerUrl || posterUrl}'); 
            background-size: cover; 
            background-position: center;
            opacity: 0.2; 
            filter: blur(2px) grayscale(40%);
            z-index: 0;
            transition: opacity 0.3s;
        `;
        card.appendChild(bg);

        // Hover effect for BG opacity
        card.addEventListener('mouseenter', () => { bg.style.opacity = '0.3'; bg.style.filter = 'blur(1px) grayscale(0%)'; });
        card.addEventListener('mouseleave', () => { bg.style.opacity = '0.2'; bg.style.filter = 'blur(2px) grayscale(40%)'; });

        // 2b. Content Layout
        const content = document.createElement("div");
        content.style.cssText = `
            position: relative; z-index: 1;
            display: flex; height: 100%;
            padding: 10px;
            gap: 15px;
            align-items: center;
        `;
        
        // Poster (Foreground)
        const posterImg = document.createElement("img");
        posterImg.src = posterUrl;
        posterImg.style.cssText = "height: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 6px; box-shadow: 2px 2px 5px rgba(0,0,0,0.5);";
        posterImg.onerror = () => { posterImg.src = 'icons/icon48.png'; };
        
        // Info Column
        const info = document.createElement("div");
        info.style.cssText = "flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;";
        
        const titleEl = document.createElement("div");
        titleEl.textContent = movie.title || item.sourceTitle || "Unknown Movie";
        titleEl.title = movie.title;
        titleEl.style.cssText = "font-weight: 800; font-size: 1.1em; margin-bottom: 4px; color: var(--text-primary); text-shadow: 0 2px 4px rgba(0,0,0,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
        
        const yearEl = document.createElement("div");
        yearEl.textContent = movie.year ? `(${movie.year})` : "";
        yearEl.style.cssText = "font-weight: 700; color: var(--text-secondary); font-size: 0.9em; margin-bottom: 5px; text-shadow: 0 1px 2px rgba(0,0,0,0.8);";
        
        // Meta (Quality + Date)
        const metaEl = document.createElement("div");
        metaEl.textContent = `${quality} • ${date}`;
        metaEl.style.cssText = "font-size: 0.75em; color: #e0e0e0; margin-top: 5px; opacity: 0.9;";

        info.appendChild(titleEl);
        info.appendChild(yearEl);
        info.appendChild(metaEl);

        content.appendChild(posterImg);
        content.appendChild(info);
        card.appendChild(content);
        
        grid.appendChild(card);
    });

    container.appendChild(grid);
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
