

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

/**
 * Fetches all indexer categories.
 * @param {string} url
 * @param {string} apiKey
 * @returns {Promise<Array>} List of categories
 */
export const getProwlarrCategories = async (url, apiKey) => {
  try {
    const response = await fetch(`${url}/api/v1/indexer/categories`, {
      headers: {
        "X-Api-Key": apiKey,
      },
    });
    if (!response.ok) throw new Error(`Categories Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Prowlarr Categories Error:", error);
    return [];
  }
};

/**
 * Searches Prowlarr.
 * @param {string} url
 * @param {string} apiKey
 * @param {string} query
 * @param {string|null} categories
 * @param {string|null} indexerIds
 * @returns {Promise<Array>} List of results
 */
export const searchProwlarr = async (url, apiKey, query, categories = null, indexerIds = null) => {
  try {
    const type = "search";
    const queryParams = new URLSearchParams();
    queryParams.append("query", query);
    queryParams.append("type", type);
    if (categories) queryParams.append("categories", categories);
    
    if (indexerIds) {
        if (Array.isArray(indexerIds)) {
            indexerIds.forEach(id => queryParams.append("indexerIds", id));
        } else {
            queryParams.append("indexerIds", indexerIds);
        }
    }
    
    const response = await fetch(`${url}/api/v1/search?${queryParams.toString()}`, {
      headers: {
        "X-Api-Key": apiKey,
      },
    });

    if (!response.ok) throw new Error(`Search Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Prowlarr Search Error:", error);
    throw error;
  }
};

