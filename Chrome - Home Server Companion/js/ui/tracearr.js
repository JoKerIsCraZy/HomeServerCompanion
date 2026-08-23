// js/ui/tracearr.js
import * as Tracearr from "../../services/tracearr.js";
import { showNotification, showPromptModal, escapeHtml, validateUrl } from "../utils.js";
import poller from "../core/Poller.js";

/** When the Statistics tab last finished loading, as an epoch ms timestamp. */
let statisticsLoadedAt = 0;

/** Statistics older than this are refetched when the tab is shown again. */
const STATS_MAX_AGE_MS = 30000;

/**
 * Initialize Tracearr view
 * @param {string} url - Tracearr URL
 * @param {string} key - API Key (Bearer token)
 * @param {Object} state - App state
 */
export async function initTracearr(url, key, state) {
    statisticsLoadedAt = 0;

    // Credentials live on the module so the tab listener - which is attached
    // once and then reused - never closes over a stale pair. Changing them in
    // Options used to leave the old ones baked into the handler forever.
    activeCredentials = { url, key };

    const update = async () => {
        try {
            const streams = await Tracearr.getTracearrStreams(url, key);
            renderTracearrStreams(streams || [], url, key, state);
            updateTracearrBadge(url, key, streams || []);
        } catch (e) {
            console.error("Tracearr Auto-refresh error", e);
        }
    };

    await update();

    const showStatsIfStale = () => {
        if (Date.now() - statisticsLoadedAt < STATS_MAX_AGE_MS) return;
        const { url: u, key: k } = activeCredentials;
        loadStatistics(u, k);
    };

    const activeTab = document.querySelector('#tracearr-view .tab-btn.active');
    if (activeTab && activeTab.dataset.tab === 'statistics') showStatsIfStale();

    const tabsContainer = document.querySelector('#tracearr-view .tabs');
    if (tabsContainer && !tabsContainer.dataset.listenerAttached) {
        tabsContainer.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('.tab-btn');
            if (tabBtn && tabBtn.dataset.tab === 'statistics') showStatsIfStale();
        });
        tabsContainer.dataset.listenerAttached = 'true';
    }

    // Unchanged 5s cadence while visible.
    poller.register('tracearr', update, { interval: 5000, immediate: false });
}

/** Credentials for handlers that outlive a single init call. */
let activeCredentials = { url: '', key: '' };

/**
 * Load Statistics tab content
 */
async function loadStatistics(url, key) {
    const container = document.getElementById("tracearr-stats-content");
    if (!container) return;

    container.innerHTML = '<div class="loading">Loading statistics...</div>';

    try {
        // v2 has no aggregate stats endpoint, so the figures are rolled up from
        // one history window plus the streams summary. Violations still come
        // from v1 — the v2 public API has no equivalent — and are optional, so
        // a server that has dropped v1 loses the tile rather than the tab.
        const [rollup, identities, violations] = await Promise.all([
            // 14 days: a baseline needs enough days that one busy evening does
            // not become "typical".
            Tracearr.getTracearrRollup(url, key, 14),
            Tracearr.getTracearrUsers(url, key).catch(() => []),
            Tracearr.getTracearrViolations(url, key).catch(() => [])
        ]);

        renderStatistics(container, rollup, identities,
            Array.isArray(violations) ? violations : []);
        statisticsLoadedAt = Date.now();
    } catch (e) {
        // The timestamp is deliberately not set here: a failed load must stay
        // retryable, and the old boolean latch made an error permanent.
        container.replaceChildren();
        const err = document.createElement('div');
        err.className = 'error-banner';
        err.textContent = `Failed to load statistics: ${e.message}`;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'trr-updated';
        retry.textContent = 'Try again';
        retry.addEventListener('click', () => loadStatistics(url, key));
        container.append(err, retry);
    }
}

/**
 * Renders the Statistics tab.
 *
 * The figures are deliberately few. A count with nothing to compare it against
 * supports no decision, so today's watch time leads, plays get a baseline over
 * the rollup window, users are shown as a ratio, and the counters that cannot
 * change while the popup is open are demoted to one footer line. Violations
 * render only when there are some: an absent banner is the all-clear.
 *
 * @param {HTMLElement} container - Tab content container
 * @param {Object} rollup - Result of Tracearr.getTracearrRollup
 * @param {Array} identities - Result of Tracearr.getTracearrUsers
 * @param {Array} violations - Rule violations (v1); may be empty
 */
