import * as Radarr from "../../services/radarr.js";
import { formatSize } from "../../services/utils.js";
import { showNotification, showConfirmModal } from "../utils.js";

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
        const radarrView = document.getElementById("radarr-view");
        if (radarrView) {
            const missingBtn = radarrView.querySelector('.tab-btn[data-tab="missing"]');
            if (missingBtn) {
                missingBtn.addEventListener('click', () => {
                   loadRadarrMissing(url, key, state);
                });
                
                // If tab is already active (restored state), load immediately
                if (missingBtn.classList.contains('active')) {
                    loadRadarrMissing(url, key, state);
                }
            }
        }

        const pCalendar = Radarr.getRadarrCalendar(url, key)
            .then(calendar => renderRadarrCalendar(calendar, state));

        const pQueue = Radarr.getRadarrQueue(url, key)
            .then(queue => {
                renderRadarrQueue(queue.records || [], state);
                return updateRadarrBadge(url, key, queue);
            });

        const pHistory = Radarr.getRadarrHistory(url, key)
            .then(history => renderRadarrRecent(history.records || [], state));

        await Promise.allSettled([pCalendar, pQueue, pHistory]);

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
            await updateRadarrBadge(state.configs.radarrUrl, state.configs.radarrKey, newQueue);
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
                  const confirmed = await showConfirmModal(
                      'Remove from Queue',
                      'Remove from queue?',
                      'Remove',
                      '#ffc107' // Radarr Gold
                  );

                  if(!confirmed) return;

                  try {
                      await Radarr.deleteQueueItem(state.configs.radarrUrl, state.configs.radarrKey, item.id, true, false);
                      // In a real app we'd remove the element or reload. For now, hide/reload via UI refresh loop usually happens or user triggers it.
                      // Let's hide the row
                      itemEl.remove(); 
                      // The refresh interval will clean it up. We can just hide the buttons.
                      delBtn.style.display = 'block';
                      optionsDiv.remove();
                      showNotification('Item removed from queue', 'success');
                  } catch(e) { 
                      if (e.message.includes('404')) {
                          showNotification("Item not found (404)", 'error');
                          itemEl.remove(); // Optimistically remove using element reference
                      } else {
                          showNotification("Error: " + e.message, 'error'); 
                      }
                  }
                  // Auto-refresh after 3 seconds
                  setTimeout(refreshQueue, 250);
              };

              btnBlock.onclick = async (ev) => {
                  ev.stopPropagation();
                  const confirmed = await showConfirmModal(
                      'Remove & Blocklist',
                      'Remove, Blocklist release and Search for new one?',
                      'Blocklist',
                      '#f44336' // Red for destructive block action
                  );

                  if(!confirmed) return;

                  try {
                    await Radarr.deleteQueueItem(state.configs.radarrUrl, state.configs.radarrKey, item.id, true, true);
                    delBtn.style.display = 'block';
                    optionsDiv.remove();
                    showNotification('Item blocked and searching for new release', 'success');
                  } catch(e) { 
                      if (e.message.includes('404')) {
                          showNotification("Item not found (404)", 'error');
                          itemEl.remove();
                      } else {
                          showNotification("Error: " + e.message, 'error'); 
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

          // MANUAL IMPORT Button for warnings
          if (isWarning) {
              const importBtn = document.createElement('button');
              importBtn.textContent = "🔧"; // Wrench icon
              importBtn.title = "Manual Import";
              importBtn.style.cssText = "background: none; border: none; color: #ff9800; cursor: pointer; font-size: 16px; margin-right: 8px;";
              importBtn.onclick = (e) => {
                  e.stopPropagation();
                  showManualImportDialog(item, state, itemEl, refreshQueue);
              };
              // Insert BEFORE the delete button
              delBtn.parentNode.insertBefore(importBtn, delBtn);
          }
      }


      container.appendChild(clone);
    });
}

/**
 * Shows a dialog for manual import of a queue item
 * @param {Object} item - Queue item with warning/error status
 * @param {Object} state - App state with configs
 * @param {HTMLElement} itemEl - The queue item element
 * @param {Function} refreshQueue - Function to refresh the queue after import
 */
/**
 * Shows a dialog for manual import of a queue item
 * @param {Object} item - Queue item with warning/error status
 * @param {Object} state - App state with configs
 * @param {HTMLElement} itemEl - The queue item element
 * @param {Function} refreshQueue - Function to refresh the queue after import
 */
