/**
 * Input Validation Utilities
 * Provides validation for user input to prevent injection attacks and ensure data integrity.
 */

/**
 * Maximum allowed length for search queries
 * @constant {number}
 */
export const MAX_QUERY_LENGTH = 500;

/**
 * Allowed characters for search queries
 * Includes alphanumeric, spaces, and common search/punctuation characters
 * @constant {RegExp}
 */
const ALLOWED_CHARS_PATTERN = /^[a-zA-Z0-9\s\-_.:;'"?!@#$&()[\]{}%,+*=\/\\]*$/;

/**
 * Validates a search query for safety and length
 * @param {string} query - The search query to validate
 * @returns {{ valid: boolean, error: string|null }} Validation result with error message if invalid
 */
export function validateSearchQuery(query) {
    // Check if query exists
    if (!query || typeof query !== 'string') {
        return { valid: false, error: 'Query must be a non-empty string' };
    }

    // Trim and check length
    const trimmed = query.trim();
    if (trimmed.length === 0) {
        return { valid: false, error: 'Query cannot be empty' };
    }

    if (trimmed.length > MAX_QUERY_LENGTH) {
        return { valid: false, error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters` };
    }

    // Check for potentially dangerous patterns.
    // HTML tags are deliberately NOT matched here: `<` and `>` are absent from
    // ALLOWED_CHARS_PATTERN below, so any markup is already rejected by the
    // allowlist. Regex-based tag blocklists are unreliable (`</script >`,
    // nested tags, encodings) and only add a false sense of coverage.
    const dangerousPatterns = [
        /javascript:/gi,                       // JavaScript protocol
        /on\w+\s*=/gi,                         // Event handlers (onclick=, etc.)
        /@import/gi,                           // CSS imports
        /expression\s*\(/gi,                   // CSS expressions
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(query)) {
            return { valid: false, error: 'Query contains potentially dangerous content' };
        }
    }

    // Character allowlist - the primary defence. Anything outside this set,
    // including all markup characters, is rejected.
    if (!ALLOWED_CHARS_PATTERN.test(query)) {
        return { valid: false, error: 'Query contains invalid characters' };
    }

    return { valid: true, error: null };
}

