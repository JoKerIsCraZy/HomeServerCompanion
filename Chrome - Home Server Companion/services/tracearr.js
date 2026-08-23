// services/tracearr.js
/**
 * Tracearr API Integration — Public API v2.
 *
 * v2 is read-only and has no aggregate statistics endpoint: where v1 served
 * `/stats` and `/stats/today` ready-made, v2 exposes primitives (history,
 * streams, users, libraries) that the caller rolls up itself.
 * `getTracearrRollup` below does that in two requests.
 *
 * Responses arrive in snake_case and are converted to camelCase at the request
 * boundary, because the UI layer was written against v1's camelCase shape.
 *
 * Two capabilities have no v2 surface at all and still call v1, marked LEGACY:
 * rule violations and terminating a stream.
 */

import { validateSearchQuery } from './inputValidation.js';

/** Base path for the v2 public API. */
const V2 = '/api/v2/public';

/** Page size when walking a cursor-paginated collection. 100 is the API's cap
 *  on every paginated endpoint; asking for more is a 400, not a clamp. */
const PAGE_SIZE = 100;

/** Safety valve so a broken cursor cannot spin forever. */
const MAX_PAGES = 40;

/**
 * Recursively rewrites snake_case keys to camelCase.
 *
 * v2 answers in snake_case (`poster_url`, `media_title`) while the UI layer was
 * written against v1's camelCase. Converting once at the response boundary
 * keeps every consumer unchanged instead of renaming 27 field reads per view —
 * and keeps the next added field working without a second edit. Cursor values
 * (`meta.nextCursor`) contain no underscore and pass through untouched.
 *
 * @param {*} value - Parsed JSON value
 * @returns {*} The same structure with camelCase keys
 */
const camelizeKeys = (value) => {
    if (Array.isArray(value)) return value.map(camelizeKeys);
    if (value === null || typeof value !== 'object') return value;
    const out = {};
    for (const [key, val] of Object.entries(value)) {
        const camel = key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
        out[camel] = camelizeKeys(val);
    }
    return out;
};

/**
 * Performs an authenticated GET against the Tracearr API.
 * @param {string} url - Tracearr base URL
 * @param {string} apiKey - Bearer token (trr_pub_xxx)
 * @param {string} path - Path below the host, including the API prefix
 * @param {Object} [params] - Query parameters; null/undefined entries are dropped
 * @returns {Promise<Object>} Parsed JSON body
 */
const request = async (url, apiKey, path, params = {}) => {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== null && v !== undefined && v !== '') query.append(k, String(v));
    }
    const qs = query.toString();
    const response = await fetch(`${url}${path}${qs ? `?${qs}` : ''}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Tracearr ${path}: ${response.status}`);
    return camelizeKeys(await response.json());
};

/**
 * Walks a cursor-paginated collection and returns every record.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {string} path - Collection path
 * @param {Object} [params] - Extra query parameters
 * @returns {Promise<Array>} All records across pages
 */
const collectPages = async (url, apiKey, path, params = {}) => {
    const items = [];
    let cursor = null;
    for (let page = 0; page < MAX_PAGES; page++) {
        const body = await request(url, apiKey, path, { ...params, pageSize: PAGE_SIZE, cursor });
        items.push(...(body.data || []));
        cursor = body.meta?.nextCursor || null;
        if (!cursor) break;
    }
    return items;
};

// ---------------------------------------------------------------- streams

/**
 * Active streams with the server-side rollup v2 ships alongside them.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {string} [serverId] - Limit to one server
 * @returns {Promise<{data: Array, summary: Object}>} Streams and their summary
 */
export const getTracearrStreamsDetailed = async (url, apiKey, serverId = null) => {
    try {
        // No `summary` parameter: passing it true makes the API return the
        // rollup *instead of* the stream list, not alongside it. The default
        // response already carries both.
        const body = await request(url, apiKey, `${V2}/streams`, { server_id: serverId });
        return { data: body.data || [], summary: body.summary || {} };
    } catch (error) {
        console.error("Tracearr Streams Error:", error);
        throw error;
    }
};

/**
 * Active streams only. Kept for callers that just want the list.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @returns {Promise<Array>} Active streams
 */
export const getTracearrStreams = async (url, apiKey) => {
    const { data } = await getTracearrStreamsDetailed(url, apiKey);
    return data;
};

// ---------------------------------------------------------------- history

/**
 * Watch history as plays. v2 accepts real filters, so callers should narrow the
 * query rather than fetching everything and filtering in the popup.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {Object} [filters] - Any of: user_id, server_id, media_id, rating_key,
 *   imdb_id, tmdb_id, tvdb_id, media_type, watched, since, until, cursor, pageSize
 * @returns {Promise<{data: Array, meta: Object}>} Page of history records
 */