function renderStatistics(container, rollup, identities, violations) {
    container.replaceChildren();

    const totalUsers = identities.length;
    const violationList = Array.isArray(violations) ? violations : [];

    container.appendChild(buildStatsHeader(rollup, totalUsers));

    const trend = buildTrendStrip(rollup);
    if (trend) container.appendChild(trend);

    if (violationList.length > 0) {
        container.appendChild(buildViolationBanner(violationList));
    }

    const roster = buildTopUsers(rollup, identities);
    if (roster) container.appendChild(roster);

    container.appendChild(buildAllTimeFooter(rollup, totalUsers));
}

/**
 * Header: watch time as the primary figure, everything else as one subline.
 * Mirrors the SABnzbd header so the two services read as one product.
 * @param {Object} rollup
 * @param {number} totalUsers
 * @returns {HTMLElement}
 */
function buildStatsHeader(rollup, totalUsers) {
    const header = document.createElement('div');
    header.className = 'trr-header';

    const hero = document.createElement('div');
    hero.className = 'trr-hero';
    hero.setAttribute('aria-live', 'polite');

    const watched = rollup.today.watchTimeMs;
    if (watched > 0) {
        hero.textContent = formatDuration(watched);
    } else {
        // No zeroes: a quiet day is a state, not the number nought.
        hero.classList.add('is-idle');
        hero.textContent = 'Quiet day';
    }

    const subline = document.createElement('div');
    subline.className = 'trr-subline';
    const parts = [];
    if (rollup.today.plays > 0) {
        parts.push(`${rollup.today.plays} ${rollup.today.plays === 1 ? 'play' : 'plays'}`);
    }
    if (totalUsers > 0) parts.push(`${rollup.today.activeUsers} of ${totalUsers} users`);
    if (rollup.activeStreams > 0) parts.push(`${rollup.activeStreams} watching now`);
    subline.textContent = parts.join(' · ') || 'Nothing played today';

    const stack = document.createElement('div');
    stack.className = 'trr-hero-stack';
    stack.append(hero, subline);

    const updated = document.createElement('button');
    updated.type = 'button';
    updated.className = 'trr-updated';
    updated.title = 'Refresh statistics';
    updated.textContent = 'Refresh';
    updated.addEventListener('click', () => {
        const { url, key } = activeCredentials;
        statisticsLoadedAt = 0;
        loadStatistics(url, key);
    });

    header.append(stack, updated);
    return header;
}

/**
 * Daily plays over the rollup window, as a bar chart with the window mean.
 *
 * This is the element that turns a bare count into a judgement: "16 plays" says
 * nothing, "16 today against a typical 12" says the day is busy. Returns null
 * when there is nothing to chart, so no empty frame is drawn.
 *
 * @param {Object} rollup
 * @returns {HTMLElement|null}
 */
function buildTrendStrip(rollup) {
    const records = rollup.records || [];
    if (records.length === 0) return null;

    const days = rollup.windowDays;

    // Bucket by local calendar day. The key is built from the local date parts
    // rather than toISOString(), which would shift the day boundary to UTC and
    // file late-evening plays under tomorrow.
    const localKey = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const buckets = new Map();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        buckets.set(localKey(d), { date: d, count: 0 });
    }
    for (const rec of records) {
        if (!rec.startedAt) continue;
        const bucket = buckets.get(localKey(new Date(rec.startedAt)));
        if (bucket) bucket.count++;
    }

    const counts = [...buckets.values()].map((b) => b.count);
    const peak = Math.max(...counts, 1);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const todayKey = localKey(new Date());
    const todayCount = buckets.get(todayKey)?.count || 0;

    const section = document.createElement('div');
    section.className = 'trr-trend';

    const chart = document.createElement('div');
    chart.className = 'trr-trend-bars';
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label',
        `Plays per day over the last ${days} days. Today ${todayCount}, typical ${Math.round(mean)}.`);

    for (const [day, bucket] of buckets) {
        const isToday = day === todayKey;
        const { count, date } = bucket;
        const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });

        const column = document.createElement('div');
        column.className = 'trr-trend-col';
        if (isToday) column.classList.add('is-today');
        column.title = `${isToday ? 'Today' : weekday}: ${count} ${count === 1 ? 'play' : 'plays'}`;

        const bar = document.createElement('div');
        bar.className = 'trr-trend-bar';
        // A zero-play day still gets a sliver, so the axis stays readable.
        bar.style.height = `${Math.max((count / peak) * 100, 3)}%`;

        const label = document.createElement('span');
        label.className = 'trr-trend-day';
        // `short`, not `narrow`: the single-letter form collides in several
        // locales — German gives D for both Dienstag and Donnerstag, M for both
        // Montag and Mittwoch.
        label.textContent = date.toLocaleDateString(undefined, { weekday: 'short' });

        column.append(bar, label);
        chart.appendChild(column);
    }

    const caption = document.createElement('div');
    caption.className = 'trr-trend-caption';
    caption.textContent =
        `Plays per day, last ${days} days · today ${todayCount}, typical ${Math.round(mean)}`;

    section.append(chart, caption);
    return section;
}

