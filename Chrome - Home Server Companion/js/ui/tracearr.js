// js/ui/tracearr.js
import * as Tracearr from "../../services/tracearr.js";
import { showNotification, showPromptModal, escapeHtml, validateUrl } from "../utils.js";

let statisticsLoaded = false;

/**
 * Initialize Tracearr view
 * @param {string} url - Tracearr URL
 * @param {string} key - API Key (Bearer token)
 * @param {Object} state - App state
 */
export async function initTracearr(url, key, state) {
    // Reset statistics loaded flag when view is initialized
    statisticsLoaded = false;

    const update = async () => {
        try {
            const streams = await Tracearr.getTracearrStreams(url, key);
            renderTracearrStreams(streams || [], url, key, state);
            updateTracearrBadge(url, key, streams || []);
        } catch (e) {
            console.error("Tracearr Auto-refresh error", e);
        }
    };

    // Initial Run
    await update();

    // Check if Statistics tab is already active and load it
    const activeTab = document.querySelector('#tracearr-view .tab-btn.active');
    if (activeTab && activeTab.dataset.tab === 'statistics') {
        loadStatistics(url, key);
        statisticsLoaded = true;
    }

    // Setup tab switching for Statistics
    const tabsContainer = document.querySelector('#tracearr-view .tabs');
    if (tabsContainer && !tabsContainer.dataset.listenerAttached) {
        tabsContainer.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.tab-btn');
            if (!tabBtn) return;

            const tabId = tabBtn.dataset.tab;
            if (tabId === 'statistics' && !statisticsLoaded) {
                loadStatistics(url, key);
                statisticsLoaded = true;
            }
        });
        tabsContainer.dataset.listenerAttached = 'true';
    }

    // Clear existing interval if any
    if (state.refreshInterval) clearInterval(state.refreshInterval);

    // Set new interval (5 seconds for streams)
    state.refreshInterval = setInterval(update, 5000);
}

/**
 * Load Statistics tab content
 */
async function loadStatistics(url, key) {
    const container = document.getElementById("tracearr-stats-content");
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading statistics...</div>';

    try {
        const [generalStats, todayStats, users, violations, history, activity] = await Promise.all([
            Tracearr.getTracearrStats(url, key),
            Tracearr.getTracearrStatsToday(url, key),
            Tracearr.getTracearrUsers(url, key),
            Tracearr.getTracearrViolations(url, key).catch(() => []),
            Tracearr.getTracearrHistory(url, key).catch(() => ({ items: [] })),
            Tracearr.getTracearrActivity(url, key).catch(() => ({ trends: [] }))
        ]);

        // Debug logging

        renderStatistics(container, generalStats, todayStats, users, violations, history, activity);
    } catch (e) {
        container.innerHTML = `<div class="error-banner">Failed to load statistics: ${escapeHtml(e.message)}</div>`;
    }
}

/**
 * Render Statistics tab
 */
