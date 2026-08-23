// Unraid API Service (GraphQL)

import { validateSearchQuery } from './inputValidation.js';

// Cache last successful systemData snapshot for instant-render on popup open.
// Keyed by URL so switching servers doesn't mix state.
const CACHE_KEY_PREFIX = 'unraidSystemCache:';

const cacheKey = (url) => CACHE_KEY_PREFIX + (url || '');

/**
 * Returns the last cached system snapshot for this URL, or null.
 * Use this to render immediately on popup open while a fresh fetch runs.
 * @param {string} url
 * @returns {Promise<{data: Object, timestamp: number} | null>}
 */
export const getCachedSystemData = (url) => {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get([cacheKey(url)], (res) => {
                resolve(res[cacheKey(url)] || null);
            });
        } catch {
            resolve(null);
        }
    });
};

const saveSystemCache = (url, data) => {
    try {
        chrome.storage.local.set({
            [cacheKey(url)]: { data, timestamp: Date.now() }
        });
    } catch (e) {
        console.debug("Unraid cache write failed:", e.message);
    }
};

/**
 * How long each optional query's answer stays good enough to reuse.
 *
 * Chosen from how fast the underlying thing actually moves, not from a single
 * poll interval imposed on all of them.
 */
const SLOW_TTL = {
    sensors: 10000,          // a temperature badge does not need a 5s heartbeat
    dockerTemplate: 60000,   // icons and WebUI URLs change when a container is recreated
    shares: 30000,           // share sizes, and the disk temperature thresholds
    notifications: 30000,    // the server raises these; it does not stream them
    parityIdle: 30000,
    parityRunning: 5000      // a running check has a percentage worth watching
};

/**
 * Last good answer per optional query, keyed by server.
 *
 * `epochs` counts how often each slot has been invalidated. A request captures
 * the epoch it started under and refuses to store its answer if the count has
 * moved on — see fetchSlow.
 *
 * @type {{url: string|null, entries: Map<string, {data: Object, at: number}>,
 *         epochs: Map<string, number>}}
 */
let slowCache = { url: null, entries: new Map(), epochs: new Map() };

/**
 * The cached answer for one optional query, or undefined.
 * @param {string} url
 * @param {string} key
 * @returns {Object|undefined}
 */
const slowPart = (url, key) =>
    (slowCache.url === url ? slowCache.entries.get(key)?.data : undefined);

/**
 * Forgets one cached slot, so the next poll fetches it again.
 *
 * A mutation changes the server, which means whatever this cache holds about
 * the thing it changed is now wrong. Without this the interval decides how
 * long the UI keeps showing the old truth — archive a notification and it
 * reappears on the next poll for up to thirty seconds, and dismissing it a
 * second time fails with "not found" because the server archived it the first
 * time.
 *
 * Every mutation below calls this for the slots it can affect.
 *
 * @param {string} url
 * @param {...string} keys - Cache slots to drop
 */
const invalidateSlow = (url, ...keys) => {
    if (slowCache.url !== url) return;
    for (const key of keys) {
        slowCache.entries.delete(key);
        // Dropping the entry is not enough on its own: a request for this slot
        // may already be in flight, having been sent before the mutation. Its
        // answer describes the world as it was a moment ago. Bumping the epoch
        // marks it stale so it is neither stored nor served.
        slowCache.epochs.set(key, (slowCache.epochs.get(key) || 0) + 1);
    }
};

/**
 * Fetches one optional query, or reuses the last answer while it is still
 * within its interval.
 *
 * A failure returns the previous answer rather than null. The old code nulled
 * the whole optional payload on any error, so one dropped request made every
 * Docker icon and the temperature disappear for that cycle and come back on
 * the next — the same flicker that partial renders used to cause.
 *
 * @param {string} url
 * @param {string} apiKey
 * @param {string} key - Cache slot
 * @param {string} query
 * @param {number} ttl - Milliseconds the previous answer stays usable
 * @returns {Promise<Object|null>}
 */
