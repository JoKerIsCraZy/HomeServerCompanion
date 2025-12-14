import * as Overseerr from "../../services/overseerr.js";

export async function initOverseerr(url, key, state) {
    if (!url || !key) {
        const container = document.getElementById('overseerr-requests');
        if(container) container.innerHTML = "<div class='error-banner'>Please configure Overseerr in options.</div>";
        return;
    }
    
    // Setup Filter Listener (Ensure single binding)
    const filterSelect = document.getElementById('overseerr-filter');
    
    if (filterSelect) {
        if (state.configs.overseerrFilter) {
            filterSelect.value = state.configs.overseerrFilter;
        }
    }

    if (filterSelect && !filterSelect.dataset.listenerAttached) {
        filterSelect.addEventListener('change', () => {
             // Save preference
             const newVal = filterSelect.value;
             state.configs.overseerrFilter = newVal; // Update local state
             chrome.storage.sync.set({ overseerrFilter: newVal });

             loadRequests(url, key, filterSelect.value);
        });
        filterSelect.dataset.listenerAttached = "true";
    }

    // Initial Load
    const currentFilter = filterSelect ? filterSelect.value : (state.configs.overseerrFilter || 'pending');
    await loadRequests(url, key, currentFilter);
}

export async function doSearch(url, key, query) {
    if (!query) {
        return;
    }
    const container = document.getElementById('overseerr-search-results');
    if (container) {
        container.innerHTML = '';
        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.textContent = 'Searching...';
        container.appendChild(loading);
    }
    
    try {
      const results = await Overseerr.search(url, key, query);
      renderOverseerrSearch(results, url, key);
    } catch (e) {
      console.error("Search failed in doSearch:", e);
      if (container) {
          container.innerHTML = '';
          const err = document.createElement('div');
          err.className = 'error';
          err.textContent = `Search Error: ${e.message}`;
          container.appendChild(err);
      }
    }
}

async function loadRequests(url, key, filter) {
    const container = document.getElementById('overseerr-requests');
    const cacheKey = `overseerr_hydrated_${filter}`;
    
    // 1. Try Cache (Hydrated Data)
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
           const hydratedData = JSON.parse(cached);
           renderHydratedRequests(hydratedData, url, key);
        } catch(e) { console.error("Cache parse error", e); }
    } else {
        if (container) {
            container.textContent = '';
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading';
            loadingDiv.textContent = `Loading ${filter} requests...`;
            container.appendChild(loadingDiv);
        }
    }
    
    try {
       // 2. Fetch Fresh Raw Data
       const rawData = await Overseerr.getRequests(url, key, filter);
       const requests = rawData.results || [];

       // 3. Hydrate Data (Fetch Details)
       const hydratedRequests = await hydrateRequests(requests, url, key);

       // 4. Save Cache & Render
       localStorage.setItem(cacheKey, JSON.stringify(hydratedRequests));
       renderHydratedRequests(hydratedRequests, url, key);

   } catch (e) {
       console.error(e);
       if (!cached && container) container.innerHTML = `<div class="error-banner">Failed to load requests: ${e.message}</div>`;
   }
}

