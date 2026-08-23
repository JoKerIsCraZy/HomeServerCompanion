// js/core/migrationRules.js
/**
 * The storage migrations themselves, in a form both worlds can load.
 *
 * js/options.js is a classic script and cannot import an ES module, so these
 * rules used to exist twice — once here in module form, once copied by hand
 * into options.js — with a note in CLAUDE.md asking that the two be kept
 * identical. Nothing enforced it, and a divergence corrupts settings.
 *
 * Attaching to globalThis is the one thing a classic script and a module can
 * agree on: the options page loads this with a script tag and calls the
 * global; js/core/migrations.js imports it for the side effect and re-exports
 * it with a proper name.
 *
 * Each migration is idempotent — running it twice on already-migrated data is
 * a no-op.
 *
 * @param {object} items - Mutable copy of chrome.storage.sync contents
 * @returns {{ changed: boolean, removedKeys: string[] }}
 */
globalThis.hscRunStorageMigrations = function runStorageMigrations(items) {
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

        // ---- v4.2: insert `dockhand` before `portainer` if missing ----
        // Same reasoning as tracearr above: an existing serviceOrder has no
        // entry for a service that did not exist when it was written, and the
        // sidebar renders from that array — so without this the new view stays
        // invisible until the user reorders the list by hand. Next to
        // Portainer, because they are the two Docker managers.
        if (!items.serviceOrder.includes('dockhand')) {
            const portainerIdx = items.serviceOrder.indexOf('portainer');
            if (portainerIdx !== -1) {
                items.serviceOrder.splice(portainerIdx, 0, 'dockhand');
            } else {
                items.serviceOrder.push('dockhand');
            }
            changed = true;
        }
    }

    // ---- v4.1: drop the stored Seerr account password ----
    // The password was persisted in cleartext to chrome.storage.sync, which
    // replicates to the user's Google account and to every signed-in profile.
    // It is never replayed — Seerr requests authenticate with the session
    // cookie — so it is removed outright rather than migrated anywhere.
    if ('seerrPassword' in items) {
        delete items.seerrPassword;
        removedKeys.push('seerrPassword');
        changed = true;
    }

    return { changed, removedKeys };
};
