import { normalizeUrl } from './utils.js';
import { validateSearchQuery } from './inputValidation.js';

/**
 * Test connection to Wizarr server
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<boolean>}
 */
export const testConnection = async (url, apiKey) => {
    if (!url || !apiKey) return false;
    url = normalizeUrl(url);

    try {
        const response = await fetch(`${url}/api/status`, {
            headers: {
                'X-API-Key': apiKey,
                'accept': 'application/json'
            }
        });
        return response.ok;
    } catch (error) {
        console.error('Wizarr connection test failed:', error);
        return false;
    }
};

/**
 * Get all configured servers (Plex/Jellyfin)
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<Array>}
 */
export const getServers = async (url, apiKey) => {
    if (!url || !apiKey) return [];
    url = normalizeUrl(url);

    try {
        const response = await fetch(`${url}/api/servers`, {
            headers: {
                'X-API-Key': apiKey,
                'accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Wizarr API Error: ${response.status}`);
        }

        const data = await response.json();
        // Response is { servers: [...], count: n }
        return Array.isArray(data.servers) ? data.servers : [];
    } catch (error) {
        console.error('Failed to fetch Wizarr servers:', error);
        return [];
    }
};

/**
 * Get libraries (all libraries from connected servers)
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<Array>}
 */
export const getLibraries = async (url, apiKey) => {
    if (!url || !apiKey) return [];
    url = normalizeUrl(url);

    try {
        const response = await fetch(`${url}/api/libraries`, {
            headers: {
                'X-API-Key': apiKey,
                'accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Wizarr API Error: ${response.status}`);
        }

        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Failed to fetch Wizarr libraries:', error);
        return [];
    }
};

/**
 * Get all invitations
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<Array>}
 */
export const getInvitations = async (url, apiKey) => {
    // A missing URL or key is a configuration fault, not an empty list. The
    // dashboard does not pre-check Wizarr's credentials, so returning [] here
    // showed an unconfigured Wizarr as online.
    if (!url || !apiKey) throw new Error('Wizarr is not configured');
    url = normalizeUrl(url);

    try {
        const response = await fetch(`${url}/api/invitations`, {
            headers: {
                'X-API-Key': apiKey,
                'accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Wizarr API Error: ${response.status}`);
        }

        const data = await response.json();
        // Wizarr answers with { invitations: [...] }. Only the bare-array
        // form was handled, so this returned [] against a healthy server -
        // the view does its own fetch and reads data.invitations, which is
        // how the discrepancy stayed hidden.
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.invitations)) return data.invitations;
        return [];
    } catch (error) {
        // Rethrow: the dashboard reads a rejection as "offline", and this
        // swallow made every Wizarr card green regardless of the server.
        console.error('Failed to fetch Wizarr invitations:', error);
        throw error;
    }
};

/**
 * Create a new invitation
 * @param {string} url
 * @param {string} apiKey
 * @param {Object} options - Invitation options
 * @param {string} options.server - Server ID (REQUIRED)
 * @param {string} [options.code] - Custom invite code (auto-generated if empty)
 * @param {Array<string>} [options.libraries] - Selected library IDs
 * @param {string} [options.expiresAt] - Expiration date (ISO string)
 * @param {string} [options.durationAt] - Membership duration date (ISO string)
 * @param {boolean} [options.unlimited] - Unlimited uses
 * @returns {Promise<Object>}
 */
export const createInvitation = async (url, apiKey, options) => {
    if (!url || !apiKey || !options.server) {
        throw new Error('URL, API Key, and Server are required');
    }
    url = normalizeUrl(url);

    // Validate code if provided
    if (options.code) {
        const validation = validateSearchQuery(options.code);
        if (!validation.valid) {
            throw new Error(`Invalid invite code: ${validation.error}`);
        }
    }

    // Generate random code if not provided
    const code = options.code || generateInviteCode();

    // Ensure server_id is a number
    const serverId = parseInt(options.server) || 1;

    // Build library_ids as integers
    const libraryIds = (options.libraries || []).map(id => parseInt(id) || id);

    const payload = {
        server_ids: [serverId],
        // The code was computed above and then never put in the payload, so a
        // code typed by the user was validated, discarded, and replaced by
        // whatever the server generated — while the UI reported success.
        code,
        expires_in_days: options.expiresInDays || 0,
        duration: options.durationDays ? `${options.durationDays} days` : "unlimited",
        unlimited: options.unlimited || false,
        library_ids: libraryIds,
        allow_downloads: false,
        allow_live_tv: false,
        allow_mobile_uploads: false
    };

    try {
        const response = await fetch(`${url}/api/invitations`, {
            method: 'POST',
            headers: {
                'X-API-Key': apiKey,
                'Content-Type': 'application/json',
                'accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Status ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Failed to create Wizarr invitation:', error);
        throw error;
    }
};

/**
 * Delete an invitation
 * @param {string} url
 * @param {string} apiKey
 * @param {string} inviteId
 * @returns {Promise<boolean>}
 */
export const deleteInvitation = async (url, apiKey, inviteId) => {
    if (!url || !apiKey || !inviteId) return false;
    url = normalizeUrl(url);

    // Validate inviteId to prevent path injection
    const sanitizedId = String(inviteId).replace(/[^\w\-]/g, '');

    try {
        const response = await fetch(`${url}/api/invitations/${sanitizedId}`, {
            method: 'DELETE',
            headers: {
                'X-API-Key': apiKey,
                'accept': 'application/json'
            }
        });

        return response.ok;
    } catch (error) {
        console.error('Failed to delete Wizarr invitation:', error);
        return false;
    }
};

/**
 * Generate a random invite code
 * @returns {string} 8-character alphanumeric code
 */
function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Get the full invite URL
 * @param {string} baseUrl - Wizarr base URL
 * @param {string} code - Invite code
 * @returns {string} Full invite URL
 */
export const getInviteUrl = (baseUrl, code) => {
    baseUrl = normalizeUrl(baseUrl);
    return `${baseUrl}/j/${code}`;
};