function renderOverseerrSearch(results, url, key) {
    const container = document.getElementById('overseerr-search-results');
    if (!container) return;
    container.innerHTML = '';
    
    if (results.length === 0) {
        container.innerHTML = '<div class="card"><div class="card-header">No results found</div></div>';
        return;
    }

    const tmpl = document.getElementById('overseerr-search-card');

    results.filter(item => item.mediaType === 'movie' || item.mediaType === 'tv').forEach(item => {
        const clone = tmpl.content.cloneNode(true);
        
        // Image
        const posterImg = clone.querySelector('.poster-img');
        if (item.posterPath) {
           const posterUrl = `https://image.tmdb.org/t/p/w200${item.posterPath}`;
           posterImg.src = posterUrl;
        } else {
           // Fallback if no path initially
           posterImg.src = 'icons/icon48.png';
        }
        // Error Handler
        posterImg.addEventListener('error', () => {
            posterImg.src = 'icons/icon48.png';
        });

        if (item.backdropPath) {
             const backdropUrl = `https://image.tmdb.org/t/p/w500${item.backdropPath}`;
             clone.querySelector('.overseerr-backdrop').style.backgroundImage = `url('${backdropUrl}')`;
        }

        // Title
        const title = item.title || item.name || 'Unknown';
        const year = item.releaseDate ? item.releaseDate.split('-')[0] : (item.firstAirDate ? item.firstAirDate.split('-')[0] : '');
        
        clone.querySelector('.media-title').textContent = title;
        clone.querySelector('.media-year').textContent = year;
        clone.querySelector('.media-type').textContent = item.mediaType === 'movie' ? 'Movie' : 'TV';

        // Status / Button
        const btn = clone.querySelector('.request-btn');
        const statusDiv = clone.querySelector('.search-status-container');
        
        let statusText = "";
        let canRequest = true;

        // Clear statusDiv safe
        statusDiv.textContent = ''; 

        if (item.mediaInfo) {
            if (item.mediaInfo.status === 5) {
                statusText = "Available";
                // Create span safely
                const span = document.createElement('span');
                span.className = 'request-status';
                span.style.color = '#4caf50';
                span.style.borderColor = '#4caf50';
                span.style.background = 'rgba(76,175,80,0.1)';
                span.textContent = statusText;
                statusDiv.appendChild(span);

                canRequest = false;
            } else if (item.mediaInfo.status === 2 || item.mediaInfo.status === 3) {
                 statusText = "Requested";
                 const span = document.createElement('span');
                 span.className = 'request-status';
                 span.textContent = statusText;
                 statusDiv.appendChild(span);
                 
                 canRequest = false;
            }
        }
        
        if (!canRequest) {
            btn.style.display = 'none';
        } else {
            btn.onclick = async () => {
                btn.textContent = "⏳";
                btn.disabled = true;
                try {
                    await Overseerr.request(url, key, {
                        mediaId: item.id,
                        mediaType: item.mediaType
                    });
                    btn.textContent = "✔";
                    btn.title = "Requested";
                } catch (e) {
                    console.error(e);
                    btn.textContent = "❌";
                    btn.title = "Failed: " + e.message;
                    alert("Failed to request: " + e.message + "\nCheck Overseerr defaults.");
                }
            };
        }

        container.appendChild(clone);
    });
}

async function hydrateRequests(requests, url, key) {
    if (!requests) return [];
    return await Promise.all(requests.map(async (req) => {
        // Clone req to avoid mutating original if needed
        const enhancedReq = { ...req }; 
        const media = req.media;
        
        enhancedReq.details = {
            title: "Unknown",
            posterPath: "",
            backdropPath: "",
            year: ""
        };

        try {
           if (req.type === 'movie') {
               // media.tmdbId is reliable for movies
               const d = await Overseerr.getMovie(url, key, media.tmdbId);
               if (d) {
                   enhancedReq.details.title = d.title;
                   enhancedReq.details.posterPath = d.posterPath;
                   enhancedReq.details.backdropPath = d.backdropPath;
                   enhancedReq.details.year = d.releaseDate ? d.releaseDate.split('-')[0] : "";
               }
           } else if (req.type === 'tv') {
               const d = await Overseerr.getTv(url, key, media.tmdbId);
               if (d) {
                   enhancedReq.details.title = d.name;
                   enhancedReq.details.posterPath = d.posterPath;
                   enhancedReq.details.backdropPath = d.backdropPath;
                   enhancedReq.details.year = d.firstAirDate ? d.firstAirDate.split('-')[0] : "";
               }
           }
        } catch (e) {
            console.error("Hydration failed for", req.id, e);
        }
        return enhancedReq;
    }));
}

