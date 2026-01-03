// Docker Search Service - Aggregates containers from Unraid + Portainer instances

import * as Unraid from './unraid.js';
import * as Portainer from './portainer.js';

/**
 * Searches all Docker containers across Unraid and all Portainer instances.
 * @param {Object} configs - Extension configuration from chrome.storage.sync
 * @param {string} query - Search query (case-insensitive)
 * @returns {Promise<Array>} Unified container results
 */
export async function searchAllContainers(configs, query) {
    const results = [];
    const searchLower = query.toLowerCase();
    const fetchPromises = [];

    // 1. Unraid Docker containers
    if (configs.unraidUrl && configs.unraidKey && configs.unraidEnabled !== false) {
        fetchPromises.push(
            fetchUnraidContainers(configs.unraidUrl, configs.unraidKey, searchLower)
                .catch(err => {
                    console.warn('Unraid Docker fetch failed:', err);
                    return [];
                })
        );
    }

    // 2. Portainer instances
    const portainerInstances = (configs.portainerInstances || []).filter(i => i.url && i.key);
    if (configs.portainerEnabled !== false) {
        portainerInstances.forEach(inst => {
            fetchPromises.push(
                fetchPortainerContainers(inst, searchLower)
                    .catch(err => {
                        console.warn(`Portainer ${inst.name} fetch failed:`, err);
                        return [];
                    })
            );
        });
    }

    // Wait for all fetches
    const allResults = await Promise.all(fetchPromises);
    
    // Flatten and return
    return allResults.flat();
}

/**
 * Fetches and filters containers from Unraid.
 */
async function fetchUnraidContainers(url, key, searchLower) {
    const data = await Unraid.getSystemData(url, key);
    if (!data.dockers || data.dockers.length === 0) return [];

    return data.dockers
        .filter(c => c.name.toLowerCase().includes(searchLower))
        .map(c => ({
            id: c.id,
            name: c.name,
            image: c.image,
            state: c.running ? 'running' : 'stopped',
            status: c.status,
            source: 'unraid',
            sourceName: 'Unraid',
            sourceIcon: 'icons/unraid.png',
            webui: c.webui || null,
            // For actions
            apiUrl: url,
            apiKey: key,
            endpointId: null // Not needed for Unraid
        }));
}

/**
 * Fetches and filters containers from a Portainer instance.
 */
async function fetchPortainerContainers(inst, searchLower) {
    try {
        // Get endpoints first
        const endpoints = await Portainer.getEndpoints(inst.url, inst.key);
        if (!endpoints || endpoints.length === 0) return [];

        const endpointId = endpoints[0].Id;
        const containers = await Portainer.getContainers(inst.url, inst.key, endpointId);

        return containers
            .filter(c => {
                const name = (c.Names && c.Names[0]) ? c.Names[0].replace(/^\//, '') : '';
                return name.toLowerCase().includes(searchLower);
            })
            .map(c => {
                // Try to construct webui from ports
                let webui = null;
                if (c.Ports && c.Ports.length > 0) {
                    const port = c.Ports.find(p => p.PublicPort && p.Type === 'tcp') || c.Ports.find(p => p.PublicPort);
                    if (port && port.PublicPort) {
                        const host = new URL(inst.url).hostname;
                        webui = `http://${host}:${port.PublicPort}`;
                    }
                }
                
                return {
                    id: c.Id,
                    name: (c.Names && c.Names[0]) ? c.Names[0].replace(/^\//, '') : c.Id.substring(0, 12),
                    image: c.Image || 'Unknown',
                    state: c.State, // 'running', 'stopped', 'paused'
                    status: c.Status,
                    source: 'portainer',
                    sourceName: inst.name || 'Portainer',
                    sourceIcon: inst.icon || 'icons/portainer.png',
                    instanceId: inst.id,
                    webui: webui,
                    // For actions
                    apiUrl: inst.url,
                    apiKey: inst.key,
                    endpointId: endpointId
                };
            });
    } catch (err) {
        console.warn(`Portainer ${inst.name} fetch error:`, err);
        return [];
    }
}

/**
 * Controls a container (start/stop/restart) from search results.
 * @param {Object} container - Container object from search results
 * @param {string} action - 'start', 'stop', 'restart'
 */
export async function controlContainerFromSearch(container, action) {
    if (container.source === 'unraid') {
        return await Unraid.controlContainer(container.apiUrl, container.apiKey, container.id, action);
    } else if (container.source === 'portainer') {
        return await Portainer.controlContainer(
            container.apiUrl, 
            container.apiKey, 
            container.endpointId, 
            container.id, 
            action
        );
    }
    throw new Error('Unknown container source');
}
