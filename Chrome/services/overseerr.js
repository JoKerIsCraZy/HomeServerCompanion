export const getRequests = async (url, apiKey, status = 'pending') => {
  if (!url || !apiKey) return { results: [] };
  if (!url.startsWith('http')) { url = 'http://' + url; }
  if (url.endsWith('/')) { url = url.slice(0, -1); }

  try {
    const filterParam = status === 'all' ? 'all' : status;
    const response = await fetch(`${url}/api/v1/request?take=50&filter=${filterParam}&sort=added&skip=0`, {
      headers: {
        'X-Api-Key': apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Overseerr API Error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Overseerr Requests (${status}):`, data);
    return data; 
  } catch (error) {
    console.error('Failed to fetch Overseerr requests:', error);
    return { results: [] };
  }
};

// Alias for backward compatibility if needed, though I will update caller
export const getPendingRequests = (url, apiKey) => getRequests(url, apiKey, 'pending');

export const approveRequest = async (url, apiKey, requestId) => {
    if (!url.startsWith('http')) { url = 'http://' + url; }
    if (url.endsWith('/')) { url = url.slice(0, -1); }
    try {
        const response = await fetch(`${url}/api/v1/request/${requestId}/approve`, {
            method: 'POST',
            headers: {
                'X-Api-Key': apiKey,
            }
        });
        if (!response.ok) throw new Error('Failed to approve');
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
};

export const declineRequest = async (url, apiKey, requestId) => {
    if (!url.startsWith('http')) { url = 'http://' + url; }
    if (url.endsWith('/')) { url = url.slice(0, -1); }
    try {
        const response = await fetch(`${url}/api/v1/request/${requestId}/decline`, {
            method: 'POST',
            headers: {
                'X-Api-Key': apiKey,
            }
        });
         if (!response.ok) throw new Error('Failed to decline');
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
};

export async function search(url, apiKey, query) {
    if (!url.startsWith('http')) {
        url = 'http://' + url;
    }
    // Remove trailing slash
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }

    const endpoint = `${url}/api/v1/search?query=${encodeURIComponent(query)}`;
    console.log("Overseerr Service: Searching", endpoint);

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error("Overseerr Service: Search response not OK", response.status);
            throw new Error(`Overseerr Search Error: ${response.status}`);
        }

        const data = await response.json();
        console.log("Overseerr Service: Search data", data);
        return data.results || [];
    } catch (error) {
        console.error("Overseerr Service: Search logic failed", error);
        throw error;
    }
}

export async function request(url, apiKey, payload) {
    if (!url.startsWith('http')) {
        url = 'http://' + url;
    }
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    
    // Payload needs: mediaId, mediaType, rootFolder, profileId
    // We only have mediaId and mediaType confidently. 
    // Overseerr defaults might handle rest if user has set them up, 
    // BUT usually we need to specify. 
    // For now, let's send minimal and hope for defaults or specific error.
    
    /* 
       Wait, simple request normally requires finding the default root folder and profile.
       Ideally we fetch profiles/rootfolders first.
       But let's try just POSTing.
    */
    
    const response = await fetch(`${url}/api/v1/request`, {
        method: 'POST',
        headers: {
            'X-Api-Key': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
         // Try to read error
         const errData = await response.json();
         throw new Error(errData.message || `Status ${response.status}`);
    }
    return await response.json();
}

export async function getMovie(url, apiKey, id) {
    if (!url.startsWith('http')) { url = 'http://' + url; }
    if (url.endsWith('/')) { url = url.slice(0, -1); }
    try {
        const response = await fetch(`${url}/api/v1/movie/${id}`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error("Failed to get movie details", e);
        return null;
    }
}

export async function getTv(url, apiKey, id) {
    if (!url.startsWith('http')) { url = 'http://' + url; }
    if (url.endsWith('/')) { url = url.slice(0, -1); }
    try {
        const response = await fetch(`${url}/api/v1/tv/${id}`, {
            headers: { 'X-Api-Key': apiKey }
        });
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error("Failed to get tv details", e);
        return null;
    }
}