function renderStatistics(container, generalStats, todayStats, users, violations, history, activity) {
    container.textContent = '';

    // Helper to safely get number value
    const num = (val) => val !== undefined && val !== null ? Number(val) : 0;

    // === HERO SECTION ===
    const heroSection = document.createElement('div');
    heroSection.style.cssText = `
        background: linear-gradient(135deg, rgba(0, 188, 212, 0.1) 0%, rgba(0, 172, 193, 0.05) 100%);
        border-radius: 16px;
        padding: 24px;
        margin-bottom: 24px;
        border: 1px solid rgba(0, 188, 212, 0.2);
    `;

    const heroTitle = document.createElement('div');
    heroTitle.style.cssText = `
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 2px;
        color: #00bcd4;
        margin-bottom: 16px;
        font-weight: 600;
    `;
    heroTitle.textContent = 'Overview';

    const heroGrid = document.createElement('div');
    heroGrid.style.cssText = `
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 20px;
    `;

    const heroStats = [
        { label: 'Active Streams', value: num(generalStats.activeStreams), icon: '🔴', color: '#ff5252' },
        { label: 'Plays Today', value: num(todayStats.todayPlays), icon: '🎬', color: '#00bcd4' },
        { label: 'Watch Time', value: formatWatchTime(todayStats.watchTimeHours), icon: '⏱️', color: '#4caf50' },
        { label: 'Active Users', value: num(todayStats.activeUsersToday), icon: '👥', color: '#ff9800' }
    ];

    heroStats.forEach(stat => {
        const statCard = document.createElement('div');
        statCard.style.cssText = `
            display: flex;
            align-items: center;
            gap: 16px;
        `;

        const iconBox = document.createElement('div');
        iconBox.textContent = stat.icon;
        iconBox.style.cssText = `
            width: 48px;
            height: 48px;
            border-radius: 12px;
            background: ${stat.color}20;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        `;

        const info = document.createElement('div');
        info.innerHTML = `
            <div style="font-size: 28px; font-weight: 700; color: var(--text-primary); line-height: 1;">${stat.value}</div>
            <div style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">${stat.label}</div>
        `;

        statCard.appendChild(iconBox);
        statCard.appendChild(info);
        heroGrid.appendChild(statCard);
    });

    heroSection.appendChild(heroTitle);
    heroSection.appendChild(heroGrid);
    container.appendChild(heroSection);

    // === STATS GRID ===
    const statsSection = document.createElement('div');
    statsSection.style.cssText = `
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
        margin-bottom: 24px;
    `;

    const statCards = [
        { title: 'Total Sessions', value: num(generalStats.totalSessions).toLocaleString(), subtitle: 'All time streams', icon: '▶️', trend: '' },
        { title: 'Total Users', value: num(generalStats.totalUsers).toLocaleString(), subtitle: 'Registered users', icon: '👥', trend: '' },
        { title: 'Sessions Today', value: num(todayStats.todaySessions).toLocaleString(), subtitle: 'Today\'s streams', icon: '📺', trend: '' },
        { title: 'Violations', value: num(generalStats.recentViolations).toLocaleString(), subtitle: 'Recent violations', icon: '⚠️', trend: '' }
    ];

    statCards.forEach(stat => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = `
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 16px;
            border-radius: 12px;
            background: var(--card-bg);
            border: 1px solid rgba(255,255,255,0.05);
            transition: transform 0.2s, box-shadow 0.2s;
        `;
        card.onmouseover = () => {
            card.style.transform = 'translateY(-2px)';
            card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        };
        card.onmouseout = () => {
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = 'none';
        };

        const iconBox = document.createElement('div');
        iconBox.textContent = stat.icon;
        iconBox.style.cssText = `
            width: 56px;
            height: 56px;
            border-radius: 14px;
            background: linear-gradient(135deg, rgba(0, 188, 212, 0.2), rgba(0, 172, 193, 0.1));
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
        `;

        const content = document.createElement('div');
        content.style.cssText = 'flex: 1;';
        content.innerHTML = `
            <div style="font-size: 24px; font-weight: 700; color: var(--text-primary);">${stat.value}</div>
            <div style="font-size: 13px; color: var(--text-secondary); font-weight: 500;">${stat.title}</div>
            <div style="font-size: 11px; color: var(--text-secondary); opacity: 0.7;">${stat.subtitle}</div>
        `;

        card.appendChild(iconBox);
        card.appendChild(content);
        statsSection.appendChild(card);
    });

    container.appendChild(statsSection);

    // === TOP USERS ===
    if (users && users.data && users.data.length > 0) {
        const usersHeader = document.createElement('div');
        usersHeader.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        `;
        usersHeader.innerHTML = `
            <div>
                <h2 style="font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0;">Top Users</h2>
                <p style="font-size: 12px; color: var(--text-secondary); margin: 2px 0 0 0;">By session count</p>
            </div>
            <div style="font-size: 24px; opacity: 0.3;">👥</div>
        `;

        const usersGrid = document.createElement('div');
        usersGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
        `;

        const topUsers = users.data
            .sort((a, b) => num(b.sessionCount) - num(a.sessionCount))
            .slice(0, 6);

        topUsers.forEach((user, index) => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = `
                padding: 16px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                gap: 12px;
                border: 1px solid rgba(255,255,255,0.05);
            `;

            const rank = document.createElement('div');
            rank.textContent = `#${index + 1}`;
            rank.style.cssText = `
                font-size: 24px;
                font-weight: 700;
                color: ${index < 3 ? '#00bcd4' : 'rgba(255,255,255,0.3)'};
                min-width: 40px;
            `;

            const avatar = document.createElement('img');
            avatar.src = user.avatarUrl || user.thumbUrl || 'icons/icon48.png';
            avatar.style.cssText = `
                width: 44px;
                height: 44px;
                border-radius: 50%;
                object-fit: cover;
                background: rgba(255,255,255,0.1);
            `;
            avatar.onerror = () => { avatar.src = 'icons/icon48.png'; };

            const info = document.createElement('div');
            info.style.cssText = 'flex: 1; min-width: 0;';

            const name = document.createElement('div');
            name.textContent = user.displayName || user.username || 'Unknown';
            name.style.cssText = `
                font-weight: 600;
                font-size: 14px;
                color: var(--text-primary);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            `;

            const stats = document.createElement('div');
            stats.innerHTML = `
                <span style="font-size: 12px; color: var(--text-secondary);">
                    <strong style="color: #00bcd4;">${num(user.sessionCount)}</strong> sessions
                </span>
            `;

            info.appendChild(name);
            info.appendChild(stats);

            card.appendChild(rank);
            card.appendChild(avatar);
            card.appendChild(info);
            usersGrid.appendChild(card);
        });

        container.appendChild(usersHeader);
        container.appendChild(usersGrid);
    }

    // === ALERTS SECTION ===
    if (num(todayStats.alertsLast24h) > 0 || num(generalStats.recentViolations) > 0) {
        const alertsSection = document.createElement('div');
        alertsSection.innerHTML = '<h2 style="font-size: 14px; color: var(--text-secondary); margin-bottom: 12px;">Alerts & Violations</h2>';

        const alertsGrid = document.createElement('div');
        alertsGrid.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;';

        const alertCards = [
            { label: 'Last 24h', value: num(todayStats.alertsLast24h), type: 'alert' },
            { label: 'Recent Violations', value: num(generalStats.recentViolations), type: 'violation' }
        ];

        alertCards.forEach(alert => {
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = `
                padding: 16px;
                border-radius: 12px;
                border-left: 3px solid ${alert.type === 'alert' ? '#ff9800' : '#f44336'};
                display: flex;
                justify-content: space-between;
                align-items: center;
            `;
            card.innerHTML = `
                <div>
                    <div style="font-size: 20px; font-weight: 700;">${alert.value}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${alert.label}</div>
                </div>
                <div style="font-size: 24px;">${alert.type === 'alert' ? '🚨' : '⚠️'}</div>
            `;
            alertsGrid.appendChild(card);
        });

        alertsSection.appendChild(alertsGrid);
        container.appendChild(alertsSection);
    }
}

