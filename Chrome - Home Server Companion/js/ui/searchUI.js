import { aggregatedSearch, warmUpSearchCache } from "../utils/search.js";
import { showNotification } from "../utils.js";
// Imports for "Add" actions if needed, or just leverage Overseerr logic
import * as Overseerr from "../../services/overseerr.js";
import * as ProwlarrService from "../../services/prowlarr.js";
import { renderSearchResults as renderProwlarrResults, populateProwlarrCategories, populateProwlarrIndexers } from "./prowlarr.js";

let searchContainer = null;
let searchInput = null;

export async function initSearchUI(state) {
    // Warm up cache in background
    warmUpSearchCache(state.configs);

    // Create Overlay if not exists
    if (!document.getElementById('unified-search-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'unified-search-overlay';
        overlay.className = 'search-overlay hidden';

        // XSS FIX: Build DOM structure using DOM API instead of innerHTML
        const modal = document.createElement('div');
        modal.className = 'search-modal';

        // Search Header
        const header = document.createElement('div');
        header.className = 'search-header';

        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'search-input-wrapper';

        const searchIcon = document.createElement('span');
        searchIcon.className = 'search-icon';
        searchIcon.textContent = '🔍';
        searchIcon.setAttribute('aria-hidden', 'true');

        const input = document.createElement('input');
        input.type = 'text';
        input.id = 'unified-search-input';
        input.placeholder = 'Search Libraries & Discovery...';
        input.autocomplete = 'off';
        input.setAttribute('aria-label', 'Search Libraries and Discovery');

        const closeBtn = document.createElement('button');
        closeBtn.id = 'unified-search-close';
        closeBtn.className = 'close-btn';
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', 'Close search');

        inputWrapper.append(searchIcon, input, closeBtn);
        header.appendChild(inputWrapper);

        // Prowlarr Filters
        const filters = document.createElement('div');
        filters.id = 'unified-prowlarr-filters';
        filters.className = 'hidden';

        const catSelect = document.createElement('select');
        catSelect.id = 'unified-prowlarr-category';
        catSelect.setAttribute('aria-label', 'Filter by category');
        const defaultCatOption = document.createElement('option');
        defaultCatOption.value = '';
        defaultCatOption.textContent = 'All Categories';
        catSelect.appendChild(defaultCatOption);

        const indexerDropdown = document.createElement('div');
        indexerDropdown.id = 'unified-prowlarr-indexer-dropdown';
        indexerDropdown.className = 'custom-dropdown';

        const indexerTrigger = document.createElement('div');
        indexerTrigger.id = 'unified-prowlarr-indexer-dropdown-trigger';
        indexerTrigger.className = 'dropdown-trigger';
        indexerTrigger.textContent = 'All Indexers';
        indexerTrigger.setAttribute('role', 'button');
        indexerTrigger.setAttribute('aria-haspopup', 'listbox');
        indexerTrigger.setAttribute('aria-expanded', 'false');

        const indexerOptions = document.createElement('div');
        indexerOptions.id = 'unified-prowlarr-indexer-dropdown-options';
        indexerOptions.className = 'dropdown-options hidden';
        indexerOptions.setAttribute('role', 'listbox');

        indexerDropdown.append(indexerTrigger, indexerOptions);
        filters.append(catSelect, indexerDropdown);

        // Search Results
        const results = document.createElement('div');
        results.className = 'search-results';
        results.id = 'unified-search-results';
        results.setAttribute('role', 'region');
        results.setAttribute('aria-live', 'polite');

        const placeholder = document.createElement('div');
        placeholder.className = 'search-placeholder';
        const placeholderText = document.createElement('p');
        placeholderText.textContent = 'Type to search across Sonarr, Radarr, and Overseerr.';
        placeholder.appendChild(placeholderText);
        results.appendChild(placeholder);

        modal.append(header, filters, results);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Bind Events (using already created elements)
        const searchInput = input;
        const close = closeBtn;
        
        close.onclick = closeSearch;
        
        // Close on backdrop click
        overlay.onclick = (e) => {
            if (e.target === overlay) closeSearch();
        };

        // Input Logic
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (debounceTimer) clearTimeout(debounceTimer);
            
            // Toggle Prowlarr Filters Visibility based on syntax
            const isProwlarr = /^n[;:]/i.test(query);
            const filtersDiv = document.getElementById('unified-prowlarr-filters');
            const searchHeader = document.querySelector('.search-header');
            
            if (filtersDiv) {
                if (isProwlarr) {
                    filtersDiv.classList.remove('hidden');
                    if (searchHeader) searchHeader.style.borderBottom = 'none';

                    // Populate if empty and config exists
                    const catSelect = document.getElementById('unified-prowlarr-category');
                    const idxOptions = document.getElementById('unified-prowlarr-indexer-dropdown-options');
                    const idxTrigger = document.getElementById('unified-prowlarr-indexer-dropdown-trigger');
                    
                    if (catSelect && catSelect.children.length <= 1 && state.configs.prowlarrUrl && state.configs.prowlarrKey) {
                        populateProwlarrCategories(state.configs.prowlarrUrl, state.configs.prowlarrKey, catSelect);
                    }
                    if (idxOptions && idxOptions.children.length === 0 && state.configs.prowlarrUrl && state.configs.prowlarrKey) {
                        populateProwlarrIndexers(state.configs.prowlarrUrl, state.configs.prowlarrKey, idxOptions, idxTrigger);
                    }
                    
                    // Toggle Indexer Dropdown (Unified Search specific)
                    if (idxTrigger && !idxTrigger.onclick) {
                         idxTrigger.onclick = (e) => {
                             e.stopPropagation();
                             idxOptions.classList.toggle('hidden');
                         };
                         // Close on click outside
                         document.addEventListener('click', (e) => {
                             if (!idxTrigger.contains(e.target) && !idxOptions.contains(e.target)) {
                                 idxOptions.classList.add('hidden');
                             }
                         });
                    }
                    
                    // Add separator styling
                    filtersDiv.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
                    filtersDiv.style.paddingBottom = "15px";
                    filtersDiv.style.marginBottom = "15px";
                } else {
                    filtersDiv.classList.add('hidden');
                    const searchHeader = document.querySelector('.search-header');
                    if (searchHeader) searchHeader.style.borderBottom = '';
                }
            }
            
            // Skip auto-search for Prowlarr syntax (n; or n:)
            if (isProwlarr) {
                return; 
            }
            
            if (query.length < 2) {
                document.getElementById('unified-search-results').textContent = '';
                return;
            }

            debounceTimer = setTimeout(() => {
                performSearch(query, state);
            }, 500);
        });

        // Keydown Logic (Enter & ESC)
        document.addEventListener('keydown', (e) => {
            // ESC to close
            if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
                closeSearch();
            }
            // Enter to search (Force trigger mostly for Prowlarr)
            if (e.key === 'Enter' && !overlay.classList.contains('hidden')) {
                 const query = searchInput.value.trim();
                 if (query.length > 0) {
                     if (debounceTimer) clearTimeout(debounceTimer);
                     performSearch(query, state);
                 }
            }
        });
    }
}

