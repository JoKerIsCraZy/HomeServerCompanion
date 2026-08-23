// js/core/BadgeManager.js
/**
 * Badge Update Manager
 * Optimized background badge polling with deduplication
 */

import eventBus from './EventBus.js';
import appState from './AppState.js';
import poller from './Poller.js';

class BadgeManager {
    constructor() {
        this.intervals = new Map();
        this.activeService = null;
        this.defaultInterval = 5000;
    }

    /**
     * Start badge updates for all services
     * @param {string} activeService - Currently active service
     * @param {Object} configs - Service configs
     */
    startAll(activeService, configs) {
        this.activeService = activeService;

        const badgeServices = [
            { id: 'sabnzbd', module: '../ui/sabnzbd.js', fn: 'updateSabnzbdBadge' },
            { id: 'sonarr', module: '../ui/sonarr.js', fn: 'updateSonarrBadge' },
            { id: 'radarr', module: '../ui/radarr.js', fn: 'updateRadarrBadge' },
            { id: 'tautulli', module: '../ui/tautulli.js', fn: 'updateTautulliBadge' },
            { id: 'tracearr', module: '../ui/tracearr.js', fn: 'updateTracearrBadge' },
            { id: 'portainer', module: '../ui/portainer.js', fn: 'updatePortainerBadge_Dashboard' }
        ];

        // Clear existing intervals
        this.stopAll();

        // Get configured interval
        const interval = configs.badgeCheckInterval || this.defaultInterval;

        // Stagger starts to prevent simultaneous requests
        badgeServices.forEach((svc, index) => {
            if (configs[`${svc.id}Enabled`] === false) return;
            if (!configs[`${svc.id}Url`] || !configs[`${svc.id}Key`]) return;

            const delay = index * 1000; // 1 second stagger

            setTimeout(() => {
                this._startServiceBadge(svc, interval);
            }, delay);
        });
    }

    /**
     * Start badge updates for a single service
     * @private
     */
    async _startServiceBadge(service, interval) {
        const updateFn = async () => {
            // Skip if this is the active service (already polling in main loop)
            if (service.id === this.activeService) return;

            try {
                const module = await import(service.module);
                if (module[service.fn]) {
                    await module[service.fn](
                        appState.get(`configs.${service.id}Url`),
                        appState.get(`configs.${service.id}Key`)
                    );
                }

                // Clear error state on success
                const navItem = document.querySelector(`.nav-item[data-target="${service.id}"]`);
                if (navItem) navItem.classList.remove('badge-error');

            } catch (error) {
                console.warn(`Badge update failed for ${service.id}:`, error.message);

                // Add error indicator after repeated failures
                const navItem = document.querySelector(`.nav-item[data-target="${service.id}"]`);
                if (navItem) navItem.classList.add('badge-error');
                // Rethrow: the scheduler needs to see the failure to back off.
                throw error;
            }
        };

        // Registered with the shared scheduler rather than a bare interval, so
        // badge polling stops with everything else when the page is hidden and
        // backs off when a service is unreachable. Without that, a fullscreen
        // tab left open kept six services under constant load.
        poller.register(`badge:${service.id}`, updateFn, { interval, group: 'badge' });
        this.intervals.set(service.id, `badge:${service.id}`);
    }

    /**
     * Stop all badge updates
     */
    stopAll() {
        for (const taskName of this.intervals.values()) {
            poller.unregister(taskName);
        }
        this.intervals.clear();
    }

    /**
     * Update active service (to skip polling)
     * @param {string} activeService - New active service
     */
    setActiveService(activeService) {
        this.activeService = activeService;
    }
}

const badgeManager = new BadgeManager();

export default badgeManager;
