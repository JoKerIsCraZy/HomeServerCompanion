/**
 * Fetches the Sonarr calendar for the next 14 days.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Array>} List of episodes
 */
export const getSonarrCalendar = async (url, apiKey) => {
    try {
        // Get calendar for next 7 days
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const response = await fetch(`${url}/api/v3/calendar?start=${today}&end=${nextWeek}&includeSeries=true`, {
            headers: {
                'X-Api-Key': apiKey
            }
        });
        if (!response.ok) throw new Error(`Calendar Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr Calendar Error:", error);
        throw error;
    }
};

/**
 * Fetches the current activity queue.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Object>} Queue object containing 'records'
 */
export const getSonarrQueue = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/queue`, {
            headers: {
                'X-Api-Key': apiKey
            }
        });
        if (!response.ok) throw new Error(`Queue Error: ${response.status}`);
        return await response.json();
    } catch (error) {
         console.error("Sonarr Queue Error:", error);
         throw error;
    }
};

export const getSonarrStatus = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/system/status`, {
            headers: {
                'X-Api-Key': apiKey
            }
        });
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr Status Error:", error);
        throw error;
    }
};

/**
 * Fetches recent history (downloads).
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Object>} History object containing 'records'
 */
export const getSonarrHistory = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/history?page=1&pageSize=200&sortKey=date&sortDirection=descending&includeSeries=true&includeEpisode=true`, {
            headers: {
                'X-Api-Key': apiKey
            }
        });
        if (!response.ok) throw new Error(`History Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr History Error:", error);
        throw error;
    }
};

export const deleteQueueItem = async (url, apiKey, id, removeFromClient = true, blocklist = false) => {
    try {
        const query = `?removeFromClient=${removeFromClient}&blocklist=${blocklist}`;
        const response = await fetch(`${url}/api/v3/queue/${id}${query}`, {
            method: 'DELETE',
            headers: {
                'X-Api-Key': apiKey
            }
        });
        if (!response.ok) throw new Error(`Delete Error: ${response.status}`);
        const text = await response.text();
        return text ? JSON.parse(text) : {};
    } catch (error) {
         console.error("Sonarr Delete Queue Error:", error);
         throw error;
    }
};
