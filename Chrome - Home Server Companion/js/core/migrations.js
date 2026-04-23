// js/core/migrations.js
/**
 * Centralized storage migrations.
 *
 * Called once on popup/options page load with a mutable clone of the
 * chrome.storage.sync data. Performs any needed upgrades in memory, then the
 * caller is responsible for persisting the changes via
 * `chrome.storage.sync.set(items)` + `chrome.storage.sync.remove(removedKeys)`.
 *
 * Each migration is idempotent — running it twice on already-migrated data
 * is a no-op.
 */

/**
 * @param {object} items - Mutable copy of chrome.storage.sync contents
 * @returns {{ changed: boolean, removedKeys: string[] }}
 *   - `changed`: whether any field was added, renamed, or removed
 *   - `removedKeys`: legacy keys that should be removed from storage via
 *     chrome.storage.sync.remove() after the set() call
 */
export function runMigrations(items) {
    let changed = false;
    const removedKeys = [];

    // ---- v4.0: Overseerr -> Seerr ----
    // Copy every `overseerr*` key to its `seerr*` counterpart (only when the
    // target is empty, so an already-configured Seerr isn't overwritten), then
    // drop the legacy keys so storage stays clean on subsequent loads.
    const overseerrKeys = Object.keys(items).filter(k => k.startsWith('overseerr'));
    if (overseerrKeys.length > 0) {
        overseerrKeys.forEach(key => {
            const seerrKey = key.replace(/^overseerr/, 'seerr');
            const targetEmpty = !(seerrKey in items)
                || items[seerrKey] === undefined
                || items[seerrKey] === null
                || items[seerrKey] === '';
            if (targetEmpty) {
                items[seerrKey] = items[key];
            }
            delete items[key];
            removedKeys.push(key);
        });
        changed = true;
    }

    // ---- v4.0: serviceOrder — rename `overseerr` -> `seerr` ----
    if (Array.isArray(items.serviceOrder)) {
        const overseerrIdx = items.serviceOrder.indexOf('overseerr');
        if (overseerrIdx !== -1) {
            if (!items.serviceOrder.includes('seerr')) {
                items.serviceOrder[overseerrIdx] = 'seerr';
            } else {
                items.serviceOrder.splice(overseerrIdx, 1);
            }
            changed = true;
        }

        // ---- v4.0: insert `tracearr` after `tautulli` if missing ----
        // New service in v4.0 — existing 3.9 users have a serviceOrder without
        // it, so the sidebar would silently hide the feature until they open
        // the options. Auto-insert keeps the update seamless.
        if (!items.serviceOrder.includes('tracearr')) {
            const tautulliIdx = items.serviceOrder.indexOf('tautulli');
            if (tautulliIdx !== -1) {
                items.serviceOrder.splice(tautulliIdx + 1, 0, 'tracearr');
            } else {
                items.serviceOrder.push('tracearr');
            }
            changed = true;
        }
    }

    return { changed, removedKeys };
}

/**
 * Convenience wrapper: loads sync storage, runs migrations, persists changes.
 * Resolves to the migrated items object.
 * @returns {Promise<object>}
 */
export function applyMigrations() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(null, (items) => {
            const result = runMigrations(items);
            if (!result.changed) {
                resolve(items);
                return;
            }
            chrome.storage.sync.set(items, () => {
                if (result.removedKeys.length > 0) {
                    chrome.storage.sync.remove(result.removedKeys, () => {
                        console.info(`Migration v4.0 applied (removed ${result.removedKeys.length} legacy keys)`);
                        resolve(items);
                    });
                } else {
                    console.info('Migration v4.0 applied');
                    resolve(items);
                }
            });
        });
    });
}
