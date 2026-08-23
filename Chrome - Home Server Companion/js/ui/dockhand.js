// js/ui/dockhand.js
/**
 * Dockhand view: container management across one server's Docker hosts.
 *
 * Built to match the Unraid Docker tab rather than to expose everything
 * Dockhand can do — the API has 249 endpoints, and a sidebar panel is not
 * where anyone wants to configure a Restic backup schedule. What is here is
 * the part that belongs in a companion: see what is running, act on it, and
 * read a log without leaving the popup.
 *
 * Two things this view has that the Unraid one cannot:
 *
 * - **Logs.** Unraid's GraphQL API exposes no container logs at all, which is
 *   why its Docker rows have no log action. Dockhand returns the tail as
 *   plain text.
 * - **Named updates.** Unraid reports that an update exists; Dockhand reports
 *   which version it is.
 *
 * Rendering follows the same rule as the rest of the app: the row set is
 * rebuilt only when the container list itself changes, so a five-second poll
 * cannot disturb scroll position, a hover, or a pending click.
 */

import {
    getDockhandEnvironments,
    getDockhandContainers,
    getDockhandStats,
    getDockhandPendingUpdates,
    checkDockhandUpdates,
    controlDockhandContainer,
    updateDockhandContainer,
    getDockhandLogs,
    getDockhandStacks
} from "../../services/dockhand.js";
import { formatSize } from "../../services/utils.js";
import { showNotification, showConfirmModal } from "../utils.js";
import poller from "../core/Poller.js";

/** Refresh cadence for the container list, matching the other Docker views. */
const REFRESH_MS = 5000;

/** Remembers the chosen Docker host between visits and popup sessions. */
const ENV_STORAGE_KEY = 'dockhand_selected_env';

/** Environment currently on screen. */
let currentEnvId = null;
/** Environments this server manages, from the last successful fetch. */
let environments = [];
/**
 * Initializes the Dockhand view.
 * @param {string} url - Dockhand URL
 * @param {string} key - API token
 * @param {object} state - App state
 */
export async function initDockhand(url, key, state) {
    const view = document.getElementById('dockhand-view');
    if (!view) return;

    setupSubTabs(url, key);
    setupControls(url, key);

    try {
        // The environment list is the one thing everything else is keyed by,
        // so it is fetched before anything and only once per visit.
        environments = await getDockhandEnvironments(url, key);
        if (environments.length === 0) {
            showEmpty('No Docker environments are registered in Dockhand.');
            return;
        }
        currentEnvId = pickEnvironment(environments);
        renderEnvironmentPicker(url, key);
    } catch (e) {
        showError(e.message);
        return;
    }

    await refresh(url, key);
    poller.register('dockhand', () => refresh(url, key),
        { interval: REFRESH_MS, immediate: false });
}

/**
 * Chooses which environment to show: the remembered one when it still exists,
 * otherwise the first.
 * @param {Array} list
 * @returns {number|string}
 */
function pickEnvironment(list) {
    const remembered = localStorage.getItem(ENV_STORAGE_KEY);
    const match = list.find(e => String(e.id) === String(remembered));
    return match ? match.id : list[0].id;
}

/**
 * Fetches everything the active sub-tab needs and repaints it.
 * @param {string} url
 * @param {string} key
 */
async function refresh(url, key) {
    if (currentEnvId === null) return;

    if (activeTab() === 'dockhand-tab-stacks') {
        const stacks = await getDockhandStacks(url, key, currentEnvId);
        renderStacks(stacks);
        return;
    }

    // Containers first and on its own: it is the only one of the three whose
    // failure should empty the list. Stats and updates decorate it and are
    // already soft-failing in the service layer.
    const containers = await getDockhandContainers(url, key, currentEnvId);

    const [stats, updates] = await Promise.all([
        getDockhandStats(url, key, currentEnvId),
        getDockhandPendingUpdates(url, key, currentEnvId)
    ]);

    renderContainers(containers, stats, updates, url, key);
    renderSummary(containers, updates);
}

/** @returns {string} Id of the visible sub-view. */
function activeTab() {
    const btn = document.querySelector('#dockhand-view .sub-tab-btn.active');
    return btn ? btn.dataset.target : 'dockhand-tab-containers';
}

/**
 * Wires the sub-tab strip. Assigned rather than added, because this runs on
 * every visit to the view.
 * @param {string} url
 * @param {string} key
 */