const fetchSlow = (url, apiKey, key, query, ttl) => {
    if (slowCache.url !== url) {
        slowCache = { url, entries: new Map(), epochs: new Map() };
    }

    const hit = slowCache.entries.get(key);
    if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.data);

    const epoch = slowCache.epochs.get(key) || 0;
    return graphQL(url, apiKey, query)
        .then((data) => {
            // Was this slot invalidated while the request was out? Then the
            // answer predates the change. Storing it would be worse than
            // useless: it would land in the slot the mutation had just
            // cleared, carrying a fresh timestamp, and so hold the old world
            // in place for another full interval. That is an archived
            // notification coming back on the next poll and refusing to be
            // dismissed again for thirty seconds.
            const superseded = slowCache.url !== url
                || (slowCache.epochs.get(key) || 0) !== epoch;
            if (superseded) return slowCache.entries.get(key)?.data ?? null;

            slowCache.entries.set(key, { data, at: Date.now() });
            return data;
        })
        .catch((e) => {
            // Older servers lack these fields entirely; hold the miss for a
            // full interval so a permanently unsupported query is not retried
            // on every poll.
            console.debug(`Unraid "${key}" query unavailable:`, e.message);
            slowCache.entries.set(key, { data: hit?.data ?? null, at: Date.now() });
            return hit?.data ?? null;
        });
};

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
        free,
        // Hardware detail. `size` is the device's physical capacity in KB,
        // which is not the same as fsSize: parity has no filesystem at all,
        // and a formatted disk loses a little to metadata.
        device: d.device || '',
        sizeBytes: parse(d.size) * 1024,
        rotational: d.rotational,
        transport: d.transport || '',
        fsType: d.fsType || '',
        errors: parse(d.numErrors)
    };
};

/**
 * Fetches comprehensive system data (System info, Array, Docker, Metrics).
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<Object>} System data object
 */

/**
 * Normalises the raw GraphQL responses into the payload the UI consumes.
 *
 * Extracted so it can run twice per fetch: once with only the fast main
 * query, to paint immediately, and again once the optional queries land.
 * Every optional argument may be null.
 *
 * @param {Object} res - Main query data
 * @param {Object|null} extRes - Extended query data (sensors, docker extras)
 * @param {Object|null} extrasRes - Parity and shares
 * @param {Object|null} notifRes - Notifications
 * @param {string} url - Server URL, used to resolve container WebUI hosts
 * @returns {Object} Normalised payload
 */
