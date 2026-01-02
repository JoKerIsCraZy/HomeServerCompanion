// Portainer API Service

/**
 * Makes an authenticated request to the Portainer API.
 * @param {string} url - Base Portainer URL
 * @param {string} token - API Access Token
 * @param {string} endpoint - API endpoint path
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} Response data
 */
async function portainerFetch(url, token, endpoint, options = {}) {
    const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const headers = {
        'X-API-Key': token,
        ...options.headers
    };

    // Only set Content-Type if body is present, otherwise let browser/fetch handle it (or omit for empty)
    if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${baseUrl}/api${endpoint}`, {
        ...options,
        headers,
        credentials: 'omit' // Don't send cookies - prevents CSRF token requirement
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Portainer API Error ${response.status}: ${errorText}`);
    }
    
    return response.json();
}

/**
 * Checks if Portainer is reachable and token is valid.
 * @param {string} url - Portainer URL
 * @param {string} token - API Token
 * @returns {Promise<boolean>} True if reachable
 */
export async function checkPortainerStatus(url, token) {
    try {
        await portainerFetch(url, token, '/status');
        return true;
    } catch (error) {
        console.error("Portainer Status Check Error:", error);
        return false;
    }
}

/**
 * Gets list of endpoints (Docker environments).
 * @param {string} url - Portainer URL
 * @param {string} token - API Token
 * @returns {Promise<Array>} List of endpoints
 */
export async function getEndpoints(url, token) {
    try {
        return await portainerFetch(url, token, '/endpoints');
    } catch (error) {
        console.error("Portainer Endpoints Error:", error);
        throw error;
    }
}

/**
 * Gets containers from a specific endpoint.
 * @param {string} url - Portainer URL
 * @param {string} token - API Token
 * @param {number} endpointId - Endpoint ID (default: 1)
 * @returns {Promise<Array>} List of containers
 */
export async function getContainers(url, token, endpointId = 1) {
    try {
        // Using Portainer's Docker proxy endpoint
        return await portainerFetch(url, token, `/endpoints/${endpointId}/docker/containers/json?all=true`);
    } catch (error) {
        console.error("Portainer Containers Error:", error);
        throw error;
    }
}

/**
 * Gets stacks from a specific endpoint.
 * @param {string} url - Portainer URL
 * @param {string} token - API Token
 * @returns {Promise<Array>} List of stacks
 */
export async function getStacks(url, token) {
    try {
        return await portainerFetch(url, token, '/stacks');
    } catch (error) {
        console.error("Portainer Stacks Error:", error);
        throw error;
    }
}

/**
 * Controls a container (start, stop, restart, pause, unpause).
 * @param {string} url - Portainer URL
 * @param {string} token - API Token
 * @param {number} endpointId - Endpoint ID
 * @param {string} containerId - Container ID
 * @param {string} action - Action: start, stop, restart, pause, unpause
 * @returns {Promise<Object>} Result
 */
export async function controlContainer(url, token, endpointId, containerId, action) {
    try {
        const response = await portainerFetch(url, token, 
            `/endpoints/${endpointId}/docker/containers/${containerId}/${action}`,
            { method: 'POST' }
        );
        return response;
    } catch (error) {
        // Docker API returns empty response on success for some actions
        if (error.message.includes('Unexpected end of JSON')) {
            return { success: true };
        }
        console.error(`Portainer Container ${action} Error:`, error);
        throw error;
    }
}

/**
 * Controls a stack (start, stop).
 * @param {string} url - Portainer URL
 * @param {string} token - API Token
 * @param {number} stackId - Stack ID
 * @param {string} action - Action: start, stop
 * @param {number} endpointId - Endpoint ID
 * @returns {Promise<Object>} Result
 */
export async function controlStack(url, token, stackId, action, endpointId = 1) {
    try {
        return await portainerFetch(url, token, 
            `/stacks/${stackId}/${action}?endpointId=${endpointId}`,
            { method: 'POST' }
        );
    } catch (error) {
        console.error(`Portainer Stack ${action} Error:`, error);
        throw error;
    }
}

/**
 * Gets system info from endpoint.
 * @param {string} url - Portainer URL
 * @param {string} token - API Token
 * @param {number} endpointId - Endpoint ID
 * @returns {Promise<Object>} Docker system info
 */
export async function getSystemInfo(url, token, endpointId = 1) {
    try {
        return await portainerFetch(url, token, `/endpoints/${endpointId}/docker/info`);
    } catch (error) {
        console.error("Portainer System Info Error:", error);
        throw error;
    }
}
