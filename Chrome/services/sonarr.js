export const getSonarrCalendar = async (url, apiKey) => {
    try {
        // Get calendar for next 7 days
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const response = await fetch(`${url}/api/v3/calendar?start=${today}&end=${nextWeek}&includeSeries=true&apikey=${apiKey}`);
        if (!response.ok) throw new Error(`Calendar Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr Calendar Error:", error);
        throw error;
    }
};

export const getSonarrQueue = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/queue?apikey=${apiKey}`);
        if (!response.ok) throw new Error(`Queue Error: ${response.status}`);
        return await response.json();
    } catch (error) {
         console.error("Sonarr Queue Error:", error);
         throw error;
    }
};

export const getSonarrStatus = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/system/status?apikey=${apiKey}`);
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr Status Error:", error);
        throw error;
    }
};

export const getSonarrHistory = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v3/history?page=1&pageSize=50&sortKey=date&sortDirection=descending&includeSeries=true&includeEpisode=true&apikey=${apiKey}`);
        if (!response.ok) throw new Error(`History Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Sonarr History Error:", error);
        throw error;
    }
};