async function showManualImportDialog(item, state, itemEl, refreshQueue) {
    // Remove any existing dialog
    const existingDialog = document.querySelector('.manual-import-dialog');
    if (existingDialog) existingDialog.remove();
    
    // Create dialog container
    const dialog = document.createElement('div');
    dialog.className = 'manual-import-dialog';
    dialog.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: var(--card-bg);
        border: 1px solid var(--border-color);
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        z-index: 10000;
        min-width: 400px;
        max-width: 90%;
    `;
    
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        z-index: 9999;
    `;
    backdrop.onclick = () => {
        dialog.remove();
        backdrop.remove();
    };
    
    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;';
    const title = document.createElement('h3');
    title.textContent = 'Manual Import';
    title.style.cssText = 'margin: 0; color: var(--text-primary);';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'background: none; border: none; color: var(--text-secondary); font-size: 24px; cursor: pointer; padding: 0; line-height: 1;';
    closeBtn.onclick = () => {
        dialog.remove();
        backdrop.remove();
    };
    header.appendChild(title);
    header.appendChild(closeBtn);
    dialog.appendChild(header);
    
    // Loading state
    const loadingDiv = document.createElement('div');
    loadingDiv.textContent = 'Loading import options...';
    loadingDiv.style.cssText = 'padding: 20px; text-align: center; color: var(--text-secondary);';
    dialog.appendChild(loadingDiv);
    
    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);
    
    try {
        // Fetch import options AND all available languages/qualities in parallel
        const downloadId = item.downloadId;
        const outputPath = item.outputPath || '';
        
        const [importOptions, allLanguages, allQualities] = await Promise.all([
            Radarr.getManualImportOptions(
                state.configs.radarrUrl,
                state.configs.radarrKey,
                downloadId,
                outputPath
            ),
            Radarr.getRadarrLanguages(state.configs.radarrUrl, state.configs.radarrKey),
            Radarr.getRadarrQualities(state.configs.radarrUrl, state.configs.radarrKey)
        ]);
        
        loadingDiv.remove();
        
        if (!importOptions || importOptions.length === 0) {
            const errorDiv = document.createElement('div');
            errorDiv.textContent = 'No files found for import. The download may have already been imported or removed.';
            errorDiv.style.cssText = 'padding: 20px; color: #ff9800; text-align: center;';
            dialog.appendChild(errorDiv);
            return;
        }
        
        // Use the first file (usually there's only one for movies)
        const fileOption = importOptions[0];
        
        // VIDEO FILENAME Display
        const originalNameDiv = document.createElement('div');
        originalNameDiv.style.cssText = 'margin-bottom: 15px;';
        const originalNameLabel = document.createElement('div');
        originalNameLabel.textContent = 'Video File:'; 
        originalNameLabel.style.cssText = 'font-weight: bold; color: var(--text-primary); margin-bottom: 5px; font-size: 0.9em;';
        const originalNameValue = document.createElement('div');
  
        // Use relativePath (just the filename usually) or path
        let videoFileName = fileOption.relativePath || fileOption.path || 'Unknown';
        originalNameValue.textContent = videoFileName; 
        originalNameValue.style.cssText = 'color: var(--text-primary); padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; font-family: monospace; font-size: 1.1em; word-break: break-all; line-height: 1.4;';
        originalNameDiv.appendChild(originalNameLabel);
        originalNameDiv.appendChild(originalNameValue);
        dialog.appendChild(originalNameDiv);
        
        // Movie name
        const movieNameDiv = document.createElement('div');
        movieNameDiv.style.cssText = 'margin-bottom: 15px;';
        const movieLabel = document.createElement('div');
        movieLabel.textContent = 'Movie to Import As:';
        movieLabel.style.cssText = 'font-weight: bold; color: var(--text-primary); margin-bottom: 5px; font-size: 0.9em;';
        const movieValue = document.createElement('div');
        movieValue.textContent = item.title || fileOption.movie?.title || 'Unknown';
        movieValue.style.cssText = 'color: var(--text-secondary); padding: 8px; background: var(--bg-secondary); border-radius: 4px; border: 1px solid var(--border-color);';
        movieNameDiv.appendChild(movieLabel);
        movieNameDiv.appendChild(movieValue);
        dialog.appendChild(movieNameDiv);
        
        // Quality dropdown
        const qualityDiv = document.createElement('div');
        qualityDiv.style.cssText = 'margin-bottom: 15px;';
        const qualityLabel = document.createElement('label');
        qualityLabel.textContent = 'Quality:';
        qualityLabel.style.cssText = 'font-weight: bold; color: var(--text-primary); display: block; margin-bottom: 5px; font-size: 0.9em;';
        const qualitySelect = document.createElement('select');
        qualitySelect.style.cssText = 'width: 100%; padding: 8px; background-color: #2b2b2b; color: #eeeeee; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;';
        
        // Populate ALL valid qualities
        const detectedQualityId = fileOption.quality?.quality?.id;
        const detectedQualityName = fileOption.quality?.quality?.name; // e.g. "WEBDL-1080p"
        
        // Find the BEST matching quality definition
        let targetQuality = allQualities.find(q => detectedQualityName && (q.title === detectedQualityName || q.name === detectedQualityName));
        if (!targetQuality) {
            targetQuality = allQualities.find(q => q.id == detectedQualityId);
        }
        
        allQualities.sort((a,b) => a.title.localeCompare(b.title)).forEach(qDef => {
             const option = document.createElement('option');
             
             const qualityObj = {
                 quality: { id: qDef.id, name: qDef.name },
                 revision: fileOption.quality?.revision || { version: 1, real: 0, isRepack: false }
             };

             option.value = JSON.stringify(qualityObj);
             option.textContent = qDef.title;
             
             // Pre-select if matches closest
             if (targetQuality && qDef.id === targetQuality.id) {
                 option.selected = true;
             }
             qualitySelect.appendChild(option);
        });

        // Add rejections as info
        if (fileOption.rejections && fileOption.rejections.length > 0) {
            const rejectionsDiv = document.createElement('div');
            rejectionsDiv.style.cssText = 'font-size: 0.85em; color: #ff9800; margin-top: 5px;';
            rejectionsDiv.textContent = 'Issues: ' + fileOption.rejections.map(r => r.reason).join(', ');
            qualityDiv.appendChild(rejectionsDiv);
        }
        
        qualityDiv.appendChild(qualityLabel);
        qualityDiv.appendChild(qualitySelect);
        dialog.appendChild(qualityDiv);
        
        // Language dropdown
        const languageDiv = document.createElement('div');
        languageDiv.style.cssText = 'margin-bottom: 20px;';
        const languageLabel = document.createElement('label');
        languageLabel.textContent = 'Language:';
        languageLabel.style.cssText = 'font-weight: bold; color: var(--text-primary); display: block; margin-bottom: 5px; font-size: 0.9em;';
        const languageSelect = document.createElement('select');
        languageSelect.style.cssText = 'width: 100%; padding: 8px; background-color: #2b2b2b; color: #eeeeee; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;';
        
         // Populate ALL valid languages
        const detectedLangId = fileOption.languages && fileOption.languages.length > 0 ? fileOption.languages[0].id : 1; // Default to English(1)
        
        allLanguages.sort((a,b) => a.name.localeCompare(b.name)).forEach(lang => {
             const option = document.createElement('option');
             option.value = JSON.stringify({ id: lang.id, name: lang.name });
             option.textContent = lang.name;
             
             if (lang.id === detectedLangId) option.selected = true;
             languageSelect.appendChild(option);
        });
        
        languageDiv.appendChild(languageLabel);
        languageDiv.appendChild(languageSelect);
        dialog.appendChild(languageDiv);
        
        // Buttons
        const buttonsDiv = document.createElement('div');
        buttonsDiv.style.cssText = 'display: flex; gap: 10px; justify-content: flex-end;';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding: 8px 16px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;';
        cancelBtn.onclick = () => {
            dialog.remove();
            backdrop.remove();
        };
        
        const importBtn = document.createElement('button');
        importBtn.textContent = 'Import';
        importBtn.style.cssText = 'padding: 8px 16px; background: #4caf50; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;';
        importBtn.onclick = async () => {
            importBtn.disabled = true;
            importBtn.textContent = 'Importing...';
            
            try {
                const selectedQuality = JSON.parse(qualitySelect.value);
                const selectedLanguage = JSON.parse(languageSelect.value);
                
                // Prepare import file
                const importFile = {
                    path: fileOption.path,
                    movieId: fileOption.movie?.id || item.movieId,
                    quality: selectedQuality,
                    languages: [selectedLanguage],
                    releaseGroup: fileOption.releaseGroup || ''
                };
                
                // Execute import
                await Radarr.executeManualImport(
                    state.configs.radarrUrl,
                    state.configs.radarrKey,
                    [importFile]
                );
                
                // Close dialog
                dialog.remove();
                backdrop.remove();
                
                // Refresh queue after a short delay
                setTimeout(refreshQueue, 1000);
                
            } catch (error) {
                importBtn.disabled = false;
                importBtn.textContent = 'Import';
                alert('Import failed: ' + error.message);
            }
        };
        
        buttonsDiv.appendChild(cancelBtn);
        buttonsDiv.appendChild(importBtn);
        dialog.appendChild(buttonsDiv);
        
    } catch (error) {
        loadingDiv.textContent = 'Error loading import options: ' + error.message;
        loadingDiv.style.color = '#f44336';
    }
}


