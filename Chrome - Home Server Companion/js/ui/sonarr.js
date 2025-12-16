import * as Sonarr from "../../services/sonarr.js";
import { formatSize } from "../../services/utils.js";

/**
 * Initializes the Sonarr service view.
 * - Fetches and renders Calendar, Queue, and History.
 * - Updates the service badge.
 * @param {string} url - Sonarr URL
 * @param {string} key - API Key
 * @param {object} state - App state
 */
export async function initSonarr(url, key, state) {
    try {
        // Calendar
        const calendar = await Sonarr.getSonarrCalendar(url, key);
        renderSonarrCalendar(calendar, state);

        // Queue
        const queue = await Sonarr.getSonarrQueue(url, key);
        renderSonarrQueue(queue.records || [], state);

        // Initial Badge Update
        await updateSonarrBadge(url, key);

        // History (Recent)
        const history = await Sonarr.getSonarrHistory(url, key);
        renderSonarrHistory(history.records || [], state);
    } catch (e) {
        console.error("Sonarr loading error", e);
        throw e;
    }
}

function renderSonarrCalendar(episodes, state) {
    const container = document.getElementById("sonarr-calendar");
    if (!container) return;
    container.textContent = "";
    if (episodes.length === 0) {
      const card = document.createElement('div');
      card.className = "card";
      const header = document.createElement('div');
      header.className = "card-header";
      header.textContent = "No upcoming episodes";
      card.appendChild(header);
      container.appendChild(card);
      return;
    }

    // Group by Date
    const grouped = {};
    episodes.forEach((ep) => {
      const dateStr = new Date(ep.airDateUtc).toLocaleDateString();
      if (!grouped[dateStr]) grouped[dateStr] = [];
      grouped[dateStr].push(ep);
    });

    Object.keys(grouped).forEach((dateStr, index) => {
      // Header
      const dateGroup = document.createElement("div");
      dateGroup.className = "date-group";

      // Nice Header Text (Today/Tomorrow checks)
      let headerText = dateStr;
      const dateObj = new Date(grouped[dateStr][0].airDateUtc);
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
              let cleanUrl = state.configs.sonarrUrl;
              if(cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
              chrome.tabs.create({ url: `${cleanUrl}/calendar` });
          };
          header.appendChild(linkBtn);
      }
      
      dateGroup.appendChild(header);

      // Grid Container
      const grid = document.createElement("div");
      grid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; padding: 5px;";

      // Items
      grouped[dateStr].forEach((ep) => {
        // Find Image (Poster)
        let posterUrl = 'icons/icon48.png';
        if (ep.series && ep.series.images) {
            const posterObj = ep.series.images.find(img => img.coverType.toLowerCase() === 'poster');
            if (posterObj) {
                if (posterObj.url) {
                     // Local URL (needs auth usually)
                     let baseUrl = state.configs.sonarrUrl || "";
                     if(baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
                     
                     let imgPath = posterObj.url;
                     if(!imgPath.startsWith('http')) {
                         if (!imgPath.startsWith('/')) imgPath = '/' + imgPath;
                         posterUrl = `${baseUrl}${imgPath}`;
                         
                         const joinChar = posterUrl.includes('?') ? '&' : '?';
                         posterUrl += `${joinChar}apikey=${state.configs.sonarrKey}`;
                     } else {
                         posterUrl = imgPath;
                     }
                } else if (posterObj.remoteUrl) {
                    // Remote URL (direct link to Metadata provider)
                    posterUrl = posterObj.remoteUrl;
                }
            }
        }

        const card = document.createElement("div");
        card.style.cssText = "background: var(--card-bg); border-radius: 8px; overflow: hidden; position: relative; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: transform 0.2s;";
        card.onmouseover = () => card.style.transform = "translateY(-2px)";
        card.onmouseout = () => card.style.transform = "translateY(0)";

        const imgDiv = document.createElement("div");
        // Use aspect-ratio to keep poster shape (2:3 is standard)
        imgDiv.style.cssText = "width: 100%; aspect-ratio: 2/3; overflow: hidden;";
        const img = document.createElement("img");
        img.src = posterUrl;
        img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
        
        // Error Handler
        img.addEventListener('error', () => { 
            if (img.src !== 'icons/icon48.png') img.src = 'icons/icon48.png'; 
        });
        
        imgDiv.appendChild(img);
        
        // Overlay Info
        const infoDiv = document.createElement("div");
        // Stronger gradient for better readability
        infoDiv.style.cssText = "padding: 8px; position: absolute; bottom: 0; width: 100%; background: linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 50%, transparent 100%); color: white; text-shadow: 1px 1px 2px black;";
        
        // Series Title
        const sTitle = document.createElement("div");
        sTitle.textContent = ep.series ? ep.series.title : "Unknown";
        sTitle.style.cssText = "font-weight: bold; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
        
        // Episode Info
        const epInfo = document.createElement("div");
        const sNum = String(ep.seasonNumber).padStart(2, '0');
        const eNum = String(ep.episodeNumber).padStart(2, '0');
        epInfo.textContent = `S${sNum}E${eNum}`;
        epInfo.style.cssText = "font-size: 0.8em; opacity: 0.9;";
        
        // Time
        const airTime = new Date(ep.airDateUtc);
        const timeStr = airTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
        const timeDiv = document.createElement("div");
        timeDiv.textContent = timeStr;
        timeDiv.style.cssText = "font-size: 0.75em; opacity: 0.8; margin-top: 2px;";

        infoDiv.appendChild(sTitle);
        infoDiv.appendChild(epInfo);
        infoDiv.appendChild(timeDiv);

        // Status Ribbon (Top Right)
        let statusColor = "#9e9e9e";
        if (ep.hasFile) statusColor = "#4caf50";
        else if (new Date() > airTime) statusColor = "#f44336"; // Missing
        else statusColor = "#2196f3"; // Airing/Upcoming

        const ribbon = document.createElement("div");
        ribbon.style.cssText = `position: absolute; top: 8px; right: 8px; width: 10px; height: 10px; border-radius: 50%; background: ${statusColor}; box-shadow: 0 0 5px ${statusColor};`;
        ribbon.title = ep.hasFile ? "Downloaded" : (new Date() > airTime ? "Missing" : "Upcoming");

        card.appendChild(imgDiv);
        card.appendChild(infoDiv);
        card.appendChild(ribbon);

        // Click
        if (ep.series && ep.series.titleSlug) {
            card.style.cursor = "pointer";
            card.onclick = () => {
                const url = state.configs.sonarrUrl;
                chrome.tabs.create({ url: `${url}/series/${ep.series.titleSlug}` });
            };
        }

        grid.appendChild(card);
      });

      dateGroup.appendChild(grid);
      container.appendChild(dateGroup);
    });
}

