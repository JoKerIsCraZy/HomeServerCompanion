import { aggregatedSearch, warmUpSearchCache } from "../utils/search.js";
import { showNotification } from "../utils.js";
// Imports for "Add" actions if needed, or just leverage Overseerr logic
import * as Overseerr from "../../services/overseerr.js";

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
        overlay.innerHTML = `
            <div class="search-modal">
                <div class="search-header">
                    <div class="search-input-wrapper">
                        <span class="search-icon">🔍</span>
                        <input type="text" id="unified-search-input" placeholder="Search Libraries & Discovery..." autocomplete="off">
                        <button id="unified-search-close" class="close-btn">&times;</button>
                    </div>
                </div>
                <div class="search-results" id="unified-search-results">
                    <!-- Results go here -->
                    <div class="search-placeholder">
                        <p>Type to search across Sonarr, Radarr, and Overseerr.</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Bind Events
        const input = document.getElementById('unified-search-input');
        const close = document.getElementById('unified-search-close');
        
        close.onclick = closeSearch;
        
        // Close on backdrop click
        overlay.onclick = (e) => {
            if (e.target === overlay) closeSearch();
        };

        // Input Logic
        let debounceTimer;
        input.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (debounceTimer) clearTimeout(debounceTimer);
            
            if (query.length < 2) {
                document.getElementById('unified-search-results').innerHTML = '';
                return;
            }

            debounceTimer = setTimeout(() => {
                performSearch(query, state);
            }, 500);
        });

        // ESC to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
                closeSearch();
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
        input.focus();
        document.getElementById('unified-search-results').innerHTML = '<div class="search-placeholder"><p>Type to search...</p></div>';
    }
}

function closeSearch() {
    const overlay = document.getElementById('unified-search-overlay');
    if (overlay) overlay.classList.add('hidden');
}

async function performSearch(query, state) {
    const container = document.getElementById('unified-search-results');
    container.innerHTML = '<div class="loading-spinner">Searching...</div>';

    try {
        const results = await aggregatedSearch(query, state.configs);
        renderResults(results, container, state);
    } catch (e) {
        container.innerHTML = `<div class="error-msg">Search failed: ${e.message}</div>`;
    }
}

function renderResults(results, container, state) {
    container.innerHTML = '';
    
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
        const img = document.createElement('img');
        img.src = item.poster;
        img.className = 'result-poster';
        img.onerror = () => { img.src = 'icons/placeholder.png'; };
        div.appendChild(img);

        // 2. Info Container
        const info = document.createElement('div');
        info.className = 'result-info';

        // Title Row
        const titleDiv = document.createElement('div');
        titleDiv.className = 'result-title';
        titleDiv.textContent = item.title + ' ';
        
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
        }

        div.appendChild(actions);
        container.appendChild(div);
    });
}
