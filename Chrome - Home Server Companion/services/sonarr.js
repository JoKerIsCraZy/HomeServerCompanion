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

/**
 * Fetches manual import options for a specific download
 * @param {string} url - Sonarr URL
 * @param {string} apiKey - API Key
 * @param {string} downloadId - Download ID from queue item
 * @param {string} folder - Download folder path
 * @returns {Promise<Array>} List of files with import options
 */
export const getManualImportOptions = async (url, apiKey, downloadId, folder) => {
    try {
        let endpoint = `${url}/api/v3/manualimport?downloadId=${encodeURIComponent(downloadId)}`;
        if (folder) {
            endpoint += `&folder=${encodeURIComponent(folder)}`;
        }
        
        const response = await fetch(endpoint, {
            headers: {
                'X-Api-Key': apiKey
            }
        });
        if (!response.ok) throw new Error(`Manual Import Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr Manual Import Options Error:", error);
        throw error;
    }
};

/**
 * Executes manual import with selected options
 * @param {string} url - Sonarr URL
 * @param {string} apiKey - API Key
 * @param {Array} files - Array of file objects with import decisions
 * @returns {Promise<Object>} Import result
 */
export const executeManualImport = async (url, apiKey, files) => {
    try {
        const response = await fetch(`${url}/api/v3/command`, {
            method: 'POST',
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'ManualImport',
                files: files,
                importMode: 'auto'
            })
        });
        if (!response.ok) throw new Error(`Manual Import Execute Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr Manual Import Execute Error:", error);
        throw error;
    }
};

/**
 * Fetches all available languages.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Array>} List of languages
 */
export const getSonarrLanguages = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/language`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error(`Languages Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr Languages Error:", error);
        throw error;
    }
};

/**
 * Fetches all equality definitions.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Array>} List of quality definitions
 */
export const getSonarrQualities = async (url, apiKey) => {
    try {
        // qualitydefinition gives us the list of qualities (id, name, title)
        const response = await fetch(`${url}/api/v3/qualitydefinition`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error(`Qualities Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr Qualities Error:", error);
        throw error;
    }
};
