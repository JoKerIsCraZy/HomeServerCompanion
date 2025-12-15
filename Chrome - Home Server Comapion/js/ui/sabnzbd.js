import * as Sabnzbd from "../../services/sabnzbd.js";

export async function initSabnzbd(url, key, state) {
  // Queue function to handle fetching and rendering
  const update = async () => {
    try {
      // Load Queue (contains stats)
      const queue = await Sabnzbd.getSabnzbdQueue(url, key);

      // Check if queue exists (avoid errors during partial loads)
      if (!queue) return;

      // Render Stats (Convert KB/s to MB/s)
      const kb = parseFloat(queue.kbpersec) || 0;
      const mb = (kb / 1024).toFixed(1);
      const speedEl = document.getElementById("sab-speed");
      if (speedEl) speedEl.textContent = `${mb} MB/s`;

      const timeEl = document.getElementById("sab-timeleft");
      if (timeEl) timeEl.textContent = queue.timeleft || "00:00:00";

      // Badge Logic
      const sabNavItem = document.querySelector('.nav-item[data-target="sabnzbd"]');
      if (sabNavItem) {
         let badge = sabNavItem.querySelector('.nav-badge');
         if (!badge) {
             badge = document.createElement('div');
             badge.className = 'nav-badge hidden';
             sabNavItem.appendChild(badge);
         }
         
         const count = queue.slots ? queue.slots.length : 0;
         if (count > 0) {
             badge.textContent = count;
             badge.classList.remove('hidden');
         } else {
             badge.classList.add('hidden');
         }
      }

      // Pause Button logic
      const pauseBtn = document.getElementById("sab-pause-btn");
      if (pauseBtn) {
        const isPaused = queue.paused;
        pauseBtn.textContent = isPaused ? "▶️" : "⏸️";
        pauseBtn.title = isPaused ? "Resume Queue" : "Pause Queue";
        if (isPaused) pauseBtn.classList.add("paused");
        else pauseBtn.classList.remove("paused");

        // Button Click Listener (Ensure single listener)
        pauseBtn.onclick = async () => {
          if (isPaused) await Sabnzbd.resumeQueue(url, key);
          else await Sabnzbd.pauseQueue(url, key);
          // Immediate update
          setTimeout(update, 200);
        };
      }

      renderSabnzbdQueue(queue.slots || [], state);

      // Load History
      const historyData = await Sabnzbd.getSabnzbdHistory(url, key);
      renderSabnzbdHistory(historyData.slots || [], state);
    } catch (e) {
      console.error("Auto-refresh error", e);
    }
  };

  // Initial Run
  await update();

  // Clear existing interval if any
  if (state.refreshInterval) clearInterval(state.refreshInterval);

  // Set new interval (1 second)
  state.refreshInterval = setInterval(update, 1000);
}

// Background Badge Update Function (exported for use by popup.js)
export async function updateSabnzbdBadge(url, key) {
  try {
    const queue = await Sabnzbd.getSabnzbdQueue(url, key);
    if (!queue) return;

    const sabNavItem = document.querySelector('.nav-item[data-target="sabnzbd"]');
    if (sabNavItem) {
      let badge = sabNavItem.querySelector('.nav-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'nav-badge hidden';
        sabNavItem.appendChild(badge);
      }
      
      const count = queue.slots ? queue.slots.length : 0;
      if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch (e) {
    console.error("Sabnzbd badge update error", e);
  }
}

function renderSabnzbdQueue(slots, state) {
  const container = document.getElementById("sab-queue");
  if (!container) return;
  container.innerHTML = "";
  if (slots.length === 0) {
    container.innerHTML =
      '<div class="card"><div class="card-header">Queue Empty</div></div>';
    return;
  }

  const tmpl = document.getElementById("sab-queue-item");
  slots.forEach((slot) => {
    const clone = tmpl.content.cloneNode(true);
    const filenameEl = clone.querySelector(".filename");
    filenameEl.textContent = slot.filename;
    filenameEl.title = slot.filename; // Tooltip for full name
    clone.querySelector(".percentage").textContent = `${slot.percentage}%`;
    clone.querySelector(
      ".progress-bar-fill"
    ).style.width = `${slot.percentage}%`;
    clone.querySelector(
      ".size"
    ).textContent = `${slot.mbleft} MB / ${slot.mb} MB`;
    clone.querySelector(".status").textContent = slot.status;

    // Delete Action
    const deleteBtn = clone.querySelector(".delete-btn");
    deleteBtn.onclick = async () => {
      if (confirm(`Delete "${slot.filename}"?`)) {
        await Sabnzbd.deleteQueueItem(
          state.configs.sabnzbdUrl,
          state.configs.sabnzbdKey,
          slot.nzo_id
        );
        // The auto-refresh loop will pick up the change
      }
    };

    container.appendChild(clone);
  });
}

function renderSabnzbdHistory(slots, state) {
  const container = document.getElementById("sab-history");
  if (!container) return;
  container.innerHTML = "";
  const tmpl = document.getElementById("sab-history-item");
  slots.forEach((slot) => {
    const clone = tmpl.content.cloneNode(true);
    const filenameEl = clone.querySelector(".filename");
    filenameEl.textContent = slot.name;
    filenameEl.title = slot.name; // Tooltip for full name
    clone.querySelector(".status-badge").textContent = slot.status;
    clone.querySelector(".status-badge").classList.add(slot.status);
    clone.querySelector(".size").textContent = slot.size;
    clone.querySelector(".time").textContent = slot.action_line || "";
    
    // Delete Action
    const deleteBtn = clone.querySelector(".delete-btn");
    if (deleteBtn) {
      deleteBtn.onclick = async () => {
        if (confirm(`Delete "${slot.name}" from history?`)) {
          try {
            await Sabnzbd.deleteHistoryItem(
              state.configs.sabnzbdUrl,
              state.configs.sabnzbdKey,
              slot.nzo_id
            );
            // Reload history after deletion
            const historyData = await Sabnzbd.getSabnzbdHistory(
              state.configs.sabnzbdUrl,
              state.configs.sabnzbdKey
            );
            renderSabnzbdHistory(historyData.slots || [], state);
          } catch (e) {
            console.error("Failed to delete history item:", e);
            alert("Failed to delete item from history");
          }
        }
      };
    }
    
    container.appendChild(clone);
  });
}