export const getTracearrHistory = async (url, apiKey, filters = {}) => {
    try {
        const body = await request(url, apiKey, `${V2}/history`, filters);
        return { data: body.data || [], meta: body.meta || {} };
    } catch (error) {
        console.error("Tracearr History Error:", error);
        throw error;
    }
};

// ---------------------------------------------------------------- users

/**
 * Identities with account correlation, following the cursor to the end.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {boolean} [includeRemoved] - Include identities removed from a server
 * @returns {Promise<Array>} All identities
 */
export const getTracearrUsers = async (url, apiKey, includeRemoved = false) => {
    try {
        return await collectPages(url, apiKey, `${V2}/users`, { include_removed: includeRemoved || null });
    } catch (error) {
        console.error("Tracearr Users Error:", error);
        throw error;
    }
};

/**
 * One identity.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {string} id - Identity id
 * @returns {Promise<Object>} Identity
 */
export const getTracearrUser = async (url, apiKey, id) =>
    request(url, apiKey, `${V2}/users/${encodeURIComponent(id)}`);

/**
 * Play statistics for one identity: all_time / last_30 / last_7 windows plus
 * the user's top genres.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {string} id - Identity id
 * @returns {Promise<Object>} Stats response
 */
export const getTracearrUserStats = async (url, apiKey, id) =>
    request(url, apiKey, `${V2}/users/${encodeURIComponent(id)}/stats`);

/**
 * Watch history for one identity.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {string} id - Identity id
 * @param {Object} [filters] - cursor, pageSize
 * @returns {Promise<Object>} Page of history records
 */
export const getTracearrUserHistory = async (url, apiKey, id, filters = {}) =>
    request(url, apiKey, `${V2}/users/${encodeURIComponent(id)}/history`, filters);

// ---------------------------------------------------------------- media

/**
 * Media identity and per-server availability: resolution, file size, versions.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {string} ref - Media reference (media id or an external id)
 * @returns {Promise<Object>} Media resource
 */
export const getTracearrMedia = async (url, apiKey, ref) =>
    request(url, apiKey, `${V2}/media/${encodeURIComponent(ref)}`);

/**
 * Children of a show or season.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {string} ref - Media reference
 * @returns {Promise<Object>} Children response
 */
export const getTracearrMediaChildren = async (url, apiKey, ref) =>
    request(url, apiKey, `${V2}/media/${encodeURIComponent(ref)}/children`);

/**
 * Play statistics for one item, in all_time / last_30 / last_7 windows.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {string} ref - Media reference
 * @returns {Promise<Object>} Stats response
 */
export const getTracearrMediaStats = async (url, apiKey, ref) =>
    request(url, apiKey, `${V2}/media/${encodeURIComponent(ref)}/stats`);

/**
 * Who watched an item, with completion percentage and episode counts.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {string} ref - Media reference
 * @param {Object} [opts] - window, server_id
 * @returns {Promise<Object>} Watchers response
 */
export const getTracearrMediaWatchers = async (url, apiKey, ref, opts = {}) =>
    request(url, apiKey, `${V2}/media/${encodeURIComponent(ref)}/watchers`, opts);

/**
 * Watch history for one item.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {string} ref - Media reference
 * @param {Object} [filters] - cursor, pageSize
 * @returns {Promise<Object>} Page of history records
 */
export const getTracearrMediaHistory = async (url, apiKey, ref, filters = {}) =>
    request(url, apiKey, `${V2}/media/${encodeURIComponent(ref)}/history`, filters);

// ---------------------------------------------------------------- library

/**
 * Per-library rollups: item counts by type, total bytes, resolution spread.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @returns {Promise<Array>} Library rollups
 */
export const getTracearrLibraries = async (url, apiKey) => {
    try {
        const body = await request(url, apiKey, `${V2}/libraries`);
        return body.data || [];
    } catch (error) {
        console.error("Tracearr Libraries Error:", error);
        throw error;
    }
};

/**
 * Recently added library items.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {Object} [filters] - server_id, library_id, media_type, include_removed,
 *   cursor, pageSize
 * @returns {Promise<{data: Array, meta: Object}>} Page of recently added items
 */
export const getTracearrRecentlyAdded = async (url, apiKey, filters = {}) => {
    try {
        const body = await request(url, apiKey, `${V2}/recently-added`, { pageSize: 20, ...filters });
        return { data: body.data || [], meta: body.meta || {} };
    } catch (error) {
        console.error("Tracearr Recently Added Error:", error);
        throw error;
    }
};

// ---------------------------------------------------------------- rollups

/**
 * Midnight today in the local timezone, as an ISO string.
 * @returns {string}
 */
