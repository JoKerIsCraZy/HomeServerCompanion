// Unraid API Service (GraphQL)

const graphQL = async (url, apiKey, query) => {
    try {
        const endpoint = `${url}/graphql`; // Official endpoint is usually at root /graphql
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({ query })
        });

        // Debug: Check for non-JSON response (likely HTML error page)
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
             const text = await response.text();
             console.error("Unraid returned HTML instead of JSON. Check URL/Key.", text.substring(0, 500));
             throw new Error(`Unraid returned HTML (Status ${response.status}). Check Console.`);
        }

        if (!response.ok) throw new Error(`Status: ${response.status}`);
        const json = await response.json();
        
        if (json.errors) throw new Error(json.errors[0].message);
        return json.data;
    } catch (error) {
        console.error("Unraid API Error:", error);
        throw error;
    }
};

/**
 * Checks if the Unraid API is reachable.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<boolean>} True if reachable
 */
export const checkUnraidStatus = async (url, apiKey) => {
    if (!apiKey) {
        // Fallback to simple ping if no key
        try {
            await fetch(url, { method: 'HEAD', mode: 'no-cors' });
            return true;
        } catch { return false; }
    }
    try {
        await graphQL(url, apiKey, `{ info { versions { core { unraid } } } }`);
        return true;
    } catch { return false; }
};

/**
 * Fetches comprehensive system data (System info, Array, Docker, Metrics).
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Object>} System data object
 */