function setupSubTabs(url, key) {
    document.querySelectorAll('#dockhand-view .sub-tab-btn').forEach(btn => {
        btn.onclick = () => {
            // popup.js also has a global .sub-tab-btn handler that does the
            // showing and hiding; this only has to load what the new tab
            // needs. Assigned rather than added, because initDockhand runs on
            // every visit to the view.
            refresh(url, key).catch(e => showError(e.message));
        };
    });
}

/**
 * Wires the search box, the sort control and the update check.
 * @param {string} url
 * @param {string} key
 */
function setupControls(url, key) {
    const search = document.getElementById('dockhand-search');
    if (search) search.oninput = () => applyFilter();

    const sort = document.getElementById('dockhand-sort');
    if (sort) sort.onchange = () => applyFilter();

    const check = document.getElementById('dockhand-check-updates');
    if (check) {
        check.onclick = async () => {
            check.disabled = true;
            check.classList.add('spinning');
            try {
                await checkDockhandUpdates(url, key, currentEnvId);
                showNotification('Update check finished', 'success');
                await refresh(url, key);
            } catch (e) {
                showNotification(`Update check failed: ${e.message}`, 'error');
            } finally {
                check.disabled = false;
                check.classList.remove('spinning');
            }
        };
    }
}

/**
 * Builds the environment selector, or hides it when there is only one host.
 * @param {string} url
 * @param {string} key
 */
function renderEnvironmentPicker(url, key) {
    const wrap = document.getElementById('dockhand-env-wrap');
    const select = document.getElementById('dockhand-env');
    if (!wrap || !select) return;

    // A picker offering one choice is furniture.
    wrap.classList.toggle('hidden', environments.length < 2);

    select.replaceChildren();
    for (const env of environments) {
        const opt = document.createElement('option');
        opt.value = String(env.id);
        opt.textContent = env.name || `Environment ${env.id}`;
        select.appendChild(opt);
    }
    select.value = String(currentEnvId);

    select.onchange = async () => {
        currentEnvId = select.value;
        localStorage.setItem(ENV_STORAGE_KEY, String(currentEnvId));
        // The previous host's containers must not linger under the new name.
        document.getElementById('dockhand-list')?.replaceChildren();
        try {
            await refresh(url, key);
        } catch (e) {
            showError(e.message);
        }
    };
}

/**
 * The header line: how many containers are running, and how many wait for an
 * update.
 * @param {Array} containers
 * @param {Map} updates
 */
function renderSummary(containers, updates) {
    const running = containers.filter(c => isRunning(c)).length;
    setText('dockhand-hero', `${running}/${containers.length}`);

    const parts = [`${running} running`];
    const stopped = containers.length - running;
    if (stopped > 0) parts.push(`${stopped} stopped`);
    if (updates.size > 0) parts.push(`${updates.size} update${updates.size === 1 ? '' : 's'}`);
    setText('dockhand-subline', parts.join(' · '));
}

/**
 * @param {Object} container
 * @returns {boolean}
 */
const isRunning = (container) => /^running$/i.test(String(container.state || ''));

/**
 * Reconciles the container cards.
 *
 * Rows are matched by container id and reused. Rebuilding the list on each
 * five-second poll would cancel the hover that reveals the actions and drop
 * focus mid-click.
 * @param {Array} containers
 * @param {Map} stats
 * @param {Map} updates
 * @param {string} url
 * @param {string} key
 */
function renderContainers(containers, stats, updates, url, key) {
    const list = document.getElementById('dockhand-list');
    if (!list) return;

    if (containers.length === 0) {
        list.replaceChildren();
        const empty = document.createElement('div');
        empty.className = 'unraid-empty';
        empty.textContent = 'No containers in this environment.';
        list.appendChild(empty);
        return;
    }
    list.querySelector('.unraid-empty')?.remove();

    const existing = new Map();
    list.querySelectorAll('.unraid-row').forEach(el => existing.set(el.dataset.id, el));

    for (const container of containers) {
        let row = existing.get(container.id);
        if (row) {
            existing.delete(container.id);
        } else {
            row = buildRow(container, url, key);
            list.appendChild(row);
        }
        updateRow(row, container, stats, updates);
    }

    // Anything the payload no longer lists has been removed on the host.
    existing.forEach(el => el.remove());

    applyFilter();
}

/**
 * Creates one container card. Values are filled in by updateRow.
 * @param {Object} container
 * @param {string} url
 * @param {string} key
 * @returns {HTMLElement}
 */