/**
 * Violations banner. Only ever built when there is at least one, so the absence
 * of this element is what says "all clear" - no tile is spent on a zero.
 * @param {Array} violations
 * @returns {HTMLElement}
 */
function buildViolationBanner(violations) {
    const banner = document.createElement('div');
    banner.className = 'trr-violations';

    const heading = document.createElement('div');
    heading.className = 'trr-violations-title';
    heading.textContent = `${violations.length} ${violations.length === 1 ? 'violation' : 'violations'}`;
    banner.appendChild(heading);

    violations.slice(0, 3).forEach((v) => {
        const row = document.createElement('div');
        row.className = 'trr-violations-row';
        const who = v.username || v.user || 'Unknown user';
        const what = v.rule || v.reason || v.type || 'Rule violation';
        row.textContent = `${who} · ${what}`;
        banner.appendChild(row);
    });

    return banner;
}

/**
 * Top users over the rollup window, as a two-column row list.
 *
 * A row rather than a card gives the name real width - the old three-column
 * card grid left about 53px for it, so most Plex usernames ellipsised.
 *
 * @param {Object} rollup
 * @param {Array} identities
 * @returns {HTMLElement|null}
 */
function buildTopUsers(rollup, identities) {
    const ranked = (rollup.topUsers || []).filter((u) => u.plays > 0).slice(0, 6);
    if (ranked.length === 0) return null;

    const byId = new Map(identities.map((i) => [i.id, i]));
    const peak = ranked[0].plays || 1;

    const section = document.createElement('div');
    section.className = 'trr-section';

    const heading = document.createElement('h2');
    heading.className = 'trr-section-title';
    heading.textContent = `Top users · last ${rollup.windowDays} days`;
    section.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'trr-user-list';

    ranked.forEach((entry, index) => {
        const identity = byId.get(entry.id);
        const row = document.createElement('div');
        row.className = 'trr-user-row';

        const rank = document.createElement('span');
        rank.className = 'trr-user-rank';
        rank.textContent = `${index + 1}`;

        const name = document.createElement('span');
        name.className = 'trr-user-name';
        name.textContent = identity?.username || entry.username || 'Unknown';
        name.title = name.textContent;

        const meter = document.createElement('span');
        meter.className = 'trr-user-meter';
        const fill = document.createElement('span');
        fill.className = 'trr-user-meter-fill';
        fill.style.width = `${Math.round((entry.plays / peak) * 100)}%`;
        meter.appendChild(fill);

        const count = document.createElement('span');
        count.className = 'trr-user-count';
        count.textContent = formatDuration(entry.watchTimeMs);
        count.title = `${entry.plays} ${entry.plays === 1 ? 'play' : 'plays'}`;

        row.append(rank, name, meter, count);
        list.appendChild(row);
    });

    section.appendChild(list);
    return section;
}

/**
 * Window totals, demoted to a single muted line. They carry no urgency, so they
 * have no claim on the primary type sizes.
 * @param {Object} rollup
 * @param {number} totalUsers
 * @returns {HTMLElement}
 */
function buildAllTimeFooter(rollup, totalUsers) {
    const footer = document.createElement('div');
    footer.className = 'trr-footer';
    footer.textContent =
        `${rollup.window.plays} plays in ${rollup.windowDays} days · ${totalUsers} users registered`;
    return footer;
}

/**
 * Formats a duration in milliseconds as a compact "8h 12m" / "45m" figure.
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
    const totalMinutes = Math.round((Number(ms) || 0) / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
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
