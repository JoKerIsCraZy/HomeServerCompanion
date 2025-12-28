import * as Sonarr from '../../services/sonarr.js';
import * as Radarr from '../../services/radarr.js';
import * as Overseerr from '../../services/overseerr.js';

let seriesCache = null;
let moviesCache = null;

// Helper to warm up caches
export async function warmUpSearchCache(configs) {
    if (configs.sonarrUrl && configs.sonarrKey) {
        Sonarr.getSonarrSeries(configs.sonarrUrl, configs.sonarrKey)
            .then(data => seriesCache = data)
            .catch(() => seriesCache = []);
    }
    if (configs.radarrUrl && configs.radarrKey) {
        Radarr.getAllMovies(configs.radarrUrl, configs.radarrKey)
            .then(data => moviesCache = data)
            .catch(() => moviesCache = []);
    }
}

export async function aggregatedSearch(query, configs) {
    if (!query) return [];

    // 1. Discovery Search via Overseerr
    let overseerrResults = [];
    if (configs.overseerrUrl && configs.overseerrKey) {
        try {
            const results = await Overseerr.search(configs.overseerrUrl, configs.overseerrKey, query);
            overseerrResults = results || [];
        } catch (e) {
            console.error("Overseerr search failed:", e);
        }
    }

    // 2. Refresh Cache if needed (lightweight check or just assume warmed up)
    // If null, we might try to fetch now, but it could slow down the first search.
    // For now, let's assume we trigger warmUp on app load.
    
    // 3. Merge Results
    return overseerrResults
        .filter(item => ['movie', 'tv'].includes(item.mediaType))
        .map(item => {
        let status = 'Request';
        let exists = false;
        let monitored = false;

        if (item.mediaInfo) {
            // Overseerr MediaInfo Status:
            // 1 = UNKNOWN
            // 2 = PENDING
            // 3 = PROCESSING
            // 4 = PARTIALLY_AVAILABLE
            // 5 = AVAILABLE
            if (item.mediaInfo.status === 5) status = 'Available';
            else if (item.mediaInfo.status === 4) status = 'Partially Available';
            else if (item.mediaInfo.status === 3) status = 'Processing';
            else if (item.mediaInfo.status === 2) status = 'Pending';
            
            if (item.mediaInfo.status >= 2) exists = true;
        }

        // Fallback: Check Local Cache if Overseerr didn't have info
        // (Sometimes Overseerr doesn't realize it's available if not synced?)
        if (!exists) {
            if (item.mediaType === 'tv' && seriesCache) {
                // Find in Sonarr cache (by TVDB ID usually, need to check what cache has)
                // Overseerr item usually has 'externalIds' with tvdbId if detailed, 
                // but search results might simple.
                // Doing a simple Title match as fallback if needed, or stick to Overseerr data?
                // Let's rely on Overseerr data mostly as it is the "source of truth" for requests.
            } else if (item.mediaType === 'movie' && moviesCache) {
                 // Check Radarr Cache
                 // moviesCache is array of Movie objects from Radarr (has .tmdbId)
                 const found = moviesCache.find(m => m.tmdbId === item.id);
                 if (found) {
                     status = found.hasFile ? 'Available' : (found.monitored ? 'Pending' : 'Request'); 
                     // Or check found.status? (released, inCinemas, etc)
                     // If it's in Radarr, it's effectively "Requested" or "Pending" at least.
                     if (status === 'Request') status = 'Pending'; 
                     exists = true;
                 }
            }
        }
        
        // Return normalized object
        return {
            id: item.id,
            title: item.title || item.name,
            year: item.releaseDate ? item.releaseDate.split('-')[0] : (item.firstAirDate ? item.firstAirDate.split('-')[0] : ''),
            poster: item.posterPath ? `https://image.tmdb.org/t/p/w200${item.posterPath}` : 'icons/placeholder.png', // We should proxy or use absolute
            type: item.mediaType,
            status: status, // Request, Pending, Available, Processing
            overview: item.overview
        };
    });
}