function buildRow(container, url, key) {
    const row = document.createElement('div');
    row.className = 'unraid-row';
    row.dataset.id = container.id;

    const icon = document.createElement('span');
    icon.className = 'unraid-row-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = (container.name || '?').substring(0, 2).toUpperCase();

    const main = document.createElement('div');
    main.className = 'unraid-row-main';
    const name = document.createElement('div');
    name.className = 'unraid-row-name';
    const meta = document.createElement('div');
    meta.className = 'unraid-row-meta';
    main.append(name, meta);

    // Both the badge and the button that acts on it, as in the Unraid view.
    // Dockhand names the target version, so the badge can say more than
    // "Update".
    const flag = document.createElement('button');
    flag.type = 'button';
    flag.className = 'unraid-update-flag hidden';
    flag.textContent = 'Update';

    const actions = document.createElement('div');
    actions.className = 'unraid-row-actions';
    const logsBtn = makeAction('≡', `Logs for ${container.name}`);
    const restartBtn = makeAction('⟳', `Restart ${container.name}`);
    const startBtn = makeAction('▶', `Start ${container.name}`);
    const stopBtn = makeAction('■', `Stop ${container.name}`);
    startBtn.classList.add('hidden');
    actions.append(logsBtn, restartBtn, startBtn, stopBtn);

    const state = document.createElement('span');
    state.className = 'unraid-row-state';
    const dot = document.createElement('span');
    dot.className = 'unraid-row-dot';
    dot.setAttribute('aria-hidden', 'true');
    const stateText = document.createElement('span');
    stateText.className = 'unraid-row-state-text';
    state.append(dot, stateText);

    /**
     * Runs one action with the button disabled for the duration, so a second
     * click cannot queue a contradictory one.
     */
    const act = async (btn, fn, okMessage) => {
        btn.disabled = true;
        try {
            await fn();
            showNotification(okMessage, 'success');
            await refresh(url, key);
        } catch (e) {
            showNotification(`${container.name}: ${e.message}`, 'error');
        } finally {
            btn.disabled = false;
        }
    };

    startBtn.addEventListener('click', () => act(startBtn,
        () => controlDockhandContainer(url, key, currentEnvId, container.id, 'start'),
        `${container.name} started`));
    stopBtn.addEventListener('click', () => act(stopBtn,
        () => controlDockhandContainer(url, key, currentEnvId, container.id, 'stop'),
        `${container.name} stopped`));
    restartBtn.addEventListener('click', () => act(restartBtn,
        () => controlDockhandContainer(url, key, currentEnvId, container.id, 'restart'),
        `${container.name} restarted`));

    logsBtn.addEventListener('click', async () => {
        logsBtn.disabled = true;
        try {
            const text = await getDockhandLogs(url, key, currentEnvId, container.id);
            showLogs(container.name, text);
        } catch (e) {
            showNotification(`Could not read the logs: ${e.message}`, 'error');
        } finally {
            logsBtn.disabled = false;
        }
    });

    flag.addEventListener('click', async () => {
        const target = flag.dataset.version
            ? ` to ${flag.dataset.version}`
            : '';
        const ok = await showConfirmModal(
            'Update container',
            `Pull the latest image for "${container.name}"${target} and recreate it? The container restarts.`,
            'Update',
            'var(--accent-dockhand)'
        );
        if (!ok) return;
        flag.disabled = true;
        try {
            await updateDockhandContainer(url, key, currentEnvId, container.id);
            showNotification(`${container.name} updated`, 'success');
            flag.classList.add('hidden');
            await refresh(url, key);
        } catch (e) {
            showNotification(`${container.name}: ${e.message}`, 'error');
        } finally {
            flag.disabled = false;
        }
    });

    row.append(icon, main, flag, actions, state);
    return row;
}

/**
 * Applies current values to an existing card. Only text and classes change.
 * @param {HTMLElement} row
 * @param {Object} container
 * @param {Map} stats
 * @param {Map} updates
 */