function renderSonarrQueue(records, state) {
    const container = document.getElementById("sonarr-queue");
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
            const newQueue = await Sonarr.getSonarrQueue(state.configs.sonarrUrl, state.configs.sonarrKey);
            await updateSonarrBadge(state.configs.sonarrUrl, state.configs.sonarrKey);
            renderSonarrQueue(newQueue.records || [], state);
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
    linkBtn.title = "Open Activity Queue in Sonarr";
    linkBtn.style.cssText = "background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 1.2em; margin-right: 15px; transition: color 0.2s;";
    linkBtn.onmouseover = () => linkBtn.style.color = "var(--primary-color)";
    linkBtn.onmouseout = () => linkBtn.style.color = "var(--text-secondary)";
    linkBtn.onclick = (e) => {
        e.stopPropagation();
        let cleanUrl = state.configs.sonarrUrl;
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

    const tmpl = document.getElementById("sab-queue-item"); // Re-using queue item template
    if (!tmpl) return;

    records.forEach((item) => {
      const clone = tmpl.content.cloneNode(true);
      const itemEl = clone.firstElementChild; // Capture actual element
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
              ? item.statusMessages[0].title 
              : "Attention Needed";
          statusEl.style.color = "#ff9800";
          statusEl.style.fontWeight = "bold";
      } else {
          statusEl.textContent = item.status;
      }
      
      // Remove delete button or handle it if Sonarr API supports it easily
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
                      await Sonarr.deleteQueueItem(state.configs.sonarrUrl, state.configs.sonarrKey, item.id, true, false);
                      delBtn.style.display = 'block';
                      itemEl.remove();
                      optionsDiv.remove();
                  } catch(e) { 
                      if (e.message.includes('404')) {
                          alert("Item not found (404). check settings.");
                          itemEl.remove();
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
                    await Sonarr.deleteQueueItem(state.configs.sonarrUrl, state.configs.sonarrKey, item.id, true, true);
                    delBtn.style.display = 'block';
                    optionsDiv.remove();
                  } catch(e) { 
                      if (e.message.includes('404')) {
                          alert("Item not found (404). check settings.");
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
              delBtn.parentNode.insertBefore(optionsDiv, delBtn); // Insert where delBtn was
          };

          // WARNING Extra Button
          if (isWarning) {
              const openBtn = document.createElement('button');
              openBtn.textContent = "\u2197"; // NE Arrow
              openBtn.title = "Open Activity Queue (Fix Issue)";
              openBtn.style.cssText = "background: none; border: none; color: #ff9800; cursor: pointer; font-size: 16px; margin-right: 8px;";
              openBtn.onclick = (e) => {
                  e.stopPropagation();
                  const cleanUrl = state.configs.sonarrUrl.replace(/\/$/, '');
                  chrome.tabs.create({ url: `${cleanUrl}/activity/queue` });
              };
              delBtn.parentNode.insertBefore(openBtn, delBtn);
          }
      }

      container.appendChild(clone);
    });
}