export function openSearch() {
    const overlay = document.getElementById('unified-search-overlay');
    const input = document.getElementById('unified-search-input');
    if (overlay) {
        overlay.classList.remove('hidden');
        input.value = '';
        const resultsContainer = document.getElementById('unified-search-results');
        resultsContainer.textContent = '';
        const placeholder = document.createElement('div');
        placeholder.className = 'search-placeholder';
        const p = document.createElement('p');
        p.textContent = 'Type to search...';
        placeholder.appendChild(p);
        resultsContainer.appendChild(placeholder);
    }
}

function closeSearch() {
    const overlay = document.getElementById('unified-search-overlay');
    if (overlay) overlay.classList.add('hidden');
}

async function performSearch(query, state) {
    const container = document.getElementById('unified-search-results');
    container.textContent = '';
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.textContent = 'Searching...';
    container.appendChild(spinner);

    try {
        // Prowlarr Search via 'N;' or 'N:' syntax
        if (/^n[;:]/i.test(query)) {
            if (!state.configs.prowlarrUrl || !state.configs.prowlarrKey) {
                 throw new Error("Prowlarr not configured");
            }
            const cleanQuery = query.substring(2).trim();
            if (cleanQuery.length < 2) {
                // XSS FIX: Use DOM API instead of innerHTML
                container.textContent = '';
                const typingDiv = document.createElement('div');
                typingDiv.className = 'no-results';
                typingDiv.textContent = 'Typing Prowlarr search...';
                container.appendChild(typingDiv);
                return;
            }
            // Collect Filter Values
            let categories = null;
            let indexerIds = null;
            
            const catSelect = document.getElementById('unified-prowlarr-category');
            if (catSelect && catSelect.value) {
                categories = catSelect.value;
            }
            
            // Indexers: check "All" or gather checkboxes
            // The structure is #unified-prowlarr-indexer-dropdown-options .indexer-checkbox
            // But checking the Prowlarr logic, if "All" is checked or none specific, we send null (which means all).
            // Actually, we can check the checkboxes inside our specific container.
            const idxContainer = document.getElementById('unified-prowlarr-indexer-dropdown-options');
            if (idxContainer) {
                 const checked = Array.from(idxContainer.querySelectorAll(".indexer-checkbox:checked"));
                 if (checked.length > 0) {
                     // Check if "All" is selected? Logic in prowlarr.js handles UI, here we just read vals.
                     // Wait, in populateProwlarrIndexers we have an 'All' checkbox too. 
                     // We should check if 'All' is NOT checked before sending IDs.
                     // But the 'All' checkbox doesn't have a specific ID we can easily grab unless we search for it.
                     // The population logic adds a checkbox with local variable 'allCheckbox'.
                     // However, the rule typically is: if specific IDs are provided, they are used. If null/empty, all are used.
                     // So just gathering the checked values of `.indexer-checkbox` (which are the specific ones) is enough?
                     // Let's verify population logic:
                     // The specific indexers have class `indexer-checkbox`. The "All" checkbox does NOT have that class?
                     // Let's check populateProwlarrIndexers again...
                     // Yes: `checkbox.className = 'indexer-checkbox';` for specific ones.
                     // `allCheckbox` does NOT have that class. Good.
                     
                     indexerIds = checked.map(cb => cb.value);
                 }
            }

            const results = await ProwlarrService.searchProwlarr(
                state.configs.prowlarrUrl, 
                state.configs.prowlarrKey, 
                cleanQuery,
                categories,
                indexerIds
            );
            renderProwlarrResults(results, container);
            return;
        }

        const results = await aggregatedSearch(query, state.configs);
        renderResults(results, container, state);
    } catch (e) {
        container.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'error-msg';
        errDiv.textContent = 'Search failed: ' + e.message;
        container.appendChild(errDiv);
    }
}

