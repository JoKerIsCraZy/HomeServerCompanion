export const getTautulliActivity = async (url, apiKey) => {
    try {
        const response = await fetch(`${url}/api/v2?apikey=${apiKey}&cmd=get_activity`);
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        const data = await response.json();
        return data.response.data; // Tautulli wraps in response.data
    } catch (error) {
        console.error("Tautulli Activity Error:", error);
        throw error;
    }
};

// Terminate Session
export const terminateSession = async (url, apiKey, sessionId, message = 'Terminated by Admin') => {
    try {
        const response = await fetch(`${url}/api/v2?apikey=${apiKey}&cmd=terminate_session&session_id=${sessionId}&message=${encodeURIComponent(message)}`);
        if (!response.ok) throw new Error(`Error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error("Tautulli Terminate Error:", error);
    }
};
