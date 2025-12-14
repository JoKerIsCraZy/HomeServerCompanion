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

        // Normalize Data
        return {
            system: {
                version: res.info?.versions?.core?.unraid || 'Unknown',
                registration: res.registration?.type || 'Basic',
                uptimeBoot: res.info?.os?.uptime, // ISO String
                memoryTotal: parse(res.metrics?.memory?.total) // Bytes
            },
            array: {
                status: res.array.state,
                used: parse(res.array.capacity.kilobytes.used) * 1024, // KB -> Bytes
                total: parse(res.array.capacity.kilobytes.total) * 1024,
                free: parse(res.array.capacity.kilobytes.free) * 1024,
                
                // Detailed Disks Lists
                parities: (res.array.parities || []).map(d => normalizeDisk(d, 'Parity')),
                disks: (res.array.disks || []).map(d => normalizeDisk(d, 'Data')),
                caches: (res.array.caches || []).map(d => normalizeDisk(d, 'Cache')),
                boot: res.array.boot ? normalizeDisk(res.array.boot, 'Flash') : null
            },
            cpu: res.metrics.cpu.percentTotal,
            ram: res.metrics.memory.percentTotal,
            // Normalize Docker List
            dockers: (res.docker.containers || []).map(c => ({
                id: c.id,
                name: (c.names && c.names[0]) ? c.names[0].replace(/^\//, '') : 'Unknown', 
                image: c.image,
                running: c.state === 'RUNNING',
                status: c.status
            }))
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

export const controlContainer = async (url, apiKey, id, action) => {
    // Schema: mutation { docker { start(id: "...") { id } } }
    // Note: 'restart' is not supported natively in the API, so we simulate it.
    
    if (action === 'restart') {
        const stopRes = await controlContainer(url, apiKey, id, 'stop');
        await new Promise(r => setTimeout(r, 2000)); // Wait for stop
        const startRes = await controlContainer(url, apiKey, id, 'start');
        return startRes;
    }

    const mutation = `
    mutation {
        docker {
            ${action}(id: "${id}") {
                id
            }
        }
    }
    `;
    return await graphQL(url, apiKey, mutation);
};