function renderRadarrRecent(records, state) {
    const container = document.getElementById("radarr-movies");
    if (!container) return;
    container.replaceChildren();

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

async function updateRadarrBadge(url, key, existingQueue = null) {
    const radarrNavItem = document.querySelector('.nav-item[data-target="radarr"]');
    if (!radarrNavItem) return;

    let badge = radarrNavItem.querySelector('.nav-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'nav-badge hidden';
        radarrNavItem.appendChild(badge);
    }
    
    try {
        const queue = existingQueue || await Radarr.getRadarrQueue(url, key);
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

/**
 * Loads missing movies
 */
/**
 * Loads missing movies with Caching (15 min)
 */
async function loadRadarrMissing(url, key, state, forceRefresh = false) {
    const container = document.getElementById("radarr-missing");
    if (!container) return;
    
    // Check Cache first
    if (!forceRefresh) {
        // Show spinner only if we don't have immediate cache? 
        // Or show old cache + spinner? Let's just default to logic: Cache -> Render; No Cache -> Spinner -> Fetch.
        try {
            const cache = await new Promise(resolve => chrome.storage.local.get(['radarrMissingCache'], resolve));
            if (cache.radarrMissingCache) {
                const { timestamp, data } = cache.radarrMissingCache;
                const age = (Date.now() - timestamp) / 1000 / 60; // Minutes
                
                if (age < 15) {
                    // Use cache
                    renderRadarrMissing(data, state);
                    return; 
                }
            }
        } catch(e) { console.warn("Cache read error", e); }
    }

    container.textContent = '';
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.textContent = 'Loading Missing Movies...';
    container.appendChild(spinner);
    
    try {
        const data = await Radarr.getRadarrMissing(url, key);
        const records = data.records || [];
        
        // Render
        renderRadarrMissing(records, state);
        
        // Save Cache
        chrome.storage.local.set({
            radarrMissingCache: {
                timestamp: Date.now(),
                data: records
            }
        });
        
    } catch (e) {
        container.textContent = '';
        const errBanner = document.createElement('div');
        errBanner.className = 'error-banner';
        errBanner.textContent = 'Error loading missing: ' + e.message;
        container.appendChild(errBanner);
    }
}

/**
 * Renders missing movies as a Poster Grid.
 * Filters for Released movies only (Physical/Digital release date <= Today OR status='released').
 */
function renderRadarrMissing(records, state) {
    const container = document.getElementById("radarr-missing");
    if (!container) return;
    container.textContent = '';
    
    const now = new Date();
    // Filter logic:
    // 1. Is Available? (Radarr's 'isAvailable' flag is useful if populated, usually strictly follows delay profiles)
    // 2. Or explicit check on release dates.
    // User requested: "missing die schon released wurden"
    const filtered = records.filter(m => {
        if (m.status === 'released') return true;
        if (m.digitalRelease && new Date(m.digitalRelease) <= now) return true;
        if (m.physicalRelease && new Date(m.physicalRelease) <= now) return true;
        return false;
    });

    // Sort by Date Descending
    const getReleaseDate = (m) => {
        if (m.digitalRelease) return new Date(m.digitalRelease);
        if (m.physicalRelease) return new Date(m.physicalRelease);
        if (m.inCinemas) return new Date(m.inCinemas);
        return new Date(0);
    };
    filtered.sort((a, b) => getReleaseDate(b) - getReleaseDate(a));

    // Toolbar / Header
    const toolbar = document.createElement('div');
    toolbar.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding: 0 5px;";
    
    const countBadge = document.createElement('div');
    countBadge.textContent = `${filtered.length} Missing`;
    countBadge.style.cssText = "font-weight: bold; color: var(--text-secondary); font-size: 0.9em;";
    
    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = "↻ Refresh Cache";
    refreshBtn.style.cssText = "background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.85em; transition: all 0.2s;";
    refreshBtn.onmouseover = () => refreshBtn.style.background = "rgba(255,255,255,0.2)";
    refreshBtn.onmouseout = () => refreshBtn.style.background = "rgba(255,255,255,0.1)";
    refreshBtn.onclick = () => {
        loadRadarrMissing(state.configs.radarrUrl, state.configs.radarrKey, state, true);
    };
    
    toolbar.appendChild(countBadge);
    toolbar.appendChild(refreshBtn);
    container.appendChild(toolbar);

    if (filtered.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = "card";
        emptyMsg.style.padding = "20px";
        emptyMsg.style.textAlign = "center";
        emptyMsg.style.color = "var(--text-secondary)";
        emptyMsg.textContent = "No missing released movies found.";
        container.appendChild(emptyMsg);
        return;
    }

    const grid = document.createElement("div");
    grid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; padding: 5px;";

    filtered.forEach(movie => {
        const card = document.createElement("div");
        card.style.cssText = "background: var(--card-bg); border-radius: 8px; overflow: hidden; position: relative; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: transform 0.2s; cursor: pointer;";
        card.onmouseover = () => card.style.transform = "translateY(-2px)";
        card.onmouseout = () => card.style.transform = "translateY(0)";

        // Poster
        let posterUrl = 'icons/icon48.png';
        if (movie.images) {
             const posterObj = movie.images.find(img => img.coverType.toLowerCase() === 'poster');
             if (posterObj) {
                if (posterObj.url) {
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
                    posterUrl = posterObj.remoteUrl;
                }
            }
        }

        const imgDiv = document.createElement("div");
        imgDiv.style.cssText = "width: 100%; aspect-ratio: 2/3; overflow: hidden;";
        const img = document.createElement("img");
        img.src = posterUrl;
        img.style.cssText = "width: 100%; height: 100%; object-fit: cover;";
        img.onerror = () => { if (img.src !== 'icons/icon48.png') img.src = 'icons/icon48.png'; };
        imgDiv.appendChild(img);

        // Overlay Info
        const infoDiv = document.createElement("div");
        infoDiv.style.cssText = "padding: 8px; position: absolute; bottom: 0; width: 100%; background: linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.8) 50%, transparent 100%); color: white; text-shadow: 1px 1px 2px black;";

        const title = document.createElement("div");
        title.textContent = movie.title;
        title.style.cssText = "font-weight: bold; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
        
        const yearDiv = document.createElement("div");
        yearDiv.textContent = movie.year;
        yearDiv.style.cssText = "font-size: 0.8em; opacity: 0.9;";
        
        // Show Release info
        let releaseStr = "";
        if (movie.digitalRelease && new Date(movie.digitalRelease) <= now) {
            releaseStr = "Digital: " + new Date(movie.digitalRelease).toLocaleDateString();
        } else if (movie.physicalRelease && new Date(movie.physicalRelease) <= now) {
            releaseStr = "Physical: " + new Date(movie.physicalRelease).toLocaleDateString();
        } else if (movie.inCinemas) {
            releaseStr = "Cinema: " + new Date(movie.inCinemas).toLocaleDateString();
        }

        const releaseDiv = document.createElement("div");
        releaseDiv.textContent = releaseStr;
        releaseDiv.style.cssText = "font-size: 0.7em; opacity: 0.8; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";

        infoDiv.appendChild(title);
        infoDiv.appendChild(yearDiv);
        infoDiv.appendChild(releaseDiv);

        // Search Button
        const searchBtn = document.createElement("div");
        searchBtn.textContent = "🔍";
        searchBtn.title = "Search for Movie";
        searchBtn.style.cssText = `
            position: absolute; top: 5px; right: 5px; 
            width: 24px; height: 24px; 
            background: rgba(0,0,0,0.6); border-radius: 50%; 
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; font-size: 14px; color: white;
            border: 1px solid rgba(255,255,255,0.3);
            transition: background 0.2s;
        `;
        searchBtn.onmouseover = () => searchBtn.style.background = "#2196f3";
        searchBtn.onmouseout = () => searchBtn.style.background = "rgba(0,0,0,0.6)";

        searchBtn.onclick = async (e) => {
             e.stopPropagation();
             searchBtn.style.pointerEvents = "none";
             searchBtn.textContent = "⏳";
             try {
                 await fetch(`${state.configs.radarrUrl}/api/v3/command`, {
                     method: 'POST',
                     headers: { 
                        'X-Api-Key': state.configs.radarrKey,
                        'Content-Type': 'application/json'
                     },
                     body: JSON.stringify({
                         name: 'MoviesSearch',
                         movieIds: [movie.id]
                     })
                 });
                 showNotification('Search started', 'success');
                 searchBtn.textContent = "✓";
             } catch(err) {
                 showNotification('Search failed', 'error');
                 searchBtn.textContent = "❌";
             }
        };

        card.appendChild(imgDiv);
        card.appendChild(infoDiv);
        card.appendChild(searchBtn);
        
        // Link logic
        if (movie.titleSlug) {
            card.addEventListener("click", () => {
                const url = state.configs.radarrUrl;
                chrome.tabs.create({ url: `${url}/movie/${movie.titleSlug}` });
            });
        }

        grid.appendChild(card);
    });
    
    container.appendChild(grid);
}
