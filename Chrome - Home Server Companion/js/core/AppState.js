// js/core/AppState.js
/**
 * Centralized Application State Manager
 * Provides reactive state with subscription support
 */

import eventBus from './EventBus.js';
import { runMigrations } from './migrations.js';

class AppState {
    constructor() {
        // Core state
        this.state = {
            // Service configs (from chrome.storage.sync)
            configs: {},

            // UI State
            activeService: 'dashboard',
            activeProfile: 'default',
            sidebarExpanded: true,

            // Data state
            services: {},
            badges: {},

            // Loading states
            loading: new Set(),

            // Error states
            errors: {},

            // Runtime state
            refreshInterval: null,
            lastUpdate: null
        };

        this.subscribers = new Map();
        this.initialized = false;
    }

    /**
     * Initialize state from storage. Runs v4.0 migrations on first load:
     * moves Overseerr settings to Seerr, drops legacy keys, inserts
     * `tracearr` into the service order if it was missing.
     */
    async init() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(null, (items) => {
                const { changed, removedKeys } = runMigrations(items);

                this.state.configs = items;
                this.state.activeProfile = items.activeProfile || 'default';
                this.initialized = true;

                // Persist migration results (fire-and-forget — the in-memory
                // state already reflects the migrated values).
                if (changed) {
                    chrome.storage.sync.set(items, () => {
                        if (removedKeys.length > 0) {
                            chrome.storage.sync.remove(removedKeys);
                        }
                    });
                }

                eventBus.emit('state:initialized', this.state);
                resolve(this.state);
            });
        });
    }

    /**
     * Get state value by path
     * @param {string} path - Dot-notation path (e.g., 'configs.sonarrUrl')
     * @returns {*} State value
     */
    get(path) {
        const keys = path.split('.');
        let value = this.state;

        for (const key of keys) {
            if (value && typeof value === 'object') {
                value = value[key];
            } else {
                return undefined;
            }
        }

        return value;
    }

    /**
     * Set state value by path
     * @param {string} path - Dot-notation path
     * @param {*} value - Value to set
     * @param {boolean} persist - Whether to persist to chrome.storage
     */
    set(path, value, persist = false) {
        const keys = path.split('.');
        let target = this.state;

        // Navigate to parent
        for (let i = 0; i < keys.length - 1; i++) {
            if (!(keys[i] in target)) {
                target[keys[i]] = {};
            }
            target = target[keys[i]];
        }

        const lastKey = keys[keys.length - 1];
        const oldValue = target[lastKey];
        target[lastKey] = value;

        // Emit change event
        eventBus.emit('state:changed', {
            path,
            value,
            oldValue
        });

        // Persist if requested
        if (persist) {
            this._persistToStorage(path, value);
        }
    }

    /**
     * Merge object into state
     * @param {Object} updates - Object with updates
     * @param {boolean} persist - Whether to persist
     */
    merge(updates, persist = false) {
        for (const [key, value] of Object.entries(updates)) {
            this.state[key] = value;
            eventBus.emit('state:changed', {
                path: key,
                value,
                oldValue: this.state[key]
            });
        }

        if (persist) {
            chrome.storage.sync.set(updates);
        }
    }

    /**
     * Subscribe to state changes
     * @param {string} path - Path to watch
     * @param {Function} callback - Callback with (newValue, oldValue)
     * @returns {Function} Unsubscribe function
     */
    subscribe(path, callback) {
        const key = `sub:${path}`;

        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, new Set());
        }

        this.subscribers.get(key).add(callback);

        return () => {
            const subs = this.subscribers.get(key);
            if (subs) {
                subs.delete(callback);
                if (subs.size === 0) {
                    this.subscribers.delete(key);
                }
            }
        };
    }

    /**
     * Set loading state for a key
     * @param {string} key - Loading key
     * @param {boolean} loading - Loading state
     */
    setLoading(key, loading) {
        if (loading) {
            this.state.loading.add(key);
        } else {
            this.state.loading.delete(key);
        }

        eventBus.emit('state:loading', {
            key,
            loading,
            allLoading: [...this.state.loading]
        });
    }

    /**
     * Set error state for a key
     * @param {string} key - Error key
     * @param {Error|null} error - Error object or null to clear
     */
    setError(key, error) {
        if (error) {
            this.state.errors[key] = {
                message: error.message,
                timestamp: Date.now()
            };
        } else {
            delete this.state.errors[key];
        }

        eventBus.emit('state:error', {
            key,
            error: this.state.errors[key]
        });
    }

    /**
     * Persist state to chrome.storage
     * @private
     */
    _persistToStorage(path, value) {
        const keys = path.split('.');
        const storageKey = keys[0];

        chrome.storage.sync.set({ [storageKey]: value });
    }

    /**
     * Get current snapshot
     * @returns {Object} State copy
     */
    snapshot() {
        return {
            ...this.state,
            loading: [...this.state.loading],
            services: { ...this.state.services }
        };
    }
}

const appState = new AppState();

export default appState;
