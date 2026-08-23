// js/core/migrations.js
import './migrationRules.js';

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
    return globalThis.hscRunStorageMigrations(items);
}
