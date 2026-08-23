import {
  getSystemData,
  getLiveMetrics,
  archiveNotification,
  getCachedSystemData,
  controlContainer,
  updateContainer,
  updateAllContainers,
  controlParityCheck,
  setArrayState,
  controlVm
} from "../../services/unraid.js";
import { showNotification, showConfirmModal, validateUrl, openUrlSafely } from "../utils.js";
import poller from "../core/Poller.js";

/**
 * Credentials for handlers built outside initUnraid's closure. Set on every
 * init so a key changed in Options is picked up rather than baked in.
 */
let activeUnraid = { url: '', key: '' };

/**
 * View state that must outlive one initUnraid() call.
 *
 * The generic sub-tab handler in popup.js calls loadService() on every sub-tab
 * click, so initUnraid() re-runs each time the user switches System → Docker →
 * VMs. When these three lived inside its closure, every switch reset them: the
 * next fetch believed nothing had been painted yet and repainted from the
 * core-only partial payload, which carries no sensors and no notifications.
 * That is why the temperature dropped to "--" and the attention list emptied
 * a moment after every tab switch, then filled back in a second later.
 *
 * They are module-scoped instead, and cleared only when the server actually
 * changes.
 */
let unraidData = null;          // last payload rendered, shared across inits
let unraidPaintedFull = false;  // a complete payload is currently on screen
let cpuHistory = [];            // rolling CPU samples for the sparkline
let liveMetrics = null;         // newest CPU/RAM reading from the fast poll

/**
 * The sparkline slides left by one sample-width per new reading. The slow
 * payload poll also repaints the CPU card, and without a way to tell the two
 * apart it restarted that slide five times a minute with no new sample —
 * snapping the curve a step to the right and crawling back, on top of the
 * smooth motion. The sequence numbers make a slide follow a sample, not a
 * repaint.
 */
let cpuSampleSeq = 0;           // incremented once per accepted reading
let cpuSlideSeq = -1;           // sequence the current slide belongs to
let lastSampleAt = 0;           // timestamp of the previous reading
let sampleGapMs = 0;            // measured spacing, drives the slide duration

/**
 * The CPU card runs on its own clock.
 *
 * The full payload is expensive — disks, every container, the sensor list, the
 * notification feed — so it polls at five seconds. A load figure and a curve
 * that only move every five seconds are not live, so CPU and RAM come from a
 * two-field query at one second instead. Sixty samples is one minute of curve.
 */
const LIVE_METRICS_INTERVAL = 1000;
const CPU_HISTORY_LENGTH = 60;

/**
 * Initializes the Unraid service view.
 * - Polls for system data (CPU, RAM, Array, Docker).
 * - Renders Dashboard, Storage, Docker, and VM tabs.
 * @param {string} url - Unraid URL (root or Unraid Connect URL)
 * @param {string} key - API Key (Unraid API Plugin)
 * @param {object} state - App state
 */
export async function initUnraid(url, key, state) {
    // A different server invalidates everything held above.
    if (activeUnraid.url !== url) {
        unraidData = null;
        unraidPaintedFull = false;
        cpuHistory = [];
        liveMetrics = null;
        cpuSampleSeq = 0;
        cpuSlideSeq = -1;
        lastSampleAt = 0;
        sampleGapMs = 0;
    }
    activeUnraid = { url, key };

    if (!key) {
        setUnraidHero('Not configured', 'Add an Unraid API key in Options', 'warn');
        return;
    }

    const update = async () => {
         const activeSubTab = document.querySelector("#unraid-view .sub-tab-btn.active");
         const target = activeSubTab ? activeSubTab.dataset.target : 'unraid-tab-system';

         // One payload drives every sub-tab.
         //
         // The core query returns well before the sensor query, which shells
         // out to lm-sensors on the server. Painting from the core response
         // first makes the tab usable immediately — but only when the screen
         // is otherwise empty. Once anything complete has been painted, a
         // partial repaint would visibly take the temperature and the
         // notifications away and hand them back a second later, so the
         // callback is not passed at all.
         const data = await getSystemData(url, key, {
             onPartial: unraidPaintedFull ? undefined : (core) => {
                 if (unraidPaintedFull) return;
                 unraidData = core;
                 renderUnraidSystem(core);
                 renderActiveSubTab(core, url, key, target);
             }
         });
         if (data._error) throw new Error(data._error);
         unraidData = data;
         unraidPaintedFull = true;

         renderUnraidSystem(data);
         // A tick that got here is healthy; the scheduler marks the view stale
         // on repeated failure via the catch below.
         document.getElementById('unraid-view')?.classList.remove('is-stale');

         renderActiveSubTab(data, url, key, target);
         // The badge is cheap and belongs to the tab strip, not to one view.
         updateDockerTabBadge(data.dockers || [], url, key);
    };

    /**
     * Wraps update() so a failure both marks the view and reaches the
     * scheduler, which needs the rejection to slow its retries down.
     */
    const guardedUpdate = async () => {
        try {
            await update();
        } catch (e) {
            document.getElementById('unraid-view')?.classList.add('is-stale');
            setUnraidHero('Unreachable', `No response from Unraid · ${e.message}`, 'crit');
            throw e;
        }
    };

    /**
     * Renders whichever sub-tab is showing. Storage skips work while hidden,
     * and the row lists reconcile, so calling this is cheap.
     * @param {Object} data - System payload
     * @param {string} u - Unraid URL
     * @param {string} k - API key
     * @param {string} target - Active sub-view id
     */
    const renderActiveSubTab = (data, u, k, target) => {
        if (target === 'unraid-tab-docker') {
            renderUnraidDocker(data.dockers || [], u, k);
        } else if (target === 'unraid-tab-vms') {
            renderUnraidVms(data.vms || [], u, k);
        } else if (target === 'unraid-tab-storage') {
            renderUnraidStorage(data);
        }
    };

    // Switching sub-tabs must paint from the data already in hand. Without
    // this the new tab stayed empty until the next 5s tick, which read as
    // "Docker is broken" rather than "one moment".
    const subTabs = document.querySelector('#unraid-view .sub-tabs');
    if (subTabs && !subTabs.dataset.unraidRenderHook) {
        subTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.sub-tab-btn');
            if (!btn) return;
            // Reads unraidData rather than a captured local: this listener is
            // attached once (see the dataset guard) and would otherwise keep
            // painting whatever the very first initUnraid() call had fetched.
            requestAnimationFrame(() => {
                if (!unraidData) return;
                renderActiveSubTab(unraidData, activeUnraid.url, activeUnraid.key,
                    btn.dataset.target);
            });
        });
        subTabs.dataset.unraidRenderHook = 'true';
    }

    // One dismissal handler for every container menu. Registered on the body
    // rather than per row, because rows come and go on every poll and a
    // listener each would leak one per container per five seconds.
    if (!document.body.dataset.unraidMenuHook) {
        document.addEventListener('click', (e) => {
            // A click that landed inside a row is that row's own business —
            // it either toggled the menu or ran an entry, both of which
            // already leave the menu in the right state.
            if (!e.target?.closest?.('.unraid-row')) closeAllDockerMenus();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAllDockerMenus();
        });
        document.body.dataset.unraidMenuHook = 'true';
    }

    // Sort & Search Listeners
    const triggerUpdate = () => {
        if (unraidData && unraidData.dockers) {
            renderUnraidDocker(unraidData.dockers, url, key);
        } else {
            update();
        }
    };

    const sortSelect = document.getElementById("unraid-docker-sort");
    if (sortSelect && !sortSelect.dataset.initListener) {
        sortSelect.addEventListener("change", triggerUpdate);
        sortSelect.dataset.initListener = "true";
    }

    const searchInput = document.getElementById("unraid-docker-search");
    if (searchInput && !searchInput.dataset.initListener) {
        let debounceTimer;
        searchInput.addEventListener("input", () => {
             clearTimeout(debounceTimer);
             debounceTimer = setTimeout(triggerUpdate, 300); // 300ms debounce
        });
        searchInput.dataset.initListener = "true";
    }

    // Instant render from cache (stale-while-revalidate) — avoids a blank UI on
    // popup open. The active sub-tab is painted too: rendering only the header
    // left whichever list the user was last on empty until the fetch landed,
    // which is most of what "opening Unraid is slow" actually felt like.
    try {
        const cached = await getCachedSystemData(url);
        if (cached?.data && !unraidData) {
            unraidData = cached.data;
            // A cached snapshot is a complete payload — it is only written
            // after all four queries have landed — so it counts as a full
            // paint and suppresses the partial repaint below.
            unraidPaintedFull = true;
            renderUnraidSystem(cached.data);
            const activeBtn = document.querySelector('#unraid-view .sub-tab-btn.active');
            renderActiveSubTab(cached.data, url, key,
                activeBtn?.dataset.target || 'unraid-tab-system');
        }
    } catch (e) {
        console.debug("Unraid cache read skipped:", e.message);
    }

    /**
     * The one-second tick. Touches only the two cards it has data for, so it
     * cannot disturb the sensor reading, the container list or anything else
     * the slow payload owns.
     *
     * A failure here is left to the scheduler: two misses and it backs off,
     * and the cards keep showing the last good figure rather than blanking.
     */
    const sampleMetrics = async () => {
        const metrics = await getLiveMetrics(url, key);
        if (!Number.isFinite(Number(metrics.cpu))) return;
        liveMetrics = metrics;
        pushCpuSample(metrics.cpu);

        // Before the first full payload there is no chip name or sensor to
        // render around, but the curve itself can already start moving.
        if (!unraidData) {
            drawCpuSparkline();
            return;
        }
        renderUnraidCpuCard(unraidData, unraidData.system || {},
            pickTemperatures(unraidData));
        renderUnraidRamCard(unraidData, unraidData.system || {});
    };

    await guardedUpdate().catch(() => { /* surfaced in the view already */ });
    // Unchanged 5s cadence while visible - array, Docker, VMs and sensors.
    poller.register('unraid', guardedUpdate, { interval: 5000, immediate: false });
    // Both live in the default 'view' group, so leaving the tab stops both.
    poller.register('unraid-metrics', sampleMetrics,
        { interval: LIVE_METRICS_INTERVAL, immediate: true });
}