const startOfTodayIso = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
};

/**
 * Activity rollup over a recent window, derived from v2 primitives.
 *
 * v1 served ready-made `/stats` and `/stats/today`; v2 has no aggregate
 * endpoint at all. One history query bounded to the window carries everything
 * needed — today's figures are the same records filtered by date, and the
 * per-user tallies fall out of the same pass — so this costs two requests
 * rather than one per figure.
 *
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {number} [days=7] - Size of the window to summarise
 * @returns {Promise<Object>} Today's figures, window figures and user tallies
 */
export const getTracearrRollup = async (url, apiKey, days = 7) => {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - days);
    windowStart.setHours(0, 0, 0, 0);

    const [history, streams] = await Promise.all([
        collectPages(url, apiKey, `${V2}/history`, { since: windowStart.toISOString() }),
        getTracearrStreamsDetailed(url, apiKey).catch(() => ({ data: [], summary: {} }))
    ]);

    const todayStart = startOfTodayIso();
    const todayUsers = new Set();
    const windowUsers = new Set();
    const byUser = new Map();
    let todayPlays = 0;
    let todayWatchMs = 0;
    let windowWatchMs = 0;

    for (const rec of history) {
        // duration_ms is time actually watched in this play; total_duration_ms
        // is the length of the item, which would overstate every figure here.
        const watched = Number(rec.durationMs) || 0;
        windowWatchMs += watched;

        const id = rec.user?.id;
        if (id) {
            windowUsers.add(id);
            const tally = byUser.get(id) || {
                id,
                username: rec.user.username || rec.user.title || 'Unknown',
                plays: 0,
                watchTimeMs: 0
            };
            tally.plays++;
            tally.watchTimeMs += watched;
            byUser.set(id, tally);
        }

        if (rec.startedAt && rec.startedAt >= todayStart) {
            todayPlays++;
            todayWatchMs += watched;
            if (id) todayUsers.add(id);
        }
    }

    return {
        windowDays: days,
        activeStreams: Number(streams.summary?.total) || streams.data.length,
        transcodes: Number(streams.summary?.transcodes) || 0,
        directPlays: Number(streams.summary?.directPlays) || 0,
        today: {
            plays: todayPlays,
            watchTimeMs: todayWatchMs,
            activeUsers: todayUsers.size
        },
        window: {
            plays: history.length,
            watchTimeMs: windowWatchMs,
            activeUsers: windowUsers.size
        },
        topUsers: [...byUser.values()].sort((a, b) => b.plays - a.plays),
        records: history
    };
};

/**
 * Library totals across every server, rolled up from `/libraries`.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @returns {Promise<{items: number, movies: number, shows: number,
 *   episodes: number, bytes: number, libraries: Array}>}
 */
export const getTracearrLibraryTotals = async (url, apiKey) => {
    const libraries = await getTracearrLibraries(url, apiKey);
    const total = (field) => libraries.reduce((sum, lib) => sum + (Number(lib[field]) || 0), 0);
    return {
        items: total('itemCount'),
        movies: total('movieCount'),
        shows: total('showCount'),
        episodes: total('episodeCount'),
        bytes: total('totalFileSize'),
        libraries
    };
};

/**
 * Reachability check. v2 has no `/health`, so the cheapest read stands in: a
 * 200 from the streams endpoint means the host answers and the token is valid.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @returns {Promise<boolean>} True when Tracearr answered
 */
export const getTracearrStatus = async (url, apiKey) => {
    try {
        await request(url, apiKey, `${V2}/streams`, { summary: true });
        return true;
    } catch {
        return false;
    }
};

// ---------------------------------------------------------------- legacy v1

/**
 * LEGACY (v1). Rule violations have no endpoint in the v2 public API, so this
 * still calls v1 and will stop working if the server drops it.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @returns {Promise<Array>} Rule violations
 */
export const getTracearrViolations = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v1/public/violations`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`Violations Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Tracearr Violations Error:", error);
        throw error;
    }
};

/**
 * LEGACY (v1). The v2 public API is read-only and cannot end a stream, so this
 * still calls v1.
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {string} streamId - Stream to terminate
 * @param {string} [reason] - Optional reason shown to the user
 * @returns {Promise<Object>} Result
 */
export const terminateTracearrStream = async (url, apiKey, streamId, reason = null) => {
    try {
        let body;
        if (reason) {
            const validation = validateSearchQuery(reason);
            if (!validation.valid) throw new Error(`Invalid reason: ${validation.error}`);
            body = JSON.stringify({ reason });
        }

        const response = await fetch(`${url}/api/v1/public/streams/${streamId}/terminate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body,
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`Terminate Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Tracearr Terminate Error:", error);
        throw error;
    }
};
