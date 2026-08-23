// services/dockhand.js
/**
 * Dockhand API integration.
 *
 * Dockhand is a Docker management platform whose REST API is generated from
 * its SvelteKit route handlers; the full OpenAPI document is public at
 * `<host>/openapi.json` (note: /api/openapi.json is behind auth).
 *
 * Two things about this API shape the module:
 *
 * 1. **Every container call is scoped to an environment.** One Dockhand server
 *    fronts several Docker hosts, each with a numeric id from
 *    `GET /api/environments`. That is one server and one token, unlike
 *    Portainer where each host is configured separately.
 *
 * 2. **Omitting `env` is not the same as asking for everything.** The spec
 *    calls the parameter optional on `GET /api/containers`, and then says "an
 *    empty array is returned if omitted" — a request that quietly succeeds
 *    with nothing, which reads exactly like a host with no containers. Every
 *    function here therefore requires the environment id and refuses without
 *    one, rather than leaving that trap to the caller.
 *
 * Auth is a user-scoped bearer token, `dh_` followed by 43 base64url
 * characters. Repeated failures are rate limited by the server: ten per IP
 * earns a 429 for five minutes, so a wrong key should not be retried in a
 * loop.
 */

import { normalizeUrl } from './utils.js';

/** Log lines fetched when opening a container's log view. */
const LOG_TAIL_LINES = 200;

/**
 * Performs a request against the Dockhand API.
 *
 * @param {string} url - Dockhand base URL
 * @param {string} apiKey - Bearer token (`dh_...`)
 * @param {string} path - Path below the host, starting with `/api`
 * @param {Object} [options]
 * @param {string} [options.method='GET']
 * @param {Object} [options.query] - Query parameters; undefined values dropped
 * @param {Object} [options.body] - JSON body for a write
 * @returns {Promise<any>} Parsed JSON, or null for an empty body
 */
const request = async (url, apiKey, path, { method = 'GET', query, body } = {}) => {
    const base = normalizeUrl(url);
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(query || {})) {
        if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
    }
    const qs = search.toString();

    const response = await fetch(`${base}${path}${qs ? `?${qs}` : ''}`, {
        method,
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: 'no-store'
    });

    if (!response.ok) {
        // 429 is the token rate limiter, and saying so stops the user
        // retrying a wrong key into a five-minute lockout.
        if (response.status === 429) {
            throw new Error('Too many failed attempts — Dockhand locks the token out for 5 minutes');
        }
        if (response.status === 401) throw new Error('Dockhand rejected the API token (401)');
        if (response.status === 403) throw new Error('The token lacks the permission for this action (403)');
        throw new Error(`Dockhand API Error: ${response.status}`);
    }

    if (response.status === 204) return null;
    const text = await response.text();
    if (!text) return null;
    return JSON.parse(text);
};

/**
 * Throws unless an environment id was supplied.
 * @param {number|string} envId
 * @returns {number|string}
 */
const requireEnv = (envId) => {
    if (envId === undefined || envId === null || envId === '') {
        throw new Error('Dockhand: no environment selected');
    }
    return envId;
};

/**
 * Liveness probe. Public — it needs no token, which makes it the honest test
 * of "is the URL right" separately from "is the key right".
 * @param {string} url - Dockhand base URL
 * @returns {Promise<Object>} `{ status, timestamp }`
 */