/**
 * Create a stat card
 */
function createStatCard(icon, value, label) {
    const card = document.createElement('div');
    card.className = 'card tracearr-stat-card';
    card.style.cssText = 'text-align: center; padding: 16px;';

    const iconEl = document.createElement('div');
    iconEl.textContent = icon;
    iconEl.style.cssText = 'font-size: 24px; margin-bottom: 8px;';

    const valueEl = document.createElement('div');
    valueEl.textContent = value;
    valueEl.style.cssText = 'font-size: 20px; font-weight: bold; color: var(--accent-tracearr);';

    const labelEl = document.createElement('div');
    labelEl.textContent = label;
    labelEl.style.cssText = 'font-size: 12px; color: var(--text-secondary); margin-top: 4px;';

    card.appendChild(iconEl);
    card.appendChild(valueEl);
    card.appendChild(labelEl);
    return card;
}

/**
 * Format watch time for display
 */
function formatWatchTime(hours) {
    if (!hours) return '0h';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

function renderTracearrStreams(streams, url, key, state) {
    const container = document.getElementById("tracearr-activity");
    if (!container) return;

    // Always remove a stale empty-state placeholder before processing
    const staleEmpty = container.querySelector('[data-tracearr-empty]');
    if (staleEmpty) staleEmpty.remove();

    // Handle empty state
    if (!streams || streams.length === 0) {
        container.textContent = '';
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.tracearrEmpty = 'true';
        card.style.cssText = 'text-align: center; padding: 40px; color: var(--text-secondary);';
        card.innerHTML = '<div style="font-size: 48px; margin-bottom: 16px;">📺</div><div>No active streams</div>';
        container.appendChild(card);
        return;
    }

    // Track existing items to identify removals
    const existingItems = Array.from(container.querySelectorAll('.tracearr-item-wrapper'));
    const existingMap = new Map();
    existingItems.forEach(item => existingMap.set(item.dataset.streamId, item));
    const processedIds = new Set();

    streams.forEach((stream) => {
        processedIds.add(stream.id);
        let cardWrapper = existingMap.get(stream.id);

        // CREATE NEW
        if (!cardWrapper) {
            const tmpl = document.getElementById('tautulli-card');
            if (!tmpl) return;

            const clone = tmpl.content.cloneNode(true);
            // Get the tautulli-item from the clone
            const tautulliItem = clone.querySelector('.tautulli-item');

            // Wrapper for identification
            cardWrapper = document.createElement('div');
            cardWrapper.className = 'tautulli-item-wrapper tracearr-item-wrapper';
            cardWrapper.dataset.streamId = stream.id;

            // Clone the template content into our wrapper
            if (tautulliItem) {
                cardWrapper.appendChild(tautulliItem);
            }
            container.appendChild(cardWrapper);

            // Setup Static Data
            const title = stream.mediaTitle || 'Unknown';
            let subtitle = '';
            if (stream.showTitle) {
                const sNum = stream.seasonNumber ?? '?';
                const eNum = stream.episodeNumber ?? '?';
                subtitle = `${stream.showTitle} - S${sNum}E${eNum}`;
            } else if (stream.year) {
                subtitle = stream.year.toString();
            } else {
                subtitle = new Date().getFullYear().toString();
            }

            // Title
            const titleContainer = cardWrapper.querySelector(".media-title");
            if (titleContainer) {
                titleContainer.textContent = "";
                const titleSpan = document.createElement("span");
                titleSpan.textContent = title;
                titleSpan.title = "Open in Tracearr";
                titleSpan.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (validateUrl(url)) chrome.tabs.create({ url });
                });
                titleContainer.appendChild(titleSpan);
            }

            // Subtitle
            const subtitleEl = cardWrapper.querySelector(".media-subtitle");
            if (subtitleEl) subtitleEl.textContent = subtitle;

            // Poster Image - needs auth header, fetch as blob
            const posterImg = cardWrapper.querySelector(".poster-img");
            const backdropEl = cardWrapper.querySelector(".tautulli-backdrop");
            const posterUrl = stream.posterUrl;
            const fullPosterUrl = posterUrl ? (posterUrl.startsWith('http') ? posterUrl : `${url}${posterUrl}`) : null;

            // Load image with auth
            const loadPoster = async () => {
                if (!fullPosterUrl) return;
                try {
                    const response = await fetch(fullPosterUrl, {
                        headers: { 'Authorization': `Bearer ${key}` }
                    });
                    if (response.ok) {
                        const blob = await response.blob();
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const dataUrl = reader.result;
                            if (posterImg) posterImg.src = dataUrl;
                            if (backdropEl) backdropEl.style.backgroundImage = `url('${dataUrl}')`;
                        };
                        reader.readAsDataURL(blob);
                    }
                } catch (e) {
                    console.warn('Failed to load poster:', e);
                }
            };

            if (posterImg && fullPosterUrl) {
                posterImg.addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (validateUrl(url)) chrome.tabs.create({ url });
                });
            }

            // Load the poster
            loadPoster();

            // Details Toggle - Click on main card or toggle button
            const detailsToggle = cardWrapper.querySelector('.details-toggle');
            const detailsSection = cardWrapper.querySelector('.tautulli-details');
            const mainDiv = cardWrapper.querySelector('.tautulli-main');

            const toggleDetails = () => {
                if (detailsSection && tautulliItem) {
                    const isHidden = detailsSection.classList.contains('hidden');
                    if (isHidden) {
                        detailsSection.classList.remove('hidden');
                        tautulliItem.classList.add('expanded');
                        setTimeout(() => {
                            cardWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100);
                    } else {
                        detailsSection.classList.add('hidden');
                        tautulliItem.classList.remove('expanded');
                    }
                }
            };

            // Click on main card to toggle
            if (mainDiv) {
                mainDiv.addEventListener('click', (e) => {
                    // Don't toggle if clicking on links or buttons
                    if (e.target.closest('a') || e.target.closest('button') || e.target.closest('.poster-img')) {
                        return;
                    }
                    toggleDetails();
                });
            }

            // Click on toggle arrow
            if (detailsToggle) {
                detailsToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleDetails();
                });
            }

            // Terminate button
            const terminateBtn = cardWrapper.querySelector('.kill-icon-btn');
            if (terminateBtn) {
                terminateBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const reason = await showPromptModal(
                        'Kill Stream',
                        `Kill stream for "${stream.username}"?`,
                        "Terminated via Home Server Companion",
                        '#00bcd4' // Tracearr Cyan
                    );

                    if (reason !== null) {
                        await Tracearr.terminateTracearrStream(url, key, stream.id, reason);
                        showNotification('Stream terminated', 'success');
                        setTimeout(() => initTracearr(url, key, state), 1000);
                    }
                });
            }
        }

        // UPDATE DYNAMIC DATA

        // User name
        const userNameEl = cardWrapper.querySelector('.user-name');
        if (userNameEl) {
            userNameEl.textContent = stream.username || 'Unknown';
        }

        // Stream Decision
        const decision = stream.videoDecision || 'directplay';
        const decisionDisplay = decision === 'directplay' ? 'Direct Play' :
                               decision === 'copy' ? 'Direct Stream' :
                               decision === 'transcode' ? 'Transcode' : 'Unknown';
        cardWrapper.querySelectorAll(".stream-decision").forEach(el => el.textContent = decisionDisplay);

        // Bandwidth (bitrate in kbps)
        const bandwidth = stream.bitrate ? `${(stream.bitrate / 1000).toFixed(1)} Mbps` : '-';
        cardWrapper.querySelectorAll(".bandwidth").forEach(el => el.textContent = bandwidth);

        // Quality (resolution)
        const quality = stream.resolution || 'Original';
        cardWrapper.querySelectorAll(".quality").forEach(el => el.textContent = quality);

        // Progress: use progressMs / durationMs
        const durationMs = stream.durationMs || 0;
        const progressMs = stream.progressMs || 0;
        const progressPercent = durationMs > 0 ? (progressMs / durationMs) * 100 : 0;

        // Time remaining
        const timeLeftEl = cardWrapper.querySelector('.time-left');
        if (timeLeftEl) {
            if (durationMs > 0 && progressMs > 0) {
                const leftMins = Math.max(0, Math.round((durationMs - progressMs) / 1000 / 60));
                timeLeftEl.textContent = `${leftMins}m left`;
            } else {
                timeLeftEl.textContent = '';
            }
        }

        // Progress bar
        const progressFill = cardWrapper.querySelector('.progress-bar-fill');
        if (progressFill) {
            progressFill.style.background = 'var(--accent-tracearr, #00bcd4)';
            progressFill.style.width = `${Math.min(progressPercent, 100)}%`;
        }

        // Stream details — Container
        const containerEl = cardWrapper.querySelector('.val-container');
        if (containerEl) {
            const sourceContainer = stream.transcodeInfo?.sourceContainer || '';
            containerEl.textContent = sourceContainer ? `${decisionDisplay} (${sourceContainer.toUpperCase()})` : decisionDisplay;
        }

        // Stream details — Video
        const videoEl = cardWrapper.querySelector('.val-video');
        if (videoEl) {
            const vDec = stream.videoDecision === 'directplay' ? 'Direct Play' :
                         stream.videoDecision === 'copy' ? 'Direct Stream' :
                         stream.videoDecision === 'transcode' ? 'Transcode' : stream.videoDecision;
            const codec = stream.sourceVideoCodecDisplay || stream.sourceVideoCodec || '';
            videoEl.textContent = `${vDec} (${codec} ${stream.resolution || ''})`.trim();
        }

        // Stream details — Audio
        const audioEl = cardWrapper.querySelector('.val-audio');
        if (audioEl) {
            const aDec = stream.audioDecision === 'directplay' ? 'Direct Play' :
                         stream.audioDecision === 'copy' ? 'Direct Stream' :
                         stream.audioDecision === 'transcode' ? 'Transcode' : stream.audioDecision;
            const aCodec = stream.sourceAudioCodecDisplay || stream.sourceAudioCodec || '';
            const lang = stream.sourceAudioDetails?.language || '';
            const channels = stream.audioChannelsDisplay || stream.sourceAudioChannels || '';
            const parts = [aCodec, channels].filter(Boolean).join(' ');
            audioEl.textContent = lang ? `${aDec} (${lang} - ${parts})` : `${aDec} (${parts})`;
        }

        // Stream details — Subtitles
        const subsEl = cardWrapper.querySelector('.val-subs');
        if (subsEl) {
            if (stream.subtitleInfo) {
                const subDec = stream.subtitleInfo.decision || stream.subtitleInfo.codec || 'Direct';
                subsEl.textContent = subDec === 'burn' ? 'Burn' : 'Direct';
            } else {
                subsEl.textContent = 'None';
            }
        }

        // Player details
        const platformEl = cardWrapper.querySelector('.val-platform');
        if (platformEl) platformEl.textContent = stream.platform || stream.device || 'Unknown';

        const productEl = cardWrapper.querySelector('.val-product');
        if (productEl) productEl.textContent = stream.product || 'Unknown';

        const playerEl = cardWrapper.querySelector('.val-player');
        if (playerEl) playerEl.textContent = stream.player || 'Unknown';

        // User details
        const valUsername = cardWrapper.querySelector('.val-username');
        if (valUsername) valUsername.textContent = stream.username || 'Unknown';

        // Network — Tracearr doesn't provide IP/location, hide those fields
        const valNetwork = cardWrapper.querySelector('.val-network');
        if (valNetwork) valNetwork.parentElement.style.display = 'none';

        const secureIcon = cardWrapper.querySelector('.secure-icon');
        if (secureIcon) secureIcon.style.display = 'none';

        const valIp = cardWrapper.querySelector('.val-ip');
        if (valIp) valIp.parentElement.style.display = 'none';
    });

    // Remove items that no longer exist
    existingItems.forEach(item => {
        if (!processedIds.has(item.dataset.streamId)) {
            item.remove();
        }
    });
}

/**
 * Update badge for Tracearr (sidebar nav item)
 * If streams not provided, fetches them from the API
 */
export async function updateTracearrBadge(url, key, streams) {
    const tracearrNavItem = document.querySelector('.nav-item[data-target="tracearr"]');
    if (!tracearrNavItem) return;

    // If no streams passed (e.g. from BadgeManager), fetch them
    if (!streams) {
        try {
            streams = await Tracearr.getTracearrStreams(url, key);
        } catch {
            return; // Silently fail — don't hide badge on network error
        }
    }

    let badge = tracearrNavItem.querySelector('.nav-badge');

    // Create badge if it doesn't exist
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'nav-badge hidden';
        tracearrNavItem.appendChild(badge);
    }

    const count = streams ? streams.length : 0;
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}
