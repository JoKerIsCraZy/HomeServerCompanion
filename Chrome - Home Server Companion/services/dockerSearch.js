// Docker Search Service - Aggregates containers from Unraid, Portainer and
// Dockhand.
//
// Which of the three take part is a setting, because all three can front the
// same Docker host: without a choice, one container comes back three times
// under three names.

import * as Unraid from './unraid.js';
import * as Portainer from './portainer.js';
import * as Dockhand from './dockhand.js';
import { validateSearchQuery } from './inputValidation.js';

/** Sources searched when the user has not chosen. */
const ALL_SOURCES = ['unraid', 'portainer', 'dockhand'];

/**
 * Whether a source takes part in the unified search.
 *
 * An absent setting means all of them: that is what the search did before the
 * setting existed, and an upgrade should not quietly narrow it.
 * @param {Object} configs
 * @param {string} source - 'unraid' | 'portainer' | 'dockhand'
 * @returns {boolean}
 */
function searchesSource(configs, source) {
    const chosen = configs.dockerSearchSources;
    if (!Array.isArray(chosen)) return true;
    return chosen.includes(source);
}

/**
 * Searches all Docker containers across Unraid and all Portainer instances.
 * @param {Object} configs - Extension configuration from chrome.storage.sync
 * @param {string} query - Search query (case-insensitive)
 * @returns {Promise<Array>} Unified container results
 */
export async function searchAllContainers(configs, query) {
    const validation = validateSearchQuery(query);
    if (!validation.valid) {
        throw new Error(`Invalid search query: ${validation.error}`);
    }

    const results = [];
    const searchLower = query.toLowerCase();
    const fetchPromises = [];

    // 1. Unraid Docker containers
    if (searchesSource(configs, 'unraid')
        && configs.unraidUrl && configs.unraidKey && configs.unraidEnabled !== false) {
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
    if (searchesSource(configs, 'portainer') && configs.portainerEnabled !== false) {
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

    // 3. Dockhand, across every environment it fronts
    if (searchesSource(configs, 'dockhand')
        && configs.dockhandUrl && configs.dockhandKey && configs.dockhandEnabled !== false) {
        fetchPromises.push(
            fetchDockhandContainers(configs.dockhandUrl, configs.dockhandKey, searchLower)
                .catch(err => {
                    console.warn('Dockhand Docker fetch failed:', err);
                    return [];
                })
        );
    }

    // Wait for all fetches
    const allResults = await Promise.all(fetchPromises);

    // Flatten and return
    return allResults.flat();
}

/**
 * Fetches and filters containers from every environment a Dockhand server
 * manages.
 *
 * One request lists the hosts, then one per host. A failing host is skipped
 * rather than losing the others.
 * @param {string} url
 * @param {string} key
 * @param {string} searchLower
 * @returns {Promise<Array>}
 */
async function fetchDockhandContainers(url, key, searchLower) {
    const environments = await Dockhand.getDockhandEnvironments(url, key);

    const perEnvironment = await Promise.all(environments.map(env =>
        Dockhand.getDockhandContainers(url, key, env.id)
            .then(containers => containers
                .filter(c => String(c.name || '').toLowerCase().includes(searchLower))
                .map(c => ({
                    id: c.id,
                    name: c.name,
                    image: c.image,
                    state: /^running$/i.test(String(c.state || '')) ? 'running' : 'stopped',
                    status: c.status,
                    source: 'dockhand',
                    // The host is named, not the server: with several
                    // environments "Dockhand" alone would not say which.
                    sourceName: environments.length > 1
                        ? `Dockhand · ${env.name || env.id}`
                        : 'Dockhand',
                    sourceIcon: 'icons/dockhand.png',
                    // Dockhand's container list carries no web UI label.
                    webui: null,
                    apiUrl: url,
                    apiKey: key,
                    envId: env.id,
                    endpointId: null
                })))
            .catch(err => {
                console.warn(`Dockhand environment ${env.id} fetch failed:`, err);
                return [];
            })
    ));

    return perEnvironment.flat();
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
    } else if (container.source === 'dockhand') {
        return await Dockhand.controlDockhandContainer(
            container.apiUrl,
            container.apiKey,
            container.envId,
            container.id,
            action
        );
    }
    throw new Error('Unknown container source');
}
