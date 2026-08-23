// js/core/Poller.js
/**
 * Central polling scheduler.
 *
 * Every service view used to own a bare `setInterval`, which meant four things
 * were either missing or reimplemented per view:
 *
 * - **Nothing paused when the page was hidden.** The popup is destroyed on
 *   close so it never mattered there, but the fullscreen page is an ordinary
 *   tab: left open in the background it kept hitting the home server forever.
 * - **A dead service was retried at full speed.** No backoff, so an unreachable
 *   host produced one failed request per second for as long as the tab lived.
 * - **Only SABnzbd guarded against overlapping runs.** Elsewhere a slow
 *   response could be overtaken by the next one and repaint the view with
 *   older data.
 * - **Every view switch tore its timer down and reloaded from nothing**, so
 *   returning to a tab always showed a loading state, even for data seconds old.
 *
 * Tasks registered here get all four for free.
 */

/** Longest a backed-off task will wait between attempts. */
const MAX_BACKOFF_MS = 60000;

/** Failures before the interval starts growing. */
const FAILURES_BEFORE_BACKOFF = 2;

class Poller {
    constructor() {
        /** @type {Map<string, Object>} Registered tasks by name */
        this.tasks = new Map();
        this.paused = false;
        this._visibilityBound = false;
    }

    /**
     * Installs the one visibility listener the whole app shares.
     * @private
     */
    _bindVisibility() {
        if (this._visibilityBound) return;
        this._visibilityBound = true;

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseAll();
            } else {
                this.resumeAll();
            }
        });
    }

    /**
     * Registers a task and starts it.
     *
     * @param {string} name - Unique task name; re-registering replaces it
     * @param {Function} fn - Async function to run each tick
     * @param {Object} [options]
     * @param {number} [options.interval=5000] - Base delay between runs, ms
     * @param {boolean} [options.immediate=true] - Run once on registration
     * @param {string} [options.group='view'] - Lifecycle group. View tasks are
     *   torn down on every view switch; badge tasks must survive it.
     * @returns {Function} Unregister function
     */
    register(name, fn, { interval = 5000, immediate = true, group = 'view' } = {}) {
        this._bindVisibility();
        this.unregister(name);

        const task = {
            name,
            fn,
            interval,
            group,
            timerId: null,
            inFlight: false,
            failures: 0,
            lastRunAt: 0,
            lastOkAt: 0,
            lastError: null
        };
        this.tasks.set(name, task);

        if (immediate && !document.hidden) {
            this._run(task);
        } else {
            this._schedule(task);
        }

        return () => this.unregister(name);
    }

    /**
     * Runs a task now, guarding against overlap, then schedules the next run.
     * @param {Object} task
     * @private
     */
    async _run(task) {
        // A tick that is still in flight must not be started again: two runs
        // can resolve out of order and the older one wins the repaint.
        if (task.inFlight) return;
        task.inFlight = true;
        task.lastRunAt = Date.now();

        try {
            await task.fn();
            task.failures = 0;
            task.lastError = null;
            task.lastOkAt = Date.now();
        } catch (error) {
            task.failures++;
            task.lastError = error;
            console.warn(`Poll "${task.name}" failed (${task.failures}):`, error?.message || error);
        } finally {
            task.inFlight = false;
            if (this.tasks.get(task.name) === task) this._schedule(task);
        }
    }

    /**
     * Queues the next run, stretched out when the task keeps failing.
     * @param {Object} task
     * @private
     */
    _schedule(task) {
        clearTimeout(task.timerId);
        if (this.paused || document.hidden) return;

        // Backoff doubles per failure past the threshold, so an unreachable
        // host settles at one attempt a minute instead of one a second.
        const overage = Math.max(task.failures - FAILURES_BEFORE_BACKOFF + 1, 0);
        const delay = overage > 0
            ? Math.min(task.interval * Math.pow(2, overage), MAX_BACKOFF_MS)
            : task.interval;

        task.timerId = setTimeout(() => this._run(task), delay);
    }

    /**
     * Runs one task immediately, outside its schedule.
     * @param {string} name
     * @returns {Promise<void>}
     */
    async runNow(name) {
        const task = this.tasks.get(name);
        if (task) await this._run(task);
    }

    /**
     * Stops a task and forgets it.
     * @param {string} name
     */
    unregister(name) {
        const task = this.tasks.get(name);
        if (!task) return;
        clearTimeout(task.timerId);
        this.tasks.delete(name);
    }

    /** Stops and forgets every task. */
    stopAll() {
        for (const task of this.tasks.values()) clearTimeout(task.timerId);
        this.tasks.clear();
    }

    /**
     * Stops and forgets every task in one group, leaving the others running.
     * A view switch ends the view's polling but must not stop badge updates.
     * @param {string} group
     */
    stopGroup(group) {
        for (const task of [...this.tasks.values()]) {
            if (task.group !== group) continue;
            clearTimeout(task.timerId);
            this.tasks.delete(task.name);
        }
    }

    /** Suspends every task without forgetting it. */
    pauseAll() {
        this.paused = true;
        for (const task of this.tasks.values()) clearTimeout(task.timerId);
    }

    /**
     * Resumes every task. A task whose interval elapsed while hidden runs at
     * once rather than waiting out another full period, so coming back to the
     * window never shows stale numbers.
     */
    resumeAll() {
        this.paused = false;
        for (const task of this.tasks.values()) {
            const elapsed = Date.now() - task.lastRunAt;
            if (elapsed >= task.interval) {
                this._run(task);
            } else {
                clearTimeout(task.timerId);
                task.timerId = setTimeout(() => this._run(task), task.interval - elapsed);
            }
        }
    }

    /**
     * Health of a task, for views that want to show a stale or offline state.
     * @param {string} name
     * @returns {{failures: number, lastOkAt: number, lastError: Error|null}|null}
     */
    status(name) {
        const task = this.tasks.get(name);
        if (!task) return null;
        return { failures: task.failures, lastOkAt: task.lastOkAt, lastError: task.lastError };
    }
}

const poller = new Poller();
export default poller;
