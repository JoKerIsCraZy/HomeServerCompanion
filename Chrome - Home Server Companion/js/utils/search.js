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
        
        let sonarrSlug = null;
        let radarrId = null;

        if (item.mediaInfo) {
            // Overseerr MediaInfo Status:
            // 5 = AVAILABLE
            // 4 = PARTIALLY_AVAILABLE
            // 3 = PROCESSING
            // 2 = PENDING
            if (item.mediaInfo.status === 5) status = 'Available';
            else if (item.mediaInfo.status === 4) status = 'Partially Available';
            else if (item.mediaInfo.status === 3) status = 'Processing';
            else if (item.mediaInfo.status === 2) status = 'Pending';
            
            if (item.mediaInfo.status >= 2) exists = true;
        }

        // --- MAPPING LOGIC START ---
        // Try to map to Sonarr/Radarr even if Overseerr provided info, 
        // because we need the internal ID/Slug for direct links.
        
        if (item.mediaType === 'tv' && seriesCache) {
            // Sonarr Mapping
            // 1. Try TVDB ID if we have it from Overseerr result externalIds (if available)
            // Overseerr search result objects 'mediaInfo' might have tvdbId? 
            // Often search results are slim. 
            // Fallback: Match by Title and Year (fuzzy) or strict title?
            
            // Best bet: check if we have tvdbId in item (sometimes Overseerr includes it)
            // If not, we have to rely on title matching or if 'exists' is true, maybe get details?
            // For search speed, strict title match + year is "okay" fallback.
            
            // Note: seriesCache items have properties: title, year, tvdbId, titleSlug, id
            
            let match = null;
            // Check if item has externalIds
            /* 
               Warning: Overseerr search results usually DON'T have externalIds. 
               But if it's "Requested" or "Available", mediaInfo might contain some IDs?
               Actually mediaInfo usually has: id, tmdbId, tvdbId, status, etc.
            */
            if (item.mediaInfo && item.mediaInfo.tvdbId) {
                 match = seriesCache.find(s => s.tvdbId === item.mediaInfo.tvdbId);
            }

            if (!match) {
                 // Fallback: Title Match (case insensitive)
                 const lowerTitle = (item.title || item.name || '').toLowerCase();
                 // Also check year if possible to reduce false positives
                 const itemYear = parseInt(item.releaseDate ? item.releaseDate.split('-')[0] : (item.firstAirDate ? item.firstAirDate.split('-')[0] : '0'));
                 
                 match = seriesCache.find(s => s.title.toLowerCase() === lowerTitle && (itemYear === 0 || s.year === itemYear));
            }

            if (match) {
                sonarrSlug = match.titleSlug;
                // If status was unknown/request but we found it in Sonarr, update status?
                // User said: "Partially Available is 100% in Sonarr".
                // If we found it, it IS in Sonarr used for tracking.
                if (status === 'Request') status = 'Pending'; // Or Available? Keep 'Request'/Pending logic from Overseerr usually better.
                exists = true;
            }

        } else if (item.mediaType === 'movie' && moviesCache) {
             // Radarr Mapping
             // moviesCache items have: tmdbId, id (Database ID)
             let match = moviesCache.find(m => m.tmdbId === item.id);
             if (match) {
                 radarrId = match.id; // Internal Radarr DB ID
                 exists = true;
                 if (status === 'Request') status = 'Pending';
             }
        }
        // --- MAPPING LOGIC END ---
        
        // Return normalized object
        return {
            id: item.id,
            title: item.title || item.name,
            year: item.releaseDate ? item.releaseDate.split('-')[0] : (item.firstAirDate ? item.firstAirDate.split('-')[0] : ''),
            poster: item.posterPath ? `https://image.tmdb.org/t/p/w200${item.posterPath}` : 'icons/placeholder.png',
            type: item.mediaType,
            status: status,
            overview: item.overview,
            plexRatingKey: item.mediaInfo?.ratingKey || item.mediaInfo?.plexUrl?.match(/\/library\/metadata\/(\d+)/)?.[1] || null,
            plexUrl: item.mediaInfo?.plexUrl || null,
            sonarrSlug: sonarrSlug, // For direct links
            radarrId: radarrId      // For direct links
        };
    });
}
