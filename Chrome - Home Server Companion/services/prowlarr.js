

/**
 * Fetches all indexers.
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<Array>} List of indexers
 */
export const getProwlarrIndexers = async (url, apiKey) => {
  try {
    const response = await fetch(`${url}/api/v1/indexer`, {
      headers: {
        "X-Api-Key": apiKey,
      },
    });
    if (!response.ok) throw new Error(`Indexers Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Prowlarr Indexers Error:", error);
    throw error;
  }
};



/**
 * Fetches indexer statistics.
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<Object>} Stats object
 */
export const getProwlarrStats = async (url, apiKey) => {
  try {
    const response = await fetch(`${url}/api/v1/indexerstats`, {
      headers: {
        "X-Api-Key": apiKey,
      },
    });
    if (!response.ok) throw new Error(`Stats Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Prowlarr Stats Error:", error);
    throw error;
  }
};

/**
 * Fetches detailed status/health of indexers (e.g. disabled due to failure).
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<Array>} List of status objects
 */
export const getProwlarrIndexerStatuses = async (url, apiKey) => {
  try {
    const response = await fetch(`${url}/api/v1/indexerstatus`, {
      headers: {
        "X-Api-Key": apiKey,
      },
    });
    if (!response.ok) throw new Error(`Indexer Status Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Prowlarr Indexer Status Error:", error);
    return [];
  }
};