// Utils
const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

/**
 * Uptime as the status card's headline figure: days, hours and minutes, so a
 * server rebooted twenty minutes ago does not read as "0d 0h".
 * @param {string} iso - Boot timestamp
 * @returns {string}
 */
const getUptimeLong = (iso) => {
    if (!iso) return '--';
    const diff = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diff) || diff < 0) return '--';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

const getUptime = (iso) => {
  if (!iso) return "--";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return `${days}d ${hours}h`;
};

/**
 * Picks the CPU, motherboard and hottest-disk temperature out of the raw
 * sensor list.
 *
 * Kept verbatim from the previous renderer because it encodes real hardware
 * knowledge: some chip drivers (nct6798) report voltages and fan RPMs in the
 * same payload and the Unraid API tags them all CELSIUS, so plausible ranges
 * and name patterns have to do the filtering.
 *
 * @param {Object} data - System payload from getSystemData
 * @returns {{cpu: Object|null, mb: Object|null, disk: Object|null,
 *   degree: string, supported: boolean}}
 */
function pickTemperatures(data) {
    const cpuTemp = data.system?.cpuTemp;
    const sensors = data.system?.temperatures || [];
    const unit = sensors[0]?.unit;
    const degree = unit === 'FAHRENHEIT' ? '°F' : '°C';
    const minReasonable = unit === 'FAHRENHEIT' ? 50 : 15;
    const maxReasonable = unit === 'FAHRENHEIT' ? 250 : 120;

    const isPlausibleTemp = (s) => {
        if (typeof s.value !== 'number') return false;
        if (s.value < minReasonable || s.value > maxReasonable) return false;
        const name = (s.name || '').toLowerCase();
        if (/\bin\d+\b/.test(name)) return false;          // voltage rails
        if (/\b(fan|rpm|vddgfx|vddnb|vcore|vbat)\b/.test(name)) return false;
        return true;
    };
    const matchesName = (s, pattern) =>
        isPlausibleTemp(s) && pattern.test((s.name || '').toLowerCase());

    let cpu = null;
    if (typeof cpuTemp === 'number') {
        cpu = { value: cpuTemp, name: 'CPU' };
    } else if (sensors.length > 0) {
        // Die sensors first, board sensors last.
        //
        // This order used to be the other way round, on the theory that a
        // superio "CPU Temp" is the more trustworthy reading. On a Ryzen it is
        // not the same measurement: k10temp reports Tctl from the die, while
        // the nct6798's "CPU Temp" is a board-side probe near the socket that
        // reads far lower — 40.5 against 57.75 on the machine this was checked
        // on. Every other tool, Unraid's own dashboard included, shows Tctl.
        cpu = sensors.find(s => matchesName(s, /\b(tctl|tdie)\b/))
            || sensors.find(s => matchesName(s, /\bpackage\s*id\b/))
            || sensors.find(s => matchesName(s, /\bpackage\b/))
            || sensors.find(s => matchesName(s, /\bcore\s*\d/))
            || sensors.find(s => matchesName(s, /\bcpu\s*temp\b/))
            || sensors.find(s => matchesName(s, /\bcpu\b/))
            || null;
    }

    const mb = sensors.find(s => matchesName(s, /\bmb\b|motherboard/))
        || sensors.find(s => s.type === 'MOTHERBOARD' && isPlausibleTemp(s))
        || sensors.find(s => matchesName(s, /\bsystin\b/))
        || null;

    // Named drives beat chip-internal labels like "Composite" or "Sensor 1".
    const diskCandidates = sensors.filter(s =>
        (s.type === 'DISK' || s.type === 'NVME') && isPlausibleTemp(s));
    const namedDrives = diskCandidates.filter(s =>
        !/\b(composite|sensor\s*\d)\b/.test((s.name || '').toLowerCase()));
    const diskPool = namedDrives.length > 0 ? namedDrives : diskCandidates;
    const disk = diskPool.slice().sort((a, b) => b.value - a.value)[0] || null;

    return {
        cpu, mb, disk, degree,
        // False only when the server answered without any sensor data at all,
        // i.e. a pre-4.30 API. Used to dim the cell rather than remove it.
        supported: typeof cpuTemp === 'number' || sensors.length > 0
    };
}

/**
 * The API reports the licence tier in caps ("LIFETIME"); shown next to a
 * version string it reads as shouting.
 * @param {string} text
 * @returns {string}
 */
function titleCase(text) {
    return String(text).charAt(0).toUpperCase() + String(text).slice(1).toLowerCase();
}

/**
 * Records one CPU reading for the sparkline.
 *
 * Kept in memory only — a minute of history is not worth a storage write every
 * second. Also measures the spacing between readings, which the slide uses as
 * its duration: the scheduler waits its interval *after* each run finishes, so
 * the real cadence is the interval plus however long the server took, and a
 * slide hard-coded to the interval would finish early and sit still. When the
 * scheduler backs off from a failing server the gap grows and the slide slows
 * with it, instead of stuttering.
 *
 * @param {number} percent
 */
function pushCpuSample(percent) {
    const value = Number(percent);
    if (!Number.isFinite(value)) return;

    cpuHistory.push(Math.min(Math.max(value, 0), 100));
    if (cpuHistory.length > CPU_HISTORY_LENGTH) {
        cpuHistory.splice(0, cpuHistory.length - CPU_HISTORY_LENGTH);
    }
    cpuSampleSeq++;

    const now = Date.now();
    if (lastSampleAt > 0) {
        // Clamped: a tab resumed after being hidden reports a gap of minutes,
        // and a minutes-long slide would look like the curve had frozen.
        sampleGapMs = Math.min(Math.max(now - lastSampleAt, 250), 5000);
    }
    lastSampleAt = now;
}

/**
 * Sets a bar's width and severity class in one place.
 * @param {string} id - Element id of the fill
 * @param {number} percent
 * @param {string} [severity] - '', 'warn' or 'crit'
 */
function setBar(id, percent, severity = '') {
    const fill = document.getElementById(id);
    if (!fill) return;
    fill.style.width = `${Math.min(Math.max(Number(percent) || 0, 0), 100)}%`;
    fill.className = `ur-fill${severity ? ` is-${severity}` : ''}`;
}

/**
 * Sets an element's text only when it differs, so the DOM is not dirtied
 * twelve times a minute for values that never change.
 * @param {string} id
 * @param {string} text
 */
function setText(id, text) {
    const el = document.getElementById(id);
    if (el && el.textContent !== text) el.textContent = text;
}

/**
 * Load band for CPU and RAM.
 * @param {number} percent
 * @returns {string} '', 'warn' or 'crit'
 */
function loadSeverity(percent) {
    if (!Number.isFinite(percent)) return '';
    if (percent >= 90) return 'crit';
    if (percent >= 75) return 'warn';
    return '';
}

/**
 * The server's unread notifications, worst first.
 *
 * This list used to mix two things that looked identical: messages Unraid had
 * raised, and conditions this code derived itself from the payload — a disk
 * over some threshold, an array not started, a parity error count. The derived
 * rows were the problem. They could not be dismissed, because there is nothing
 * to dismiss: the next five-second poll writes them straight back. They
 * duplicated what the Storage tab and the status card already show. And they
 * second-guessed the server, which on this machine meant warning about a drive
 * Unraid itself considered perfectly fine.
 *
 * So the list is now exactly the notification feed. Every row is a real
 * message with a real id, and every row can be archived — the same action
 * Unraid's own interface offers. Conditions still surface where they belong:
 * array state in the status card, disk health and capacity in Storage, parity
 * beside the parity disks.
 *
 * @param {Object} data - System payload
 * @returns {Array<{level: string, what: string, detail: string, noticeId: string}>}
 */
function collectAttention(data) {
    const rank = { ALERT: 0, WARNING: 1, INFO: 2 };

    return (data.notifications?.items || [])
        .map(note => {
            const importance = String(note.importance || '').toUpperCase();
            return {
                level: importance === 'ALERT' ? 'crit'
                    : importance === 'WARNING' ? 'warn' : '',
                what: cleanNoticeSubject(note.subject || note.title || 'Notification'),
                detail: note.description || '',
                noticeId: note.id,
                rank: rank[importance] ?? 3
            };
        })
        .sort((a, b) => a.rank - b.rank);
}

/**
 * Strips Unraid's notification prefix. The API sends
 * "Warning [UNRAID] - Disk 3 is hot (46 C)"; the severity is already carried by
 * the row's mark, and the hostname is not news to the person reading it.
 * @param {string} subject
 * @returns {string}
 */
function cleanNoticeSubject(subject) {
    return String(subject)
        .replace(/^(warning|notice|alert|info)\s*/i, '')
        .replace(/^\[[^\]]+\]\s*-?\s*/, '')
        .trim() || String(subject);
}

/**
 * The dismiss button. Archiving is what Unraid's own UI does with a
 * notification: it leaves the archive, it is not deleted.
 *
 * @param {Object} item - Entry from collectAttention
 * @param {Array} items - The list this row belongs to, repainted on success
 * @returns {HTMLElement}
 */
