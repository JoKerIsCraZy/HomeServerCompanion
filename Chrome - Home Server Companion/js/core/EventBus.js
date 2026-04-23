// js/core/EventBus.js
/**
 * Event Bus for component communication
 * Provides pub/sub pattern for decoupled components
 */

class EventBus {
    constructor() {
        this.events = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }

        this.events.get(event).add(callback);

        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler to remove
     */
    off(event, callback) {
        const handlers = this.events.get(event);
        if (handlers) {
            handlers.delete(callback);
            if (handlers.size === 0) {
                this.events.delete(event);
            }
        }
    }

    /**
     * Emit an event with data
     * @param {string} event - Event name
     * @param {*} data - Data to pass to handlers
     */
    emit(event, data) {
        const handlers = this.events.get(event);
        if (handlers) {
            // Create iterator copy to allow unsubscribe during emit
            for (const handler of [...handlers]) {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for "${event}":`, error);
                }
            }
        }
    }

    /**
     * Subscribe to event once
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    once(event, callback) {
        const onceWrapper = (data) => {
            callback(data);
            this.off(event, onceWrapper);
        };
        return this.on(event, onceWrapper);
    }

    /**
     * Clear all event listeners
     */
    clear() {
        this.events.clear();
    }
}

// Create singleton instance
const eventBus = new EventBus();

export default eventBus;
