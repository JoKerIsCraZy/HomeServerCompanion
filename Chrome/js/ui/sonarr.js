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

      // Items
      grouped[dateStr].forEach((ep) => {
        const item = document.createElement("div");
        item.className = "calendar-item";

        const airTime = new Date(ep.airDateUtc);
        const timeStr = airTime.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });

        let statusClass = "status-Unaired";
        let statusText = "Unaired";

        if (ep.hasFile) {
          statusClass = "status-Downloaded";
          statusText = "Downloaded";
        } else if (new Date() > airTime) {
          statusClass = "status-Missing";
          statusText = "Missing";
        } else {
          statusClass = "status-Airing";
          statusText = "Airing";
        }

        // --- SAFE DOM CREATION ---
        
        // Left Column (Time)
        const leftDiv = document.createElement('div');
        leftDiv.className = 'calendar-left';
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'cal-time';
        timeDiv.textContent = timeStr;
        leftDiv.appendChild(timeDiv);

        // Main Column
        const mainDiv = document.createElement('div');
        mainDiv.className = 'calendar-main';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'cal-title clickable-link';
        // DATA ATTRIBUTE IS SAFE
        if (ep.series && ep.series.titleSlug) {
            titleDiv.dataset.slug = ep.series.titleSlug; 
        }
        // SAFE TEXT CONTENT
        titleDiv.textContent = ep.series ? ep.series.title : "Unknown";
        
        const metaDiv = document.createElement('div');
        metaDiv.className = 'cal-meta';
        metaDiv.textContent = `S${ep.seasonNumber}E${ep.episodeNumber} - ${ep.title}`;
        
        mainDiv.appendChild(titleDiv);
        mainDiv.appendChild(metaDiv);

        // Status Badge
        const badgeDiv = document.createElement('div');
        badgeDiv.className = `status-badge ${statusClass}`;
        badgeDiv.style.marginLeft = '10px';
        badgeDiv.textContent = statusText;

        // Assemble
        item.appendChild(leftDiv);
        item.appendChild(mainDiv);
        item.appendChild(badgeDiv);
        
        // Add click listener
        if (ep.series && ep.series.titleSlug) {
            titleDiv.addEventListener("click", (e) => {
                e.stopPropagation();
                const url = state.configs.sonarrUrl;
                chrome.tabs.create({ url: `${url}/series/${ep.series.titleSlug}` });
            });
        }

        dateGroup.appendChild(item);
      });

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