function buildSystemResult(res, extRes, extrasRes, notifRes, url) {
    const serverHostname = new URL(url).hostname;
    const serverProtocol = new URL(url).protocol; // http: or https:

    // Build lookup map for docker template extras (v4.30+)
    const dockerExtrasById = new Map();
    if (extRes?.docker?.containers) {
        for (const c of extRes.docker.containers) {
            if (c.id) dockerExtrasById.set(c.id, c);
        }
    }

    // Temperature sensors (v4.30+)
    const sensors = extRes?.metrics?.temperature?.sensors || [];
    const cpuSensor = sensors.find(s => s.type === 'CPU_PACKAGE')
        || sensors.find(s => s.type === 'CPU_CORE');
    const mbSensor = sensors.find(s => s.type === 'MOTHERBOARD');

    // Normalize Data
    const result = {
        system: {
            version: res.info?.versions?.core?.unraid || 'Unknown',
            registration: res.registration?.type || 'Basic',
            uptimeBoot: res.info?.os?.uptime, // ISO String
            memoryTotal: parse(res.metrics?.memory?.total), // Bytes
            // `available` is what percentTotal is derived from: the server
            // reports `used` including cache and buffers, which reads as 94%
            // on a healthy box. total - available matches the percentage the
            // API itself publishes and the figure Unraid's own dashboard shows.
            memoryAvailable: parse(res.metrics?.memory?.available),
            cpuBrand: res.info?.cpu?.brand || '',
            cpuCores: parse(res.info?.cpu?.cores),
            cpuThreads: parse(res.info?.cpu?.threads),
            cpuTemp: cpuSensor?.current?.value ?? res.metrics?.cpu?.temperature,
            motherboardTemp: mbSensor?.current?.value ?? res.metrics?.motherboard?.temperature,
            // Only what the UI reads. The query used to also pull each
            // sensor's location, warning and critical thresholds plus a
            // whole summary block — on a 46-sensor board that is a lot of
            // JSON for fields nothing rendered.
            temperatures: sensors.map(s => ({
                id: s.id,
                name: s.name,
                type: s.type,
                value: s.current?.value,
                unit: s.current?.unit,
                status: s.current?.status // NORMAL | WARNING | CRITICAL | UNKNOWN
            }))
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
        notifications: notifRes?.notifications ? {
            unread: notifRes.notifications.overview?.unread || null,
            items: (notifRes.notifications.list || []).map(n => ({
                id: n.id,
                title: n.title,
                // The subject carries the readable sentence; the title is a
                // slug-like "Unraid Disk 3 temperature".
                subject: n.subject,
                description: n.description,
                importance: n.importance,
                timestamp: n.timestamp
            }))
        } : null,
        // VMs ride along in the main query now. They used to be a fourth
        // request fired separately on every poll, so the count arrived
        // after the first paint and the workload row changed under the
        // reader. `vms` is core schema and safe on every server version.
        vms: (res.vms?.domains || []).map(v => ({
            id: v.id,
            name: v.name,
            state: v.state,
            running: v.state === 'RUNNING' || v.state === 'PAUSED'
        })),
        // Normalize Docker List
        dockers: (res.docker.containers || []).map(c => {
            const extra = dockerExtrasById.get(c.id);

            // Prefer resolved WebUI URL from template (v4.30+), fall back to legacy label parsing
            let webuiUrl = extra?.webUiUrl || null;
            if (!webuiUrl) {
                const labels = c.labels || {};
                const webuiLabel = labels['net.unraid.docker.webui'];

                if (webuiLabel) {
                    webuiUrl = webuiLabel.replace('[IP]', serverHostname);
                    webuiUrl = webuiUrl.replace(/\[PORT:(\d+)\]/g, '$1');
                } else if (c.ports && c.ports.length > 0) {
                    const port = c.ports.find(p => p.publicPort && p.type === 'TCP') || c.ports.find(p => p.publicPort);
                    if (port && port.publicPort) {
                        webuiUrl = `${serverProtocol}//${serverHostname}:${port.publicPort}`;
                    }
                }
            }

            return {
                id: c.id,
                name: (c.names && c.names[0]) ? c.names[0].replace(/^\//, '') : 'Unknown',
                image: c.image,
                running: c.state === 'RUNNING',
                status: c.status,
                webui: webuiUrl,
                // New fields from v4.30+ (null on older servers)
                icon: extra?.iconUrl || null,
                projectUrl: extra?.projectUrl || null,
                supportUrl: extra?.supportUrl || null,
                autoStart: extra?.autoStart ?? null,
                isOrphaned: extra?.isOrphaned ?? false,
                // isUpdateAvailable is only requested in the extended query,
                // so read it from there - the main query never returns it.
                updateAvailable: extra?.isUpdateAvailable ?? false,
                rebuildReady: extra?.isRebuildReady ?? false
            };
        }),

        // Parity check (null when the field is unavailable or never run)
        parity: extrasRes?.array?.parityCheckStatus
            ? {
                progress: parseFloat(extrasRes.array.parityCheckStatus.progress) || 0,
                speed: extrasRes.array.parityCheckStatus.speed ?? null,
                duration: parse(extrasRes.array.parityCheckStatus.duration),
                errors: parse(extrasRes.array.parityCheckStatus.errors),
                correcting: !!extrasRes.array.parityCheckStatus.correcting,
                running: !!extrasRes.array.parityCheckStatus.running,
                paused: !!extrasRes.array.parityCheckStatus.paused
            }
            : null,

        // The disk temperature thresholds the user configured in Unraid
        // (Settings -> Display Settings). `hot` is the warning level and
        // `max` the critical one; the defaults are 45 and 55. Reading them
        // means the extension warns about exactly what the server would,
        // instead of about a number invented here.
        //
        // Note `display.warning` / `display.critical` are next to these and
        // are NOT temperatures — they are the disk *utilisation* percentages,
        // 70 and 90 by default.
        thresholds: extrasRes?.display
            ? {
                diskWarn: Number(extrasRes.display.hot),
                diskCrit: Number(extrasRes.display.max),
                unit: extrasRes.display.unit || 'CELSIUS'
            }
            : null,

        // Per-share usage. Sizes come back in KB as BigInt strings.
        shares: (extrasRes?.shares || []).map(s => ({
            name: s.name,
            comment: s.comment || '',
            cache: !!s.cache,
            sizeBytes: parse(s.size) * 1024,
            usedBytes: parse(s.used) * 1024,
            freeBytes: parse(s.free) * 1024
        }))
    };

    // renderUnraidSystem() already ships a parity card that reads
    // data.array.parity as { status, percent, errors, speed }. That field was
    // never populated because no query requested it, so the card was stuck on
    // "No check running". Expose the normalized status in the shape the
    // existing consumer expects.
    if (result.array && result.parity) {
        result.array.parity = {
            status: result.parity.running
                ? 'running'
                : (result.parity.paused ? 'paused' : 'idle'),
            percent: result.parity.progress,
            errors: result.parity.errors,
            speed: result.parity.speed,
            correcting: result.parity.correcting
        };
    }

    // Cache successful snapshot for instant-render on next popup open.
    //
    // Only a COMPLETE snapshot may be cached. The dashboard aggregator calls
    // this with `skipExtended`, which nulls the temperature, parity, share
    // and docker-template queries — and it does so every few seconds for as
    // long as the dashboard is open. Caching that reduced payload meant the
    // Unraid tab's first paint came from a snapshot with no temperatures, no
    // parity state and no container icons, and the live fetch a moment later
    // un-hid three temperature cards and the parity button: the layout grew
    // by a whole grid row right after the user thought it had settled.
    return result;
}

/**
 * Fetches Unraid system data.
 * @param {string} url
 * @param {string} apiKey
 * @param {object} [options]
 * @param {boolean} [options.skipExtended] - Skip the v4.30+ temperature / docker-template
 *   query. Use `true` for consumers that only need cpu/ram/array/dockers (e.g. the
 *   Dashboard aggregator). Cuts one GraphQL roundtrip per refresh.
 */
export const getSystemData = async (url, apiKey, options = {}) => {
    const skipExtended = !!options.skipExtended;
    // Schema verified from source code analysis (api-main/api/src/unraid-api/graph/resolvers)

    // Unified Query
    const systemQuery = `
    {
        info {
            versions { core { unraid } }
            os { uptime }
            cpu { brand cores threads }
        }
        registration { type, state }
        array {
            state
            capacity { kilobytes { used total free } }
            parities { name, temp, status, isSpinning, device, size, rotational, transport, numErrors }
            disks { name, temp, status, isSpinning, fsUsed, fsSize, fsFree, device, size, rotational, transport, fsType, numErrors }
            caches { name, temp, status, isSpinning, fsUsed, fsSize, fsFree, device, size, rotational, transport, fsType, numErrors }
            boot { name, temp, status, fsUsed, fsSize, fsFree, device, size, rotational, transport, fsType }
        }
        metrics {
            cpu { percentTotal }
            memory { percentTotal, total, available }
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
        vms {
            domains {
                id
                name
                state
            }
        }
    }
    `;



    // One query per cadence.
    //
    // These used to be two documents, each bundling things that change at very
    // different rates: sensor readings next to Docker template metadata, parity
    // status next to the share list. Because a document is fetched as a whole,
    // the slowest-changing field forced the fastest-changing field's interval —
    // every five seconds the server shelled out to lm-sensors for 46 readings
    // to keep a Docker icon URL that had not changed since the container was
    // created. Split apart, each can be asked for as often as it is worth.
    //
    // v4.30.0+ only. On an older server each fails on its own and the rest
    // still land.
    const sensorsQuery = `
    {
        metrics {
            temperature {
                sensors {
                    id
                    name
                    type
                    current { value unit status }
                }
            }
        }
    }
    `;

    const dockerTemplateQuery = `
    {
        docker {
            containers {
                id
                webUiUrl
                iconUrl
                isOrphaned
                projectUrl
                supportUrl
                autoStart
                isUpdateAvailable
                isRebuildReady
            }
        }
    }
    `;

    // Shares and the disk temperature thresholds: both are configuration, and
    // both are small.
    const sharesQuery = `
    {
        display { hot max unit }
        shares {
            name
            comment
            free
            used
            size
            cache
        }
    }
    `;

    const parityQuery = `
    {
        array {
            parityCheckStatus {
                progress
                speed
                duration
                errors
                correcting
                running
                paused
            }
        }
    }
    `;

    const notificationsQuery = `
    {
        notifications {
            overview { unread { info warning alert total } }
            list(filter: { type: UNREAD, offset: 0, limit: 20 }) {
                id
                title
                subject
                description
                importance
                timestamp
            }
        }
    }
    `;

    try {
        // The dashboard aggregator wants the core payload only.
        const mainPromise = graphQL(url, apiKey, systemQuery);

        // A parity check moves; an idle one does not. Asking every five seconds
        // for "still idle" twelve times a minute is the whole reason this
        // split exists.
        const parityTtl = slowPart(url, 'parity')?.array?.parityCheckStatus?.running
            ? SLOW_TTL.parityRunning
            : SLOW_TTL.parityIdle;

        const optional = skipExtended
            ? { sensors: null, dockerTemplate: null, shares: null, parity: null, notifications: null }
            : {
                sensors: fetchSlow(url, apiKey, 'sensors', sensorsQuery, SLOW_TTL.sensors),
                dockerTemplate: fetchSlow(url, apiKey, 'dockerTemplate', dockerTemplateQuery, SLOW_TTL.dockerTemplate),
                shares: fetchSlow(url, apiKey, 'shares', sharesQuery, SLOW_TTL.shares),
                parity: fetchSlow(url, apiKey, 'parity', parityQuery, parityTtl),
                notifications: fetchSlow(url, apiKey, 'notifications', notificationsQuery, SLOW_TTL.notifications)
            };

        // The main query is fast; the sensor one shells out to lm-sensors and is
        // the slow leg. Waiting for everything before painting made opening the
        // tab feel sluggish, so the caller may ask for the core payload as soon
        // as it lands. That is only safe because the layout no longer changes
        // shape when late data arrives — pending values render as "--" in slots
        // that already exist.
        const res = await mainPromise;
        if (typeof options.onPartial === 'function') {
            try {
                options.onPartial(buildSystemResult(res, null, null, null, url));
            } catch (err) {
                console.debug("Unraid partial render failed:", err.message);
            }
        }

        const [sensorsRes, dockerTplRes, sharesRes, parityRes, notifRes] = await Promise.all([
            optional.sensors, optional.dockerTemplate, optional.shares,
            optional.parity, optional.notifications
        ]);

        // buildSystemResult still reads the two original shapes, so hand it
        // those rather than teaching it about the split.
        const extRes = (sensorsRes || dockerTplRes)
            ? { metrics: sensorsRes?.metrics, docker: dockerTplRes?.docker }
            : null;
        const extrasRes = (sharesRes || parityRes)
            ? { display: sharesRes?.display, shares: sharesRes?.shares, array: parityRes?.array }
            : null;

        const result = buildSystemResult(res, extRes, extrasRes, notifRes, url);

        if (!skipExtended) saveSystemCache(url, result);
        return result;

    } catch (e) {
        console.warn("Unraid Sync Failed", e);
        // `_error` is what the caller branches on. The rest is an empty shape
        // so nothing downstream has to null-check — note `status` is left
        // unset rather than carrying the old 'Start Service' string, which
        // leaked an API instruction into the UI as if it were array state.
        return {
            array: { status: null, used: 0, total: 0, disks: [], caches: [] },
            cpu: 0, ram: 0,
            dockers: [],
            vms: [],
            notifications: null,
            _error: e.message
        };
    }
};

/**
 * CPU and memory load, and nothing else.
 *
 * getSystemData pulls disks, every Docker container, the sensor list and the
 * notification feed; on this server that is a few hundred kilobytes of JSON
 * and it is why the full poll sits at five seconds. A load figure that only
 * moves every five seconds is not a live reading, so the CPU card polls this
 * instead — one field per metric, cheap enough to run once a second.
 *
 * @param {string} url - Unraid URL
 * @param {string} apiKey - API key
 * @returns {Promise<{cpu: number, ram: number, memoryTotal: number,
 *   memoryAvailable: number}>}
 */
export const getLiveMetrics = async (url, apiKey) => {
    const res = await graphQL(url, apiKey, `
    {
        metrics {
            cpu { percentTotal }
            memory { percentTotal, total, available }
        }
    }
    `);
    return {
        cpu: res?.metrics?.cpu?.percentTotal,
        ram: res?.metrics?.memory?.percentTotal,
        memoryTotal: parse(res?.metrics?.memory?.total),
        memoryAvailable: parse(res?.metrics?.memory?.available)
    };
};

/**
 * Starts or stops the array.
 *
 * Schema confirmed against a live 7.3.1 server by probing with a deliberately
 * invalid selection set, so validation rejected the document before anything
 * ran: ArrayMutations.setState takes ArrayStateInput! whose required
 * desiredState is the ArrayStateInputState enum (START | STOP), and returns
 * UnraidArray.
 *
 * @param {string} url - Unraid URL
 * @param {string} apiKey - API key
 * @param {'START'|'STOP'} desiredState
 * @returns {Promise<Object>} Mutation result
 */
export const setArrayState = async (url, apiKey, desiredState) => {
    if (desiredState !== 'START' && desiredState !== 'STOP') {
        throw new Error(`Unsupported array state: ${desiredState}`);
    }
    const result = await graphQL(url, apiKey,
        `mutation { array { setState(input: { desiredState: ${desiredState} }) { state } } }`);
    // Stopping the array ends any check and unmounts every share.
    invalidateSlow(url, 'parity', 'shares');
    return result;
};

/**
 * Archives one unread notification, which is how Unraid's own UI dismisses it.
 * The notification stays in the archive; it is not deleted.
 * @param {string} url - Unraid URL
 * @param {string} apiKey - API key
 * @param {string} id - Notification id from the unread list
 * @returns {Promise<Object>} Mutation result
 */
export const archiveNotification = async (url, apiKey, id) => {
    const mutation = `mutation { archiveNotification(id: ${JSON.stringify(id)}) { id } }`;
    const result = await graphQL(url, apiKey, mutation);
    // The unread list just changed.
    invalidateSlow(url, 'notifications');
    return result;
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
 * Pulls a newer image for a container and recreates it.
 * @param {string} url
 * @param {string} apiKey
 * @param {string} id - Container ID
 * @returns {Promise<Object>}
 */
export const updateContainer = async (url, apiKey, id) => {
    const sanitizedId = String(id).replace(/[\\"']/g, '');
    const mutation = `
    mutation {
        docker {
            updateContainer(id: "${sanitizedId}") {
                id
            }
        }
    }
    `;
    const result = await graphQL(url, apiKey, mutation);
    // isUpdateAvailable lives in the 60s template slot, and this just cleared it.
    invalidateSlow(url, 'dockerTemplate');
    return result;
};

/**
 * Pulls newer images for every container that has one and recreates them.
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<Object>}
 */
export const updateAllContainers = async (url, apiKey) => {
    const mutation = `
    mutation {
        docker {
            updateAllContainers {
                id
            }
        }
    }
    `;
    const result = await graphQL(url, apiKey, mutation);
    // Same slot, for every container at once.
    invalidateSlow(url, 'dockerTemplate');
    return result;
};

/**
 * Starts, pauses, resumes or cancels a parity check.
 * @param {string} url
 * @param {string} apiKey
 * @param {'start'|'pause'|'resume'|'cancel'} action
 * @param {boolean} [correcting] - Only used by 'start': write corrections to parity
 * @returns {Promise<Object>}
 */
export const controlParityCheck = async (url, apiKey, action, correcting = false) => {
    const allowedActions = ['start', 'pause', 'resume', 'cancel'];
    if (!allowedActions.includes(action)) {
        throw new Error(`Invalid parity action: ${action}`);
    }

    const args = action === 'start' ? `(correct: ${correcting ? 'true' : 'false'})` : '';
    const mutation = `
    mutation {
        parityCheck {
            ${action}${args}
        }
    }
    `;
    const result = await graphQL(url, apiKey, mutation);
    // Idle to running, or the reverse.
    invalidateSlow(url, 'parity');
    return result;
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


