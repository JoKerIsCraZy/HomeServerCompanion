// services/tracearr.js
/**
 * Tracearr API Integration
 * Content tracking service
 */

import { validateSearchQuery } from './inputValidation.js';

/**
 * Get Tracearr statistics
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token (trr_pub_xxx)
 * @returns {Promise<Object>} Statistics
 */
export const getTracearrStats = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v1/public/stats`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) throw new Error(`Stats Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Tracearr Stats Error:", error);
        throw error;
    }
};

/**
 * Get Tracearr health/status
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @returns {Promise<Object>} Health status
 */
export const getTracearrStatus = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v1/public/health`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) throw new Error(`Health Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Tracearr Health Error:", error);
        throw error;
    }
};

/**
 * Get today's statistics
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @returns {Promise<Object>} Today's stats
 */
export const getTracearrStatsToday = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v1/public/stats/today`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) throw new Error(`Today Stats Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Tracearr Today Stats Error:", error);
        throw error;
    }
};

/**
 * Get active streams
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @returns {Promise<Array>} Active streams
 */
export const getTracearrStreams = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v1/public/streams`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) throw new Error(`Streams Error: ${response.status}`);
        const result = await response.json();
        // API returns { data: [...], summary: {...} }
        return result.data || [];
    } catch (error) {
        console.error("Tracearr Streams Error:", error);
        throw error;
    }
};

/**
 * Get playback activity
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @returns {Promise<Object>} Activity trends
 */
export const getTracearrActivity = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v1/public/activity`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) throw new Error(`Activity Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Tracearr Activity Error:", error);
        throw error;
    }
};

/**
 * Get users list
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @returns {Promise<Array>} Users
 */
export const getTracearrUsers = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v1/public/users`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) throw new Error(`Users Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Tracearr Users Error:", error);
        throw error;
    }
};

/**
 * Get violations
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @returns {Promise<Array>} Rule violations
 */
export const getTracearrViolations = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v1/public/violations`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) throw new Error(`Violations Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Tracearr Violations Error:", error);
        throw error;
    }
};

/**
 * Get session history
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @returns {Promise<Object>} History
 */
export const getTracearrHistory = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v1/public/history`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!response.ok) throw new Error(`History Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Tracearr History Error:", error);
        throw error;
    }
};

/**
 * Terminate stream
 * @param {string} url - Tracearr URL
 * @param {string} apiKey - Bearer token
 * @param {string} streamId - Stream ID to terminate
 * @param {string} reason - Optional termination reason
 * @returns {Promise<Object>} Result
 */
export const terminateTracearrStream = async (url, apiKey, streamId, reason = null) => {
    try {
        let body = undefined;

        // Validate reason if provided
        if (reason) {
            const validation = validateSearchQuery(reason);
            if (!validation.valid) {
                throw new Error(`Invalid reason: ${validation.error}`);
            }
            body = JSON.stringify({ reason });
        }

        const response = await fetch(`${url}/api/v1/public/streams/${streamId}/terminate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body
        });
        if (!response.ok) throw new Error(`Terminate Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Tracearr Terminate Error:", error);
        throw error;
    }
};