export const getSystemData = async (url, apiKey) => {
    // Schema assumption: 
    // - array: status, storage stats
    // - dockers: list of containers
    // - network: interface stats
    // Note: Introspection is disabled. We must rely on standard fields or user feedback.
    
    // 1. Connectivity Check (Simple)
    try {
        const simpleQuery = `{ info { versions { core { unraid } } } }`;
        await graphQL(url, apiKey, simpleQuery);
    } catch (e) {
        console.error("Connectivity Check Failed:", e);
        return {
            array: { status: 'Auth/Connection Failed', totalSize: 0, totalFree: 0 },
            dockers: [],
            network: { interfaces: [] },
            _error: "Connection Failed"
        };
    }

    // 2. Data Query 
    // Schema verified from source code analysis (api-main/api/src/unraid-api/graph/resolvers)
    
    // Unified Query
    const systemQuery = `
    {
        info {
            versions { core { unraid } }
            os { uptime }
        }
        registration { type, state }
        array { 
            state 
            capacity { kilobytes { used total free } } 
            parities { name, temp, status, isSpinning }
            disks { name, temp, status, isSpinning, fsUsed, fsSize, fsFree }
            caches { name, temp, status, isSpinning, fsUsed, fsSize, fsFree }
            boot { name, temp, status, fsUsed, fsSize, fsFree }
        }
        metrics {
            cpu { percentTotal }
            memory { percentTotal, total }
        }
        docker {
            containers {
                id
                names
                image
                state
                status
                labels
                ports {
                    publicPort
                    type
                }
            }
        }
    }
    `;



    try {
        const res = await graphQL(url, apiKey, systemQuery);
        
        // Helper to parse potential string numbers
        const parse = (val) => parseInt(val, 10) || 0;

        // Helper to normalize disk object
        const normalizeDisk = (d, type) => {
            const used = parse(d.fsUsed) * 1024;
            const total = parse(d.fsSize) * 1024;
            const free = d.fsFree ? (parse(d.fsFree) * 1024) : (total - used);
            
            return {
                type,
                name: d.name || type,
                temp: d.temp,
                spinning: d.isSpinning,
                status: d.status,
                used,
                total,
                free
            };
        };

        const serverHostname = new URL(url).hostname;
        const serverProtocol = new URL(url).protocol; // http: or https:

        // Normalize Data
        return {
            system: {
                version: res.info?.versions?.core?.unraid || 'Unknown',
                registration: res.registration?.type || 'Basic',
                uptimeBoot: res.info?.os?.uptime, // ISO String
                memoryTotal: parse(res.metrics?.memory?.total), // Bytes
                cpuTemp: res.metrics?.cpu?.temperature,
                motherboardTemp: res.metrics?.motherboard?.temperature
            },
            array: {
                status: res.array.state,
                used: parse(res.array.capacity.kilobytes.used) * 1024, // KB -> Bytes
                total: parse(res.array.capacity.kilobytes.total) * 1024,
                free: parse(res.array.capacity.kilobytes.free) * 1024,
                
                // Parity Check Status
                parity: res.array.parity ? {
                    status: res.array.parity.status,
                    percent: res.array.parity.percent,
                    errors: res.array.parity.errors,
                    duration: res.array.parity.duration,
                    speed: res.array.parity.speed
                } : null,
                
                // Detailed Disks Lists
                parities: (res.array.parities || []).map(d => normalizeDisk(d, 'Parity')),
                disks: (res.array.disks || []).map(d => normalizeDisk(d, 'Data')),
                caches: (res.array.caches || []).map(d => normalizeDisk(d, 'Cache')),
                boot: res.array.boot ? normalizeDisk(res.array.boot, 'Flash') : null
            },
            cpu: res.metrics.cpu.percentTotal,
            ram: res.metrics.memory.percentTotal,
            // Normalize Docker List
            dockers: (res.docker.containers || []).map(c => {
                let webuiUrl = null;
                const labels = c.labels || {};
                const webuiLabel = labels['net.unraid.docker.webui'];
                
                if (webuiLabel) {
                     // Label found: Replace [IP] with hostname
                    webuiUrl = webuiLabel.replace('[IP]', serverHostname);
                    // Replace [PORT:1234] with 1234
                    webuiUrl = webuiUrl.replace(/\[PORT:(\d+)\]/g, '$1');
                } else if (c.ports && c.ports.length > 0) {
                     // Fallback: Use first mapped public port
                     // Filter for TCP if possible, or just take the first one with a public port
                     const port = c.ports.find(p => p.publicPort && p.type === 'TCP') || c.ports.find(p => p.publicPort);
                     if (port && port.publicPort) {
                         webuiUrl = `${serverProtocol}//${serverHostname}:${port.publicPort}`;
                     }
                }



                return {
                    id: c.id,
                    name: (c.names && c.names[0]) ? c.names[0].replace(/^\//, '') : 'Unknown', 
                    image: c.image,
                    running: c.state === 'RUNNING',
                    status: c.status,
                    webui: webuiUrl,
                    updateAvailable: c.isUpdateAvailable
                };
            })
        };

    } catch (e) {
        console.warn("Unraid Sync Failed", e);
        return {
            array: { status: 'Start Service', used: 0, total: 0 },
            cpu: 0, ram: 0,
            dockers: [],
            _error: e.message
        };
    }
};

/**
 * Controls a Docker container (start, stop, restart).
 * @param {string} url 
 * @param {string} apiKey 
 * @param {string} id - Container ID
 * @param {string} action - Action command
 * @returns {Promise<Object>} Mutation result
 */
export const controlContainer = async (url, apiKey, id, action) => {
    // Schema: mutation { docker { start(id: "...") { id } } }
    // Note: 'restart' is not supported natively in the API, so we simulate it.
    
    // Input validation to prevent GraphQL injection
    const allowedActions = ['start', 'stop', 'restart', 'pause', 'unpause'];
    if (!allowedActions.includes(action)) {
        throw new Error(`Invalid action: ${action}`);
    }
    
    // Sanitize ID (remove quotes and backslashes that could break GraphQL)
    const sanitizedId = String(id).replace(/[\\"\']/g, '');
    
    if (action === 'restart') {
        const stopRes = await controlContainer(url, apiKey, sanitizedId, 'stop');
        await new Promise(r => setTimeout(r, 2000)); // Wait for stop
        const startRes = await controlContainer(url, apiKey, sanitizedId, 'start');
        return startRes;
    }

    const mutation = `
    mutation {
        docker {
            ${action}(id: "${sanitizedId}") {
                id
            }
        }
    }
    `;
    return await graphQL(url, apiKey, mutation);
};

/**
 * Fetches list of VMs.
 * @param {string} url 
 * @param {string} apiKey 
 * @returns {Promise<Array>} List of VMs
 */
export const getVms = async (url, apiKey) => {
    // Query based on vms.resolver.ts
    const query = `{
        vms {
            domains {
                id
                name
                state
            }
        }
    }`;

    try {
        const data = await graphQL(url, apiKey, query);
        // Map to cleaner objects
        return (data.vms.domains || []).map(vm => ({
            id: vm.id,
            name: vm.name,
            state: vm.state, // RUNNING, PAUSED, SHUTOFF, etc.
            running: vm.state === 'RUNNING' || vm.state === 'PAUSED' // Treat paused as 'running' context for stop capability
        }));
    } catch (e) {
        console.error("Failed to fetch VMs", e);
        return [];
    }
};

/**
 * Controls a VM (start, stop, etc.).
 * @param {string} url 
 * @param {string} apiKey 
 * @param {string} id - VM ID
 * @param {string} action - Action command
 * @returns {Promise<Object>} Mutation result
 */
export const controlVm = async (url, apiKey, id, action) => {
    // Mutation: mutation { vm { start(id: "...") } }
    // Action: start, stop, pause, resume, forceStop, reboot, reset
    
    // Input validation to prevent GraphQL injection
    const allowedActions = ['start', 'stop', 'pause', 'resume', 'forceStop', 'reboot', 'reset'];
    if (!allowedActions.includes(action)) {
        throw new Error(`Invalid action: ${action}`);
    }
    
    // Sanitize ID (remove quotes and backslashes that could break GraphQL)
    const sanitizedId = String(id).replace(/[\\"\']/g, '');
    
    const mutation = `
    mutation {
        vm {
            ${action}(id: "${sanitizedId}")
        }
    }`;
    return await graphQL(url, apiKey, mutation);
};


