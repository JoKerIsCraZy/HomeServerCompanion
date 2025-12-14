import * as Tautulli from "../../services/tautulli.js";

export async function initTautulli(url, key, state) {
    const update = async () => {
      try {
        const activity = await Tautulli.getTautulliActivity(url, key);
        renderTautulliActivity(activity.sessions || [], url, key, state);
      } catch (e) {
        console.error("Tautulli Auto-refresh error", e);
      }
    };

    // Initial Run
    await update();

    // Clear existing interval if any
    if (state.refreshInterval) clearInterval(state.refreshInterval);

    // Set new interval (2 seconds)
    state.refreshInterval = setInterval(update, 2000);
}

function renderTautulliActivity(sessions, url, key, state) {
    const container = document.getElementById("tautulli-activity");
    if (!container) return;
    container.innerHTML = "";
    if (sessions.length === 0) {
      container.innerHTML =
        '<div class="card"><div class="card-header">No active streams</div></div>';
      return;
    }

    const tmpl = document.getElementById("tautulli-card");
    if (!tmpl) return;

    sessions.forEach((session) => {
      const clone = tmpl.content.cloneNode(true);
      const card = clone.querySelector('.tautulli-item');

      // --- Main Info ---
      // Title logic: Grandparent - Title (Series) or Title (Movie)
      const title = session.grandparent_title
        ? session.grandparent_title
        : session.title;
      const subtitle = session.grandparent_title 
        ? `${session.parent_media_index}x${session.media_index} • ${session.title}`
        : session.year || '';
        
      clone.querySelector(".media-title").textContent = title;
      clone.querySelector(".media-subtitle").textContent = subtitle;

      // User & Time
      clone.querySelector(".user-name").textContent = session.user || session.username;
      
      // Time Left Calculation
      // duration (ms) - view_offset (ms)
      let timeText = "";
      if (session.duration && session.view_offset) {
          const leftMs = session.duration - session.view_offset;
          const leftMins = Math.round(leftMs / 1000 / 60);
          timeText = `${leftMins}m left`;
      }
      clone.querySelector(".time-left").textContent = timeText;

      // Meta Row: Direct Play • 7.7 Mbps • Original
      const streamDecision = session.transcode_decision === 'direct play' ? 'Direct Play' : 'Transcode';
      clone.querySelector(".stream-decision").textContent = streamDecision;
      
      const bandwidth = session.bandwidth ? `${(session.bandwidth / 1000).toFixed(1)} Mbps` : '';
      clone.querySelector(".bandwidth").textContent = bandwidth;
      
      const quality = session.quality_profile || session.video_resolution || "";
      clone.querySelector(".quality").textContent = quality;

      // Progress Bar
      clone.querySelector(".progress-bar-fill").style.width = `${session.progress_percent}%`;
      
      // Images (Auth required for proxied images)
      if (session.art) {
        const backdropUrl = `${url}/pms_image_proxy?img=${session.art}&width=800&opacity=100&background=000000&apikey=${key}`;
        clone.querySelector(".tautulli-backdrop").style.backgroundImage = `url('${backdropUrl}')`;
      }
      
      // --- Poster ---
      const posterImg = session.grandparent_thumb || session.thumb;
      if (posterImg) {
        const posterUrl = `${url}/pms_image_proxy?img=${posterImg}&width=300&apikey=${key}`;
        clone.querySelector(".poster-img").src = posterUrl;
      } else {
        clone.querySelector(".tautulli-poster").style.display = "none";
      }

      // --- Hidden Details ---
      // Stream
      clone.querySelector('.val-container').textContent = `${streamDecision} (${session.container.toUpperCase()})`;
      clone.querySelector('.val-video').textContent = `${session.stream_video_decision.toUpperCase()} (${session.video_codec.toUpperCase()} ${session.video_resolution}p)`;
      clone.querySelector('.val-audio').textContent = `${session.stream_audio_decision.toUpperCase()} (${session.audio_language.toUpperCase()} - ${session.audio_codec.toUpperCase()} ${session.audio_channels})`;
      
      // Subs
      const subText = session.subtitle_decision === 'burn' ? 'Burn' : (session.selected_subtitle_codec ? 'Direct' : 'None');
      clone.querySelector('.val-subs').textContent = subText;

      // Player
      clone.querySelector('.val-platform').textContent = session.platform;
      clone.querySelector('.val-product').textContent = session.product;
      clone.querySelector('.val-player').textContent = session.player;

      // User / Network
      clone.querySelector('.val-username').textContent = session.user || session.username;
      
      // Tautulli session object has `session.location` = 'lan' or 'wan'
      const netText = session.location ? session.location.toUpperCase() : 'WAN';
      clone.querySelector('.val-network').textContent = netText;
      
      if (session.secure !== '1' && session.secure !== true) {
          clone.querySelector('.secure-icon').textContent = '🔓';
          clone.querySelector('.secure-icon').title = 'Insecure';
      }
      
      clone.querySelector('.val-ip').textContent = session.ip_address;

      // --- Interactivity ---
      // Toggle
      const mainDiv = clone.querySelector('.tautulli-main');
      const detailsDiv = clone.querySelector('.tautulli-details');
      
      // Check persistent state
      if (state.expandedSessions.has(session.session_id)) {
          detailsDiv.classList.remove('hidden');
          card.classList.add('expanded');
      }

      const toggleDetails = () => {
          const isHidden = detailsDiv.classList.contains('hidden');
          if (isHidden) {
              detailsDiv.classList.remove('hidden');
              card.classList.add('expanded');
              state.expandedSessions.add(session.session_id);
          } else {
              detailsDiv.classList.add('hidden');
              card.classList.remove('expanded');
              state.expandedSessions.delete(session.session_id);
          }
      };

      mainDiv.addEventListener('click', toggleDetails); // Whole card clickable 

      // Terminate Logic
      const terminateLogic = async (e) => {
        e.stopPropagation(); // Don't toggle
        const reason = prompt(
          `Kill stream for user "${session.user || session.username}"?\nEnter a reason (optional):`,
          "Terminated via Chrome Extension"
        );
        if (reason !== null) {
          await Tautulli.terminateSession(url, key, session.session_id, reason);
          setTimeout(() => initTautulli(url, key, state), 1000);
        }
      };

      const killIcon = clone.querySelector('.kill-icon-btn');
      if (killIcon) killIcon.addEventListener('click', terminateLogic);

      container.appendChild(clone);
    });
}