function buildAttentionAction(item, items) {
    const btn = makeUnraidAction('\u00d7', 'Dismiss this notification');
    btn.classList.add('ua-action');
    btn.addEventListener('click', async (e) => {
        blurIfPointer(e, btn);
        btn.disabled = true;
        try {
            await archiveNotification(activeUnraid.url, activeUnraid.key, item.noticeId);
            // Repaint the whole section rather than just pulling the row out
            // of the DOM. Removing the row alone left the banner still
            // counting it — "1 unread notification" above an empty list —
            // until the next poll corrected it five seconds later. A repaint
            // keeps the count, the severity colour and the empty state in
            // step with what is actually on screen.
            const at = items.indexOf(item);
            if (at >= 0) items.splice(at, 1);
            renderUnraidAttention(items);

            // Also drop it from the cached payload, so a repaint from cache —
            // a sub-tab switch, say — does not bring it back for the seconds
            // before the next fetch lands.
            const cached = unraidData?.notifications?.items;
            const ci = cached ? cached.findIndex(n => n.id === item.noticeId) : -1;
            if (ci >= 0) cached.splice(ci, 1);
        } catch (err) {
            btn.disabled = false;
            showNotification(`Could not dismiss: ${err.message}`, 'error');
        }
    });
    return btn;
}

/**
 * Renders the System tab.
 *
 * Layout follows the order a person actually reads in: is the server up, is
 * anything wrong, how hard is it working, what is it running. Every element
 * written here already exists in popup.html with a placeholder, so this only
 * ever changes text, bar widths and classes — nothing is created, removed or
 * un-hidden, which is what used to make the tab jump a full row a second
 * after it first appeared.
 *
 * @param {Object} data - System payload from getSystemData
 */
function renderUnraidSystem(data) {
    const temps = pickTemperatures(data);
    const array = data.array || {};
    const sys = data.system || {};

    // Before anything grades a temperature.
    applyDiskThresholds(data.thresholds, temps.degree);

    renderUnraidHeader(data, array, sys);
    renderUnraidStatusCard(data, sys);
    renderUnraidAttention(collectAttention(data));
    renderUnraidCpuCard(data, sys, temps);
    renderUnraidRamCard(data, sys);
    renderUnraidArrayCard(data, array);
    renderUnraidServiceCards(data);
}

/**
 * The header is visible on every sub-tab, so it carries identity rather than
 * live load: which server this is, on what licence, with how much room left.
 * @param {Object} data
 * @param {Object} array
 * @param {Object} sys
 */
function renderUnraidHeader(data, array, sys) {
    const hero = document.getElementById('unraid-hero');
    if (hero) {
        hero.classList.remove('is-pending', 'is-ok', 'is-warn', 'is-crit');
        hero.textContent = sys.version ? `Unraid ${sys.version}` : 'Unraid';
    }

    const subline = document.getElementById('unraid-subline');
    if (!subline) return;

    const parts = [];
    if (sys.registration) parts.push(titleCase(sys.registration));
    const free = Number(array.free) || 0;
    if (free > 0) parts.push(`${formatBytes(free, 1)} free`);
    // No uptime here any more: it sits to the right of this line as the
    // header's own figure, and printing it twice on one row read as a mistake.
    subline.textContent = parts.join(' · ') || 'Connected';
}

/**
 * Reachability and uptime, in the header's right-hand slot.
 *
 * Addressed purely by id, and the header is in the DOM from first paint on
 * every sub-tab, so this needs no knowledge of which tab is showing.
 * @param {Object} data
 * @param {Object} sys
 */
function renderUnraidStatusCard(data, sys) {
    const reachable = !data._error;
    const started = /^started$/i.test(String(data.array?.status || ''));

    const dot = document.getElementById('unraid-state-dot');
    if (dot) {
        dot.className = `ur-dot is-${reachable ? (started ? 'ok' : 'warn') : 'crit'}`;
    }
    // One word where one word will do. The dot beside it already carries the
    // severity, and "Server online" repeated a subject the whole view is
    // about. The middle state stays distinct: the server answers but the
    // array is down, which is neither online nor offline.
    setText('unraid-state-text', reachable
        ? (started ? 'Online' : 'Array stopped')
        : 'Offline');
    setText('unraid-uptime', getUptimeLong(sys.uptimeBoot));
    setText('unraid-uptime-sub', 'Uptime');
}

/**
 * Attention: a one-line summary that opens the full list.
 *
 * The list itself used to be the whole top of the System tab, which meant a
 * healthy server spent its most valuable screen space saying nothing was
 * wrong. The banner keeps severity and count visible at all times and puts
 * the detail one click away; the open/closed choice is remembered.
 *
 * @param {Array} items - Result of collectAttention
 */
function renderUnraidAttention(items) {
    const banner = document.getElementById('unraid-attention-banner');
    const list = document.getElementById('unraid-attention');
    if (!banner || !list) return;

    if (items.length === 0) {
        banner.classList.add('hidden');
        list.classList.add('hidden');
        list.replaceChildren();
        return;
    }

    const worst = items.some(i => i.level === 'crit') ? 'crit'
        : items.some(i => i.level === 'warn') ? 'warn' : 'info';
    banner.className = `ur-attention-banner is-${worst}`;
    banner.title = 'Unread notifications from Unraid. Dismissing one archives '
        + 'it on the server, exactly as its own interface does.';
    const dot = document.getElementById('unraid-attention-dot');
    if (dot) dot.className = `ur-dot is-${worst}`;
    setText('unraid-attention-level',
        worst === 'crit' ? 'Critical' : worst === 'warn' ? 'Warning' : 'Notice');
    setText('unraid-attention-text', items.length === 1
        ? '1 unread notification'
        : `${items.length} unread notifications`);

    if (!banner.dataset.hook) {
        banner.addEventListener('click', (e) => {
            blurIfPointer(e, banner);
            const open = !list.classList.toggle('hidden');
            banner.setAttribute('aria-expanded', String(open));
            try {
                localStorage.setItem('unraid_attention_open', open ? '1' : '0');
            } catch { /* private mode: the choice simply is not remembered */ }
        });
        banner.dataset.hook = 'true';
    }

    let open = false;
    try {
        open = localStorage.getItem('unraid_attention_open') === '1';
    } catch { /* see above */ }
    list.classList.toggle('hidden', !open);
    banner.setAttribute('aria-expanded', String(open));

    list.replaceChildren();
    for (const item of items) {
        const row = document.createElement('div');
        row.className = `unraid-attention-row${item.level ? ` is-${item.level}` : ''}`;

        const mark = document.createElement('span');
        mark.className = 'ua-mark';
        mark.setAttribute('aria-hidden', 'true');

        const what = document.createElement('span');
        what.className = 'ua-what';
        what.textContent = item.what;
        what.title = item.what;

        const detail = document.createElement('span');
        detail.className = 'ua-detail';
        detail.textContent = item.detail;

        row.append(mark, what, detail);
        row.appendChild(buildAttentionAction(item, items));
        list.appendChild(row);
    }
}

/**
 * CPU card: load as the headline, the chip and its core count as context, the
 * hottest temperature as a badge, and three minutes of history as a sparkline.
 * @param {Object} data
 * @param {Object} sys
 * @param {Object} temps - Result of pickTemperatures
 */
function renderUnraidCpuCard(data, sys, temps) {
    // The one-second poll is the fresher source whenever it is running; the
    // payload's own figure is the fallback for the first paint and for a
    // server whose live query is failing.
    const percent = Number(liveMetrics?.cpu ?? data.cpu);
    setText('unraid-cpu-value',
        Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '--');

    const sev = loadSeverity(percent);
    const figure = document.getElementById('unraid-cpu-value');
    if (figure) figure.className = `ur-metric-figure${sev ? ` is-${sev}` : ''}`;

    // Two lines, not one: the chip name is long enough on its own to push the
    // core count out of a half-width card when they share a line, and the
    // count is the half that makes the load figure mean something.
    setText('unraid-cpu-brand', sys.cpuBrand || '\u00a0');
    // The name still overflows a narrow card, so the full string stays
    // reachable on hover.
    const brand = document.getElementById('unraid-cpu-brand');
    if (brand) brand.title = sys.cpuBrand || '';

    setText('unraid-cpu-sub', sys.cpuCores
        ? `${sys.cpuCores} ${sys.cpuCores === 1 ? 'core' : 'cores'}`
            + (sys.cpuThreads ? ` · ${sys.cpuThreads} threads` : '')
        : '\u00a0');

    // The CPU's own temperature. This badge used to show the hottest of the
    // CPU, motherboard and disk readings — a leftover from when it lived in a
    // header strip labelled TEMP. On a card labelled CPU that is simply wrong:
    // on the machine this was checked on it displayed the motherboard's 57 C
    // while the CPU was at 40.5. Board and disk temperatures have their own
    // homes — the attention list and the Storage tab.
    const badge = document.getElementById('unraid-temp');
    if (badge) {
        const band = temps.cpu ? tempSeverity(temps.cpu.value, 'cpu') : '';
        // Dimmed rather than removed when this server exposes no CPU sensor,
        // so the card keeps its shape.
        badge.className = `ur-temp${band ? ` is-${band}` : ''}`
            + (temps.cpu ? '' : ' is-unavailable');
        badge.title = temps.cpu
            ? `CPU temperature · ${temps.cpu.name}`
            : 'No CPU temperature sensor';
    }
    setText('unraid-temp-value',
        temps.cpu ? `${Math.round(temps.cpu.value)}${temps.degree}` : '--');

    drawCpuSparkline();
}

/**
 * Draws the CPU history into the card's inline SVG.
 *
 * Two things keep it from looking like a bar chart that redraws once a second.
 *
 * The shape is a Catmull-Rom spline rather than straight segments, because CPU
 * load is noisy and a polyline through sixty noisy samples reads as a picket
 * fence rather than a trend.
 *
 * The motion is a slide. The newest sample is placed one step beyond the right
 * edge and the group is translated left by exactly that step over one polling
 * interval, so by the time the next reading lands the curve has walked into
 * position and the redraw is invisible. Without it the whole line jumps a
 * step at once and the eye reads the jump, not the data.
 */
