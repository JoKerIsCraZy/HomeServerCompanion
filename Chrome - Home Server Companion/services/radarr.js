import { validateSearchQuery } from './inputValidation.js';

/**
 * Fetches the current activity queue.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Object>} Queue object
 */
export const getRadarrQueue = async (url, apiKey) => {
    try {
        // Just get recently added or just a few to show 'Recent'
        // Unfortunately /movie returns ALL movies. We should probably sort/limit client side or use a different endpoint if available.
        // There is no easy 'recent' endpoint without fetching all, but v3 implies we can just fetch all (lightweight) and sort.
        // OR we can use /history for changes.
        // Let's stick to 'In Cinemas' or 'Physical Release' from Calendar if possible, or just queue.
        // Actually, let's just show the Queue and maybe "Movies Missing" count.
        
        // For now, let's fetch Queue as it's most useful.
        // includeMovie defaults to false, so every queue record arrived with
        // `movie` null — the poster, title and year all read from it. The view
        // compensated by calling /parse on the release name for each item.
        //
        // pageSize is explicit because the server's default of 20 silently
        // truncated a busy queue.
        const queueParams = new URLSearchParams({
            page: '1',
            pageSize: '100',
            includeMovie: 'true'
        });
        const response = await fetch(`${url}/api/v3/queue?${queueParams}`, {
            headers: {
                'X-Api-Key': apiKey
            }
        });
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Radarr Queue Error:", error);
        throw error;
    }
};

// Getting "Recent" movies via history might be better than fetching 1000 movies
/**
 * Fetches history (imported/completed movies).
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Object>} History object
 */
export const getRadarrHistory = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/history?page=1&pageSize=200&sortKey=date&sortDirection=descending&includeMovie=true`, {
            headers: {
                'X-Api-Key': apiKey
            }
        });
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Radarr History Error:", error);
        throw error;
    }
}

/**
 * Fetches the calendar for the next 14 days.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Array>} List of movies
 */
export const getRadarrCalendar = async (url, apiKey) => {
    try {
        // Get calendar for next 30 days (Movies often have longer release windows than TV)
        const today = new Date().toISOString().split('T')[0];
        const nextMonth = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const response = await fetch(`${url}/api/v3/calendar?start=${today}&end=${nextMonth}`, {
            headers: {
                'X-Api-Key': apiKey
            }
        });
        if (!response.ok) throw new Error(`Calendar Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Radarr Calendar Error:", error);
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
        console.error("Radarr Delete Error:", error);
        throw error;
    }
};

/**
 * Fetches manual import options for a specific download
 * @param {string} url - Radarr URL
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
        console.error("Radarr Manual Import Options Error:", error);
        throw error;
    }
};

/**
 * Executes manual import with selected options
 * @param {string} url - Radarr URL
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
        console.error("Radarr Manual Import Execute Error:", error);
        throw error;
    }
};

/**
 * Fetches all available languages.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Array>} List of languages
 */
export const getRadarrLanguages = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/language`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error(`Languages Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Radarr Languages Error:", error);
        throw error;
    }
};

/**
 * Fetches all equality definitions.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Array>} List of quality definitions
 */
export const getRadarrQualities = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/qualitydefinition`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error(`Qualities Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Radarr Qualities Error:", error);
        throw error;
    }
};

/**
 * Fetches all movies from library.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Array>} List of movies
 */
export const getAllMovies = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/movie`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error(`All Movies Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Radarr ALL Movies Error:", error);
        throw error;
    }
};

/**
 * Fetches missing movies.
 * @param {string} url 
 * @param {string} apiKey 
 * @param {number} pageSize 
 * @returns {Promise<Object>} Object with 'records'
 */
export const getRadarrMissing = async (url, apiKey, pageSize = 50) => {
    try {
        // sortKey has to name a column of the joined MovieMetadata table.
        // `releaseDate` is a computed field, not a column: Radarr accepts the
        // request, ignores the key and falls back to sort title. The tab was
        // therefore showing the last 50 movies alphabetically — the Z end of
        // the library — under a header that claimed date order.
        const response = await fetch(`${url}/api/v3/wanted/missing?page=1&pageSize=${pageSize}&sortKey=movieMetadata.digitalRelease&sortDirection=descending&includeMovie=true`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error(`Missing Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Radarr Missing Error:", error);
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
const runRadarrCommand = async (url, apiKey, body) => {
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
 * Triggers a search for specific movies.
 * @param {string} url
 * @param {string} apiKey
 * @param {number[]} movieIds
 * @returns {Promise<Object>}
 */
export const searchMovies = async (url, apiKey, movieIds) => {
    try {
        return await runRadarrCommand(url, apiKey, { name: 'MoviesSearch', movieIds });
    } catch (error) {
        console.error("Radarr Movie Search Error:", error);
        throw error;
    }
};

/**
 * Triggers Radarr's own search across every missing movie.
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<Object>}
 */
export const searchAllMissingMovies = async (url, apiKey) => {
    try {
        return await runRadarrCommand(url, apiKey, { name: 'MissingMoviesSearch' });
    } catch (error) {
        console.error("Radarr Missing Search Error:", error);
        throw error;
    }
};

/**
 * Fetches the blocklist.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Object>} Object with 'records'
 */
export const getRadarrBlocklist = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/blocklist?page=1&pageSize=100&sortKey=date&sortDirection=descending`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error(`Blocklist Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Radarr Blocklist Error:", error);
        throw error;
    }
};

/**
 * Deletes an item from the blocklist.
 * @param {string} url 
 * @param {string} apiKey 
 * @param {number} id - Blocklist Item ID
 */
export const deleteRadarrBlocklistItem = async (url, apiKey, id) => {
    try {
        const response = await fetch(`${url}/api/v3/blocklist/${id}`, {
            method: 'DELETE',
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error(`Delete Blocklist Error: ${response.status}`);
        return true;
    } catch (error) {
        console.error("Radarr Delete Blocklist Error:", error);
        throw error;
    }
};

/**
 * Parses release name to extract movie information
 * @param {string} url - Radarr URL
 * @param {string} apiKey - API Key
 * @param {string} title - Release name to parse
 * @returns {Promise<Object>} Parsed title information
 */
export const parseTitle = async (url, apiKey, title) => {
    try {
        const validation = validateSearchQuery(title);
        if (!validation.valid) {
            throw new Error(`Invalid title: ${validation.error}`);
        }

        const query = encodeURIComponent(title);
        const response = await fetch(`${url}/api/v3/parse?title=${query}`, {
            headers: {
                'X-Api-Key': apiKey
            }
        });
        if (!response.ok) throw new Error(`Parse Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Radarr Parse Error:", error);
        return null;
    }
};
