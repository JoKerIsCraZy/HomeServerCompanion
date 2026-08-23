import { normalizeUrl } from './utils.js';

// ==================== AUTHENTICATION ====================

/**
 * Login with local Seerr account (email/password)
 * @param {string} baseUrl
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>} User object if successful
 */
export async function loginLocal(baseUrl, email, password) {
    baseUrl = normalizeUrl(baseUrl);
    const response = await fetch(`${baseUrl}/api/v1/auth/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include'
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `Login failed: ${response.status}`);
    }

    return await response.json();
}

/**
 * Login with Plex token (from OAuth flow)
 * @param {string} baseUrl
 * @param {string} authToken - Plex auth token
 * @returns {Promise<Object>} User object if successful
 */
export async function loginPlex(baseUrl, authToken) {
    baseUrl = normalizeUrl(baseUrl);
    const response = await fetch(`${baseUrl}/api/v1/auth/plex`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken }),
        credentials: 'include'
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `Plex login failed: ${response.status}`);
    }

    return await response.json();
}

/**
 * Check if current session is valid
 * @param {string} baseUrl
 * @returns {Promise<Object|null>} User object if logged in, null otherwise
 */
export async function checkSession(baseUrl) {
    baseUrl = normalizeUrl(baseUrl);
    try {
        const response = await fetch(`${baseUrl}/api/v1/auth/me`, {
            credentials: 'include'
        });

        if (!response.ok) return null;
        return await response.json();
    } catch {
        return null;
    }
}

/**
 * Logout from Seerr
 * @param {string} baseUrl
 */
export async function logout(baseUrl) {
    baseUrl = normalizeUrl(baseUrl);
    try {
        await fetch(`${baseUrl}/api/v1/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (e) {
        console.error('Logout error:', e);
    }
}

/**
 * Get fetch options based on auth method
 * @param {string} authMethod - 'apikey', 'local', or 'plex'
 * @param {string} apiKey - API key (only used if authMethod is 'apikey')
 * @returns {Object} Fetch options with appropriate headers
 */
export function getAuthFetchOptions(authMethod, apiKey) {
    if (authMethod === 'apikey' && apiKey) {
        return {
            headers: { 'X-Api-Key': apiKey }
        };
    } else {
        // Cookie-based auth for local/plex
        return {
            credentials: 'include'
        };
    }
}

// ==================== API FUNCTIONS ====================

/**
 * Fetches trending media from Seerr (TMDB discover/trending wrapper).
 * @param {string} url
 * @param {string} apiKey
 * @param {number} page - Page number
 * @param {string} authMethod - 'apikey', 'local', or 'plex'
 * @returns {Promise<Array>} List of trending items
 */
export async function getTrending(url, apiKey, page = 1, authMethod = 'apikey') {
    url = normalizeUrl(url);
    const fetchOptions = getAuthFetchOptions(authMethod, apiKey);

    try {
        const response = await fetch(`${url}/api/v1/discover/trending?page=${page}`, fetchOptions);

        if (!response.ok) {
            throw new Error(`Seerr Trending Error: ${response.status}`);
        }

        const data = await response.json();
        return data.results || [];
    } catch (error) {
        // Rethrow. Returning [] here rendered an empty Discover grid that was
        // indistinguishable from "nothing is trending", and the caller
        // already has a catch that shows a proper error banner.
        console.error('Failed to fetch Seerr trending:', error);
        throw error;
    }
}

/**
 * Fetches requests (pending, approved, etc.).
 * @param {string} url
 * @param {string} apiKey
 * @param {string} status - Filter status (pending, all, processing, available, unavailable)
 * @param {string} authMethod - 'apikey', 'local', or 'plex'
 * @returns {Promise<Object>} Object containing 'results' array
 */
export async function getRequests(url, apiKey, status = 'pending', authMethod = 'apikey') {
    if (!url) return { results: [] };
    url = normalizeUrl(url);
    const fetchOptions = getAuthFetchOptions(authMethod, apiKey);

    try {
        const filterParam = status === 'all' ? 'all' : status;
        const response = await fetch(`${url}/api/v1/request?take=50&filter=${filterParam}&sort=added&skip=0`, fetchOptions);

        if (!response.ok) {
            throw new Error(`Seerr API Error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        // Rethrow. The dashboard decides a service is online by whether this
        // rejects, so swallowing the error reported Seerr as online with 0
        // pending requests whether the server was unreachable, the API key
        // rejected, or there really were none. The Requests view has its own
        // catch, which now finally gets to run.
        console.error('Failed to fetch Seerr requests:', error);
        throw error;
    }
}

/**
 * Approves a request.
 * @param {string} url
 * @param {string} apiKey
 * @param {number} requestId
 * @param {string} authMethod
 * @returns {Promise<boolean>} Success status
 */
export async function approveRequest(url, apiKey, requestId, authMethod = 'apikey') {
    url = normalizeUrl(url);
    const fetchOptions = getAuthFetchOptions(authMethod, apiKey);

    try {
        const response = await fetch(`${url}/api/v1/request/${requestId}/approve`, {
            method: 'POST',
            ...fetchOptions
        });
        if (!response.ok) throw new Error(`Failed to approve: ${response.status}`);
        return true;
    } catch (e) {
        // Rethrow, like every other call in this file. Returning false left
        // the caller with no reason to show and, worse, an easy failure to
        // ignore - which is exactly what happened.
        console.error(e);
        throw e;
    }
}

/**
 * Declines a request.
 * @param {string} url
 * @param {string} apiKey
 * @param {number} requestId
 * @param {string} authMethod
 * @returns {Promise<boolean>} Success status
 */
export async function declineRequest(url, apiKey, requestId, authMethod = 'apikey') {
    url = normalizeUrl(url);
    const fetchOptions = getAuthFetchOptions(authMethod, apiKey);

    try {
        const response = await fetch(`${url}/api/v1/request/${requestId}/decline`, {
            method: 'POST',
            ...fetchOptions
        });
        if (!response.ok) throw new Error(`Failed to decline: ${response.status}`);
        return true;
    } catch (e) {
        console.error(e);
        throw e;
    }
}

/**
 * Searches Seerr (TMDB wrapper).
 * @param {string} url
 * @param {string} apiKey
 * @param {string} query
 * @param {string} authMethod
 * @returns {Promise<Array>} List of results
 */
export async function search(url, apiKey, query, authMethod = 'apikey') {
    url = normalizeUrl(url);
    const fetchOptions = getAuthFetchOptions(authMethod, apiKey);

    // Merge Content-Type header with auth headers
    const headers = { 'Content-Type': 'application/json', ...(fetchOptions.headers || {}) };

    try {
        const response = await fetch(`${url}/api/v1/search?query=${encodeURIComponent(query)}`, {
            method: 'GET',
            headers,
            credentials: fetchOptions.credentials
        });

        if (!response.ok) {
            console.error("Seerr Service: Search response not OK", response.status);
            throw new Error(`Seerr Search Error: ${response.status}`);
        }

        const data = await response.json();
        return data.results || [];
    } catch (error) {
        console.error("Seerr Service: Search logic failed", error);
        throw error;
    }
}

// Helper to get default profile/rootFolder
async function getDefaults(url, apiKey, mediaType, authMethod = 'apikey') {
    const fetchOptions = getAuthFetchOptions(authMethod, apiKey);

    try {
        const isMovie = mediaType === 'movie';
        const endpoint = isMovie ? 'radarr' : 'sonarr';

        const servicesRes = await fetch(`${url}/api/v1/settings/${endpoint}`, fetchOptions);
        if (!servicesRes.ok) return null;

        const servicesData = await servicesRes.json();
        let server = servicesData.find(s => s.isDefault) || servicesData[0];
        if (!server) return null;

        const serverDetailsRes = await fetch(`${url}/api/v1/service/${endpoint}/${server.id}`, fetchOptions);
        if (!serverDetailsRes.ok) return null;

        const profileId = server.activeProfileId;
        const rootFolder = server.activeDirectory;

        if (profileId && rootFolder) {
            return {
                serverId: server.id,
                profileId: profileId,
                rootFolder: rootFolder
            };
        }

        return null;
    } catch(e) {
        console.error("Failed to fetch defaults", e);
        return null;
    }
}

/**
 * Submits a new media request.
 * @param {string} url
 * @param {string} apiKey
 * @param {Object} payload - { mediaId, mediaType, seasons? }
 * @param {string} authMethod
 * @returns {Promise<Object>} Response data
 */
export async function request(url, apiKey, payload, authMethod = 'apikey') {
    url = normalizeUrl(url);
    const fetchOptions = getAuthFetchOptions(authMethod, apiKey);

    if (payload.mediaType) payload.mediaType = payload.mediaType.toLowerCase();

    if (!payload.rootFolder || !payload.profileId) {
        const defaults = await getDefaults(url, apiKey, payload.mediaType, authMethod);
        if (defaults) {
            if (!payload.profileId) payload.profileId = defaults.profileId;
            if (!payload.rootFolder) payload.rootFolder = defaults.rootFolder;
            if (!payload.serverId) payload.serverId = defaults.serverId;
        }
    }

    const headers = { 'Content-Type': 'application/json', ...(fetchOptions.headers || {}) };

    const response = await fetch(`${url}/api/v1/request`, {
        method: 'POST',
        headers,
        credentials: fetchOptions.credentials,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        // Guarded. An error body is not always JSON - a reverse proxy answers
        // 502 in HTML, a rejected key can answer 401 with nothing at all - and
        // response.json() throws on those. That SyntaxError then replaced the
        // real failure, so the user was told "Unexpected token '<'" instead of
        // the status that would have explained it.
        let detail = '';
        try {
            const errData = await response.json();
            detail = errData?.message || '';
        } catch {
            // Body was not JSON; the status is all we have, and it is enough.
        }
        throw new Error(detail || `Status ${response.status}`);
    }
    return await response.json();
}

/**
 * Get movie details by TMDB ID.
 * @param {string} url
 * @param {string} apiKey
 * @param {number} id - TMDB movie ID
 * @param {string} authMethod
 * @returns {Promise<Object|null>}
 */
export async function getMovie(url, apiKey, id, authMethod = 'apikey') {
    url = normalizeUrl(url);
    const fetchOptions = getAuthFetchOptions(authMethod, apiKey);

    try {
        const response = await fetch(`${url}/api/v1/movie/${id}`, fetchOptions);
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error("Failed to get movie details", e);
        return null;
    }
}

/**
 * Get TV show details by TMDB ID.
 * @param {string} url
 * @param {string} apiKey
 * @param {number} id - TMDB TV ID
 * @param {string} authMethod
 * @returns {Promise<Object|null>}
 */
export async function getTv(url, apiKey, id, authMethod = 'apikey') {
    url = normalizeUrl(url);
    const fetchOptions = getAuthFetchOptions(authMethod, apiKey);

    try {
        const response = await fetch(`${url}/api/v1/tv/${id}`, fetchOptions);
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error("Failed to get tv details", e);
        return null;
    }
}