function drawCpuSparkline() {
    const line = document.getElementById('unraid-cpu-spark-line');
    if (!line) return;

    if (cpuHistory.length < 2) {
        line.setAttribute('d', '');
        return;
    }

    // Fixed denominator with the newest sample pinned to the right edge, so a
    // short history fills in from the right and older samples scroll out on
    // the left. Rescaling to fit instead would make an unchanged past appear
    // to move every second.
    const step = 100 / (CPU_HISTORY_LENGTH - 1);
    const newest = 100 + step;
    const last = cpuHistory.length - 1;
    const points = cpuHistory.map((value, i) => ({
        x: newest - (last - i) * step,
        y: 26 - (value / 100) * 24
    }));

    line.setAttribute('d', splinePath(points));
    slideSparkline(step);
}

/**
 * A Catmull-Rom spline through the points, emitted as cubic Béziers.
 *
 * Control points are clamped to the drawing box: the spline overshoots on a
 * sharp spike, and an unclamped overshoot draws outside the card.
 *
 * @param {Array<{x: number, y: number}>} points
 * @returns {string} SVG path data
 */
function splinePath(points) {
    const clampY = (y) => Math.min(Math.max(y, 1), 27);
    const at = (i) => points[Math.min(Math.max(i, 0), points.length - 1)];

    let d = `M ${points[0].x.toFixed(2)},${clampY(points[0].y).toFixed(2)}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = at(i - 1);
        const p1 = at(i);
        const p2 = at(i + 1);
        const p3 = at(i + 2);
        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
        d += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)}`
            + ` ${c2x.toFixed(2)},${c2y.toFixed(2)}`
            + ` ${p2.x.toFixed(2)},${clampY(p2.y).toFixed(2)}`;
    }
    return d;
}

/**
 * Restarts the leftward slide, but only for a reading it has not run for yet.
 *
 * Snapping back to the start is only invisible because the path is redrawn one
 * step further right in the same breath. Do it without a new sample — which is
 * what the five-second payload poll and every sub-tab click used to cause —
 * and the path does not move while the transform does, so the curve visibly
 * jumps a step right and crawls back.
 *
 * @param {number} step - Horizontal distance between two samples, user units
 */
function slideSparkline(step) {
    if (cpuSlideSeq === cpuSampleSeq) return;
    const shift = document.getElementById('unraid-cpu-spark-shift');
    if (!shift) return;
    cpuSlideSeq = cpuSampleSeq;

    shift.style.transition = 'none';
    shift.style.transform = 'translateX(0px)';
    // Read a layout property to commit that reset. Both writes would otherwise
    // collapse into a single style recalculation, the browser would never see
    // the start position, and there would be nothing to animate from — the
    // once-a-second jump this exists to remove.
    void shift.getBoundingClientRect().width;
    shift.style.transition = `transform ${sampleGapMs || LIVE_METRICS_INTERVAL}ms linear`;
    shift.style.transform = `translateX(${-step}px)`;
}

/**
 * RAM card.
 *
 * Used is derived as total - available, not from the API's `used`, which
 * counts cache and buffers and therefore sits near 95% on a healthy server.
 * total - available is what the API's own percentTotal is computed from, so
 * the figure and the percentage agree.
 * @param {Object} data
 * @param {Object} sys
 */
function renderUnraidRamCard(data, sys) {
    const percent = Number(liveMetrics?.ram ?? data.ram);
    const sev = loadSeverity(percent);
    setText('unraid-ram-value',
        Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '--');
    setBar('unraid-ram-fill', percent, sev);

    const total = Number(liveMetrics?.memoryTotal || sys.memoryTotal) || 0;
    const available = Number(liveMetrics?.memoryAvailable || sys.memoryAvailable) || 0;
    const used = available > 0
        ? Math.max(total - available, 0)
        : (Number.isFinite(percent) ? total * (percent / 100) : 0);
    setText('unraid-ram-sub', total > 0
        ? `${formatBytes(used, 2)} / ${formatBytes(total, 2)}`
        : '\u00a0');
    // Mirrors the CPU card's second line, and answers what the used figure
    // does not: how much is left to hand out.
    setText('unraid-ram-free', available > 0
        ? `${formatBytes(available, 2)} available`
        : '\u00a0');

    const value = document.getElementById('unraid-ram-value');
    if (value) value.className = `ur-metric-figure${sev ? ` is-${sev}` : ''}`;
}

/**
 * Array card, including the parity control.
 * @param {Object} data
 * @param {Object} array
 */
function renderUnraidArrayCard(data, array) {
    const total = Number(array.total) || 0;
    const free = Number(array.free) || 0;
    const used = Number(array.used) || Math.max(total - free, 0);
    const percent = total > 0 ? (used / total) * 100 : 0;
    // storageSeverity returns 'ok' for the healthy case; the bar wants ''.
    const raw = storageSeverity(free, percent);
    const sev = raw === 'ok' ? '' : raw;

    const disks = (array.disks || []).length;
    setText('unraid-array-name',
        disks > 0 ? `Array · ${disks} ${disks === 1 ? 'disk' : 'disks'}` : 'Array');
    setText('unraid-array-value', total > 0 ? `${percent.toFixed(1)}%` : '--');
    setBar('unraid-array-fill', percent, sev);
    setText('unraid-array-sub', total > 0
        ? `${formatBytes(used, 2)} / ${formatBytes(total, 2)} · ${formatBytes(free, 1)} free`
        : 'No array data');

    const value = document.getElementById('unraid-array-value');
    if (value) value.className = `ur-metric-pct${sev ? ` is-${sev}` : ''}`;
    // The parity control lives in Storage, next to the parity disks it acts
    // on, rather than under a capacity figure it has nothing to do with.
}

/**
 * Docker and VM count cards. Both jump to their own sub-tab, which is the only
 * thing anyone wants after reading the count.
 * @param {Object} data
 */
function renderUnraidServiceCards(data) {
    const containers = data.dockers || [];
    const vms = data.vms || [];

    setServiceCard('docker', containers.filter(c => c.running).length,
        containers.length, containers.filter(c => c.updateAvailable).length);
    setServiceCard('vm', vms.filter(v => /running/i.test(v.state || '')).length,
        vms.length, 0);
}

/**
 * Fills one service card and wires its jump once.
 * @param {string} id - 'docker' or 'vm'
 * @param {number} running
 * @param {number} total
 * @param {number} updates - Containers with an update pending
 */
function setServiceCard(id, running, total, updates) {
    setText(`unraid-${id}-count`, total === 0 ? '0' : String(running));
    setText(`unraid-${id}-total`, total === 0 ? '' : ` / ${total}`);

    const stopped = total - running;
    setText(`unraid-${id}-sub`, total === 0
        ? 'None configured'
        : updates > 0
            ? `${updates} update${updates === 1 ? '' : 's'} available`
            : stopped > 0
                ? `${stopped} stopped`
                : 'All running');

    const dot = document.getElementById(`unraid-${id}-dot`);
    if (dot) {
        dot.className = `ur-dot is-${total === 0 ? 'idle'
            : updates > 0 ? 'warn'
            : running === total ? 'ok' : 'idle'}`;
    }

    const card = document.getElementById(`unraid-${id}-card`);
    if (card && !card.dataset.hook) {
        card.addEventListener('click', (e) => {
            blurIfPointer(e, card);
            document.querySelector(
                `#unraid-view .sub-tab-btn[data-target="${card.dataset.goto}"]`)?.click();
        });
        card.dataset.hook = 'true';
    }
}

/**
 * The shared shape of a control row: a label, a live state, and one button.
 *
 * Built once and updated in place by the callers. Both rows sit among the
 * device rows in Storage and are styled to match them, so the section reads as
 * one list rather than a control bolted above a list.
 *
 * @param {HTMLElement} slot - Container the row lives in
 * @param {string} label - Fixed left-hand label
 * @param {Function} onClick - Receives the row, so it can read row._state
 * @returns {HTMLElement}
 */
function ensureControlRow(slot, label, onClick) {
    let row = slot.querySelector('.unraid-control-row');
    if (row) return row;

    row = document.createElement('div');
    row.className = 'unraid-control-row';

    const name = document.createElement('span');
    name.className = 'uc-label';
    name.textContent = label;

    const state = document.createElement('span');
    state.className = 'uc-state';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'uc-btn';
    btn.addEventListener('click', (e) => {
        blurIfPointer(e, btn);
        // Returned, not dropped: the handler is async, and a rejection from a
        // discarded promise surfaces nowhere. Click listeners ignore the
        // return value, so this costs nothing in the browser.
        return onClick(row, btn);
    });

    row.append(name, state, btn);
    slot.appendChild(row);
    return row;
}

/**
 * Starting and stopping the array.
 *
 * Stopping unmounts every share and kills anything reading from them, so the
 * confirmation says that in those words rather than asking "are you sure".
 *
 * @param {string|null} status - array.status from the payload
 */
