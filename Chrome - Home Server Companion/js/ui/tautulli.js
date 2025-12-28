import * as Tautulli from "../../services/tautulli.js";
import { showNotification, showPromptModal, showIpInfoModal } from "../utils.js";

/**
 * Initializes the Tautulli service view.
 * - Starts polling for active sessions (streams).
 * - Updates badge count.
 * @param {string} url - Tautulli URL
 * @param {string} key - API Key
 * @param {object} state - App state
 */
export async function initTautulli(url, key, state) {
    const update = async () => {
      try {
        const activity = await Tautulli.getTautulliActivity(url, key);
        renderTautulliActivity(activity.sessions || [], url, key, state);
        
        // Update badge directly from this data to ensure sync
        // Update badge directly using shared function
        updateTautulliBadge(url, key, activity.sessions || []);
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
    
    // Handle empty state separately if container is empty
    if (sessions.length === 0) {
        // Only verify if we already showed "No active streams" to avoid redraw
        if (container.querySelector('.no-streams-msg')) return;
        
        container.textContent = "";
        const card = document.createElement('div');
        card.className = "card no-streams-msg";
        const header = document.createElement('div');
        header.className = "card-header";
        header.textContent = "No active streams";
        card.appendChild(header);
        container.appendChild(card);
        return;
    }
    
    // Clear "No streams" message if it exists
    const noMsg = container.querySelector('.no-streams-msg');
    if (noMsg) noMsg.remove();

    const tmpl = document.getElementById("tautulli-card");
    if (!tmpl) return;

    // Track existing items to identify removals
    const existingItems = Array.from(container.querySelectorAll('.tautulli-item-wrapper'));
    const existingMap = new Map();
    existingItems.forEach(item => existingMap.set(item.dataset.sessionId, item));
    const processedIds = new Set();

    sessions.forEach((session) => {
      processedIds.add(session.session_id);
      let cardWrapper = existingMap.get(session.session_id);
      
      // CREATE NEW
      if (!cardWrapper) {
          const clone = tmpl.content.cloneNode(true);
          // Wrapper for identification
          cardWrapper = document.createElement('div');
          cardWrapper.className = 'tautulli-item-wrapper';
          cardWrapper.dataset.sessionId = session.session_id;
          cardWrapper.appendChild(clone);
          container.appendChild(cardWrapper);
          
          // Setup One-Time Static Data (Images, Title, User Init)
          // Title
          const title = session.grandparent_title ? session.grandparent_title : session.title;
          const subtitle = session.grandparent_title 
            ? `${session.parent_media_index}x${session.media_index} • ${session.title}`
            : session.year || '';
            
          // Wrapper: Clear and add span
          const titleContainer = cardWrapper.querySelector(".media-title");
          titleContainer.textContent = ""; 
          const titleSpan = document.createElement("span");
          titleSpan.textContent = title;
          titleContainer.appendChild(titleSpan);

          cardWrapper.querySelector(".media-subtitle").textContent = subtitle;
          
          // User Static
          const userNameEl = cardWrapper.querySelector(".user-name");
          userNameEl.textContent = session.user || session.username;
          if (session.user_id) {
              userNameEl.classList.add('clickable-link');
              userNameEl.title = "Open User Profile";
              userNameEl.addEventListener('click', (e) => {
                  e.stopPropagation();
                  const userUrl = `${url}/user?user_id=${session.user_id}`;
                  chrome.tabs.create({ url: userUrl });
              });
          }

          // Posters - Load BOTH images in parallel for faster display
          const backdropEl = cardWrapper.querySelector(".tautulli-backdrop");
          const posterEl = cardWrapper.querySelector(".poster-img");
          const posterImg = session.grandparent_thumb || session.thumb;
          
          // Build URLs first
          const backdropUrl = session.art 
            ? `${url}/pms_image_proxy?img=${session.art}&width=400&opacity=100&background=000000&apikey=${key}` 
            : null;
          const posterUrl = posterImg 
            ? `${url}/pms_image_proxy?img=${posterImg}&width=150&apikey=${key}` 
            : null;
          
          // Start BOTH image loads simultaneously
          if (backdropUrl && backdropEl) {
            const bgImg = new Image();
            bgImg.src = backdropUrl; // Start loading immediately
            bgImg.onload = () => {
              backdropEl.style.backgroundImage = `url('${backdropUrl}')`;
            };
          }
          
          if (posterUrl && posterEl) {
            posterEl.decoding = 'async';
            posterEl.src = posterUrl; // Start loading immediately (parallel with backdrop)
          } else if (posterEl) {
            cardWrapper.querySelector(".tautulli-poster").style.display = "none";
          }
          
          // Link Logic
          const linkKey = session.grandparent_rating_key || session.rating_key;
          const itemLink = `${url}/info?rating_key=${linkKey}`;
          const openMedia = (e) => {
              e.stopPropagation();
              chrome.tabs.create({ url: itemLink });
          };
          
          // Target the span created earlier
          const titleSpanTarget = cardWrapper.querySelector(".media-title span");
          if(titleSpanTarget) {
              titleSpanTarget.title = "Open in Tautulli";
              titleSpanTarget.style.cursor = "pointer";
              titleSpanTarget.classList.add("hover-underline"); // We can add a class or inline style
              titleSpanTarget.addEventListener('click', openMedia);
              
              // Add inline hover effect via JS since we are here, or rely on CSS. 
              // Simplest is direct style for now as requested "text cursor behavior"
              titleSpanTarget.addEventListener("mouseenter", () => titleSpanTarget.style.textDecoration = "underline");
              titleSpanTarget.addEventListener("mouseleave", () => titleSpanTarget.style.textDecoration = "none");
          }
          
          if(posterEl) {
              posterEl.style.cursor = "pointer";
              posterEl.title = "Open in Tautulli";
              posterEl.addEventListener('click', openMedia);
          }

          // Interaction Logic
          const mainDiv = cardWrapper.querySelector('.tautulli-main');
          const detailsDiv = cardWrapper.querySelector('.tautulli-details');
          const card = cardWrapper.querySelector('.tautulli-item');

          const toggleDetails = () => {
              const isHidden = detailsDiv.classList.contains('hidden');
              if (isHidden) {
                  detailsDiv.classList.remove('hidden');
                  card.classList.add('expanded');
                  state.expandedSessions.add(session.session_id);
                  setTimeout(() => {
                      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 100); 
              } else {
                  detailsDiv.classList.add('hidden');
                  card.classList.remove('expanded');
                  state.expandedSessions.delete(session.session_id);
              }
          };
          mainDiv.addEventListener('click', toggleDetails);
          
          // Terminate
          const terminateLogic = async (e) => {
            e.stopPropagation();
            const reason = await showPromptModal(
              'Kill Stream',
              `Kill stream for user "${session.user || session.username}"?`, // Removed newline helper text for cleaner modal
              "Terminated via Home Server Companion",
              '#e5a00d' // Tautulli Orange
            );
            
            if (reason !== null) {
              await Tautulli.terminateSession(url, key, session.session_id, reason);
              showNotification('Stream terminated', 'success');
              setTimeout(() => initTautulli(url, key, state), 1000);
            }
          };
          const killIcon = cardWrapper.querySelector('.kill-icon-btn');
          if (killIcon) killIcon.addEventListener('click', terminateLogic);
      } // End Create New

      // UPDATE DYNAMIC DATA (For both new and existing)
      const cardWrapperRef = cardWrapper; // safe ref

      // Time Left
      let timeText = "";
      if (session.duration && session.view_offset) {
          const leftMs = session.duration - session.view_offset;
          const leftMins = Math.round(leftMs / 1000 / 60);
          timeText = `${leftMins}m left`;
      }
      cardWrapperRef.querySelector(".time-left").textContent = timeText;

      // Stream Info
      const streamDecision = session.transcode_decision === 'direct play' ? 'Direct Play' : 'Transcode';
      cardWrapperRef.querySelector(".stream-decision").textContent = streamDecision;
      const bandwidth = session.bandwidth ? `${(session.bandwidth / 1000).toFixed(1)} Mbps` : '';
      cardWrapperRef.querySelector(".bandwidth").textContent = bandwidth;
      const quality = session.quality_profile || session.video_resolution || "";
      cardWrapperRef.querySelector(".quality").textContent = quality;
      
      // Progress
      cardWrapperRef.querySelector(".progress-bar-fill").style.width = `${session.progress_percent}%`;

      // Detailed Stats (Hidden but updated)
      cardWrapperRef.querySelector('.val-container').textContent = `${streamDecision} (${session.container.toUpperCase()})`;
      cardWrapperRef.querySelector('.val-video').textContent = `${session.stream_video_decision.toUpperCase()} (${session.video_codec.toUpperCase()} ${session.video_resolution}p)`;
      cardWrapperRef.querySelector('.val-audio').textContent = `${session.stream_audio_decision.toUpperCase()} (${session.audio_language.toUpperCase()} - ${session.audio_codec.toUpperCase()} ${session.audio_channels})`;
      
      const subText = session.subtitle_decision === 'burn' ? 'Burn' : (session.selected_subtitle_codec ? 'Direct' : 'None');
      cardWrapperRef.querySelector('.val-subs').textContent = subText;
      
      cardWrapperRef.querySelector('.val-platform').textContent = session.platform;
      cardWrapperRef.querySelector('.val-product').textContent = session.product;
      cardWrapperRef.querySelector('.val-player').textContent = session.player;
      
      // Detailed User
      const valUser = cardWrapperRef.querySelector('.val-username');
      valUser.textContent = session.user || session.username;
      
       // Re-apply clickable logic to detailed user if needed (idempotent safe)
       if (session.user_id && !valUser.dataset.listenerAttached) {
          valUser.style.cursor = 'pointer';
          valUser.style.textDecoration = 'underline';
          valUser.title = "Open User Profile";
          valUser.addEventListener('click', (e) => {
              e.stopPropagation();
              const userUrl = `${url}/user?user_id=${session.user_id}`;
              chrome.tabs.create({ url: userUrl });
          });
          valUser.dataset.listenerAttached = "true";
      }

      const netText = session.location ? session.location.toUpperCase() : 'WAN';
      cardWrapperRef.querySelector('.val-network').textContent = netText;
      
      const secureIcon = cardWrapperRef.querySelector('.secure-icon');
      if (session.secure === '1' || session.secure === 1 || session.secure === true) {
          secureIcon.textContent = '🔒';
          secureIcon.title = 'Secure Connection';
          secureIcon.style.color = '#4caf50';
      } else {
          secureIcon.textContent = '🔓';
          secureIcon.title = 'Insecure Connection';
          secureIcon.style.color = '#f44336';
      }
      const valIp = cardWrapperRef.querySelector('.val-ip');
      valIp.textContent = session.ip_address;
      
      // Helper to check if IP is private/LAN
      const isPrivateIp = (ip) => {
          if (!ip) return true;
          // Check for private IP ranges: 10.x.x.x, 192.168.x.x, 172.16-31.x.x, 127.x.x.x
          return /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.)/.test(ip);
      };
      
      // Make IP clickable for IP lookup (only for external IPs, only once, and if ENABLED)
      if (session.ip_address && !isPrivateIp(session.ip_address) && !valIp.dataset.listenerAttached) {
          valIp.style.cursor = 'pointer';
          valIp.style.textDecoration = 'underline';
          valIp.title = 'Click to view IP information';
          valIp.addEventListener('click', (e) => {
              e.stopPropagation();
              if (state.configs.tautulliEnableIpLookup) {
                  showIpInfoModal(session.ip_address);
              } else {
                  showNotification('Enable IP Geolocation in Tautulli Settings first.', 'info');
              }
          });
          valIp.dataset.listenerAttached = 'true';
      }
      
      // Check Expansion State (keep in sync)
      const detailsDiv = cardWrapperRef.querySelector('.tautulli-details');
      const cardItem = cardWrapperRef.querySelector('.tautulli-item');
      if (state.expandedSessions.has(session.session_id)) {
          detailsDiv.classList.remove('hidden');
          cardItem.classList.add('expanded');
      } else {
          detailsDiv.classList.add('hidden');
          cardItem.classList.remove('expanded');
      }

    });

    // Remove Stale
    existingMap.forEach((el, id) => {
        if (!processedIds.has(id)) {
            el.remove();
        }
    });

}

// Background Badge Update Function (exported for use by popup.js)
export async function updateTautulliBadge(url, key, existingSessions = null) {
  try {
    const sessions = existingSessions || (await Tautulli.getTautulliActivity(url, key)).sessions || [];
    
    const tautulliNavItem = document.querySelector('.nav-item[data-target="tautulli"]');
    if (!tautulliNavItem) return;

    let badge = tautulliNavItem.querySelector('.nav-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'nav-badge hidden';
      tautulliNavItem.appendChild(badge);
    }
    
    const count = sessions.length;
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (e) {
    console.error("Tautulli badge update error", e);
  }
}
