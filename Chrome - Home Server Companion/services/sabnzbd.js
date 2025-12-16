import { formatSize, formatTime } from './utils.js';

// Queue
/**
 * Fetches the current download queue.
 * @param {string} url - SABnzbd URL
 * @param {string} apiKey - API Key
 * @returns {Promise<Array>} List of queue slots
 */
export const getSabnzbdQueue = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api?mode=queue&apikey=${apiKey}&output=json`);
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
        const response = await fetch(`${url}/api?mode=history&output=json&apikey=${apiKey}&limit=${limit}`);
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
        const response = await fetch(apiUrl);
        return await response.json();
    } catch (error) {
        console.error("SABnzbd Pause Error:", error);
    }
};

export const resumeQueue = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api?mode=resume&apikey=${apiKey}&output=json`);
        return await response.json();
    } catch (error) {
        console.error("SABnzbd Resume Error:", error);
    }
};

export const deleteQueueItem = async (url, apiKey, nzo_id) => {
    try {
        const response = await fetch(`${url}/api?mode=queue&name=delete&value=${nzo_id}&apikey=${apiKey}&output=json`);
        return await response.json();
    } catch (error) {
        console.error("SABnzbd Delete Error:", error);
    }
};

export const deleteHistoryItem = async (url, apiKey, nzo_id) => {
    try {
        const response = await fetch(`${url}/api?mode=history&name=delete&value=${nzo_id}&apikey=${apiKey}&output=json`);
        return await response.json();
    } catch (error) {
        console.error("SABnzbd History Delete Error:", error);
        throw error;
    }
};
