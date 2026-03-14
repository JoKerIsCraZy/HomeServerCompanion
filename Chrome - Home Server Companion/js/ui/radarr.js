import * as Radarr from "../../services/radarr.js";
import { formatSize } from "../../services/utils.js";
import { showNotification, showConfirmModal, escapeHtml } from "../utils.js";

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
          const linkBtn = document.createElement('button');
          linkBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
          linkBtn.title = "Open Calendar";
          linkBtn.style.cssText = "background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); cursor: pointer; padding: 6px 8px; border-radius: 6px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; margin-left: 10px;";
          
          linkBtn.onmouseover = () => { linkBtn.style.background = "rgba(255,255,255,0.1)"; linkBtn.style.color = "var(--accent-radarr)"; };
          linkBtn.onmouseout = () => { linkBtn.style.background = "rgba(255,255,255,0.05)"; linkBtn.style.color = "var(--text-secondary)"; };
          
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
             btn.classList.add('spinning');
             btn.disabled = true;
        }
        try {
            const newQueue = await Radarr.getRadarrQueue(state.configs.radarrUrl, state.configs.radarrKey);
            await updateRadarrBadge(state.configs.radarrUrl, state.configs.radarrKey, newQueue);
            renderRadarrQueue(newQueue.records || [], state);
        } catch(e) {
            if(btn) {
                btn.classList.remove('spinning');
                btn.disabled = false;
            }
        }
    };

    // Helper to get poster URL
    const getPosterUrl = (movie) => {
        let posterUrl = 'icons/icon48.png';
        if (movie && movie.images) {
            const posterObj = movie.images.find(img => img.coverType.toLowerCase() === 'poster');
            if (posterObj) {
                if (posterObj.remoteUrl) {
                    posterUrl = posterObj.remoteUrl;
                } else if (posterObj.url) {
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
                }
            }
        }
        return posterUrl;
    };

    // Toolbar with icon-only buttons
    const toolbar = document.createElement('div');
    toolbar.style.cssText = "display: flex; justify-content: flex-end; margin-bottom: 10px; padding: 0 5px; gap: 8px;";
    
    // Open in Radarr button (external link icon)
    const linkBtn = document.createElement('button');
    linkBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    linkBtn.title = "Open Activity Queue in Radarr";
    linkBtn.style.cssText = "background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); cursor: pointer; padding: 6px 8px; border-radius: 6px; transition: all 0.2s; display: flex; align-items: center; justify-content: center;";
    linkBtn.onmouseover = () => { linkBtn.style.background = "rgba(255,255,255,0.1)"; linkBtn.style.color = "var(--accent-radarr)"; };
    linkBtn.onmouseout = () => { linkBtn.style.background = "rgba(255,255,255,0.05)"; linkBtn.style.color = "var(--text-secondary)"; };
    linkBtn.onclick = (e) => {
        e.stopPropagation();
        let cleanUrl = state.configs.radarrUrl;
        if(cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        chrome.tabs.create({ url: `${cleanUrl}/activity/queue` });
    };
    
    // Refresh button (icon only)
    const refreshBtn = document.createElement('button');
    refreshBtn.className = "refresh-btn";
    refreshBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
    refreshBtn.title = "Refresh Queue";
    refreshBtn.style.cssText = "background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); cursor: pointer; padding: 6px 8px; border-radius: 6px; transition: all 0.2s; display: flex; align-items: center; justify-content: center;";
    refreshBtn.onmouseover = () => { if(!refreshBtn.disabled) { refreshBtn.style.background = "rgba(255,255,255,0.1)"; refreshBtn.style.color = "var(--text-primary)"; } };
    refreshBtn.onmouseout = () => { refreshBtn.style.background = "rgba(255,255,255,0.05)"; refreshBtn.style.color = "var(--text-secondary)"; };
    refreshBtn.onclick = refreshQueue;
    
    // Add spinning animation style
    const style = document.createElement('style');
    style.textContent = `.refresh-btn.spinning svg { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
    if (!document.querySelector('style[data-refresh-spin]')) {
        style.dataset.refreshSpin = 'true';
        document.head.appendChild(style);
    }
    
    toolbar.appendChild(linkBtn);
    toolbar.appendChild(refreshBtn);
    container.appendChild(toolbar);

    // Empty state
    if (records.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'queue-empty';
        emptyDiv.innerHTML = `
            <div class="queue-empty-icon">📭</div>
            <div class="queue-empty-text">Queue is empty</div>
        `;
        container.appendChild(emptyDiv);
        return;
    }

    // Sort: warnings first, then by progress
    const sortedRecords = [...records].sort((a, b) => {
        const aWarning = ['warning', 'error'].includes((a.trackedDownloadStatus || '').toLowerCase());
        const bWarning = ['warning', 'error'].includes((b.trackedDownloadStatus || '').toLowerCase());
        if (aWarning && !bWarning) return -1;
        if (!aWarning && bWarning) return 1;
        return 0;
    });

    sortedRecords.forEach((item) => {
        const movie = item.movie || {};
        const posterUrl = getPosterUrl(movie);
        const tStatus = (item.trackedDownloadStatus || '').toLowerCase();
        const isWarning = tStatus === 'warning' || tStatus === 'error';
        
        let percent = 0;
        if (item.size > 0) {
            percent = 100 - (item.sizeleft / item.size) * 100;
        }
        
        // Determine status
        let statusClass = 'downloading';
        let statusText = item.status || 'Downloading';
        let statusMessage = ''; // Tooltip text

        if (isWarning) {
            statusClass = tStatus;
            if (item.statusMessages && item.statusMessages.length > 0) {
                statusText = 'Attention Needed';
                // Join all messages for the tooltip
                statusMessage = item.statusMessages.map(m => m.title + (m.messages ? ': ' + m.messages.join(', ') : '')).join('\n');
            }
        } else if (item.status?.toLowerCase() === 'paused') {
            statusClass = 'paused';
        } else if (item.status?.toLowerCase() === 'queued') {
            statusClass = 'queued';
        }

        // Quality
        const quality = item.quality?.quality?.name || '';

        // Create queue card
        const card = document.createElement('div');
        card.className = `queue-card${isWarning ? ' ' + tStatus : ''}`;
        
        const displayTitle = escapeHtml(item.title || movie.title || 'Unknown');
        const escapedQuality = escapeHtml(quality);
        const escapedYear = escapeHtml(movie.year);
        const escapedItemTitle = escapeHtml(item.title);
        const escapedStatusMessage = escapeHtml(statusMessage);
        const escapedStatusText = escapeHtml(statusText);

        card.innerHTML = `
            <div class="queue-poster">
                <img id="queue-poster-${item.id}" src="${escapeHtml(posterUrl)}" alt="" onerror="this.src='icons/icon48.png'">
            </div>
            <div class="queue-content">
                <div class="queue-header">
                    <div id="queue-title-${item.id}" class="queue-title" title="${displayTitle}">${displayTitle}</div>
                </div>
                <div class="queue-subtitle">
                    ${quality ? `<span class="queue-quality">${escapedQuality}</span>` : ''}
                    ${movie.year ? `<span>${escapedYear}</span>` : ''}
                </div>

                <div class="queue-progress-row">
                    <div class="queue-progress-bar">
                        <div class="queue-progress-fill" style="width: ${percent}%"></div>
                    </div>
                    <span class="queue-percentage">${Math.round(percent)}%</span>
                </div>

                <div style="font-size:10px; color:var(--text-secondary); margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:0.8;" title="${escapedItemTitle}">
                    <span style="font-weight:600; opacity:0.7;">Release Name:</span> ${escapedItemTitle}
                </div>

                <div class="queue-details">
                    <span class="queue-size">${escapeHtml(formatSize(item.sizeleft))} left</span>
                    <span class="queue-status-chip ${statusClass}" title="${escapedStatusMessage}" style="cursor:help;">${escapedStatusText}</span>
                </div>
            </div>
            <div class="queue-actions">
                ${isWarning ? `<button class="queue-action-btn import-btn" title="Manual Import">🔧</button>` : '<div></div>'}
                <button class="queue-action-btn delete-btn" title="Remove from Queue">×</button>
            </div>
        `;

        if (!movie || !movie.title || movie.title === 'Unknown') {
            Radarr.parseTitle(state.configs.radarrUrl, state.configs.radarrKey, item.title)
                .then(parsed => {
                    if (parsed) {
                        // If Radarr mapped it to a real movie
                        if (parsed.movie && parsed.movie.title) {
                            const titleEl = card.querySelector('#queue-title-' + item.id);
                            if (titleEl) {
                                titleEl.textContent = parsed.movie.title;
                                titleEl.title = parsed.movie.title;
                            }
                            
                            const posterEl = card.querySelector('#queue-poster-' + item.id);
                            if (posterEl) {
                                const newPosterUrl = getPosterUrl(parsed.movie);
                                if (newPosterUrl && newPosterUrl !== 'icons/icon48.png') {
                                    posterEl.src = newPosterUrl;
                                }
                            }
                        } 
                        // If Radarr couldn't map it, but still extracted a title string
                        else if (parsed.parsedMovieInfo && parsed.parsedMovieInfo.movieTitle) {
                            const titleEl = card.querySelector('#queue-title-' + item.id);
                            if (titleEl) {
                                const rawTitle = parsed.parsedMovieInfo.movieTitle;
                                // Combine title and year if parsed
                                const displayTitle = parsed.parsedMovieInfo.year ? `${rawTitle} (${parsed.parsedMovieInfo.year})` : rawTitle;
                                titleEl.innerHTML = escapeHtml(displayTitle) + ' <span style="font-size: 0.8em; color: #ff9800;">(Unmapped)</span>';
                                titleEl.title = displayTitle + " (Movie not matched in DB)";
                            }
                        }
                    }
                }).catch(err => console.log("Radarr Parse API error", err));
        }

        // Event handlers
        const delBtn = card.querySelector('.delete-btn');
        if (delBtn) {
            delBtn.onclick = (e) => {
                e.stopPropagation();
                
                // Check if options already shown
                if (card.querySelector('.queue-delete-options')) return;
                
                const optionsDiv = document.createElement('div');
                optionsDiv.className = 'queue-delete-options';

                const btnRemove = document.createElement('button');
                btnRemove.className = 'btn-remove';
                btnRemove.title = 'Remove from Client';
                btnRemove.textContent = '🗑️';

                const btnBlock = document.createElement('button');
                btnBlock.className = 'btn-block';
                btnBlock.title = 'Blocklist & Search';
                btnBlock.textContent = '🚫';

                const btnCancel = document.createElement('button');
                btnCancel.className = 'btn-cancel';
                btnCancel.textContent = '×';

                optionsDiv.appendChild(btnRemove);
                optionsDiv.appendChild(btnBlock);
                optionsDiv.appendChild(btnCancel);

                btnRemove.onclick = async (ev) => {
                    ev.stopPropagation();
                    const confirmed = await showConfirmModal('Remove from Queue', 'Remove from queue?', 'Remove', '#ffc107');
                    if (!confirmed) return;
                    try {
                        await Radarr.deleteQueueItem(state.configs.radarrUrl, state.configs.radarrKey, item.id, true, false);
                        card.remove();
                        showNotification('Item removed from queue', 'success');
                    } catch(e) {
                        showNotification(e.message.includes('404') ? 'Item not found' : 'Error: ' + e.message, 'error');
                        if (e.message.includes('404')) card.remove();
                    }
                    setTimeout(refreshQueue, 250);
                };

                btnBlock.onclick = async (ev) => {
                    ev.stopPropagation();
                    const confirmed = await showConfirmModal('Remove & Blocklist', 'Remove, Blocklist and Search for new one?', 'Blocklist', '#f44336');
                    if (!confirmed) return;
                    try {
                        await Radarr.deleteQueueItem(state.configs.radarrUrl, state.configs.radarrKey, item.id, true, true);
                        showNotification('Item blocked and searching for new release', 'success');
                    } catch(e) {
                        showNotification(e.message.includes('404') ? 'Item not found' : 'Error: ' + e.message, 'error');
                        if (e.message.includes('404')) card.remove();
                    }
                    setTimeout(refreshQueue, 250);
                };

                btnCancel.onclick = (ev) => {
                    ev.stopPropagation();
                    optionsDiv.remove();
                };
                
                delBtn.style.display = 'none';
                delBtn.parentNode.appendChild(optionsDiv);
            };
        }

        // Manual import button
        if (isWarning) {
            const importBtn = card.querySelector('.import-btn');
            if (importBtn) {
                importBtn.onclick = (e) => {
                    e.stopPropagation();
                    showManualImportDialog(item, state, card, refreshQueue);
                };
            }
        }

        container.appendChild(card);
    });
}

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
        buttonsDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-top: 20px;';
        
        // Left side: Delete options
        const leftActions = document.createElement('div');
        leftActions.style.cssText = 'display: flex; align-items: center; gap: 5px;';
        
        const trashBtn = document.createElement('button');
        trashBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
        trashBtn.title = "Remove from Queue";
        trashBtn.style.cssText = 'background: #f44336; color: white; border: none; border-radius: 4px; width: 36px; height: 36px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s;';
        trashBtn.onmouseover = () => trashBtn.style.background = "#d32f2f";
        trashBtn.onmouseout = () => trashBtn.style.background = "#f44336";
        
        trashBtn.onclick = (e) => {
             e.stopPropagation();
             // Expand options
             leftActions.innerHTML = '';
             
             const btnRemove = document.createElement('button');
             btnRemove.innerHTML = '🗑️ Remove';
             btnRemove.title = "Remove from Client";
             btnRemove.style.cssText = "background: #f44336; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em; margin-right: 5px;";
             
             const btnBlock = document.createElement('button');
             btnBlock.innerHTML = '🚫 Blocklist';
             btnBlock.title = "Remove, Blocklist & Search";
             btnBlock.style.cssText = "background: #ff9800; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em; margin-right: 5px;";
             
             const btnCancel = document.createElement('button');
             btnCancel.textContent = "×";
             btnCancel.style.cssText = "background: #9e9e9e; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer;";
             
             btnRemove.onclick = async () => {
                if(confirm('Confirm Remove from Queue?')) {
                    try {
                        await Radarr.deleteQueueItem(state.configs.radarrUrl, state.configs.radarrKey, item.id, true, false);
                        showNotification('Item removed', 'success');
                        dialog.remove();
                        backdrop.remove();
                        if(refreshQueue) refreshQueue();
                    } catch(err) {
                        showNotification('Error removing: ' + err.message, 'error');
                    }
                }
             };
             
             btnBlock.onclick = async () => {
                 if(confirm('Confirm Blocklist release and search for new one?')) {
                    try {
                        await Radarr.deleteQueueItem(state.configs.radarrUrl, state.configs.radarrKey, item.id, true, true);
                        showNotification('Item blocked and searching', 'success');
                        dialog.remove();
                        backdrop.remove();
                        if(refreshQueue) refreshQueue();
                    } catch(err) {
                        showNotification('Error blocking: ' + err.message, 'error');
                    }
                 }
             };
             
             btnCancel.onclick = () => {
                 leftActions.innerHTML = '';
                 leftActions.appendChild(trashBtn);
             };
             
             leftActions.appendChild(btnRemove);
             leftActions.appendChild(btnBlock);
             leftActions.appendChild(btnCancel);
        };
        
        leftActions.appendChild(trashBtn);
        
        // Right side: Import buttons
        const rightActions = document.createElement('div');
        rightActions.style.cssText = 'display: flex; gap: 10px;';
        
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
        
        buttonsDiv.appendChild(leftActions);
        rightActions.appendChild(cancelBtn);
        rightActions.appendChild(importBtn);
        buttonsDiv.appendChild(rightActions);
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

function renderRadarrMissing(records, state) {
    const container = document.getElementById("radarr-missing");
    if (!container) return;
    container.textContent = '';
    
    const now = new Date();
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
    refreshBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>`;
    refreshBtn.title = "Refresh Cache";
    refreshBtn.classList.add("icon-btn");
    refreshBtn.style.cssText = "background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); padding: 0; border-radius: 6px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;";
    
    refreshBtn.onmouseover = () => { refreshBtn.style.background = "rgba(255,255,255,0.1)"; refreshBtn.style.color = "var(--accent-radarr)"; };
    refreshBtn.onmouseout = () => { refreshBtn.style.background = "rgba(255,255,255,0.05)"; refreshBtn.style.color = "var(--text-primary)"; };
    
    refreshBtn.onclick = () => {
        loadRadarrMissing(state.configs.radarrUrl, state.configs.radarrKey, state, true);
    };
    
    const searchAllBtn = document.createElement('button');
    searchAllBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> Search All`;
    searchAllBtn.title = "Search All Missing Movies";
    searchAllBtn.classList.add("btn-primary");
    searchAllBtn.style.cssText = "background: var(--accent-radarr); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 6px; font-size: 0.9em; font-weight: bold;";
    
    searchAllBtn.onmouseover = () => { searchAllBtn.style.filter = "brightness(1.2)"; };
    searchAllBtn.onmouseout = () => { searchAllBtn.style.filter = "brightness(1)"; };
    
    searchAllBtn.onclick = async () => {
        const confirmed = await showConfirmModal('Search All Missing', 'Trigger an automatic search for ALL missing movies in Radarr?', 'Search', 'var(--accent-radarr)');
        if (!confirmed) return;
        
        searchAllBtn.textContent = 'Searching...';
        searchAllBtn.style.pointerEvents = 'none';
        searchAllBtn.style.opacity = '0.7';
        
        try {
            await fetch(`${state.configs.radarrUrl}/api/v3/command`, {
                 method: 'POST',
                 headers: { 
                    'X-Api-Key': state.configs.radarrKey,
                    'Content-Type': 'application/json'
                 },
                 body: JSON.stringify({ name: 'MissingMoviesSearch' })
            });
            showNotification('Started search for all missing movies', 'success');
        } catch (e) {
            showNotification('Error starting search', 'error');
        }
        
        setTimeout(() => {
            searchAllBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> Search All`;
            searchAllBtn.style.pointerEvents = 'auto';
            searchAllBtn.style.opacity = '1';
        }, 2000);
    };

    const actionsDiv = document.createElement('div');
    actionsDiv.style.cssText = "display: flex; gap: 8px; align-items: center;";
    actionsDiv.appendChild(searchAllBtn);
    actionsDiv.appendChild(refreshBtn);
    
    toolbar.appendChild(countBadge);
    toolbar.appendChild(actionsDiv);
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
        searchBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
        searchBtn.title = "Search for Movie";
        searchBtn.style.cssText = `
            position: absolute; top: 5px; right: 5px; 
            width: 28px; height: 28px; 
            background: rgba(0,0,0,0.6); border-radius: 50%; 
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; color: white;
            border: 1px solid rgba(255,255,255,0.2);
            backdrop-filter: blur(4px);
            transition: all 0.2s;
        `;
        searchBtn.onmouseover = () => { searchBtn.style.background = "var(--accent-radarr)"; searchBtn.style.borderColor = "var(--accent-radarr)"; };
        searchBtn.onmouseout = () => { searchBtn.style.background = "rgba(0,0,0,0.6)"; searchBtn.style.borderColor = "rgba(255,255,255,0.2)"; };

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
