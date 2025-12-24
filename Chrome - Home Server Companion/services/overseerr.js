/**
 * Fetches requests (pending, approved, etc).
 * @param {string} url 
 * @param {string} apiKey 
 * @param {string} status - Filter status (pending, all, processing, available, unavailable)
 * @returns {Promise<Object>} Object containing 'results' array
 */
export const getRequests = async (url, apiKey, status = 'pending') => {
  if (!url || !apiKey) return { results: [] };
  if (!url.startsWith('http')) { url = 'http://' + url; }
  if (url.endsWith('/')) { url = url.slice(0, -1); }

  try {
    const filterParam = status === 'all' ? 'all' : status;
    const response = await fetch(`${url}/api/v1/request?take=50&filter=${filterParam}&sort=added&skip=0`, {
      headers: {
        'X-Api-Key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Overseerr API Error: ${response.status}`);
    }

    const data = await response.json();

    return data; 
  } catch (error) {
    console.error('Failed to fetch Overseerr requests:', error);
    return { results: [] };
  }
};

/**
 * Approves a request.
 * @param {string} url 
 * @param {string} apiKey 
 * @param {number} requestId 
 * @returns {Promise<boolean>} Success status
 */
export const approveRequest = async (url, apiKey, requestId) => {
    if (!url.startsWith('http')) { url = 'http://' + url; }
    if (url.endsWith('/')) { url = url.slice(0, -1); }
    try {
        const response = await fetch(`${url}/api/v1/request/${requestId}/approve`, {
            method: 'POST',
            headers: {
                'X-Api-Key': apiKey,
            }
        });
        if (!response.ok) throw new Error('Failed to approve');
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
};

/**
 * Declines a request.
 * @param {string} url 
 * @param {string} apiKey 
 * @param {number} requestId 
 * @returns {Promise<boolean>} Success status
 */
export const declineRequest = async (url, apiKey, requestId) => {
    if (!url.startsWith('http')) { url = 'http://' + url; }
    if (url.endsWith('/')) { url = url.slice(0, -1); }
    try {
        const response = await fetch(`${url}/api/v1/request/${requestId}/decline`, {
            method: 'POST',
            headers: {
                'X-Api-Key': apiKey,
            }
        });
         if (!response.ok) throw new Error('Failed to decline');
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
};

/**
 * Searches Overseerr (TMDB wrapper).
 * @param {string} url 
 * @param {string} apiKey 
 * @param {string} query 
 * @returns {Promise<Array>} List of results
 */
export async function search(url, apiKey, query) {
    if (!url.startsWith('http')) {
        url = 'http://' + url;
    }
    // Remove trailing slash
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }

    const endpoint = `${url}/api/v1/search?query=${encodeURIComponent(query)}`;


    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error("Overseerr Service: Search response not OK", response.status);
            throw new Error(`Overseerr Search Error: ${response.status}`);
        }

        const data = await response.json();

        return data.results || [];
    } catch (error) {
        console.error("Overseerr Service: Search logic failed", error);
        throw error;
    }
}

// Helper to get default profile/rootFolder
async function getDefaults(url, apiKey, mediaType) {
    try {
        const isMovie = mediaType === 'movie';
        const endpoint = isMovie ? 'radarr' : 'sonarr';
        
        // 1. Get Services (Servers)
        const servicesRes = await fetch(`${url}/api/v1/settings/${endpoint}`, { 
            headers: { 'X-Api-Key': apiKey } 
        });
        if (!servicesRes.ok) return null;
        
        const servicesData = await servicesRes.json();
        // Find default or first server
        let server = servicesData.find(s => s.isDefault) || servicesData[0];
        
        if (!server) return null;

        // 2. Get Profiles & Root Folders for this server
        // Endpoint: /api/v1/service/sonarr/{id}  or radarr
        
        const serverDetailsRes = await fetch(`${url}/api/v1/service/${endpoint}/${server.id}`, {
            headers: { 'X-Api-Key': apiKey }
        });
        
        if (!serverDetailsRes.ok) return null;
        const serverData = await serverDetailsRes.json();
        
        // Find default profile
        // serverData.profiles: []
        // serverData.rootFolders: []
        
        // How does Overseerr store defaults?
        // It seems they are inside the service settings object itself?
        // Let's recheck the first response.
        
        // Actually, the defaults are usually stored on the server object in the array "servicesData"
        // properties: activeProfileId, activeDirectory, isDefault
        
        const profileId = server.activeProfileId;
        const rootFolder = server.activeDirectory;
        
        if (profileId && rootFolder) {
            return {
                serverId: server.id,
                profileId: profileId,
                rootFolder: rootFolder
            };
        }
        
        // If not set on the server object, maybe detailed object?
        // Let's assume serverData has profiles and rootFolders, we pick first if defaults are missing?
        // No, that's dangerous.
        
        return null;

    } catch(e) { 
        console.error("Failed to fetch defaults", e);
        return null; 
    }
}

/**
 * Submits a new media request.
 * - Fetches defaults (Root Folder, Quality Profile) if needed to prevent errors.
 * @param {string} url 
 * @param {string} apiKey 
 * @param {Object} payload - { mediaId, mediaType, seasons? }
 * @returns {Promise<Object>} Response data
 */
export async function request(url, apiKey, payload) {
    if (!url.startsWith('http')) {
        url = 'http://' + url;
    }
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    
    // Ensure mediaType is lowercase
    if (payload.mediaType) payload.mediaType = payload.mediaType.toLowerCase();

    // SERVER CRASH FIX:
    // If the server crashes with "filter of undefined", it's likely missing defaults.
    // We try to fetch and inject them if user didn't provide them.
    if (!payload.rootFolder || !payload.profileId) {

         const defaults = await getDefaults(url, apiKey, payload.mediaType);
         if (defaults) {
             if (!payload.profileId) payload.profileId = defaults.profileId;
             if (!payload.rootFolder) payload.rootFolder = defaults.rootFolder;
             // Overseerr request endpoint also accepts 'serverId' sometimes? 
             // API docs say: mediaId, mediaType, rootFolder, profileId, serverId (optional)
             if (!payload.serverId) payload.serverId = defaults.serverId;
         }
    }



    const response = await fetch(`${url}/api/v1/request`, {
        method: 'POST',
        headers: {
            'X-Api-Key': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
         const errData = await response.json();
         throw new Error(errData.message || `Status ${response.status}`);
    }
    return await response.json();
}

export async function getMovie(url, apiKey, id) {
    if (!url.startsWith('http')) { url = 'http://' + url; }
    if (url.endsWith('/')) { url = url.slice(0, -1); }
    try {
        const response = await fetch(`${url}/api/v1/movie/${id}`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error("Failed to get movie details", e);
        return null;
    }
}

export async function getTv(url, apiKey, id) {
    if (!url.startsWith('http')) { url = 'http://' + url; }
    if (url.endsWith('/')) { url = url.slice(0, -1); }
    try {
        const response = await fetch(`${url}/api/v1/tv/${id}`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error("Failed to get tv details", e);
        return null;
    }
}

export async function getTrending(url, apiKey, page = 1) {
    if (!url.startsWith('http')) { url = 'http://' + url; }
    if (url.endsWith('/')) { url = url.slice(0, -1); }
    try {
        const response = await fetch(`${url}/api/v1/discover/trending?page=${page}`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) throw new Error("Failed to fetch trending");
        const data = await response.json();
        return data.results || [];
    } catch (e) {
        console.error("Failed to get trending", e);
        return [];
    }
}