function updateRow(row, container, stats, updates) {
    const running = isRunning(container);
    row.classList.toggle('is-running', running);
    row.dataset.name = (container.name || '').toLowerCase();
    row.dataset.running = running ? '1' : '0';

    const name = row.querySelector('.unraid-row-name');
    if (name.textContent !== container.name) {
        name.textContent = container.name;
        name.title = container.name;
    }

    // The image line carries the live figures when there are any, because a
    // card this size has room for one subtitle and not two.
    const snapshot = stats.get(String(container.id)) || stats.get(String(container.name));
    const bits = [container.image || ''];
    if (running && snapshot && Number.isFinite(snapshot.cpu)) {
        bits.push(`${snapshot.cpu.toFixed(1)}% CPU`);
    }
    if (running && snapshot && Number.isFinite(snapshot.memory)) {
        bits.push(formatSize(snapshot.memory));
    }
    const meta = row.querySelector('.unraid-row-meta');
    const metaText = bits.filter(Boolean).join(' · ');
    if (meta.textContent !== metaText) {
        meta.textContent = metaText;
        meta.title = container.image || '';
    }

    const stateText = row.querySelector('.unraid-row-state-text');
    // Dockhand's `status` is Docker's human string ("Up 3 days"), which says
    // more than "Running" when there is room for it.
    const label = container.status || (running ? 'Running' : 'Stopped');
    if (stateText.textContent !== label) stateText.textContent = label;

    const update = updates.get(String(container.id));
    const flag = row.querySelector('.unraid-update-flag');
    flag.classList.toggle('hidden', !update);
    if (update) {
        const label = update.newerVersion ? `Update → ${update.newerVersion}` : 'Update';
        if (flag.textContent !== label) flag.textContent = label;
        flag.dataset.version = update.newerVersion || '';
        flag.setAttribute('aria-label', `Update ${container.name}`);
    }

    const [, restartBtn, startBtn, stopBtn] = row.querySelectorAll('.unraid-action');
    startBtn.classList.toggle('hidden', running);
    stopBtn.classList.toggle('hidden', !running);
    restartBtn.classList.toggle('hidden', !running);
}

/**
 * Hides the cards that do not match the search box, and orders the rest.
 *
 * Sorting reorders the existing nodes rather than rebuilding them, for the
 * same reason renderContainers reconciles.
 */
function applyFilter() {
    const list = document.getElementById('dockhand-list');
    if (!list) return;

    const term = (document.getElementById('dockhand-search')?.value || '')
        .trim().toLowerCase();
    const mode = document.getElementById('dockhand-sort')?.value || 'status-asc';

    const rows = Array.from(list.querySelectorAll('.unraid-row'));
    for (const row of rows) {
        const hit = !term || (row.dataset.name || '').includes(term);
        row.classList.toggle('hidden', !hit);
    }

    const byName = (a, b) => (a.dataset.name || '').localeCompare(b.dataset.name || '');
    rows.sort((a, b) => {
        if (mode === 'name-asc') return byName(a, b);
        const ra = a.dataset.running === '1' ? 0 : 1;
        const rb = b.dataset.running === '1' ? 0 : 1;
        if (ra !== rb) return mode === 'status-desc' ? rb - ra : ra - rb;
        return byName(a, b);
    });
    rows.forEach(row => list.appendChild(row));
}

/**
 * Lists the compose stacks of the environment.
 * @param {Array} stacks
 */
function renderStacks(stacks) {
    const list = document.getElementById('dockhand-stack-list');
    if (!list) return;
    list.replaceChildren();

    if (!stacks || stacks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'unraid-empty';
        empty.textContent = 'No compose stacks in this environment.';
        list.appendChild(empty);
        return;
    }

    for (const stack of stacks) {
        const row = document.createElement('div');
        row.className = 'unraid-row';

        const icon = document.createElement('span');
        icon.className = 'unraid-row-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = String(stack.name || '?').substring(0, 2).toUpperCase();

        const main = document.createElement('div');
        main.className = 'unraid-row-main';
        const name = document.createElement('div');
        name.className = 'unraid-row-name';
        name.textContent = stack.name || 'Unnamed stack';
        const meta = document.createElement('div');
        meta.className = 'unraid-row-meta';
        // No response schema is documented for /api/stacks, so every field
        // here is read defensively and simply left out when absent.
        const count = stack.serviceCount ?? stack.services?.length;
        meta.textContent = [
            stack.source || stack.type,
            count !== undefined ? `${count} service${count === 1 ? '' : 's'}` : ''
        ].filter(Boolean).join(' · ');
        main.append(name, meta);

        const state = document.createElement('span');
        state.className = 'unraid-row-state';
        const dot = document.createElement('span');
        dot.className = 'unraid-row-dot';
        dot.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.className = 'unraid-row-state-text';
        const up = /running|active|up|deployed/i.test(String(stack.status || stack.state || ''));
        row.classList.toggle('is-running', up);
        text.textContent = stack.status || stack.state || (up ? 'Running' : 'Stopped');
        state.append(dot, text);

        row.append(icon, main, state);
        list.appendChild(row);
    }
}