function updateArrayControl(status) {
    const slot = document.getElementById('storage-array-control');
    if (!slot) return;

    const started = /^started$/i.test(String(status || ''));

    const row = ensureControlRow(slot, 'Array', async (r, btn) => {
        const stopping = r._started;
        const ok = stopping
            ? await showConfirmModal('Stop array',
                'Every share is unmounted and anything still reading or writing '
                + 'to the array is cut off. Docker and VMs stop with it.',
                'Stop array', '#f44336')
            : await showConfirmModal('Start array',
                'Mounts the array and brings the shares back up.',
                'Start array', 'var(--accent-unraid)');
        if (!ok) return;
        btn.disabled = true;
        try {
            await setArrayState(activeUnraid.url, activeUnraid.key,
                stopping ? 'STOP' : 'START');
            showNotification(stopping ? 'Array stopping' : 'Array starting', 'success');
        } catch (err) {
            showNotification(`Array: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
        }
    });

    row._started = started;
    row.classList.toggle('is-stopped', !started);

    const state = row.querySelector('.uc-state');
    const label = status ? titleCase(status) : 'Unknown';
    if (state.textContent !== label) state.textContent = label;

    const btn = row.querySelector('.uc-btn');
    const action = started ? 'Stop array' : 'Start array';
    if (btn.textContent !== action) {
        btn.textContent = action;
        btn.setAttribute('aria-label', action);
    }
    btn.classList.toggle('is-danger', started);
    // Nothing sensible to do while the server is mid-transition.
    btn.disabled = !status;
}

/**
 * Parity state plus its one action, in the Storage tab beside the parity
 * disks.
 *
 * Built once and updated in place. The previous version rebuilt the row on
 * every five-second poll, which during a running check meant replacing the
 * button under the pointer twelve times a minute.
 *
 * @param {Object|null} parity - Parity check status, or null when unavailable
 */
function updateParityControl(parity) {
    const slot = document.getElementById('storage-parity-control');
    if (!slot) return;

    if (!parity) {
        slot.replaceChildren();
        return;
    }

    // Reads the state off the element rather than a captured argument, so the
    // handler is wired once and still acts on the current status.
    const row = ensureControlRow(slot, 'Parity check', async (r, btn) => {
        const current = r._parity || {};
        const ok = current.running
            ? await showConfirmModal('Cancel parity check',
                'Progress will be lost and the check starts from the beginning next time.',
                'Cancel check', '#f44336')
            : await showConfirmModal('Start parity check',
                'This reads every disk in the array and can run for several hours.',
                'Start', 'var(--accent-unraid)');
        if (!ok) return;
        btn.disabled = true;
        try {
            await controlParityCheck(activeUnraid.url, activeUnraid.key,
                current.running ? 'cancel' : 'start');
        } catch (err) {
            showNotification(`Parity: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
        }
    });

    row._parity = parity;

    const text = row.querySelector('.uc-state');
    const label = parity.running
        ? `Running · ${Math.round(Number(parity.percent ?? parity.progress) || 0)}%`
        : parity.errors > 0
            ? `Last check: ${parity.errors} error${parity.errors === 1 ? '' : 's'}`
            : 'Idle';
    if (text.textContent !== label) text.textContent = label;
    row.classList.toggle('has-errors', parity.errors > 0 && !parity.running);

    const btn = row.querySelector('.uc-btn');
    const action = parity.running ? 'Cancel' : 'Start check';
    if (btn.textContent !== action) {
        btn.textContent = action;
        btn.setAttribute('aria-label',
            parity.running ? 'Cancel parity check' : 'Start parity check');
    }
}

/**
 * Severity for a filesystem, based on absolute free space first.
 *
 * Percentage alone is the wrong signal on Unraid: the array fills disks
 * sequentially by design, so a healthy 18 TB disk sits at 95%+ for most of its
 * life. Colouring that red trains the user to ignore the colour entirely.
 * What actually matters is whether there is room left for the next write.
 * @param {number} freeBytes
 * @param {number} percent
 * @returns {'ok'|'warn'|'crit'}
 */
function storageSeverity(freeBytes, percent) {
    const GB = 1024 ** 3;
    if (freeBytes < 25 * GB) return 'crit';
    if (freeBytes < 150 * GB) return 'warn';
    // A nearly-full device with lots of absolute room left is still worth a nudge.
    if (percent >= 99) return 'warn';
    return 'ok';
}

/**
 * What counts as hot depends on what is being measured.
 *
 * One set of thresholds used to cover all three, and they were disk
 * thresholds: a Ryzen reporting a perfectly ordinary 58 C on Tctl came out
 * "hot" and painted the badge red permanently, and a 57 C motherboard sat in
 * the attention list forever. A CPU that throttles at 95 and a spinning disk
 * that should stay under 45 do not share a scale.
 */
const TEMP_BANDS = {
    // Ours: the API has no setting for either, and both are far below the
    // point where the hardware itself intervenes (a Ryzen throttles at 95).
    cpu: { warm: 80, hot: 90 },
    board: { warm: 65, hot: 80 },
    // Unraid's own defaults, replaced at runtime by whatever the user set in
    // Settings -> Display Settings. See applyDiskThresholds.
    disk: { warm: 45, hot: 55 },
    // SSDs and NVMe drives are not spinning disks and the server applies no
    // separate setting to them. 70 is where consumer NVMe starts throttling.
    flash: { warm: 70, hot: 80 }
};

/**
 * Adopts the server's configured disk temperature thresholds.
 *
 * These used to be a hardcoded 42/50 chosen here, which meant the extension
 * warned about a temperature the server itself considered fine — and stayed
 * silent about one it did not, for anybody who had changed the setting.
 *
 * @param {{diskWarn: number, diskCrit: number, unit: string}|null} thresholds
 * @param {string} sensorUnit - '°C' or '°F', as reported by the sensors
 */
function applyDiskThresholds(thresholds, sensorUnit) {
    if (!thresholds) return;
    const { diskWarn, diskCrit, unit } = thresholds;
    if (!Number.isFinite(diskWarn) || !Number.isFinite(diskCrit)) return;
    if (diskCrit <= diskWarn) return;
    // The setting carries its own unit. Comparing a Fahrenheit threshold with
    // a Celsius reading would mark every disk healthy, so leave the defaults
    // alone rather than guess a conversion.
    const settingUnit = String(unit).toUpperCase() === 'FAHRENHEIT' ? '°F' : '°C';
    if (settingUnit !== sensorUnit) return;

    TEMP_BANDS.disk = { warm: diskWarn, hot: diskCrit };
}

/**
 * Temperature band. Returns an empty string below the warm threshold so a
 * normal temperature stays visually silent instead of adding another colour.
 * @param {number|string} temp
 * @param {'cpu'|'board'|'disk'} [kind='disk'] - Which scale to grade against
 * @returns {string} '', 'warm' or 'hot'
 */
function tempSeverity(temp, kind = 'disk') {
    const t = parseFloat(temp);
    if (isNaN(t)) return '';
    const band = TEMP_BANDS[kind] || TEMP_BANDS.disk;
    if (t >= band.hot) return 'hot';
    if (t >= band.warm) return 'warm';
    return '';
}

/**
 * Renders the Storage tab: an array summary, then one flat row per device,
 * parity handled separately, then shares.
 * @param {object} data - Normalized system data from getSystemData()
 */
function renderUnraidStorage(data) {
    const storageTab = document.getElementById("unraid-tab-storage");
    if (!storageTab || storageTab.classList.contains('hidden')) return;

    const parities = data.array.parities || [];
    const disks = data.array.disks || [];
    const caches = data.array.caches || [];
    const boot = data.array.boot ? [data.array.boot] : [];
    const shares = data.shares || [];

    // Rebuild the skeleton only when the device set changes, so a 5s poll does
    // not blow away scroll position or cause flicker.
    const signature = [
        parities.map(d => d.name).join(','),
        disks.map(d => d.name).join(','),
        caches.map(d => d.name).join(','),
        boot.map(d => d.name).join(','),
        shares.map(s => s.name).join(',')
    ].join('|');

    let wrap = document.getElementById('storage-list-container');
    if (!wrap || wrap.dataset.signature !== signature) {
        storageTab.replaceChildren();
        wrap = document.createElement('div');
        wrap.className = 'unraid-storage-wrapper';
        wrap.id = 'storage-list-container';
        wrap.dataset.signature = signature;
        storageTab.appendChild(wrap);
        buildStorageSkeleton(wrap, { parities, disks, caches, boot, shares });
    }

    // ---- Array summary -------------------------------------------------
    const total = data.array.total || 0;
    const used = data.array.used || 0;
    const free = data.array.free || Math.max(total - used, 0);
    const percent = total > 0 ? (used / total) * 100 : 0;

    const freeEl = document.getElementById('storage-summary-free');
    const subEl = document.getElementById('storage-summary-sub');
    const fillEl = document.getElementById('storage-summary-fill');
    if (freeEl && subEl && fillEl) {
        freeEl.textContent = formatBytes(free, 1);
        subEl.textContent = `free of ${formatBytes(total, 1)} · ${Math.round(percent)}% used`;
        fillEl.style.width = `${Math.min(percent, 100)}%`;
        fillEl.className = `storage-bar-fill sev-${storageSeverity(free, percent)}`;
    }

    // ---- Controls ---------------------------------------------------------
    updateParityControl(data.parity || data.array.parity);
    updateArrayControl(data.array.status);

    // ---- Devices -------------------------------------------------------
    [...disks, ...caches, ...boot].forEach(updateStorageRow);
    parities.forEach(updateParityRow);
    shares.forEach(updateShareRow);
}

/**
 * Slug for a row id. Device and share names come from the server.
 * @param {string} prefix
 * @param {string} name
 * @returns {string}
 */
const storageRowId = (prefix, name) =>
    `${prefix}-${String(name).replace(/[^a-zA-Z0-9]/g, '')}`;

/**
 * Creates one device/share row. Values are filled in by the update pass.
 * @param {string} id
 * @param {string} name
 * @param {boolean} withBar
 * @returns {HTMLElement}
 */
function buildStorageRow(id, name, withBar = true) {
    const row = document.createElement('div');
    row.className = 'storage-row';
    row.id = id;

    const head = document.createElement('div');
    head.className = 'storage-row-head';

    const nameEl = document.createElement('span');
    nameEl.className = 'storage-row-name';
    nameEl.textContent = name;
    nameEl.title = name;

    const metaEl = document.createElement('span');
    metaEl.className = 'storage-row-meta';

    head.appendChild(nameEl);
    head.appendChild(metaEl);
    row.appendChild(head);

    // What the device actually is. The row used to say "disk3 · 35 C · 700 GB
    // free", which does not tell you whether disk3 is the 8 TB spinner or the
    // NVMe pool, or which /dev node to look at when something goes wrong.
    const detailEl = document.createElement('div');
    detailEl.className = 'storage-row-detail';
    row.appendChild(detailEl);

    if (withBar) {
        const track = document.createElement('div');
        track.className = 'storage-bar-track';
        const fill = document.createElement('div');
        fill.className = 'storage-bar-fill';
        track.appendChild(fill);
        row.appendChild(track);
    }

    return row;
}

/**
 * The hardware line for one device: node, kind, filesystem, physical size, and
 * anything currently wrong with it.
 *
 * @param {object} disk - Normalised disk
 * @returns {{text: string, errors: number}}
 */
function describeDisk(disk) {
    const parts = [];
    if (disk.device) parts.push(`/dev/${disk.device}`);

    // NVMe is worth naming separately: "SSD" over a USB stick and "SSD" on a
    // PCIe 4 drive are not the same answer to "why is this slow".
    const kind = String(disk.transport).toLowerCase() === 'nvme'
        ? 'NVMe'
        : String(disk.transport).toLowerCase() === 'usb'
            ? 'USB'
            : disk.rotational === true
                ? 'HDD'
                : disk.rotational === false ? 'SSD' : '';
    if (kind) parts.push(kind);

    if (disk.fsType) parts.push(String(disk.fsType).toUpperCase());
    if (disk.sizeBytes > 0) parts.push(formatBytes(disk.sizeBytes, 1));

    // Spun down is a normal state on an Unraid array and worth showing: it
    // explains why a share took a few seconds to answer.
    if (disk.spinning === false) parts.push('Standby');

    return { text: parts.join(' \u00b7 '), errors: Number(disk.errors) || 0 };
}

/**
 * Writes the hardware line into a row.
 * @param {HTMLElement} row
 * @param {object} disk
 */
function setDiskDetail(row, disk) {
    const el = row.querySelector('.storage-row-detail');
    if (!el) return;

    const { text, errors } = describeDisk(disk);
    const full = errors > 0
        ? `${text}${text ? ' \u00b7 ' : ''}${errors} ${errors === 1 ? 'error' : 'errors'}`
        : text;
    if (el.textContent !== full) el.textContent = full || '\u00a0';
    el.classList.toggle('has-errors', errors > 0);
}

/**
 * Builds the static structure once per device-set change.
 * @param {HTMLElement} wrap
 * @param {{parities:Array,disks:Array,caches:Array,boot:Array,shares:Array}} groups
 */
function buildStorageSkeleton(wrap, groups) {
    // Summary
    const summary = document.createElement('div');
    summary.className = 'storage-summary';

    const free = document.createElement('div');
    free.className = 'storage-summary-free';
    free.id = 'storage-summary-free';
    free.textContent = '--';

    const sub = document.createElement('div');
    sub.className = 'storage-summary-sub';
    sub.id = 'storage-summary-sub';

    const track = document.createElement('div');
    track.className = 'storage-bar-track storage-summary-track';
    const fill = document.createElement('div');
    fill.className = 'storage-bar-fill';
    fill.id = 'storage-summary-fill';
    track.appendChild(fill);

    summary.appendChild(free);
    summary.appendChild(sub);
    summary.appendChild(track);
    wrap.appendChild(summary);

    const section = (title) => {
        const h = document.createElement('div');
        h.className = 'storage-section-title';
        h.textContent = title;
        wrap.appendChild(h);
    };

    // Parity first: it is what protects everything below it, and the check
    // control belongs beside the disks it runs against.
    // Parity has no filesystem - a capacity bar for it would always read 0%.
    if (groups.parities.length) {
        section('Parity');
        const control = document.createElement('div');
        control.id = 'storage-parity-control';
        wrap.appendChild(control);
        groups.parities.forEach(d => wrap.appendChild(buildStorageRow(storageRowId('sparity', d.name), d.name, false)));
    }

    if (groups.disks.length) {
        section('Array');
        const arrayControl = document.createElement('div');
        arrayControl.id = 'storage-array-control';
        wrap.appendChild(arrayControl);
        groups.disks.forEach(d => wrap.appendChild(buildStorageRow(storageRowId('sdisk', d.name), d.name)));
    }

    if (groups.caches.length) {
        section('Pools');
        groups.caches.forEach(d => wrap.appendChild(buildStorageRow(storageRowId('scache', d.name), d.name)));
    }

    if (groups.boot.length) {
        section('Boot');
        groups.boot.forEach(d => wrap.appendChild(buildStorageRow(storageRowId('sboot', d.name), d.name)));
    }

    if (groups.shares.length) {
        section('Shares');
        groups.shares.forEach(s => wrap.appendChild(buildStorageRow(storageRowId('sshare', s.name), s.name)));
    }
}

/**
 * Updates a device row. Free space is the primary figure - it is what you need
 * before starting a download; "used" requires mental subtraction.
 * @param {object} disk
 */
function updateStorageRow(disk) {
    const prefix = disk.type === 'cache' ? 'scache' : (disk.type === 'boot' ? 'sboot' : 'sdisk');
    let row = document.getElementById(storageRowId(prefix, disk.name));
    // Pool and boot devices reuse the same mapper, so fall back across prefixes.
    if (!row) {
        row = document.getElementById(storageRowId('sdisk', disk.name))
            || document.getElementById(storageRowId('scache', disk.name))
            || document.getElementById(storageRowId('sboot', disk.name));
    }
    if (!row) return;

    const total = disk.total || 0;
    const used = disk.used || 0;
    const free = disk.free !== undefined ? disk.free : Math.max(total - used, 0);
    const percent = total > 0 ? (used / total) * 100 : 0;
    const severity = storageSeverity(free, percent);

    const parts = [];
    const tempBand = tempSeverity(disk.temp, disk.rotational === false ? 'flash' : 'disk');
    if (disk.temp !== undefined && disk.temp !== null && disk.temp !== '') {
        parts.push(`${disk.temp}°C`);
    }
    parts.push(`${formatBytes(free, 1)} free`);

    const meta = row.querySelector('.storage-row-meta');
    meta.textContent = parts.join(' · ');
    meta.className = `storage-row-meta${tempBand ? ' temp-' + tempBand : ''}`;
    row.title = `${formatBytes(used, 1)} used of ${formatBytes(total, 1)} (${Math.round(percent)}%)`;

    const fill = row.querySelector('.storage-bar-fill');
    if (fill) {
        fill.style.width = `${Math.min(percent, 100)}%`;
        fill.className = `storage-bar-fill sev-${severity}`;
    }

    setDiskDetail(row, disk);
    row.classList.toggle('is-idle', disk.spinning === false);
}

/**
 * Updates a parity row. Parity carries no filesystem, so this reports health
 * and temperature rather than capacity.
 * @param {object} disk
 */
function updateParityRow(disk) {
    const row = document.getElementById(storageRowId('sparity', disk.name));
    if (!row) return;

    const parts = [];
    if (disk.temp !== undefined && disk.temp !== null && disk.temp !== '') {
        parts.push(`${disk.temp}°C`);
    }
    parts.push(disk.status ? String(disk.status).replace(/_/g, ' ') : 'Unknown');

    const meta = row.querySelector('.storage-row-meta');
    const tempBand = tempSeverity(disk.temp, disk.rotational === false ? 'flash' : 'disk');
    meta.textContent = parts.join(' · ');
    meta.className = `storage-row-meta${tempBand ? ' temp-' + tempBand : ''}`;

    // Standby moved to the detail line, which is where every other device
    // reports it — it was listed twice otherwise.
    setDiskDetail(row, disk);
}

/**
 * Updates a share row.
 * @param {object} share
 */
function updateShareRow(share) {
    const row = document.getElementById(storageRowId('sshare', share.name));
    if (!row) return;

    const total = share.sizeBytes || 0;
    const used = share.usedBytes || 0;
    const free = share.freeBytes !== undefined ? share.freeBytes : Math.max(total - used, 0);
    const percent = total > 0 ? (used / total) * 100 : 0;

    const meta = row.querySelector('.storage-row-meta');
    meta.textContent = `${formatBytes(used, 1)} used`;
    meta.className = 'storage-row-meta';
    row.title = share.comment
        ? `${share.comment} — ${formatBytes(free, 1)} free`
        : `${formatBytes(free, 1)} free`;

    const fill = row.querySelector('.storage-bar-fill');
    if (fill) {
        fill.style.width = `${Math.min(percent, 100)}%`;
        fill.className = `storage-bar-fill sev-${storageSeverity(free, percent)}`;
    }
}

/**
 * Renders the "Update All" bar above the container list. It only exists while
 * something is actually updatable, so the Docker tab stays clean otherwise.
 * @param {number} count - Number of containers with a pending update
 * @param {string} url
 * @param {string} key
 */
function renderUpdateAllBar(count, url, key) {
    const list = document.getElementById("unraid-docker-list");
    if (!list || !list.parentNode) return;

    let bar = document.getElementById('unraid-update-all-bar');

    if (count === 0) {
        if (bar) bar.remove();
        return;
    }

    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'unraid-update-all-bar';
        bar.className = 'unraid-update-all-bar';

        const label = document.createElement('span');
        label.className = 'update-all-label';
        bar.appendChild(label);

        const btn = document.createElement('button');
        btn.id = 'unraid-update-all-btn';
        btn.className = 'update-all-btn';
        btn.textContent = 'Update All';
        bar.appendChild(btn);

        list.parentNode.insertBefore(bar, list);
    }

    bar.querySelector('.update-all-label').textContent =
        `${count} update${count === 1 ? '' : 's'} available`;

    const btn = bar.querySelector('.update-all-btn');
    // Rebind every pass: url/key and the count are captured in the closure.
    btn.onclick = async () => {
        if (btn.dataset.busy) return;
        const ok = await showConfirmModal(
            'Update All Containers',
            `Pull the latest image for ${count} container${count === 1 ? '' : 's'} and recreate them? Each one restarts.`,
            'Update All',
            'var(--accent-unraid)'
        );
        if (!ok) return;

        btn.dataset.busy = '1';
        btn.disabled = true;
        btn.textContent = 'Updating…';
        try {
            await updateAllContainers(url, key);
            showNotification('All containers updated', 'success');
        } catch (e) {
            showNotification(`Update all failed: ${e.message}`, 'error');
        } finally {
            btn.textContent = 'Update All';
            btn.disabled = false;
            delete btn.dataset.busy;
        }
    };
}

