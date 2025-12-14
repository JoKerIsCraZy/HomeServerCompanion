import * as Radarr from "../../services/radarr.js";
import { formatSize } from "../../services/utils.js";

export async function initRadarr(url, key, state) {
    try {
        // Calendar
        const calendar = await Radarr.getRadarrCalendar(url, key);
        renderRadarrCalendar(calendar, state);

        // Load Queue
        const queue = await Radarr.getRadarrMovies(url, key);
        renderRadarrQueue(queue.records || []);

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

      grouped[dateKey].forEach((movie) => {
        const item = document.createElement("div");
        item.className = "calendar-item";

        let type = "Cinema";
        if (
          movie.digitalRelease &&
          new Date(movie.digitalRelease).toDateString() ===
            dateObj.toDateString()
        )
          type = "Digital";
        else if (
          movie.physicalRelease &&
          new Date(movie.physicalRelease).toDateString() ===
            dateObj.toDateString()
        )
          type = "Physical";

        let statusClass = "status-Airing";
        let statusText = "Upcoming";

        if (movie.hasFile) {
          statusClass = "status-Downloaded";
          statusText = "Downloaded";
        } else if (movie.isAvailable) {
          statusClass = "status-Airing";
          statusText = "Available";
        } else {
          statusClass = "status-Unaired";
          statusText = "Upcoming";
        }

        // --- SAFE DOM ---
        
        // Left (Type)
        const leftDiv = document.createElement('div');
        leftDiv.className = 'calendar-left';
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'cal-time';
        timeDiv.style.fontSize = '11px';
        timeDiv.style.textTransform = 'uppercase';
        timeDiv.textContent = type;
        leftDiv.appendChild(timeDiv);

        // Main
        const mainDiv = document.createElement('div');
        mainDiv.className = 'calendar-main';
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'cal-title clickable-link';
        if (movie.titleSlug) titleDiv.dataset.slug = movie.titleSlug;
        titleDiv.textContent = movie.title;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'cal-meta';
        metaDiv.textContent = movie.studio || "";

        mainDiv.appendChild(titleDiv);
        mainDiv.appendChild(metaDiv);
        
        // Badge
        const badgeDiv = document.createElement('div');
        badgeDiv.className = `status-badge ${statusClass}`;
        badgeDiv.style.marginLeft = '10px';
        badgeDiv.textContent = statusText;

        // Assemble
        item.appendChild(leftDiv);
        item.appendChild(mainDiv);
        item.appendChild(badgeDiv);

        // Add click listener
        if (movie.titleSlug) {
          titleDiv.addEventListener("click", (e) => {
            e.stopPropagation();
            const url = state.configs.radarrUrl;
            chrome.tabs.create({ url: `${url}/movie/${movie.titleSlug}` });
          });
        }

        dateGroup.appendChild(item);
      });
      container.appendChild(dateGroup);
    });
}

function renderRadarrQueue(records) {
    const container = document.getElementById("radarr-queue");
    if (!container) return;
    container.innerHTML = "";
    if (records.length === 0) {
      container.innerHTML =
        '<div class="card"><div class="card-header">Queue Empty</div></div>';
      return;
    }

    const tmpl = document.getElementById("sab-queue-item");
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
      
      const delBtn = clone.querySelector(".delete-btn");
      if(delBtn) delBtn.style.display = "none";

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
