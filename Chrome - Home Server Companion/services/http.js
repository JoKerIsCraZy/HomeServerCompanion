/**
 * HTTP Utility Module
 * Provides standardized fetch with timeout, error handling, and retry logic
 */

const DEFAULT_TIMEOUT = 10000; // 10 seconds

/**
 * Creates an AbortController with timeout
 * @param {number} timeout - Timeout in milliseconds
 * @returns {{ controller: AbortController, timeoutId: number }}
 */
function createTimeoutController(timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    return { controller, timeoutId };
}

/**
 * Performs a fetch request with timeout and standardized error handling
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} [options.timeout] - Timeout in milliseconds (default: 10000)
 * @param {Object} [options.headers] - Request headers
 * @param {string} [options.method] - HTTP method (default: GET)
 * @param {string|Object} [options.body] - Request body
 * @param {string} [options.errorContext] - Context for error messages (e.g., "Sonarr Queue")
 * @returns {Promise<any>} - Parsed JSON response
 */
export async function fetchWithTimeout(url, options = {}) {
    const {
        timeout = DEFAULT_TIMEOUT,
        headers = {},
        method = 'GET',
        body,
        errorContext = 'API'
    } = options;

    const { controller, timeoutId } = createTimeoutController(timeout);

    try {
        const fetchOptions = {
            method,
            headers,
            signal: controller.signal
        };

        if (body) {
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`${errorContext} Error: ${response.status}`);
        }

        // Handle empty responses
        const text = await response.text();
        return text ? JSON.parse(text) : {};

    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            console.error(`${errorContext}: Request timed out after ${timeout}ms`);
            throw new Error(`${errorContext}: Request timed out`);
        }

        console.error(`${errorContext} Error:`, error);
        throw error;
    }
}

/**
 * Performs a GET request with X-Api-Key header (for Sonarr, Radarr, Prowlarr, Overseerr)
 * @param {string} url - The URL to fetch
 * @param {string} apiKey - The API key
 * @param {Object} [options] - Additional options
 * @returns {Promise<any>} - Parsed JSON response
 */
export async function apiGet(url, apiKey, options = {}) {
    return fetchWithTimeout(url, {
        ...options,
        headers: {
            'X-Api-Key': apiKey,
            ...options.headers
        }
    });
}

/**
 * Performs a POST request with X-Api-Key header
 * @param {string} url - The URL to fetch
 * @param {string} apiKey - The API key
 * @param {Object} body - Request body
 * @param {Object} [options] - Additional options
 * @returns {Promise<any>} - Parsed JSON response
 */
export async function apiPost(url, apiKey, body, options = {}) {
    return fetchWithTimeout(url, {
        ...options,
        method: 'POST',
        headers: {
            'X-Api-Key': apiKey,
            'Content-Type': 'application/json',
            ...options.headers
        },
        body
    });
}

/**
 * Performs a DELETE request with X-Api-Key header
 * @param {string} url - The URL to fetch
 * @param {string} apiKey - The API key
 * @param {Object} [options] - Additional options
 * @returns {Promise<any>} - Parsed JSON response
 */
export async function apiDelete(url, apiKey, options = {}) {
    return fetchWithTimeout(url, {
        ...options,
        method: 'DELETE',
        headers: {
            'X-Api-Key': apiKey,
            ...options.headers
        }
    });
}

/**
 * Performs a GET request with apikey query parameter (for SABnzbd, Tautulli)
 * @param {string} url - The base URL (without apikey param)
 * @param {string} apiKey - The API key
 * @param {Object} [options] - Additional options
 * @returns {Promise<any>} - Parsed JSON response
 */
export async function queryGet(url, apiKey, options = {}) {
    const separator = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${separator}apikey=${apiKey}`;
    return fetchWithTimeout(fullUrl, options);
}
