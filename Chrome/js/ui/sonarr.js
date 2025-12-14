import * as Sonarr from "../../services/sonarr.js";
import { formatSize } from "../../services/utils.js";

export async function initSonarr(url, key, state) {
    try {
        // Calendar
        const calendar = await Sonarr.getSonarrCalendar(url, key);
        renderSonarrCalendar(calendar, state);

        // Queue
        const queue = await Sonarr.getSonarrQueue(url, key);
        renderSonarrQueue(queue.records || []);

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
    container.innerHTML = "";
    if (episodes.length === 0) {
      container.innerHTML =
        '<div class="card"><div class="card-header">No upcoming episodes</div></div>';
      return;
    }

    // Group by Date
    const grouped = {};
    episodes.forEach((ep) => {
      const dateStr = new Date(ep.airDateUtc).toLocaleDateString();
      if (!grouped[dateStr]) grouped[dateStr] = [];
      grouped[dateStr].push(ep);
    });

    Object.keys(grouped).forEach((dateStr) => {
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
      header.textContent = headerText;
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

function renderSonarrQueue(records) {
    const container = document.getElementById("sonarr-queue");
    if (!container) return;
    container.innerHTML = "";
    if (records.length === 0) {
      container.innerHTML =
        '<div class="card"><div class="card-header">Queue Empty</div></div>';
      return;
    }

    const tmpl = document.getElementById("sab-queue-item"); // Re-using queue item template
    if (!tmpl) return;

    records.forEach((item) => {
      const clone = tmpl.content.cloneNode(true);
      clone.querySelector(".filename").textContent = item.title;
      
      let percent = 0;
      if (item.size > 0) {
          percent = 100 - (item.sizeleft / item.size) * 100;
      }
      
      clone.querySelector(".percentage").textContent = `${Math.round(percent)}%`;
      clone.querySelector(".progress-bar-fill").style.width = `${percent}%`;
      clone.querySelector(".size").textContent = formatSize(item.sizeleft);
      clone.querySelector(".status").textContent = item.status;
      
      // Remove delete button or handle it if Sonarr API supports it easily
      const delBtn = clone.querySelector(".delete-btn");
      if(delBtn) delBtn.style.display = "none"; // Hide for now

      container.appendChild(clone);
    });
}

function renderSonarrHistory(records, state) {
    const container = document.getElementById("sonarr-history");
    if (!container) return;
    container.innerHTML = "";

    // Filter for only 'downloadFolderImported' (Completed Downloads)
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
      const seriesTitle = item.series ? item.series.title : "Unknown";

      let epString = "";
      if (item.episode) {
        epString = ` - S${item.episode.seasonNumber}E${item.episode.episodeNumber}`;
      }

      const filenameEl = clone.querySelector(".filename");
      filenameEl.textContent = `${seriesTitle}${epString}`;
      
      if (item.series && item.series.titleSlug) {
          filenameEl.classList.add('clickable-link');
          filenameEl.addEventListener('click', (e) => {
              e.stopPropagation();
              const url = state.configs.sonarrUrl;
              chrome.tabs.create({ url: `${url}/series/${item.series.titleSlug}` });
          });
      }

      const badge = clone.querySelector(".status-badge");
      // Friendly name
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
