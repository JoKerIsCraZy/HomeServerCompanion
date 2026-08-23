// js/core/changelogEntries.js
/**
 * The "What's New" entries, in a form both worlds can load.
 *
 * js/options.js is a classic script and cannot import an ES module, so this
 * list existed twice - once inline in checkAndShowChangelog(), once copied by
 * hand into options.js. Nothing kept them in step, and both copies had
 * already been carried unchanged past a version bump, which is how a modal
 * ends up titled "What's New in v4.1.0" over the previous release's bullets.
 *
 * Same trick as js/core/migrationRules.js: attaching to globalThis is the one
 * thing a classic script and a module can agree on. The options page loads
 * this with a script tag; js/utils.js imports it for the side effect.
 *
 * Rewrite the list on every release. It describes one version - the one in
 * the manifest - and is not a running history.
 *
 * @type {Array<{title: string, desc: string}>}
 */
globalThis.hscChangelogEntries = [
    { title: 'Dockhand:', desc: 'New service for Docker management across every host one Dockhand server fronts — start, stop and restart containers, read live logs, pull image updates, and control compose stacks, with a picker for the environment you are working in.' },
    { title: 'Docker Search Sources:', desc: 'The d: search now covers Dockhand alongside Unraid and Portainer, and Settings lets you choose which of the three take part — more than one of them can manage the same host, and then a container came back once per source.' },
    { title: 'Settings, Rebuilt:', desc: 'Service navigation is a vertical list with icons and a status dot per service, so a glance tells you what is configured, what is switched off, and what is still empty. The page now draws on the same design tokens as the rest of the extension.' },
    { title: 'Unraid, Rebuilt:', desc: 'Status and uptime moved into the header, Docker and VM entries became cards like Storage and System, and their actions sit on the card and appear when you point at it instead of hiding behind a dropdown.' },
    { title: 'SABnzbd, Rebuilt:', desc: 'The queue view was rebuilt around live speed, ETA and per-item controls.' },
    { title: 'Wider Dashboard:', desc: 'Four cards per row instead of two.' },
    { title: 'Central Scheduler:', desc: 'One polling scheduler for every view. It pauses while the popup is hidden, backs off after a failure instead of hammering a service that is down, and staggers requests rather than firing them all at once.' },
    { title: 'Security Hardening:', desc: 'The stored Seerr account password is deleted on upgrade — it was never replayed, but it was kept in cleartext and synced to your Google account. Credential transport and external link handling were tightened alongside it.' },
    { title: 'Bug Fixes:', desc: 'Over twenty, including refresh spinners that never spun, the Prowlarr indexer filter being ignored, Portainer header rules reaching other services on the same domain, and several places that reported success they had not earned.' }
];
