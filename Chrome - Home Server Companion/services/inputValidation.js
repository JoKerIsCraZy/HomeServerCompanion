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

    // Check for potentially dangerous patterns
    const dangerousPatterns = [
        /<script[^>]*>.*?<\/script>/gi,      // Script tags
        /javascript:/gi,                       // JavaScript protocol
        /on\w+\s*=/gi,                         // Event handlers (onclick=, etc.)
        /<iframe[^>]*>/gi,                     // Iframe tags
        /<embed[^>]*>/gi,                      // Embed tags
        /<object[^>]*>/gi,                     // Object tags
        /<link[^>]*>/gi,                       // Link tags
        /<meta[^>]*>/gi,                       // Meta tags
        /<style[^>]*>.*?<\/style>/gi,          // Style tags
        /@import/gi,                           // CSS imports
        /expression\s*\(/gi,                   // CSS expressions
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(query)) {
            return { valid: false, error: 'Query contains potentially dangerous content' };
        }
    }

    // Check character whitelist (more restrictive check)
    if (!ALLOWED_CHARS_PATTERN.test(query)) {
        return { valid: false, error: 'Query contains invalid characters' };
    }

    return { valid: true, error: null };
}

/**
 * Sanitizes a query by removing or escaping potentially dangerous content
 * This is a defensive measure - validation should still be performed first
 * @param {string} query - The query to sanitize
 * @returns {string} Sanitized query
 */
export function sanitizeQuery(query) {
    if (!query || typeof query !== 'string') {
        return '';
    }

    let sanitized = query;

    // Remove script tags and their content
    sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');

    // Remove other potentially dangerous HTML tags
    sanitized = sanitized.replace(/<(iframe|embed|object|link|meta|style)[^>]*>/gi, '');

    // Remove JavaScript protocol
    sanitized = sanitized.replace(/javascript:/gi, '');

    // Remove event handler patterns
    sanitized = sanitized.replace(/on\w+\s*=/gi, '');

    // Remove CSS expressions
    sanitized = sanitized.replace(/expression\s*\(/gi, '');

    // Remove CSS imports
    sanitized = sanitized.replace(/@import/gi, '');

    return sanitized.trim();
}

/**
 * Validates and sanitizes a search query in one step
 * @param {string} query - The query to validate and sanitize
 * @returns {{ valid: boolean, error: string|null, sanitized: string }} Result object
 */
export function cleanQuery(query) {
    const validation = validateSearchQuery(query);
    if (!validation.valid) {
        return { valid: false, error: validation.error, sanitized: '' };
    }

    return { valid: true, error: null, sanitized: sanitizeQuery(query) };
}