/**
 * Shows a container's log tail in a modal.
 *
 * textContent, never innerHTML: log lines are whatever the container decided
 * to print, and a container that prints markup is not a special case worth
 * trusting.
 * @param {string} name - Container name, for the title
 * @param {string} text - Raw log text
 */
function showLogs(name, text) {
    const backdrop = document.createElement('div');
    backdrop.className = 'custom-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'custom-modal dockhand-log-modal';

    const header = document.createElement('div');
    header.className = 'custom-modal-header';
    header.textContent = `Logs — ${name}`;

    const body = document.createElement('div');
    body.className = 'custom-modal-body';
    const pre = document.createElement('pre');
    pre.className = 'dockhand-logs';
    pre.textContent = text || 'This container has produced no output.';
    body.appendChild(pre);

    const footer = document.createElement('div');
    footer.className = 'custom-modal-footer';
    const copy = document.createElement('button');
    copy.className = 'modal-btn';
    copy.textContent = 'Copy';
    copy.onclick = async () => {
        try {
            await navigator.clipboard.writeText(text || '');
            copy.textContent = 'Copied';
        } catch {
            // Routine in a popup: clipboard writes reject whenever the
            // document is not focused, and that is not worth an error toast.
            copy.textContent = 'Could not copy';
        }
    };
    const close = document.createElement('button');
    close.className = 'modal-btn confirm';
    // .modal-btn.confirm sets `color: white` and leaves the background to the
    // caller — "set inline by JS based on service", says the stylesheet. Not
    // setting one left white text on the modal's own dark surface.
    close.style.backgroundColor = 'var(--accent-dockhand)';
    close.textContent = 'Close';
    footer.append(copy, close);

    modal.append(header, body, footer);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('show'));

    const dismiss = () => {
        backdrop.classList.remove('show');
        setTimeout(() => backdrop.remove(), 200);
    };
    close.onclick = dismiss;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) dismiss(); });

    // The newest lines are the ones worth reading first.
    pre.scrollTop = pre.scrollHeight;
}

/**
 * Sidebar badge: the number of containers with a pending update, across every
 * environment. A red dot when the server cannot be reached.
 * @param {string} url
 * @param {string} key
 */
export async function updateDockhandBadge(url, key) {
    const navItem = document.querySelector('.nav-item[data-target="dockhand"]');
    if (!navItem) return;
    const badge = navItem.querySelector('.badge');
    if (!badge) return;

    const envs = await getDockhandEnvironments(url, key);
    let pending = 0;
    for (const env of envs) {
        const updates = await getDockhandPendingUpdates(url, key, env.id);
        pending += updates.size;
    }

    badge.textContent = pending > 0 ? String(pending) : '';
    badge.classList.toggle('hidden', pending === 0);
}

/**
 * @param {string} id
 * @param {string} value
 */
function setText(id, value) {
    const el = document.getElementById(id);
    if (el && el.textContent !== value) el.textContent = value;
}

/**
 * @param {string} glyph - Visible character
 * @param {string} label - Accessible name and tooltip
 * @returns {HTMLButtonElement}
 */
function makeAction(glyph, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'unraid-action';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.textContent = glyph;
    return btn;
}

/**
 * Reports a failure into the panel that is actually on screen.
 *
 * This used to write into #dockhand-list unconditionally. That list lives in
 * the Containers panel, so a failure while the Stacks tab was open put the
 * message somewhere hidden and left Stacks blank — which reads as the tab
 * switcher being broken rather than as a request that failed.
 * @param {string} message
 */
function showError(message) {
    setText('dockhand-hero', 'Unavailable');
    setText('dockhand-subline', message);

    const target = activeTab() === 'dockhand-tab-stacks'
        ? document.getElementById('dockhand-stack-list')
        : document.getElementById('dockhand-list');
    if (!target) return;

    target.replaceChildren();
    const banner = document.createElement('div');
    banner.className = 'error-banner';
    banner.textContent = message;
    target.appendChild(banner);
}

/** @param {string} message */
function showEmpty(message) {
    setText('dockhand-hero', '0/0');
    setText('dockhand-subline', message);
}