/**
 * Shows how many containers have a pending image update on the Docker sub-tab,
 * so it is visible without opening the tab and scrolling the list.
 * @param {Array} containers
 */
function updateDockerTabBadge(containers, url, key) {
    const count = (containers || []).filter(c => c.updateAvailable).length;
    renderUpdateAllBar(count, url, key);

    const tabBtn = document.querySelector('#unraid-view .sub-tab-btn[data-target="unraid-tab-docker"]');
    if (!tabBtn) return;

    let badge = tabBtn.querySelector('.tab-badge');
    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'tab-badge hidden';
        badge.style.background = 'var(--accent-unraid)';
        badge.style.color = '#fff';
        tabBtn.appendChild(badge);
    }

    if (count > 0) {
        badge.textContent = count;
        badge.title = `${count} container update${count === 1 ? '' : 's'} available`;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

/**
 * Renders the Docker container list.
 *
 * Rows, not cards, and reconciled by id. Three things the previous version hid
 * are now visible without hovering: the image tag (the field that decides
 * whether an update is wanted), the state as a word rather than only a colour,
 * and the update flag. Actions still fade in on hover, but they are focusable
 * throughout, so the keyboard reaches them.
 *
 * @param {Array} containers - Containers from the system payload
 * @param {string} url - Unraid URL
 * @param {string} key - API key
 */
function renderUnraidDocker(containers, url, key) {
    const list = document.getElementById('unraid-docker-list');
    if (!list) return;

    const query = (document.getElementById('unraid-docker-search')?.value || '')
        .trim().toLowerCase();
    const sort = document.getElementById('unraid-docker-sort')?.value || 'status-asc';

    // Search covers the image too: "which of these is linuxserver" was
    // unanswerable when only the name was matched.
    let visible = (containers || []).filter(c => {
        if (!query) return true;
        return (c.name || '').toLowerCase().includes(query)
            || (c.image || '').toLowerCase().includes(query);
    });

    const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
    visible = visible.slice().sort((a, b) => {
        if (sort === 'name-asc') return byName(a, b);
        if (sort === 'update-first') {
            const d = Number(!!b.updateAvailable) - Number(!!a.updateAvailable);
            return d || byName(a, b);
        }
        const d = sort === 'status-desc'
            ? Number(!!a.running) - Number(!!b.running)
            : Number(!!b.running) - Number(!!a.running);
        return d || byName(a, b);
    });

    if (visible.length === 0) {
        list.replaceChildren();
        const empty = document.createElement('div');
        empty.className = 'unraid-empty';
        empty.textContent = query
            ? `No container matches "${query}".`
            : 'No containers found.';
        list.appendChild(empty);
        return;
    }

    const existing = new Map();
    list.querySelectorAll('.unraid-row').forEach(el => existing.set(el.dataset.id, el));
    list.querySelector('.unraid-empty')?.remove();

    visible.forEach((container, index) => {
        let row = existing.get(container.id);
        if (row) {
            existing.delete(container.id);
        } else {
            row = buildDockerRow(container, url, key);
            list.appendChild(row);
        }
        updateDockerRow(row, container);

        // Keep DOM order in step with the sort without rebuilding anything.
        const atIndex = list.children[index];
        if (atIndex !== row) list.insertBefore(row, atIndex || null);
    });

    existing.forEach(el => el.remove());
}

/**
 * Builds one container row and wires its actions once.
 * @param {Object} container
 * @param {string} url
 * @param {string} key
 * @returns {HTMLElement}
 */
function buildDockerRow(container, url, key) {
    const row = document.createElement('div');
    // is-expandable, because .unraid-row is also the VM row, which is a plain
    // single line. The grid layout the panel animates in belongs to Docker
    // rows alone — applying it to a row whose children are not wrapped in a
    // head drops each child into its own grid track.
    row.className = 'unraid-row is-expandable';
    row.dataset.id = container.id;
    // The whole row opens the menu, so it has to behave like a control:
    // reachable by tab, operable by Enter and Space, and announced as a menu
    // trigger rather than as a piece of text.
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-haspopup', 'menu');
    row.setAttribute('aria-expanded', 'false');

    const icon = document.createElement('span');
    icon.className = 'unraid-row-icon';
    icon.setAttribute('aria-hidden', 'true');

    const main = document.createElement('div');
    main.className = 'unraid-row-main';
    const name = document.createElement('div');
    name.className = 'unraid-row-name';
    const meta = document.createElement('div');
    meta.className = 'unraid-row-meta';
    main.append(name, meta);

    // The badge is the button. It used to be a label that announced an update
    // next to a separate arrow that performed one — two controls for one idea,
    // and the arrow was only visible on hover while the label was always
    // there, so the thing you could see was the thing you could not press.
    const flag = document.createElement('button');
    flag.type = 'button';
    flag.className = 'unraid-update-flag hidden';
    flag.textContent = 'Update';
    flag.setAttribute('aria-label', `Update ${container.name}`);

    const state = document.createElement('span');
    state.className = 'unraid-row-state';
    const dot = document.createElement('span');
    dot.className = 'unraid-row-dot';
    dot.setAttribute('aria-hidden', 'true');
    const stateText = document.createElement('span');
    stateText.className = 'unraid-row-state-text';
    state.append(dot, stateText);

    const caret = document.createElement('span');
    caret.className = 'unraid-row-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '\u203a';

    const menu = document.createElement('div');
    menu.className = 'unraid-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `${container.name} actions`);

    // No Logs entry: the GraphQL API has no container logs. There is no
    // `logs` field on DockerContainer, no `containerLogs` on Docker, and the
    // only subscription is dockerContainerStats; `logFile(path:)` exists but
    // is sandboxed to /var/log and reduces any other path to its basename.
    const webItem = makeMenuItem('Web UI');
    const restartItem = makeMenuItem('Restart');
    const startItem = makeMenuItem('Start');
    const stopItem = makeMenuItem('Stop', 'danger');
    startItem.classList.add('hidden');
    menu.append(webItem, restartItem, startItem, stopItem);

    /**
     * Runs one menu action: closes the menu, disables the item while the call
     * is in flight, and reports either way.
     */
    const act = async (item, fn, okMessage) => {
        closeDockerMenu(row);
        item.disabled = true;
        try {
            await fn();
            showNotification(okMessage, 'success');
        } catch (e) {
            showNotification(`${container.name}: ${e.message}`, 'error');
        } finally {
            item.disabled = false;
        }
    };

    startItem.addEventListener('click', () => act(startItem,
        () => controlContainer(url, key, container.id, 'start'), `${container.name} started`));
    stopItem.addEventListener('click', () => act(stopItem,
        () => controlContainer(url, key, container.id, 'stop'), `${container.name} stopped`));
    restartItem.addEventListener('click', () => act(restartItem,
        () => controlContainer(url, key, container.id, 'restart'), `${container.name} restarted`));

    webItem.addEventListener('click', () => {
        closeDockerMenu(row);
        // The WebUI URL comes from a container label, so a hostile template can
        // point it anywhere. openUrlSafely prompts for non-local hosts.
        if (container.webui) {
            openUrlSafely(container.webui, { unraidUrl: url }, 'Docker container');
        } else if (validateUrl(url)) {
            chrome.tabs.create({ url, active: true });
        }
    });

    flag.addEventListener('click', async (e) => {
        // Without this the click would also reach the row and open the menu.
        e.stopPropagation();
        blurIfPointer(e, flag);
        const ok = await showConfirmModal(
            'Update container',
            `Pull the latest image for "${container.name}" and recreate it? The container restarts.`,
            'Update',
            'var(--accent-unraid)'
        );
        if (!ok) return;
        flag.disabled = true;
        try {
            await updateContainer(url, key, container.id);
            showNotification(`${container.name} updated`, 'success');
            // The next poll drops the badge anyway, but leaving it up for five
            // seconds after a successful update reads as "that did nothing".
            flag.classList.add('hidden');
        } catch (err) {
            showNotification(`${container.name}: ${err.message}`, 'error');
        } finally {
            flag.disabled = false;
        }
    });

    row.addEventListener('click', (e) => {
        // Clicks that started inside the menu are the menu's business.
        if (e.target !== row && menu.children.length && menuContains(menu, e.target)) return;
        toggleDockerMenu(row);
    });
    row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            toggleDockerMenu(row);
        } else if (e.key === 'Escape') {
            closeDockerMenu(row);
        }
    });

    // The row is a header line plus a panel that expands underneath it, not a
    // line with a floating menu over it: an overlay covers the rows below and
    // has to be dismissed before you can read them again.
    const head = document.createElement('div');
    head.className = 'unraid-row-head';
    // State stays the last thing you read; the caret is the affordance that
    // says the row opens.
    head.append(icon, main, flag, state, caret);

    row.append(head, menu);
    return row;
}