function renderSonarrHistory(records, state) {
    const container = document.getElementById("sonarr-history");
    if (!container) return;
    container.textContent = "";

    // Filter for only 'downloadFolderImported'
    // We fetch more initially to allow for grouping compression
    const rawFiltered = records
      .filter((r) => r.eventType === "downloadFolderImported")
      .slice(0, 100);

    if (rawFiltered.length === 0) {
      const card = document.createElement('div');
      card.className = "card";
      const header = document.createElement('div');
      header.className = "card-header";
      header.textContent = "No recent downloads";
      card.appendChild(header);
      container.appendChild(card);
      return;
    }

    // Grouping Logic
    const groupedItems = [];
    if (rawFiltered.length > 0) {
        let currentGroup = [rawFiltered[0]];
        
        for (let i = 1; i < rawFiltered.length; i++) {
            const prev = currentGroup[0];
            const curr = rawFiltered[i];
            
            // Check if same series (by titleSlug or id)
            // And also check if same season? Usually safer to group by season too, 
            // otherwise S01E24 and S02E01 might look weird as S01E24-01 without season handling.
            // Let's assume strict grouping: Same Series AND Same Season.
            const sameSeries = (prev.series && curr.series && prev.series.id === curr.series.id);
            const prevSeason = prev.episode ? prev.episode.seasonNumber : -1;
            const currSeason = curr.episode ? curr.episode.seasonNumber : -2;
            
            if (sameSeries && prevSeason === currSeason) {
                currentGroup.push(curr);
            } else {
                groupedItems.push(currentGroup);
                currentGroup = [curr];
            }
        }
        groupedItems.push(currentGroup);
    }
    
    // Limit to 10 visible Cards (groups)
    const displayGroups = groupedItems.slice(0, 10);

    // Grid Container for History
    const grid = document.createElement("div");
    grid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px;";

    displayGroups.forEach((group) => {
      // Use the first item for Series Info / Images
      const mainItem = group[0];
      const series = mainItem.series || {};
      const date = new Date(mainItem.date).toLocaleDateString();
      
      // Determine Episode Label
      let epString = "";
      let epTitleString = "";
      
      if (group.length === 1) {
          // Single Episode
          const ep = mainItem.episode || {};
          const sNum = String(ep.seasonNumber || 0).padStart(2, '0');
          const eNum = String(ep.episodeNumber || 0).padStart(2, '0');
          epString = `S${sNum}E${eNum}`;
          epTitleString = ep.title || "";
      } else {
          // Multi Episode Group
          // Find Min/Max Episode Numbers
          const epNumbers = group.map(i => i.episode ? i.episode.episodeNumber : 0).sort((a,b) => a-b);
          const minEp = epNumbers[0];
          const maxEp = epNumbers[epNumbers.length - 1];
          const count = group.length;
          
          const sNum = String(mainItem.episode.seasonNumber || 0).padStart(2, '0');
          // e.g. S12E10-14
          // Note: Logic assumes continuous range, but even if S12E10 and S12E12 (gap), showing E10-12 might be acceptable or specific list "E10, E12".
          // User requested "S12E10-14". Let's stick to Range if > 2, or Comma if 2? 
          // Re-reading: "S12E10-14 z.B." (Range).
          
          // Check if contiguous? 
          // Ideally yes, but "imported" events usually happen in batches.
          
          epString = `S${sNum}E${minEp}-${maxEp}`;
          
          // For title, "3 Episodes" or join titles?
          if (count <= 2) {
              epTitleString = group.map(i => i.episode.title).join(" / ");
          } else {
              epTitleString = `${count} Episodes Imported`;
          }
      }

      // 2. Images (Poster & Banner)
      let posterUrl = 'icons/icon48.png';
      let bannerUrl = '';
      
      if (series.images) {
          // Find Poster
          const posterObj = series.images.find(img => img.coverType.toLowerCase() === 'poster');
          if(posterObj) {
               if(posterObj.url) {
                    let baseUrl = state.configs.sonarrUrl || "";
                    if(baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
                    if(!posterObj.url.startsWith('http')) { 
                        posterUrl = `${baseUrl}${posterObj.url.startsWith('/') ? '' : '/'}${posterObj.url}?apikey=${state.configs.sonarrKey}`; 
                    } else { posterUrl = posterObj.url; }
               } else if (posterObj.remoteUrl) { posterUrl = posterObj.remoteUrl; }
          }
          
          // Find Banner (or Fanart as fallback)
          const bannerObj = series.images.find(img => img.coverType.toLowerCase() === 'banner') 
                         || series.images.find(img => img.coverType.toLowerCase() === 'fanart');
          if(bannerObj) {
              if(bannerObj.url) {
                    let baseUrl = state.configs.sonarrUrl || "";
                    if(baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
                    if(!bannerObj.url.startsWith('http')) { 
                        bannerUrl = `${baseUrl}${bannerObj.url.startsWith('/') ? '' : '/'}${bannerObj.url}?apikey=${state.configs.sonarrKey}`; 
                    } else { bannerUrl = bannerObj.url; }
               } else if (bannerObj.remoteUrl) { bannerUrl = bannerObj.remoteUrl; }
          }
      }

      // 3. Card DOM
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
      // Click to Series
      if (series.titleSlug) {
          card.onclick = () => {
              const url = state.configs.sonarrUrl;
              chrome.tabs.create({ url: `${url}/series/${series.titleSlug}` });
          };
          card.onmouseenter = () => card.style.transform = "translateY(-3px)";
          card.onmouseleave = () => card.style.transform = "translateY(0)";
      }

      // 3a. Background (Banner)
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

      // Hover effect
      card.addEventListener('mouseenter', () => { bg.style.opacity = '0.3'; bg.style.filter = 'blur(1px) grayscale(0%)'; });
      card.addEventListener('mouseleave', () => { bg.style.opacity = '0.2'; bg.style.filter = 'blur(2px) grayscale(40%)'; });

      // 3b. Content Layout
      const content = document.createElement("div");
      content.style.cssText = `
          position: relative; z-index: 1;
          display: flex; height: 100%;
          padding: 10px;
          gap: 15px;
          align-items: center;
      `;
      
      // Poster
      const posterImg = document.createElement("img");
      posterImg.src = posterUrl;
      posterImg.style.cssText = "height: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 6px; box-shadow: 2px 2px 5px rgba(0,0,0,0.5);";
      posterImg.onerror = () => { posterImg.src = 'icons/icon48.png'; };
      
      // Info
      const info = document.createElement("div");
      info.style.cssText = "flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;";
      
      const titleEl = document.createElement("div");
      titleEl.textContent = series.title || "Unknown Series";
      titleEl.title = series.title;
      titleEl.style.cssText = "font-weight: 800; font-size: 1.1em; margin-bottom: 4px; color: var(--text-primary); text-shadow: 0 2px 4px rgba(0,0,0,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
      
      const epEl = document.createElement("div");
      epEl.textContent = epString;
      epEl.style.cssText = "font-weight: 700; color: var(--accent-sonarr); font-size: 1em; margin-bottom: 2px; text-shadow: 0 1px 2px rgba(0,0,0,0.8);";
      
      const epTitleEl = document.createElement("div");
      epTitleEl.textContent = epTitleString;
      epTitleEl.style.cssText = "font-size: 0.85em; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; opacity: 0.9;";
      
      const metaEl = document.createElement("div");
      const quality = mainItem.quality && mainItem.quality.quality ? mainItem.quality.quality.name : "";
      metaEl.textContent = `${quality} • ${date}`;
      metaEl.style.cssText = "font-size: 0.75em; color: #e0e0e0; margin-top: 5px; opacity: 0.9;";

      info.appendChild(titleEl);
      info.appendChild(epEl);
      info.appendChild(epTitleEl);
      info.appendChild(metaEl);

      content.appendChild(posterImg);
      content.appendChild(info);
      card.appendChild(content);
      
      grid.appendChild(card);
    });

    container.appendChild(grid);
}

async function updateSonarrBadge(url, key) {
    const sonarrNavItem = document.querySelector('.nav-item[data-target="sonarr"]');
    if (!sonarrNavItem) return;

    let badge = sonarrNavItem.querySelector('.nav-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'nav-badge hidden';
        sonarrNavItem.appendChild(badge);
    }
    
    try {
        const queue = await Sonarr.getSonarrQueue(url, key);
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
        const sonarrView = document.getElementById('sonarr-view');
        if (sonarrView) {
            const queueTabBtn = sonarrView.querySelector('.tab-btn[data-tab="queue"]');
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
        console.error("Sonarr badge update error", e);
        badge.classList.add('hidden');
    }
}

// Export for background updates
export { updateSonarrBadge };