function createPosterPlaceholder() {
    const placeholder = document.createElement('div');
    placeholder.className = 'no-poster-placeholder';
    
    // Film/image icon SVG - XSS FIX: Use DOM API instead of innerHTML
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z');
    svg.appendChild(path);
    placeholder.appendChild(svg);
    
    // "No Image" text
    const text = document.createElement('span');
    text.textContent = 'No Image';
    placeholder.appendChild(text);
    
    return placeholder;
}

function renderResults(results, container, state) {
    // XSS FIX: Use replaceChildren instead of innerHTML = ''
    container.replaceChildren();
    
    if (results.length === 0) {
        const noRes = document.createElement('div');
        noRes.className = 'no-results';
        noRes.textContent = 'No results found.';
        container.appendChild(noRes);
        return;
    }

    results.forEach(item => {
        const div = document.createElement('div');
        div.className = `search-result-item ${item.status.toLowerCase().replace(' ', '-')}`;
        
        // 1. Poster
        if (item.poster && item.poster !== 'icons/placeholder.png') {
            const img = document.createElement('img');
            img.src = item.poster;
            img.className = 'result-poster';
            img.onerror = () => {
                // Replace broken image with placeholder
                const placeholder = createPosterPlaceholder();
                img.replaceWith(placeholder);
            };
            div.appendChild(img);
        } else {
            // No poster available - show placeholder immediately
            const placeholder = createPosterPlaceholder();
            div.appendChild(placeholder);
        }

        // 2. Info Container
        const info = document.createElement('div');
        info.className = 'result-info';

        // Title Row - Clickable to open in Overseerr
        const titleDiv = document.createElement('div');
        titleDiv.className = 'result-title clickable-title';
        titleDiv.textContent = item.title + ' ';
        titleDiv.style.cursor = 'pointer';
        titleDiv.title = 'Open in Overseerr';
        
        // Click handler to open Overseerr page
        titleDiv.addEventListener('click', () => {
            const overseerrUrl = state.configs.overseerrUrl;
            if (overseerrUrl) {
                const mediaType = item.type === 'tv' ? 'tv' : 'movie';
                const url = `${overseerrUrl}/${mediaType}/${item.id}`;
                chrome.tabs.create({ url });
            }
        });
        
        const yearSpan = document.createElement('span');
        yearSpan.className = 'result-year';
        yearSpan.textContent = `(${item.year})`;
        titleDiv.appendChild(yearSpan);
        info.appendChild(titleDiv);

        // Type
        const typeDiv = document.createElement('div');
        typeDiv.className = 'result-type';
        typeDiv.textContent = item.type.toUpperCase();
        info.appendChild(typeDiv);

        // Overview
        const overviewDiv = document.createElement('div');
        overviewDiv.className = 'result-overview';
        const overviewText = item.overview ? item.overview : '';
        overviewDiv.textContent = overviewText.length > 100 ? overviewText.substring(0, 100) + '...' : overviewText;
        info.appendChild(overviewDiv);

        div.appendChild(info);

        // 3. Actions
        const actions = document.createElement('div');
        actions.className = 'result-actions';

        if (item.status === 'Request') {
             const btn = document.createElement('button');
             btn.className = 'action-btn request-btn';
             btn.textContent = 'Request';
             
             // Bind Click
             btn.onclick = async () => {
                btn.disabled = true;
                btn.textContent = 'Requesting...';
                try {
                     let payload = {
                         mediaId: item.id,
                         mediaType: item.type
                     };

                     // Special handling for TV Series
                     if (item.type === 'tv') {
                         try {
                             const details = await Overseerr.getTv(state.configs.overseerrUrl, state.configs.overseerrKey, item.id);
                             if (details && details.seasons) {
                                 const seasonsToRequest = details.seasons
                                     .filter(s => s.seasonNumber > 0)
                                     .map(s => s.seasonNumber);
                                 
                                 if (seasonsToRequest.length > 0) {
                                     payload.seasons = seasonsToRequest;
                                 }
                             }
                         } catch (err) {
                             console.warn("Failed to fetch TV details for smart season selection, falling back to default.", err);
                         }
                     }

                     await Overseerr.request(state.configs.overseerrUrl, state.configs.overseerrKey, payload);
                     showNotification('Requested Successfully!', 'success');
                     
                     // Replace button with Pending badge
                     const badge = document.createElement('span');
                     badge.className = 'status-badge pending';
                     badge.textContent = 'Pending';
                     btn.replaceWith(badge);
                     
                } catch (e) {
                     showNotification('Request Failed', 'error');
                     btn.disabled = false;
                     btn.textContent = 'Request';
                }
            };
            actions.appendChild(btn);

        } else {
             const badge = document.createElement('span');
             badge.className = 'status-badge';
             
             // Specific styles
             if (item.status === 'Available') badge.classList.add('available');
             else if (item.status === 'Pending') badge.classList.add('pending');
             else if (item.status === 'Processing') badge.classList.add('processing');
             
             badge.textContent = item.status;
             actions.appendChild(badge);
             
             // Add service buttons for Available or Partially Available items
             if (item.status === 'Available' || item.status === 'Partially Available') {
                 // Radarr button for movies
                 if (item.type === 'movie' && state.configs.radarrUrl) {
                     const radarrBtn = document.createElement('button');
                     radarrBtn.className = 'service-link-btn';
                     radarrBtn.title = 'Open in Radarr';
                     // XSS FIX: Use DOM API instead of innerHTML
                     const radarrImg = document.createElement('img');
                     radarrImg.src = 'https://favicone.com/radarr.video?s=32';
                     radarrImg.alt = 'Radarr';
                     radarrImg.style.cssText = 'width: 18px; height: 18px; border-radius: 2px;';
                     radarrBtn.appendChild(radarrImg);
                     radarrBtn.addEventListener('click', (e) => {
                         e.stopPropagation();
                         // Use TMDB ID (item.id) - Radarr URLs use /movie/{tmdbId} format
                         const radarrUrl = `${state.configs.radarrUrl}/movie/${item.id}`;
                         chrome.tabs.create({ url: radarrUrl });
                     });
                     actions.appendChild(radarrBtn);
                 }
                 
                 // Sonarr button for TV shows
                 if (item.type === 'tv' && state.configs.sonarrUrl) {
                     const sonarrBtn = document.createElement('button');
                     sonarrBtn.className = 'service-link-btn';
                     sonarrBtn.title = 'Open in Sonarr';
                     // XSS FIX: Use DOM API instead of innerHTML
                     const sonarrImg = document.createElement('img');
                     sonarrImg.src = 'https://favicone.com/sonarr.tv?s=32';
                     sonarrImg.alt = 'Sonarr';
                     sonarrImg.style.cssText = 'width: 18px; height: 18px; border-radius: 2px;';
                     sonarrBtn.appendChild(sonarrImg);
                     sonarrBtn.addEventListener('click', (e) => {
                         e.stopPropagation();
                         let sonarrUrl;
                         if (item.sonarrSlug) {
                             // Direct open: /series/{slug}
                             sonarrUrl = `${state.configs.sonarrUrl}/series/${item.sonarrSlug}`;
                         } else {
                             // Fallback: Add New Search
                             sonarrUrl = `${state.configs.sonarrUrl}/add/new?term=${encodeURIComponent(item.title)}`;
                         }
                         chrome.tabs.create({ url: sonarrUrl });
                     });
                     actions.appendChild(sonarrBtn);
                 }
                 
                 // Plex button
                 if (item.plexUrl || item.plexRatingKey) {
                     const plexBtn = document.createElement('button');
                     plexBtn.className = 'plex-play-btn';
                     plexBtn.title = 'Open in Plex';
                     // XSS FIX: Use DOM API instead of innerHTML
                     const plexImg = document.createElement('img');
                     plexImg.src = 'https://favicone.com/plex.tv?s=32';
                     plexImg.alt = 'Plex';
                     plexImg.style.cssText = 'width: 18px; height: 18px; border-radius: 2px;';
                     plexBtn.appendChild(plexImg);
                     plexBtn.addEventListener('click', async (e) => {
                         e.stopPropagation();
                         
                         // Check Plex redirect mode from settings
                         const plexSettings = await chrome.storage.sync.get(['plexRedirectMode', 'plexUrl', 'plexToken']);
                         const redirectMode = plexSettings.plexRedirectMode || 'web';
                         
                         if (redirectMode === 'web' || !plexSettings.plexUrl) {
                             // Web mode: Open Plex web URL
                             if (item.plexUrl) {
                                 chrome.tabs.create({ url: item.plexUrl });
                             } else {
                                 // Fallback: Search on Plex
                                 chrome.tabs.create({ url: `https://app.plex.tv/desktop/#!/search?query=${encodeURIComponent(item.title)}` });
                             }
                         } else {
                             // App mode: Fetch Plex GUID and open plex://
                             try {
                                 const metadataUrl = `${plexSettings.plexUrl}/library/metadata/${item.plexRatingKey}?X-Plex-Token=${plexSettings.plexToken}`;
                                 const response = await fetch(metadataUrl, { headers: { 'Accept': 'application/json' } });
                                 
                                 if (response.ok) {
                                     const data = await response.json();
                                     const metadata = data.MediaContainer?.Metadata?.[0];
                                     
                                     if (metadata?.guid) {
                                         // Extract the Plex GUID (format: plex://movie/xxxxx or plex://show/xxxxx)
                                         const plexGuid = metadata.guid;
                                         console.log('Opening Plex app with GUID:', plexGuid);
                                         chrome.tabs.create({ url: plexGuid });
                                     } else {
                                         // Fallback to web
                                         chrome.tabs.create({ url: item.plexUrl || `https://app.plex.tv` });
                                     }
                                 } else {
                                     // API failed, fallback to web
                                     chrome.tabs.create({ url: item.plexUrl || `https://app.plex.tv` });
                                 }
                             } catch (err) {
                                 console.error('Plex API error:', err);
                                 chrome.tabs.create({ url: item.plexUrl || `https://app.plex.tv` });
                             }
                         }
                     });
                     actions.appendChild(plexBtn);
                 }
             }
        }

        div.appendChild(actions);
        container.appendChild(div);
    });
}