/**
 * One entry in a container's menu.
 * @param {string} label
 * @param {string} [tone] - 'danger' for the destructive entry
 * @returns {HTMLElement}
 */
function makeMenuItem(label, tone = '') {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `unraid-menu-item${tone ? ` is-${tone}` : ''}`;
    item.setAttribute('role', 'menuitem');
    item.textContent = label;
    return item;
}

/**
 * True when `node` is the menu or sits inside it.
 * @param {HTMLElement} menu
 * @param {HTMLElement} node
 * @returns {boolean}
 */
function menuContains(menu, node) {
    let el = node;
    while (el) {
        if (el === menu) return true;
        el = el.parentElement || el.parent || null;
    }
    return false;
}

/**
 * Closes every open container panel. Used by the click-outside and Escape
 * handlers; opening one card does not call this.
 * @param {HTMLElement} [except] - Row to leave alone
 */
function closeAllDockerMenus(except) {
    for (const row of document.querySelectorAll('.unraid-row[aria-expanded="true"]')) {
        if (row === except) continue;
        row.setAttribute('aria-expanded', 'false');
        row.classList.remove('is-open');
    }
}

/**
 * Opens or closes one row's menu.
 * @param {HTMLElement} row
 */
function toggleDockerMenu(row) {
    if (!row.querySelector('.unraid-menu')) return;
    const open = !row.classList.contains('is-open');

    if (open) closeOthersWithoutMoving(row);

    row.classList.toggle('is-open', open);
    row.setAttribute('aria-expanded', String(open));
}