function renderHydratedRequests(requests, url, key) {
    const container = document.getElementById('overseerr-requests');
    if (!container) return;
    container.innerHTML = '';

    if (requests.length === 0) {
        container.innerHTML = '<div class="card"><div class="card-header">No pending requests</div></div>';
        return;
    }

    const tmpl = document.getElementById('overseerr-card');

    requests.forEach((req) => {
        const clone = tmpl.content.cloneNode(true);
        const media = req.media;
        const details = req.details || {}; 
        
        const title = details.title || "Loading...";
        const posterPath = details.posterPath || "";
        const backdropPath = details.backdropPath || "";
        
        const posterImg = clone.querySelector('.poster-img');
        if (posterPath) {
           const posterUrl = `https://image.tmdb.org/t/p/w200${posterPath}`;
           posterImg.src = posterUrl;

           if (backdropPath) {
               const backdropUrl = `https://image.tmdb.org/t/p/w500${backdropPath}`;
               clone.querySelector('.overseerr-backdrop').style.backgroundImage = `url('${backdropUrl}')`;
           }
        } else {
           posterImg.src = 'icons/icon48.png';
        }
        // Error Handler
        posterImg.addEventListener('error', () => {
            posterImg.src = 'icons/icon48.png';
        });

        clone.querySelector('.media-title').textContent = title;
        
        const requester = req.requestedBy ? (req.requestedBy.displayName || req.requestedBy.email) : 'Unknown';
        const dateStr = new Date(req.createdAt).toLocaleDateString();
        
        const titleEl = clone.querySelector('.media-title');
        titleEl.textContent = title;
        titleEl.classList.add('clickable-link');
        titleEl.addEventListener('click', (e) => {
            e.stopPropagation();
            let baseUrl = url;
            if (!baseUrl.startsWith('http')) { baseUrl = 'http://' + baseUrl; }
            if (baseUrl.endsWith('/')) { baseUrl = baseUrl.slice(0, -1); }

            let targetUrl = '';
            // Using media info or request type
            let tmdbId = media ? media.tmdbId : null;
            
            // Fallback for safety
            if (!tmdbId && req.mediaType === 'movie') tmdbId = req.mediaId; // Might depend on response structure?
            
            if (req.type === 'movie') {
                targetUrl = `${baseUrl}/movie/${tmdbId}`;
            } else if (req.type === 'tv') {
                targetUrl = `${baseUrl}/tv/${tmdbId}`;
            }

            if (targetUrl) {
                chrome.tabs.create({ url: targetUrl });
            }
        });
        clone.querySelector('.requester-name').textContent = requester;
        clone.querySelector('.request-date').textContent = dateStr;

        // Request Status / Type
        let statusText = "Pending Approval";
        let statusColor = "#ffc107"; // Yellow
        let statusBg = "rgba(255, 193, 7, 0.2)";
        let statusBorder = "rgba(255, 193, 7, 0.4)";

        // Request Status: 1=Pending, 2=Approved, 3=Declined
        if (req.status === 1) {
            statusText = "Pending Approval";
        } else if (req.status === 2) {
            statusText = "Approved";
            statusColor = "#2196f3"; // Blue
            statusBg = "rgba(33, 150, 243, 0.2)";
            statusBorder = "rgba(33, 150, 243, 0.4)";

            // Check Media Status if Approved
            if (media) {
                if (media.status === 3) {
                    statusText = "Processing";
                } else if (media.status === 4) {
                    statusText = "Partially Available";
                    statusColor = "#4caf50"; 
                    statusBg = "rgba(76, 175, 80, 0.2)";
                    statusBorder = "rgba(76, 175, 80, 0.4)";
                } else if (media.status === 5) {
                    statusText = "Available";
                    statusColor = "#4caf50"; // Green
                    statusBg = "rgba(76, 175, 80, 0.2)";
                    statusBorder = "rgba(76, 175, 80, 0.4)";
                }
            }
        } else if (req.status === 3) {
            statusText = "Declined";
            statusColor = "#f44336"; // Red
            statusBg = "rgba(244, 67, 54, 0.2)";
            statusBorder = "rgba(244, 67, 54, 0.4)";
        }
        
        const statusEl = clone.querySelector('.request-status');
        statusEl.textContent = statusText;
        statusEl.style.color = statusColor;
        statusEl.style.background = statusBg;
        statusEl.style.borderColor = statusBorder;

        // Actions - Only show if Pending (1)
        const actionsDiv = clone.querySelector('.overseerr-actions');
        if (req.status !== 1) {
            actionsDiv.style.display = 'none';
        } else {
            const approveBtn = clone.querySelector('.approve-btn');
            const declineBtn = clone.querySelector('.decline-btn');

            if (approveBtn) {
               approveBtn.onclick = async () => {
                  approveBtn.disabled = true;
                  const success = await Overseerr.approveRequest(url, key, req.id);
                  if (success) {
                      loadRequests(url, key, document.getElementById('overseerr-filter')?.value || 'pending');
                  }
               };
            }

            if (declineBtn) {
                declineBtn.onclick = async () => {
                    declineBtn.disabled = true;
                    if (confirm(`Decline request for ${title}?`)) {
                        const success = await Overseerr.declineRequest(url, key, req.id);
                        if (success) {
                             loadRequests(url, key, document.getElementById('overseerr-filter')?.value || 'pending');
                        }
                    } else {
                        declineBtn.disabled = false;
                    }
                };
            }
        }

        container.appendChild(clone);
    });
}