export const pingDockhand = async (url) => {
    try {
        const response = await fetch(`${normalizeUrl(url)}/api/health`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Dockhand health check failed:', error);
        throw error;
    }
};

/**
 * Lists the Docker hosts this Dockhand server manages.
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<Array>} `[{ id, name, connectionType, host, port, ... }]`
 */
export const getDockhandEnvironments = async (url, apiKey) => {
    try {
        const data = await request(url, apiKey, '/api/environments');
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Dockhand environments error:', error);
        throw error;
    }
};

/**
 * Lists the containers of one environment.
 *
 * Containers labelled `dockhand.hidden=true` are filtered out by the server.
 * @param {string} url
 * @param {string} apiKey
 * @param {number|string} envId - Environment id; required, see the note above
 * @param {boolean} [includeStopped=true]
 * @returns {Promise<Array>} `[{ id, name, image, state, status }]`
 */
export const getDockhandContainers = async (url, apiKey, envId, includeStopped = true) => {
    try {
        const data = await request(url, apiKey, '/api/containers', {
            query: { env: requireEnv(envId), all: includeStopped ? 'true' : 'false' }
        });
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Dockhand containers error:', error);
        throw error;
    }
};

/**
 * One CPU/memory snapshot per running container in an environment.
 *
 * The OpenAPI document describes the response only as "array of per-container
 * stats snapshots" with no field list, so the shape is normalised here rather
 * than in the view: the single-container endpoint documents `cpuPercent`,
 * `memoryUsage`, `memoryLimit` and `memoryPercent`, and the bulk endpoint is
 * read for those names plus the obvious aliases.
 *
 * @param {string} url
 * @param {string} apiKey
 * @param {number|string} envId
 * @returns {Promise<Map<string, {cpu: number, memory: number, memoryPercent: number}>>}
 *   Keyed by container id, and by name as well so either lookup works.
 */
export const getDockhandStats = async (url, apiKey, envId) => {
    const byKey = new Map();
    try {
        const data = await request(url, apiKey, '/api/containers/stats', {
            query: { env: requireEnv(envId) }
        });
        const rows = Array.isArray(data) ? data : (data && Array.isArray(data.stats) ? data.stats : []);

        for (const row of rows) {
            if (!row || typeof row !== 'object') continue;
            const entry = {
                cpu: Number(row.cpuPercent ?? row.cpu ?? NaN),
                memory: Number(row.memoryUsage ?? row.memory ?? NaN),
                memoryPercent: Number(row.memoryPercent ?? NaN)
            };
            for (const key of [row.id, row.containerId, row.name, row.containerName]) {
                if (key) byKey.set(String(key), entry);
            }
        }
    } catch (error) {
        // Stats are decoration on top of the container list. A token without
        // the 'view' permission still gets a usable view without them.
        console.warn('Dockhand stats unavailable:', error.message);
    }
    return byKey;
};

/**
 * The containers of an environment that have a newer image waiting.
 *
 * Reads the recorded result; it does not start a fresh check. Unlike Unraid's
 * plain "update available" flag, each record names the version.
 * @param {string} url
 * @param {string} apiKey
 * @param {number|string} envId
 * @returns {Promise<Map<string, {newerVersion: string, currentImage: string}>>} By container id
 */
export const getDockhandPendingUpdates = async (url, apiKey, envId) => {
    const byId = new Map();
    try {
        const data = await request(url, apiKey, '/api/containers/pending-updates', {
            query: { env: requireEnv(envId) }
        });
        for (const row of (data && data.pendingUpdates) || []) {
            if (!row || !row.containerId) continue;
            if (row.hasImageUpdate === false) continue;
            byId.set(String(row.containerId), {
                newerVersion: row.newerVersion || '',
                currentImage: row.currentImage || ''
            });
        }
    } catch (error) {
        // Same reasoning as stats: an absent update list must not cost the
        // user the container list.
        console.warn('Dockhand pending updates unavailable:', error.message);
    }
    return byId;
};

/**
 * Asks Dockhand to re-check every container in an environment for a newer
 * image. Slow — it talks to the registries.
 * @param {string} url
 * @param {string} apiKey
 * @param {number|string} envId
 * @returns {Promise<Object>}
 */
export const checkDockhandUpdates = async (url, apiKey, envId) => {
    try {
        return await request(url, apiKey, '/api/containers/check-updates', {
            method: 'POST',
            query: { env: requireEnv(envId) }
        });
    } catch (error) {
        console.error('Dockhand update check error:', error);
        throw error;
    }
};

/**
 * Starts, stops or restarts a container.
 * @param {string} url
 * @param {string} apiKey
 * @param {number|string} envId
 * @param {string} id - Container id or name
 * @param {'start'|'stop'|'restart'} action
 * @returns {Promise<Object>} `{ success }`
 */
export const controlDockhandContainer = async (url, apiKey, envId, id, action) => {
    if (!['start', 'stop', 'restart'].includes(action)) {
        throw new Error(`Unsupported container action: ${action}`);
    }
    try {
        return await request(url, apiKey, `/api/containers/${encodeURIComponent(id)}/${action}`, {
            method: 'POST',
            query: { env: requireEnv(envId) }
        });
    } catch (error) {
        console.error(`Dockhand ${action} error:`, error);
        throw error;
    }
};

/**
 * Recreates a container on its newest image, keeping its configuration.
 * @param {string} url
 * @param {string} apiKey
 * @param {number|string} envId
 * @param {string} id - Container id or name
 * @returns {Promise<Object>} `{ success, id }`
 */
export const updateDockhandContainer = async (url, apiKey, envId, id) => {
    try {
        return await request(url, apiKey, `/api/containers/${encodeURIComponent(id)}/update`, {
            method: 'POST',
            query: { env: requireEnv(envId), pull: 'true' }
        });
    } catch (error) {
        console.error('Dockhand container update error:', error);
        throw error;
    }
};

/**
 * The tail of a container's combined stdout and stderr.
 *
 * Worth having: this is the one thing the Unraid GraphQL API cannot do, which
 * is why the Unraid Docker view has no log action at all.
 * @param {string} url
 * @param {string} apiKey
 * @param {number|string} envId
 * @param {string} id - Container id or name
 * @param {number} [tail=200] - Trailing lines
 * @returns {Promise<string>} The log text, empty string when there is none
 */
export const getDockhandLogs = async (url, apiKey, envId, id, tail = LOG_TAIL_LINES) => {
    try {
        const data = await request(url, apiKey, `/api/containers/${encodeURIComponent(id)}/logs`, {
            query: { env: requireEnv(envId), tail }
        });
        return (data && typeof data.logs === 'string') ? data.logs : '';
    } catch (error) {
        console.error('Dockhand logs error:', error);
        throw error;
    }
};

/**
 * The compose stacks of one environment: internal, external and git-backed.
 *
 * The OpenAPI document records no response schema for this endpoint, so the
 * result is passed through and the view reads defensively.
 * @param {string} url
 * @param {string} apiKey
 * @param {number|string} envId
 * @returns {Promise<Array>}
 */
export const getDockhandStacks = async (url, apiKey, envId) => {
    try {
        const data = await request(url, apiKey, '/api/stacks', {
            query: { env: requireEnv(envId) }
        });
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.stacks)) return data.stacks;
        return [];
    } catch (error) {
        console.error('Dockhand stacks error:', error);
        throw error;
    }
};

/**
 * Aggregated counts per environment, in one request.
 *
 * Used by the dashboard card and the sidebar badge, so neither has to walk
 * every environment's container list. The nested counts carry no documented
 * field names, hence the several spellings accepted below.
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<Array>} `[{ id, name, online, running, total, updates }]`
 */
export const getDockhandDashboard = async (url, apiKey) => {
    try {
        const data = await request(url, apiKey, '/api/dashboard/stats');
        const rows = Array.isArray(data) ? data : [];

        return rows.map(row => {
            const c = row.containers || {};
            const total = Number(c.total ?? c.count ?? c.all ?? 0) || 0;
            const running = Number(c.running ?? c.active ?? 0) || 0;
            return {
                id: row.id,
                name: row.name || `Environment ${row.id}`,
                online: row.online !== false,
                total,
                running,
                stopped: Number(c.stopped ?? c.exited ?? Math.max(total - running, 0)) || 0,
                images: Number((row.images || {}).total ?? (row.images || {}).count ?? 0) || 0,
                stacks: Number((row.stacks || {}).total ?? (row.stacks || {}).count ?? 0) || 0
            };
        });
    } catch (error) {
        console.error('Dockhand dashboard error:', error);
        throw error;
    }
};
