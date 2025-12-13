export const getRadarrMovies = async (url, apiKey) => {
    try {
        // Just get recently added or just a few to show 'Recent'
        // Unfortunately /movie returns ALL movies. We should probably sort/limit client side or use a different endpoint if available.
        // There is no easy 'recent' endpoint without fetching all, but v3 implies we can just fetch all (lightweight) and sort.
        // OR we can use /history for changes.
        // Let's stick to 'In Cinemas' or 'Physical Release' from Calendar if possible, or just queue.
        // Actually, let's just show the Queue and maybe "Movies Missing" count.
        
        // For now, let's fetch Queue as it's most useful.
        const response = await fetch(`${url}/api/v3/queue?apikey=${apiKey}`);
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Radarr Queue Error:", error);
        throw error;
    }
};

// Getting "Recent" movies via history might be better than fetching 1000 movies
export const getRadarrHistory = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/history?page=1&pageSize=50&sortKey=date&sortDirection=descending&apikey=${apiKey}`);
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Radarr History Error:", error);
        throw error;
    }
}

export const getRadarrCalendar = async (url, apiKey) => {
    try {
        // Get calendar for next 30 days (Movies often have longer release windows than TV)
        const today = new Date().toISOString().split('T')[0];
        const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const response = await fetch(`${url}/api/v3/calendar?start=${today}&end=${nextMonth}&apikey=${apiKey}`);
        if (!response.ok) throw new Error(`Calendar Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Radarr Calendar Error:", error);
        throw error;
    }
};

export const getRadarrStatus = async (url, apiKey) => {
    try {
         const response = await fetch(`${url}/api/v3/system/status?apikey=${apiKey}`);
         if (!response.ok) throw new Error(`Error: ${response.status}`);
         return await response.json();
    } catch (error) {
        console.error("Radarr Status Error:", error);
        throw error;
    }
};
