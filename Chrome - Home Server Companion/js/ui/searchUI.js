import { aggregatedSearch, warmUpSearchCache } from "../utils/search.js";
import { showNotification } from "../utils.js";
import * as Overseerr from "../../services/overseerr.js";
import * as ProwlarrService from "../../services/prowlarr.js";
import { renderSearchResults as renderProwlarrResults, populateProwlarrCategories, populateProwlarrIndexers } from "./prowlarr.js";
import { searchAllContainers, controlContainerFromSearch } from "../../services/dockerSearch.js";

let searchContainer = null;
let searchInput = null;

export async function initSearchUI(state) {
    // Store state reference for search persistence restore
    window.__searchState = state;

    // Warm up cache in background
    warmUpSearchCache(state.configs);

    // Create Overlay if not exists
    if (!document.getElementById('unified-search-overlay')) {
        const overlay = document.createElement('div');
        overlay.id = 'unified-search-overlay';
        overlay.className = 'search-overlay hidden';

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

        // Persistence Toggle (only for Prowlarr searches)
        const persistenceWrapper = document.createElement('div');
        persistenceWrapper.className = 'persistence-toggle-wrapper';
        persistenceWrapper.title = 'Keep search results when closing extension';
        
        const persistenceLabel = document.createElement('label');
        persistenceLabel.className = 'persistence-toggle';
        
        const persistenceCheckbox = document.createElement('input');
        persistenceCheckbox.type = 'checkbox';
        persistenceCheckbox.id = 'unified-search-persistence';
        persistenceCheckbox.checked = localStorage.getItem('searchPersistenceEnabled') === 'true';
        
        const persistenceSlider = document.createElement('span');
        persistenceSlider.className = 'persistence-slider';
        
        const persistenceText = document.createElement('span');
        persistenceText.className = 'persistence-text';
        persistenceText.textContent = '📌';
        
        persistenceCheckbox.addEventListener('change', () => {
            localStorage.setItem('searchPersistenceEnabled', persistenceCheckbox.checked);
            if (!persistenceCheckbox.checked) {
                // Clear saved state when disabled
                localStorage.removeItem('savedSearchQuery');
                localStorage.removeItem('savedSearchResults');
            }
        });
        
        persistenceLabel.append(persistenceCheckbox, persistenceSlider);
        persistenceWrapper.append(persistenceLabel, persistenceText);
        
        filters.append(catSelect, indexerDropdown, persistenceWrapper);

        // Search Results
        const results = document.createElement('div');
        results.className = 'search-results';
        results.id = 'unified-search-results';
        results.setAttribute('role', 'region');
        results.setAttribute('aria-live', 'polite');

        const placeholder = document.createElement('div');
        placeholder.className = 'search-placeholder';
        placeholder.innerHTML = `
            <p>Search Movies & TV Shows</p>
            <div class="search-syntax-hints">
                <span class="syntax-hint"><code>n:</code> NZB Search (Prowlarr)</span>
                <span class="syntax-hint"><code>d:</code> Docker Containers</span>
            </div>
        `;
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
            const isDocker = /^d[;:]/i.test(query);
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
            
            // Skip auto-search only for Prowlarr (external indexer API calls)
            // Docker search can auto-search since it's local
            if (isProwlarr) {
                return; 
            }
            
            // For Docker search, perform auto-search with debounce
            if (isDocker) {
                const cleanQuery = query.substring(2).trim();
                if (cleanQuery.length >= 1) {
                    debounceTimer = setTimeout(() => {
                        performSearch(query, state);
                    }, 300); // Faster debounce for Docker since it's local
                }
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
            // ESC to close search (prevent closing the entire extension popup)
            if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
                e.preventDefault();
                e.stopPropagation();
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
    const filtersDiv = document.getElementById('unified-prowlarr-filters');
    
    if (overlay) {
        overlay.classList.remove('hidden');
        
        // Check if persistence is enabled and we have saved query
        // SECURITY: We only save the query, not HTML content (prevents XSS)
        const persistenceEnabled = localStorage.getItem('searchPersistenceEnabled') === 'true';
        const savedQuery = localStorage.getItem('savedSearchQuery');

        if (persistenceEnabled && savedQuery) {
            // Restore saved search query and re-execute search
            input.value = savedQuery;

            // Show/hide Prowlarr filters based on query type
            if (/^n[;:]/i.test(savedQuery)) {
                if (filtersDiv) filtersDiv.classList.remove('hidden');
            } else {
                if (filtersDiv) filtersDiv.classList.add('hidden');
            }

            // Focus at end of input
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);

            // Re-execute search safely instead of loading cached HTML
            // Use a small delay to ensure the overlay is fully visible
            setTimeout(() => {
                const stateFromWindow = window.__searchState;
                if (stateFromWindow && savedQuery.length >= 2) {
                    performSearch(savedQuery, stateFromWindow);
                }
            }, 100);
        } else {
            // Default behavior - clear everything and hide filters
            input.value = '';
            if (filtersDiv) filtersDiv.classList.add('hidden');
            
            const resultsContainer = document.getElementById('unified-search-results');
            resultsContainer.textContent = '';
            const placeholder = document.createElement('div');
            placeholder.className = 'search-placeholder';
            placeholder.innerHTML = `
                <p>Search Movies & TV Shows</p>
                <div class="search-syntax-hints">
                    <span class="syntax-hint clickable" data-prefix="n:"><code>n:</code> NZB Search</span>
                    <span class="syntax-hint clickable" data-prefix="d:"><code>d:</code> Docker Containers</span>
                </div>
            `;
            
            // Make hints clickable
            placeholder.querySelectorAll('.syntax-hint.clickable').forEach(hint => {
                hint.onclick = () => {
                    const prefix = hint.dataset.prefix;
                    input.value = prefix;
                    input.focus();
                    // Trigger input event to show filters if needed
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                };
            });
            
            resultsContainer.appendChild(placeholder);
            
            // Focus the input immediately
            input.focus();
        }
    }
}

function closeSearch() {
    const overlay = document.getElementById('unified-search-overlay');
    if (overlay) {
        // Save query only if persistence is enabled (not HTML for security)
        const persistenceEnabled = localStorage.getItem('searchPersistenceEnabled') === 'true';
        if (persistenceEnabled) {
            const input = document.getElementById('unified-search-input');
            if (input && input.value.trim()) {
                localStorage.setItem('savedSearchQuery', input.value);
            }
        }
        overlay.classList.add('hidden');
    }
}

// Helper function to save search query (not HTML for security)
function saveSearchState(query) {
    const persistenceEnabled = localStorage.getItem('searchPersistenceEnabled') === 'true';
    if (persistenceEnabled && query && query.trim()) {
        localStorage.setItem('savedSearchQuery', query);
    }
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
            
            const idxContainer = document.getElementById('unified-prowlarr-indexer-dropdown-options');
            if (idxContainer) {
                 const checked = Array.from(idxContainer.querySelectorAll(".indexer-checkbox:checked"));
                 if (checked.length > 0) {
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
            saveSearchState(query);
            return;
        }

        // Docker Search via 'd:' or 'd;' syntax
        if (/^d[;:]/i.test(query)) {
            const cleanQuery = query.substring(2).trim();
            if (cleanQuery.length < 1) {
                container.textContent = '';
                const typingDiv = document.createElement('div');
                typingDiv.className = 'no-results';
                typingDiv.textContent = 'Type container name to search...';
                container.appendChild(typingDiv);
                return;
            }
            
            const results = await searchAllContainers(state.configs, cleanQuery);
            renderDockerResults(results, container, state);
            saveSearchState(query);
            return;
        }

        const results = await aggregatedSearch(query, state.configs);
        renderResults(results, container, state);
        saveSearchState(query);
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

/**
 * Renders Docker container search results.
 */
function renderDockerResults(results, container, state) {
    container.replaceChildren();
    
    if (results.length === 0) {
        const noRes = document.createElement('div');
        noRes.className = 'no-results';
        const iconDiv = document.createElement('div');
        iconDiv.style.cssText = 'font-size: 32px; margin-bottom: 8px;';
        iconDiv.textContent = '📭';
        noRes.appendChild(iconDiv);
        const textNode = document.createTextNode('No containers found.');
        noRes.appendChild(textNode);
        container.appendChild(noRes);
        return;
    }

    // Group by source for visual organization
    results.forEach(item => {
        const div = document.createElement('div');
        div.className = `docker-result-item ${item.state}`;
        
        // Source badge
        const sourceBadge = document.createElement('div');
        sourceBadge.className = `docker-source-badge ${item.source}`;
        const sourceImg = document.createElement('img');
        sourceImg.src = item.sourceIcon;
        sourceImg.alt = item.sourceName;
        sourceImg.className = 'docker-source-icon';
        sourceBadge.appendChild(sourceImg);
        const sourceText = document.createElement('span');
        sourceText.textContent = item.sourceName;
        sourceBadge.appendChild(sourceText);
        div.appendChild(sourceBadge);
        
        // Status dot
        const statusDot = document.createElement('div');
        statusDot.className = `docker-status-dot ${item.state}`;
        div.appendChild(statusDot);
        
        // Container info
        const info = document.createElement('div');
        info.className = 'docker-info';
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'docker-name';
        nameDiv.textContent = item.name;
        info.appendChild(nameDiv);
        
        const imageDiv = document.createElement('div');
        imageDiv.className = 'docker-image';
        imageDiv.textContent = item.image;
        imageDiv.title = item.image;
        info.appendChild(imageDiv);
        
        const statusDiv = document.createElement('div');
        statusDiv.className = 'docker-status-text';
        statusDiv.textContent = item.status || item.state;
        info.appendChild(statusDiv);
        
        div.appendChild(info);
        
        // Actions
        const actions = document.createElement('div');
        actions.className = 'docker-actions';
        
        const isRunning = item.state === 'running';
        const isStopped = item.state === 'stopped' || item.state === 'exited';
        
        if (isStopped) {
            const startBtn = document.createElement('button');
            startBtn.className = 'docker-action-btn start';
            startBtn.innerHTML = '▶️';
            startBtn.title = 'Start';
            startBtn.onclick = async (e) => {
                e.stopPropagation();
                startBtn.disabled = true;
                startBtn.innerHTML = '⏳';
                try {
                    await controlContainerFromSearch(item, 'start');
                    showNotification(`Started "${item.name}"`, 'success');
                    statusDot.className = 'docker-status-dot running';
                    statusDiv.textContent = 'Running';
                    div.className = 'docker-result-item running';
                    // Replace start with stop/restart
                    actions.innerHTML = '';
                    addRunningActions(actions, item, statusDot, statusDiv, div);
                } catch (err) {
                    showNotification(`Failed to start: ${err.message}`, 'error');
                    startBtn.disabled = false;
                    startBtn.innerHTML = '▶️';
                }
            };
            actions.appendChild(startBtn);
        }
        
        if (isRunning) {
            addRunningActions(actions, item, statusDot, statusDiv, div);
        }
        
        // WebUI button (for running containers with webui)
        if (item.webui && isRunning) {
            const webuiBtn = document.createElement('button');
            webuiBtn.className = 'docker-action-btn webui';
            webuiBtn.innerHTML = '🌐';
            webuiBtn.title = 'Open WebUI';
            webuiBtn.onclick = (e) => {
                e.stopPropagation();
                chrome.tabs.create({ url: item.webui });
            };
            actions.appendChild(webuiBtn);
        }
        
        div.appendChild(actions);
        container.appendChild(div);
    });
    
    function addRunningActions(actions, item, statusDot, statusDiv, div) {
        const stopBtn = document.createElement('button');
        stopBtn.className = 'docker-action-btn stop';
        stopBtn.innerHTML = '⏹️';
        stopBtn.title = 'Stop';
        stopBtn.onclick = async (e) => {
            e.stopPropagation();
            stopBtn.disabled = true;
            stopBtn.innerHTML = '⏳';
            try {
                await controlContainerFromSearch(item, 'stop');
                showNotification(`Stopped "${item.name}"`, 'success');
                statusDot.className = 'docker-status-dot stopped';
                statusDiv.textContent = 'Stopped';
                div.className = 'docker-result-item stopped';
                // Replace with start button
                actions.innerHTML = '';
                const startBtn = document.createElement('button');
                startBtn.className = 'docker-action-btn start';
                startBtn.innerHTML = '▶️';
                startBtn.title = 'Start';
                startBtn.onclick = async () => {
                    await controlContainerFromSearch(item, 'start');
                    showNotification(`Started "${item.name}"`, 'success');
                    location.reload(); // Refresh to update state
                };
                actions.appendChild(startBtn);
            } catch (err) {
                showNotification(`Failed to stop: ${err.message}`, 'error');
                stopBtn.disabled = false;
                stopBtn.innerHTML = '⏹️';
            }
        };
        
        const restartBtn = document.createElement('button');
        restartBtn.className = 'docker-action-btn restart';
        restartBtn.innerHTML = '🔄';
        restartBtn.title = 'Restart';
        restartBtn.onclick = async (e) => {
            e.stopPropagation();
            restartBtn.disabled = true;
            restartBtn.innerHTML = '⏳';
            try {
                await controlContainerFromSearch(item, 'restart');
                showNotification(`Restarted "${item.name}"`, 'success');
                restartBtn.innerHTML = '🔄';
                restartBtn.disabled = false;
            } catch (err) {
                showNotification(`Failed to restart: ${err.message}`, 'error');
                restartBtn.disabled = false;
                restartBtn.innerHTML = '🔄';
            }
        };
        
        actions.appendChild(stopBtn);
        actions.appendChild(restartBtn);
    }
}
