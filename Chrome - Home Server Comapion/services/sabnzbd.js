import { formatSize, formatTime } from './utils.js';

// Queue
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
export const pauseQueue = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api?mode=pause&apikey=${apiKey}&output=json`);
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
