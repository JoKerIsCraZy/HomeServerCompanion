import { formatSize, formatTime } from './utils.js';
import { validateSearchQuery } from './inputValidation.js';

/**
 * Every SABnzbd endpoint is a GET with the parameters in the query string, so
 * the polled URLs are byte-identical on every tick and the browser is free to
 * serve them from its HTTP cache - which freezes the queue view while the poll
 * loop keeps running. The action endpoints are state-changing GETs, where a
 * cache hit would skip the request entirely. Neither may ever be cached.
 * @constant {RequestInit}
 */
const NO_CACHE = { cache: 'no-store' };

// Queue
/**
 * Fetches the current download queue.
 * @param {string} url - SABnzbd URL
 * @param {string} apiKey - API Key
 * @returns {Promise<Array>} List of queue slots
 */
export const getSabnzbdQueue = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api?mode=queue&apikey=${apiKey}&output=json`, NO_CACHE);
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        const data = await response.json();
        return data.queue;
    } catch (error) {
        console.error("SABnzbd Queue Error:", error);
        throw error;
    }
};

// History
/**
 * Fetches download history.
 * @param {string} url - SABnzbd URL
 * @param {string} apiKey - API Key
 * @param {number} limit - Number of items to retrieve (default 10)
 * @returns {Promise<Array>} List of history slots
 */
export const getSabnzbdHistory = async (url, apiKey, limit = 10) => {
    try {
        const response = await fetch(`${url}/api?mode=history&output=json&apikey=${apiKey}&limit=${limit}`, NO_CACHE);
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        const data = await response.json();
        return data.history;
    } catch (error) {
        console.error("SABnzbd History Error:", error);
        throw error;
    }
};

// Controls
/**
 * Pauses the download queue.
 * @param {string} url
 * @param {string} apiKey
 * @param {string|null} time - Optional duration (e.g., "15", "30") or null for indefinite
 */
export const pauseQueue = async (url, apiKey, time = null) => {
    try {
        let apiUrl = `${url}/api?mode=pause&apikey=${apiKey}&output=json`;
        if (time) {
            // "set_pause" usually accepts "15" for 15 minutes, or "15m"
            // Using `mode=config&name=set_pause&value=${time}`
            apiUrl = `${url}/api?mode=config&name=set_pause&value=${time}&apikey=${apiKey}&output=json`;
        }
        const response = await fetch(apiUrl, NO_CACHE);
        return await response.json();
    } catch (error) {
        console.error("SABnzbd Pause Error:", error);
    }
};

export const resumeQueue = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api?mode=resume&apikey=${apiKey}&output=json`, NO_CACHE);
        return await response.json();
    } catch (error) {
        console.error("SABnzbd Resume Error:", error);
    }
};

export const deleteQueueItem = async (url, apiKey, nzo_id) => {
    try {
        const response = await fetch(`${url}/api?mode=queue&name=delete&value=${nzo_id}&apikey=${apiKey}&output=json`, NO_CACHE);
        return await response.json();
    } catch (error) {
        console.error("SABnzbd Delete Error:", error);
    }
};

export const deleteHistoryItem = async (url, apiKey, nzo_id) => {
    try {
        const response = await fetch(`${url}/api?mode=history&name=delete&value=${nzo_id}&apikey=${apiKey}&output=json`, NO_CACHE);
        return await response.json();
    } catch (error) {
        console.error("SABnzbd History Delete Error:", error);
        throw error;
    }
};

/**
 * Moves a queue item to an absolute position. SABnzbd's `switch` mode takes the
 * item and its target index and shifts everything else around it, so callers
 * only need the destination, not a pairwise swap.
 * @param {string} url - SABnzbd URL
 * @param {string} apiKey - API Key
 * @param {string} nzo_id - Item to move
 * @param {number} position - Zero-based target index in the queue
 * @returns {Promise<Object|undefined>} Parsed response, or undefined on failure
 */
export const moveQueueItem = async (url, apiKey, nzo_id, position) => {
    try {
        const target = Math.max(0, Math.floor(position));
        const response = await fetch(`${url}/api?mode=switch&value=${encodeURIComponent(nzo_id)}&value2=${target}&apikey=${apiKey}&output=json`, NO_CACHE);
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("SABnzbd Move Error:", error);
        throw error;
    }
};

/**
 * Sorts the whole queue server-side, the same operation SABnzbd's own web UI
 * offers. This rewrites the actual queue order rather than just the view, so
 * the result survives a reload and applies to the download order itself.
 * @param {string} url - SABnzbd URL
 * @param {string} apiKey - API Key
 * @param {'name'|'size'|'avg_age'} field - Column to sort on
 * @param {'asc'|'desc'} direction - Sort direction
 * @returns {Promise<Object>} Parsed response
 */
export const sortQueue = async (url, apiKey, field, direction) => {
    try {
        const response = await fetch(`${url}/api?mode=queue&name=sort&sort=${encodeURIComponent(field)}&dir=${encodeURIComponent(direction)}&apikey=${apiKey}&output=json`, NO_CACHE);
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("SABnzbd Sort Error:", error);
        throw error;
    }
};

/**
 * Sets an item's priority. Unlike a move this survives new additions, so a
 * forced item stays ahead of whatever arrives later.
 * @param {string} url - SABnzbd URL
 * @param {string} apiKey - API Key
 * @param {string} nzo_id - Item to reprioritise
 * @param {number} priority - -1 low, 0 normal, 1 high, 2 force
 * @returns {Promise<Object|undefined>} Parsed response, or undefined on failure
 */
export const setQueueItemPriority = async (url, apiKey, nzo_id, priority) => {
    try {
        const response = await fetch(`${url}/api?mode=queue&name=priority&value=${encodeURIComponent(nzo_id)}&value2=${priority}&apikey=${apiKey}&output=json`, NO_CACHE);
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("SABnzbd Priority Error:", error);
        throw error;
    }
};

export const setSpeedLimit = async (url, apiKey, limit) => {
    try {
        const response = await fetch(`${url}/api?mode=config&name=speedlimit&value=${limit}&apikey=${apiKey}&output=json`, NO_CACHE);
        return await response.json();
    } catch (error) {
        console.error("SABnzbd Speed Limit Error:", error);
    }
};