/**
 * Closes every other open card, without animating them shut.
 *
 * Only one card is open at a time, and the panels sit in the flow, so opening
 * one while another closes moves everything between them. Two ways of hiding
 * that were tried and both were worse than the movement:
 *
 * Letting the other card animate shut runs a 200ms collapse against a 200ms
 * expansion, and the card under the pointer glides upward while it grows —
 * the wobble that started all this.
 *
 * Correcting the scroll offset so the clicked card stays put looks calm for
 * that one card and moves the entire list instead. Nobody asked the page to
 * scroll.
 *
 * So the others close in a single reflow, before the new panel starts opening.
 * Rows above shift once, sharply, and nothing competes with the animation.
 * Cards below the one being opened do not move at all.
 *
 * @param {HTMLElement} row - The card being opened
 */
function closeOthersWithoutMoving(row) {
    for (const other of document.querySelectorAll('.unraid-row[aria-expanded="true"]')) {
        if (other === row) continue;
        other.style.transition = 'none';
        other.classList.remove('is-open');
        other.setAttribute('aria-expanded', 'false');
        // Commit the collapse before handing the transition back, or the two
        // style changes coalesce and the card animates shut after all.
        void other.getBoundingClientRect?.().height;
        other.style.transition = '';
    }
}

/**
 * @param {HTMLElement} row
 */
function closeDockerMenu(row) {
    row.classList.remove('is-open');
    row.setAttribute('aria-expanded', 'false');
}

/**
 * Applies current values to an existing row. Only text, classes and the icon
 * source change — never the row's structure.
 * @param {HTMLElement} row
 * @param {Object} container
 */
function updateDockerRow(row, container) {
    const running = !!container.running;
    row.classList.toggle('is-running', running);

    const name = row.querySelector('.unraid-row-name');
    if (name.textContent !== container.name) {
        name.textContent = container.name;
        name.title = container.name;
    }

    const meta = row.querySelector('.unraid-row-meta');
    const image = container.image || '';
    if (meta.textContent !== image) {
        meta.textContent = image;
        meta.title = image;
    }

    const stateText = row.querySelector('.unraid-row-state-text');
    const label = running ? 'Running' : 'Stopped';
    if (stateText.textContent !== label) stateText.textContent = label;

    row.querySelector('.unraid-update-flag')
        .classList.toggle('hidden', !container.updateAvailable);

    // The menu is built once and its entries are shown or hidden, rather than
    // rebuilt: rebuilding under an open menu would drop the user's focus.
    const [, restartItem, startItem, stopItem] =
        row.querySelectorAll('.unraid-menu-item');
    startItem.classList.toggle('hidden', running);
    stopItem.classList.toggle('hidden', !running);
    restartItem.classList.toggle('hidden', !running);

    // Icon: compared against the raw API value, not img.src, because the getter
    // returns a resolved URL and would never match. A failed URL is remembered
    // so a broken template icon is not refetched on every 5s poll.
    const icon = row.querySelector('.unraid-row-icon');
    const shown = icon.querySelector('img');
    if (container.icon) {
        const alreadyShown = shown && shown.dataset.iconUrl === container.icon;
        const alreadyFailed = icon.dataset.failedIconUrl === container.icon;
        if (!alreadyShown && !alreadyFailed) {
            icon.textContent = '';
            const img = document.createElement('img');
            img.dataset.iconUrl = container.icon;
            img.alt = '';
            img.loading = 'lazy';
            img.onerror = () => {
                icon.dataset.failedIconUrl = container.icon;
                icon.textContent = (container.name || '?').substring(0, 2).toUpperCase();
            };
            icon.appendChild(img);
            img.src = container.icon;
        }
    } else if (!shown) {
        const initials = (container.name || '?').substring(0, 2).toUpperCase();
        if (icon.textContent !== initials) icon.textContent = initials;
    }
}

/**
 * Sets the header hero and subline directly. Used for states that exist before
 * or instead of a payload — unconfigured, unreachable.
 * @param {string} text - Hero line
 * @param {string} detail - Subline
 * @param {string} [level] - '', 'ok', 'warn' or 'crit'
 */
function setUnraidHero(text, detail, level = '') {
    const hero = document.getElementById('unraid-hero');
    const subline = document.getElementById('unraid-subline');
    if (hero) {
        hero.classList.remove('is-pending', 'is-ok', 'is-warn', 'is-crit');
        if (level) hero.classList.add(`is-${level}`);
        hero.textContent = text;
    }
    if (subline) subline.textContent = detail;
}

/**
 * Renders the VM list.
 *
 * Reconciles by id rather than rebuilding. The previous version called
 * `replaceChildren()` on every 5s poll, which destroyed keyboard focus before
 * a Start button could ever be pressed — the list was unusable without a mouse.
 *
 * @param {Array} vms - VM domains from the system payload
 * @param {string} url - Unraid URL
 * @param {string} key - API key
 */
function renderUnraidVms(vms, url, key) {
    const list = document.getElementById('unraid-vm-list');
    if (!list) return;

    if (!vms || vms.length === 0) {
        if (!list.querySelector('.unraid-empty')) {
            list.replaceChildren();
            const empty = document.createElement('div');
            empty.className = 'unraid-empty';
            empty.textContent = 'No virtual machines configured.';
            list.appendChild(empty);
        }
        return;
    }
    list.querySelector('.unraid-empty')?.remove();

    const existing = new Map();
    list.querySelectorAll('.unraid-row').forEach(el => existing.set(el.dataset.id, el));

    vms.forEach(vm => {
        const id = vm.id || vm.uuid || vm.name;
        const running = /running/i.test(vm.state || '');
        let row = existing.get(id);

        if (row) {
            existing.delete(id);
        } else {
            row = document.createElement('div');
            row.className = 'unraid-row';
            row.dataset.id = id;

            const icon = document.createElement('span');
            icon.className = 'unraid-row-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = (vm.name || '?').substring(0, 2).toUpperCase();

            const main = document.createElement('div');
            main.className = 'unraid-row-main';
            const name = document.createElement('div');
            name.className = 'unraid-row-name';
            main.appendChild(name);

            const state = document.createElement('span');
            state.className = 'unraid-row-state';
            const dot = document.createElement('span');
            dot.className = 'unraid-row-dot';
            dot.setAttribute('aria-hidden', 'true');
            const stateText = document.createElement('span');
            stateText.className = 'unraid-row-state-text';
            state.append(dot, stateText);

            const actions = document.createElement('div');
            actions.className = 'unraid-row-actions';
            // Named for screen readers: the glyph alone announced as
            // "black right-pointing triangle".
            const startBtn = makeUnraidAction('▶', `Start ${vm.name}`);
            const stopBtn = makeUnraidAction('■', `Stop ${vm.name}`);
            actions.append(startBtn, stopBtn);

            startBtn.addEventListener('click', (e) => runVmAction(url, key, id, 'start', startBtn, e));
            stopBtn.addEventListener('click', (e) => runVmAction(url, key, id, 'stop', stopBtn, e));

            // State last, matching the Docker list: it is always present, so
            // it anchors the right edge instead of shifting when the actions
            // fade in beside it.
            row.append(icon, main, actions, state);
            list.appendChild(row);
        }

        row.classList.toggle('is-running', running);
        const nameEl = row.querySelector('.unraid-row-name');
        if (nameEl.textContent !== vm.name) {
            nameEl.textContent = vm.name;
            nameEl.title = vm.name;
        }
        const stateEl = row.querySelector('.unraid-row-state-text');
        // The API sends states in caps ("SHUTOFF"), which sat next to a
        // title-cased "Running" in the same column.
        const label = running ? 'Running' : titleCase(vm.state || 'Stopped');
        if (stateEl.textContent !== label) stateEl.textContent = label;

        row.querySelectorAll('.unraid-action')[0].disabled = running;
        row.querySelectorAll('.unraid-action')[1].disabled = !running;
    });

    // Anything the payload no longer lists has gone away.
    existing.forEach(el => el.remove());
}

/**
 * Drops focus after a pointer click, keeps it after a keyboard one.
 *
 * The row actions are revealed by :hover and :focus-within. A clicked button
 * keeps focus, so the action strip stayed visible after the pointer left —
 * and after opening a container's web UI it was still there on return. Blurring
 * unconditionally would be worse: it would strip focus from keyboard users
 * mid-interaction. A click from the keyboard reports detail 0, a real pointer
 * click reports 1 or more.
 * @param {MouseEvent} e
 * @param {HTMLElement} el
 */
function blurIfPointer(e, el) {
    if (e && e.detail > 0) el.blur();
}

/**
 * Builds a row action button with a real accessible name.
 * @param {string} glyph - Visible character
 * @param {string} label - Accessible name and tooltip
 * @returns {HTMLButtonElement}
 */
function makeUnraidAction(glyph, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'unraid-action';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.textContent = glyph;
    return btn;
}

/**
 * Starts or stops a VM, with the button disabled for the duration so a second
 * click cannot queue a contradictory action.
 * @param {string} url
 * @param {string} key
 * @param {string} id
 * @param {'start'|'stop'} action
 * @param {HTMLButtonElement} btn
 */
async function runVmAction(url, key, id, action, btn, e) {
    blurIfPointer(e, btn);
    btn.disabled = true;
    try {
        await controlVm(url, key, id, action);
        showNotification(`VM ${action === 'start' ? 'started' : 'stopped'}`, 'success');
    } catch (e) {
        showNotification(`Could not ${action} the VM: ${e.message}`, 'error');
    } finally {
        btn.disabled = false;
    }
}
