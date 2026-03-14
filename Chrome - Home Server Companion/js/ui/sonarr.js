import * as Sonarr from "../../services/sonarr.js";
import { formatSize } from "../../services/utils.js";
import { showNotification, showConfirmModal, escapeHtml } from "../utils.js";

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
        // Create independent promise chains for parallel execution
        const pCalendar = Sonarr.getSonarrCalendar(url, key)
            .then(calendar => renderSonarrCalendar(calendar, state));

        const pQueue = Sonarr.getSonarrQueue(url, key)
            .then(queue => {
                renderSonarrQueue(queue.records || [], state);
                return updateSonarrBadge(url, key, queue);
            });

        const pHistory = Sonarr.getSonarrHistory(url, key)
            .then(history => renderSonarrHistory(history.records || [], state));

        // Add listeners for new tabs (lazy load)
        const sonarrView = document.getElementById("sonarr-view");
        if (sonarrView) {
            const missingBtn = sonarrView.querySelector('.tab-btn[data-tab="missing"]');
            if (missingBtn) {
                missingBtn.addEventListener('click', () => {
                   loadSonarrMissing(url, key, state);
                });
                
                // If tab is already active (restored state), load immediately
                if (missingBtn.classList.contains('active')) {
                    loadSonarrMissing(url, key, state);
                }
            }
        }

        // Wait for all (settled) so we don't throw on partial failure immediately
        await Promise.allSettled([pCalendar, pQueue, pHistory]);

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
          const linkBtn = document.createElement('button');
          linkBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
          linkBtn.title = "Open Calendar";
          linkBtn.style.cssText = "background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); cursor: pointer; padding: 6px 8px; border-radius: 6px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; margin-left: 10px;";
          
          linkBtn.onmouseover = () => { linkBtn.style.background = "rgba(255,255,255,0.1)"; linkBtn.style.color = "var(--accent-sonarr)"; };
          linkBtn.onmouseout = () => { linkBtn.style.background = "rgba(255,255,255,0.05)"; linkBtn.style.color = "var(--text-secondary)"; };
          
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
             btn.classList.add('spinning');
             btn.disabled = true;
        }
        try {
            const newQueue = await Sonarr.getSonarrQueue(state.configs.sonarrUrl, state.configs.sonarrKey);
            await updateSonarrBadge(state.configs.sonarrUrl, state.configs.sonarrKey, newQueue);
            renderSonarrQueue(newQueue.records || [], state);
        } catch(e) {
            if(btn) {
                btn.classList.remove('spinning');
                btn.disabled = false;
            }
        }
    };

    // Helper to get poster URL
    const getPosterUrl = (series) => {
        let posterUrl = 'icons/icon48.png';
        if (series && series.images) {
            const posterObj = series.images.find(img => img.coverType.toLowerCase() === 'poster');
            if (posterObj) {
                if (posterObj.remoteUrl) {
                    posterUrl = posterObj.remoteUrl;
                } else if (posterObj.url) {
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
                }
            }
        }
        return posterUrl;
    };

    // Toolbar with icon-only buttons
    const toolbar = document.createElement('div');
    toolbar.style.cssText = "display: flex; justify-content: flex-end; margin-bottom: 10px; padding: 0 5px; gap: 8px;";
    
    // Open in Sonarr button (external link icon)
    const linkBtn = document.createElement('button');
    linkBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    linkBtn.title = "Open Activity Queue in Sonarr";
    linkBtn.style.cssText = "background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); cursor: pointer; padding: 6px 8px; border-radius: 6px; transition: all 0.2s; display: flex; align-items: center; justify-content: center;";
    linkBtn.onmouseover = () => { linkBtn.style.background = "rgba(255,255,255,0.1)"; linkBtn.style.color = "var(--accent-sonarr)"; };
    linkBtn.onmouseout = () => { linkBtn.style.background = "rgba(255,255,255,0.05)"; linkBtn.style.color = "var(--text-secondary)"; };
    linkBtn.onclick = (e) => {
        e.stopPropagation();
        let cleanUrl = state.configs.sonarrUrl;
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
    
    // Check if style already added in Radarr; Sonarr might run alone too, so safe to check and add
    const style = document.createElement('style');
    style.textContent = `.refresh-btn.spinning svg { animation: spin 1s linear infinite; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
    if (!document.querySelector('style[data-refresh-spin]')) {
        style.dataset.refreshSpin = 'true';
        document.head.appendChild(style);
    }
    
    toolbar.appendChild(linkBtn);
    toolbar.appendChild(refreshBtn);
    container.appendChild(toolbar);

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
        const series = item.series || {};
        const episode = item.episode || {};
        const posterUrl = getPosterUrl(series);
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
        
        // Episode String (S01E01)
        const sNum = String(episode.seasonNumber || 0).padStart(2, '0');
        const eNum = String(episode.episodeNumber || 0).padStart(2, '0');
        const epString = `S${sNum}E${eNum}`;

        // Create queue card
        const card = document.createElement('div');
        card.className = `queue-card${isWarning ? ' ' + tStatus : ''}`;

        const displayTitle = escapeHtml(series.title || 'Unknown');
        const escapedQuality = escapeHtml(quality);
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
                    <span id="queue-epstring-${item.id}" style="font-weight:700; color:var(--text-primary); margin-right:6px;">${escapeHtml(epString)}</span>
                    ${quality ? `<span class="queue-quality">${escapedQuality}</span>` : ''}
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

        if (!series || !series.title) {
            Sonarr.parseTitle(state.configs.sonarrUrl, state.configs.sonarrKey, item.title)
                .then(parsed => {
                    if (parsed) {
                        // If Sonarr mapped it to a real series
                        if (parsed.series && parsed.series.title) {
                            const titleEl = card.querySelector('#queue-title-' + item.id);
                            if (titleEl) {
                                titleEl.textContent = parsed.series.title;
                                titleEl.title = parsed.series.title;
                            }
                            
                            const posterEl = card.querySelector('#queue-poster-' + item.id);
                            if (posterEl) {
                                const newPosterUrl = getPosterUrl(parsed.series);
                                if (newPosterUrl && newPosterUrl !== 'icons/icon48.png') {
                                    posterEl.src = newPosterUrl;
                                }
                            }
                        } 
                        // If Sonarr couldn't map it, but still extracted a title string
                        else if (parsed.parsedEpisodeInfo && parsed.parsedEpisodeInfo.seriesTitle) {
                            const rawTitle = parsed.parsedEpisodeInfo.seriesTitle;
                            const titleEl = card.querySelector('#queue-title-' + item.id);
                            
                            // Start by displaying the unmapped string
                            if (titleEl) {
                                titleEl.innerHTML = escapeHtml(rawTitle) + ' <span style="font-size: 0.8em; color: #ff9800;">(Unmapped)</span>';
                                titleEl.title = rawTitle + " (Series not matched in DB)";
                            }

                            // Attempt local fuzzy match
                            Sonarr.getSonarrSeries(state.configs.sonarrUrl, state.configs.sonarrKey)
                                .then(allSeries => {
                                    if (!allSeries || allSeries.length === 0) return;
                                    
                                    // Basic tokenization: lowercase, remove non-alphanumeric, split by spaces
                                    const tokenize = (str) => {
                                        return (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
                                    };
                                    
                                    const rawTokens = tokenize(rawTitle);
                                    if (rawTokens.length === 0) return;
                                    
                                    const firstWord = rawTokens[0];
                                    
                                    let bestMatch = null;
                                    let bestScore = 0;

                                    allSeries.forEach(s => {
                                        // Check main title
                                        const titleTokens = tokenize(s.title);
                                        if (titleTokens.length > 0 && titleTokens[0] === firstWord) {
                                            // Score 1.0 for perfect first word match
                                            if (1.0 > bestScore) {
                                                bestScore = 1.0;
                                                bestMatch = s;
                                            }
                                        }

                                        // Check Aliases if requested
                                        if (s.alternateTitles) {
                                            s.alternateTitles.forEach(alt => {
                                                const altTokens = tokenize(alt.title);
                                                if (altTokens.length > 0 && altTokens[0] === firstWord) {
                                                     if (1.0 > bestScore) {
                                                        bestScore = 1.0;
                                                        bestMatch = s;
                                                     }
                                                }
                                            });
                                        }
                                    });

                                    // If we matched the first word
                                    if (bestMatch && bestScore > 0) {
                                        if (titleEl) {
                                            titleEl.innerHTML = escapeHtml(bestMatch.title) + ' <span style="font-size: 0.8em; color: #4caf50;">(Fuzzy)</span>';
                                            titleEl.title = `Mapped from first word of: ${rawTitle}`;
                                        }
                                        
                                        const posterEl = card.querySelector('#queue-poster-' + item.id);
                                        if (posterEl) {
                                            const newPosterUrl = getPosterUrl(bestMatch);
                                            if (newPosterUrl && newPosterUrl !== 'icons/icon48.png') {
                                                posterEl.src = newPosterUrl;
                                            }
                                        }
                                    }

                                }).catch(err => console.log("Fuzzy match fetch failed", err));
                        }

                        // Try to update Season/Episode number whether mapped or unmapped
                        const epStringEl = card.querySelector('#queue-epstring-' + item.id);
                        if (epStringEl) {
                            if (parsed.episodes && parsed.episodes.length > 0) {
                                const ep = parsed.episodes[0];
                                const parseSNum = String(ep.seasonNumber || 0).padStart(2, '0');
                                const parseENum = String(ep.episodeNumber || 0).padStart(2, '0');
                                epStringEl.textContent = `S${parseSNum}E${parseENum}`;
                            } else if (parsed.parsedEpisodeInfo) {
                                const pInfo = parsed.parsedEpisodeInfo;
                                const parseSNum = String(pInfo.seasonNumber || 0).padStart(2, '0');
                                const parseENum = (pInfo.episodeNumbers && pInfo.episodeNumbers.length > 0) 
                                    ? String(pInfo.episodeNumbers[0]).padStart(2, '0') 
                                    : '00';
                                epStringEl.textContent = `S${parseSNum}E${parseENum}`;
                            }
                        }
                    }
                }).catch(err => {
                    console.log("Failed to parse unknown queue item title:", err);
                });
        }

        // Event handlers
        const delBtn = card.querySelector('.delete-btn');
        if (delBtn) {
            delBtn.onclick = (e) => {
                e.stopPropagation();
                
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
                    const confirmed = await showConfirmModal('Remove from Queue', 'Remove from queue?', 'Remove', '#2196f3');
                    if (!confirmed) return;
                    try {
                        await Sonarr.deleteQueueItem(state.configs.sonarrUrl, state.configs.sonarrKey, item.id, true, false);
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
                        await Sonarr.deleteQueueItem(state.configs.sonarrUrl, state.configs.sonarrKey, item.id, true, true);
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
 * Shows a dialog for manual import of a Sonarr queue item
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
            Sonarr.getManualImportOptions(
                state.configs.sonarrUrl,
                state.configs.sonarrKey,
                downloadId,
                outputPath
            ),
            Sonarr.getSonarrLanguages(state.configs.sonarrUrl, state.configs.sonarrKey),
            Sonarr.getSonarrQualities(state.configs.sonarrUrl, state.configs.sonarrKey)
        ]);
        
        loadingDiv.remove();
        
        if (!importOptions || importOptions.length === 0) {
            const errorDiv = document.createElement('div');
            errorDiv.textContent = 'No files found for import. The download may have already been imported or removed.';
            errorDiv.style.cssText = 'padding: 20px; color: #ff9800; text-align: center;';
            dialog.appendChild(errorDiv);
            return;
        }
        
        // Use the first file (usually one or more episodes)
        const fileOption = importOptions[0];
        
        // VIDEO FILENAME Display
        const originalNameDiv = document.createElement('div');
        originalNameDiv.style.cssText = 'margin-bottom: 15px;';
        const originalNameLabel = document.createElement('div');
        originalNameLabel.textContent = 'Video File:'; // Changed Label
        originalNameLabel.style.cssText = 'font-weight: bold; color: var(--text-primary); margin-bottom: 5px; font-size: 0.9em;';
        const originalNameValue = document.createElement('div');
        
        let videoFileName = fileOption.relativePath || fileOption.path || 'Unknown';
       
        originalNameValue.textContent = videoFileName; 
        originalNameValue.style.cssText = 'color: var(--text-primary); padding: 8px; background: rgba(0,0,0,0.3); border-radius: 4px; font-family: monospace; font-size: 1.1em; word-break: break-all; line-height: 1.4;';
        originalNameDiv.appendChild(originalNameLabel);
        originalNameDiv.appendChild(originalNameValue);
        dialog.appendChild(originalNameDiv);
        
        // Series/Episode name
        const episodeNameDiv = document.createElement('div');
        episodeNameDiv.style.cssText = 'margin-bottom: 15px;';
        const episodeLabel = document.createElement('div');
        episodeLabel.textContent = 'Episode to Import As:';
        episodeLabel.style.cssText = 'font-weight: bold; color: var(--text-primary); margin-bottom: 5px; font-size: 0.9em;';
        const episodeValue = document.createElement('div');
        
        let episodeText = 'Unknown';
        if (fileOption.series && fileOption.episodes && fileOption.episodes.length > 0) {
            const ep = fileOption.episodes[0];
            const sNum = String(ep.seasonNumber || 0).padStart(2, '0');
            const eNum = String(ep.episodeNumber || 0).padStart(2, '0');
            episodeText = `${fileOption.series.title} - S${sNum}E${eNum} - ${ep.title || ''}`;
        }
        
        episodeValue.textContent = episodeText;
        episodeValue.style.cssText = 'color: var(--text-secondary); padding: 8px; background: var(--bg-secondary); border-radius: 4px; border: 1px solid var(--border-color);';
        episodeNameDiv.appendChild(episodeLabel);
        episodeNameDiv.appendChild(episodeValue);
        dialog.appendChild(episodeNameDiv);
        
        const qualityDiv = document.createElement('div');
        qualityDiv.style.cssText = 'margin-bottom: 15px;';
        const qualityLabel = document.createElement('label');
        qualityLabel.textContent = 'Quality:';
        qualityLabel.style.cssText = 'font-weight: bold; color: var(--text-primary); display: block; margin-bottom: 5px; font-size: 0.9em;';
        const qualitySelect = document.createElement('select');
        qualitySelect.style.cssText = 'width: 100%; padding: 8px; background-color: #2b2b2b; color: #eeeeee; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;';
        

        const detectedQualityId = fileOption.quality?.quality?.id;
        const detectedQualityName = fileOption.quality?.quality?.name; // e.g. "WEBDL-1080p"
        
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
             option.style.backgroundColor = "#2b2b2b";
             option.style.color = "#eeeeee";
             
             // Select if it matches our determined target
             if (targetQuality && qDef.id === targetQuality.id) {
                 option.selected = true;
             }
             qualitySelect.appendChild(option);
        });
        
        // (Removed old fallback check)

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
        
        const languageDiv = document.createElement('div');
        languageDiv.style.cssText = 'margin-bottom: 20px;';
        const languageLabel = document.createElement('label');
        languageLabel.textContent = 'Language:';
        languageLabel.style.cssText = 'font-weight: bold; color: var(--text-primary); display: block; margin-bottom: 5px; font-size: 0.9em;';
        const languageSelect = document.createElement('select');

        languageSelect.style.cssText = 'width: 100%; padding: 8px; background-color: #2b2b2b; color: #eeeeee; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;';
        
        const detectedLangId = (fileOption.languages && fileOption.languages.length > 0) ? fileOption.languages[0].id : null;

        allLanguages.sort((a,b) => a.name.localeCompare(b.name)).forEach(lang => {
            const option = document.createElement('option');
            option.value = JSON.stringify(lang);
            option.textContent = lang.name;
            option.style.backgroundColor = "#2b2b2b";
            option.style.color = "#eeeeee";
            
            if (lang.id === detectedLangId) {
                option.selected = true;
            } else if (!detectedLangId && lang.name === "English") {
                // Default to english if nothing detected?
                // option.selected = true; 
            }
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
                        await Sonarr.deleteQueueItem(state.configs.sonarrUrl, state.configs.sonarrKey, item.id, true, false);
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
                        await Sonarr.deleteQueueItem(state.configs.sonarrUrl, state.configs.sonarrKey, item.id, true, true);
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
                    seriesId: fileOption.series?.id || item.seriesId,
                    episodeIds: fileOption.episodes?.map(ep => ep.id) || [],
                    quality: selectedQuality,
                    languages: [selectedLanguage],
                    releaseGroup: fileOption.releaseGroup || ''
                };
                
                // Execute import
                await Sonarr.executeManualImport(
                    state.configs.sonarrUrl,
                    state.configs.sonarrKey,
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

async function updateSonarrBadge(url, key, existingQueue = null) {
    const sonarrNavItem = document.querySelector('.nav-item[data-target="sonarr"]');
    if (!sonarrNavItem) return;

    let badge = sonarrNavItem.querySelector('.nav-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'nav-badge hidden';
        sonarrNavItem.appendChild(badge);
    }
    
    try {
        const queue = existingQueue || await Sonarr.getSonarrQueue(url, key);
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

/**
 * Loads missing episodes with Caching (15 min)
 */
async function loadSonarrMissing(url, key, state, forceRefresh = false) {
    const container = document.getElementById("sonarr-missing");
    if (!container) return;
    
    // Check Cache first
    if (!forceRefresh) {
        try {
            const cache = await new Promise(resolve => chrome.storage.local.get(['sonarrMissingCache'], resolve));
            if (cache.sonarrMissingCache) {
                const { timestamp, data } = cache.sonarrMissingCache;
                const age = (Date.now() - timestamp) / 1000 / 60; // Minutes
                if (age < 15) {
                    renderSonarrMissing(data, state);
                    return; 
                }
            }
        } catch(e) { console.warn("Cache read error", e); }
    }

    container.textContent = '';
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.textContent = 'Loading Missing Episodes...';
    container.appendChild(spinner);
    
    try {
        const data = await Sonarr.getSonarrMissing(url, key);
        const records = data.records || [];
        
        renderSonarrMissing(records, state);
        
        // Save Cache
        chrome.storage.local.set({
            sonarrMissingCache: {
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
 * Renders missing episodes as a Poster Grid (similar to Calendar/Recent)
 * Filters for Released episodes only.
 */
function renderSonarrMissing(records, state) {
    const container = document.getElementById("sonarr-missing");
    if (!container) return;
    container.textContent = '';
    
    // Filter: AirDate must be in the past (Released)
    const now = new Date();
    const filtered = records.filter(item => {
        if (!item.airDateUtc) return false;
        return new Date(item.airDateUtc) <= now;
    });

    // Sort by Date Descending
    filtered.sort((a, b) => new Date(b.airDateUtc) - new Date(a.airDateUtc));

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
    
    refreshBtn.onmouseover = () => { refreshBtn.style.background = "rgba(255,255,255,0.1)"; refreshBtn.style.color = "var(--accent-sonarr)"; };
    refreshBtn.onmouseout = () => { refreshBtn.style.background = "rgba(255,255,255,0.05)"; refreshBtn.style.color = "var(--text-primary)"; };
    
    refreshBtn.onclick = () => {
        loadSonarrMissing(state.configs.sonarrUrl, state.configs.sonarrKey, state, true);
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
        emptyMsg.textContent = "No missing released episodes found.";
        container.appendChild(emptyMsg);
        return;
    }

    const grid = document.createElement("div");
    grid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; padding: 5px;";

    filtered.forEach(item => {
        const card = document.createElement("div");
        card.style.cssText = "background: var(--card-bg); border-radius: 8px; overflow: hidden; position: relative; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: transform 0.2s; cursor: pointer;";
        
        // Find Image (Poster)
        let posterUrl = 'icons/icon48.png';
        if (item.series && item.series.images) {
            const posterObj = item.series.images.find(img => img.coverType.toLowerCase() === 'poster');
            if (posterObj) {
                if (posterObj.url) {
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
        
        const sTitle = document.createElement("div");
        sTitle.textContent = item.series ? item.series.title : "Unknown";
        sTitle.style.cssText = "font-weight: bold; font-size: 0.9em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";
        
        const epInfo = document.createElement("div");
        const sNum = String(item.seasonNumber).padStart(2, '0');
        const eNum = String(item.episodeNumber).padStart(2, '0');
        epInfo.textContent = `S${sNum}E${eNum}`;
        epInfo.style.cssText = "font-size: 0.8em; opacity: 0.9;";
        
        const airDate = new Date(item.airDateUtc).toLocaleDateString();
        const dateDiv = document.createElement("div");
        dateDiv.textContent = airDate;
        dateDiv.style.cssText = "font-size: 0.75em; opacity: 0.8; margin-top: 2px;";

        infoDiv.appendChild(sTitle);
        infoDiv.appendChild(epInfo);
        infoDiv.appendChild(dateDiv);

        const searchBtn = document.createElement("div");
        searchBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
        searchBtn.title = "Search for Episode";
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
        searchBtn.onmouseover = () => { searchBtn.style.background = "var(--accent-sonarr)"; searchBtn.style.borderColor = "var(--accent-sonarr)"; };
        searchBtn.onmouseout = () => { searchBtn.style.background = "rgba(0,0,0,0.6)"; searchBtn.style.borderColor = "rgba(255,255,255,0.2)"; };
        
        searchBtn.onclick = async (e) => {
             e.stopPropagation();
             searchBtn.style.pointerEvents = "none";
             searchBtn.textContent = "⏳";
             try {
                 await fetch(`${state.configs.sonarrUrl}/api/v3/command`, {
                     method: 'POST',
                     headers: { 
                        'X-Api-Key': state.configs.sonarrKey,
                        'Content-Type': 'application/json'
                     },
                     body: JSON.stringify({
                         name: 'EpisodeSearch',
                         episodeIds: [item.id]
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

        // Card Click -> Open Series
        card.onclick = () => {
             if (item.series && item.series.titleSlug) {
                 const url = state.configs.sonarrUrl;
                 chrome.tabs.create({ url: `${url}/series/${item.series.titleSlug}` });
             }
        };

        grid.appendChild(card);
    });
    
    container.appendChild(grid);
}

// Export for background updates
export { updateSonarrBadge };
