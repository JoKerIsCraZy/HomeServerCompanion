import { validateSearchQuery } from './inputValidation.js';

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
        // includeSeries/includeEpisode default to false, so the queue records
        // arrived with `series` and `episode` null — which is what the poster,
        // the show name and the season/episode line are read from. The view
        // papered over it by calling /parse on every release name to recover a
        // title it should already have had.
        //
        // pageSize is explicit because the server's default of 20 silently
        // truncated a busy queue.
        const params = new URLSearchParams({
            page: '1',
            pageSize: '100',
            includeSeries: 'true',
            includeEpisode: 'true'
        });
        const response = await fetch(`${url}/api/v3/queue?${params}`, {
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

/**
 * Fetches all series from library.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Array>} List of series
 */
export const getSonarrSeries = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/series`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error(`Series Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr Series Error:", error);
        throw error;
    }
};

/**
 * Fetches missing episodes (wanted).
 * @param {string} url 
 * @param {string} apiKey 
 * @param {number} pageSize 
 * @returns {Promise<Object>} Object with 'records'
 */
export const getSonarrMissing = async (url, apiKey, pageSize = 50) => {
    try {
        const response = await fetch(`${url}/api/v3/wanted/missing?page=1&pageSize=${pageSize}&sortKey=airDateUtc&sortDirection=descending&includeSeries=true`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error(`Missing Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr Missing Error:", error);
        throw error;
    }
};


/**
 * Posts a command and confirms the server accepted it.
 *
 * fetch() only rejects on a network fault, so the callers that used to POST
 * here directly reported "Search started" for a rejected API key, a 404 from
 * a wrong base path and a 500 alike.
 * @param {string} url
 * @param {string} apiKey
 * @param {Object} body - Command payload, `name` plus its arguments.
 * @returns {Promise<Object>} The queued command resource.
 */
const runSonarrCommand = async (url, apiKey, body) => {
    const response = await fetch(`${url}/api/v3/command`, {
        method: 'POST',
        headers: {
            'X-Api-Key': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Command Error: ${response.status}`);
    return await response.json();
};

/**
 * Triggers a search for specific episodes.
 * @param {string} url
 * @param {string} apiKey
 * @param {number[]} episodeIds
 * @returns {Promise<Object>}
 */
export const searchEpisodes = async (url, apiKey, episodeIds) => {
    try {
        return await runSonarrCommand(url, apiKey, { name: 'EpisodeSearch', episodeIds });
    } catch (error) {
        console.error("Sonarr Episode Search Error:", error);
        throw error;
    }
};

/**
 * Triggers Sonarr's own search across every missing episode.
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<Object>}
 */
export const searchAllMissingEpisodes = async (url, apiKey) => {
    try {
        return await runSonarrCommand(url, apiKey, { name: 'MissingEpisodeSearch' });
    } catch (error) {
        console.error("Sonarr Missing Search Error:", error);
        throw error;
    }
};

/**
 * Fetches the blocklist.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Object>} Object with 'records'
 */
export const getSonarrBlocklist = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/blocklist?page=1&pageSize=100&sortKey=date&sortDirection=descending`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error(`Blocklist Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr Blocklist Error:", error);
        throw error;
    }
};

/**
 * Deletes an item from the blocklist.
 * @param {string} url 
 * @param {string} apiKey 
 * @param {number} id - Blocklist Item ID
 */
export const deleteSonarrBlocklistItem = async (url, apiKey, id) => {
    try {
        const response = await fetch(`${url}/api/v3/blocklist/${id}`, {
            method: 'DELETE',
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error(`Delete Blocklist Error: ${response.status}`);
        return true;
    } catch (error) {
        console.error("Sonarr Delete Blocklist Error:", error);
        throw error;
    }
};

/**
 * Parses a title to find matching series info using Sonarr's parse endpoint
 * @param {string} url - Sonarr URL
 * @param {string} apiKey - API Key
 * @param {string} title - Release Title to parse
 * @returns {Promise<Object>} Parse result combining series/episode info
 */
export const parseTitle = async (url, apiKey, title) => {
    try {
        const validation = validateSearchQuery(title);
        if (!validation.valid) {
            throw new Error(`Invalid title: ${validation.error}`);
        }

        const response = await fetch(`${url}/api/v3/parse?title=${encodeURIComponent(title)}`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error(`Parse Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr Parse Error:", error);
        throw error;
    }
};

