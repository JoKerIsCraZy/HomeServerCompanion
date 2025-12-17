# Security Audit Report - Home Server Companion

**Extension Version:** 2.3  
**Audit Date:** 2025-12-17  
**Auditor:** Security Review

---

## Executive Summary

A comprehensive security audit was performed on the Home Server Companion Chrome extension. The extension manages connections to multiple home server services (SABnzbd, Sonarr, Radarr, Tautulli, Overseerr, Unraid) and requires careful handling of API credentials and user data.

**Overall Security Rating: ✅ GOOD**

The extension follows Chrome security best practices with proper CSP, secure credential storage, and safe DOM manipulation. No critical vulnerabilities were identified. Minor recommendations have been provided to further enhance security.

---

## 1. Manifest & Permissions Analysis

### ✅ Findings

#### Manifest Configuration

```json
{
  "manifest_version": 3,
  "permissions": ["storage"],
  "optional_host_permissions": ["http://*/*", "https://*/*"],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

#### Security Strengths:

- ✅ **Manifest V3** - Uses the latest, most secure manifest version
- ✅ **Minimal Permissions** - Only requests `storage` permission (required)
- ✅ **Optional Host Permissions** - Smart use of `optional_host_permissions` instead of mandatory permissions
  - User grants permissions only for their specific server URLs
  - Follows principle of least privilege
- ✅ **Strong CSP** - Content Security Policy prevents inline scripts and external code execution
  - `script-src 'self'` - Only allows scripts from the extension itself
  - `object-src 'self'` - Prevents embedding untrusted plugins

#### Permission Request Flow:

The extension properly requests host permissions at runtime when users save server URLs in `options.js`:

```javascript
chrome.permissions.request({ origins: [originToRequest] }, (granted) => {
  if (granted) {
    performSave();
  }
});
```

### 🟡 Recommendations

- None - Permission model is optimal for this use case

---

## 2. Code Security Analysis

### ✅ XSS Prevention

#### innerHTML Usage Audit

All `innerHTML` usage was audited across the codebase:

**Safe Usage Patterns Found:**

- All instances only clear containers: `container.innerHTML = '';`
- No direct injection of user data or API responses into innerHTML
- Dynamic content is created using safe DOM methods:
  - `document.createElement()`
  - `.textContent` for text insertion
  - `.appendChild()` for DOM construction

**Example (unraid.js:465):**

```javascript
container.innerHTML = ""; // Safe - only clearing
const div = document.createElement("div");
div.textContent = disk.name; // Safe - textContent escapes HTML
container.appendChild(div);
```

#### ✅ No eval() or Function() Usage

- Searched entire codebase - no instances of `eval()` or `Function()` constructor
- No dynamic code execution vulnerabilities

### ✅ DOM Manipulation Security

All dynamic content is created securely:

**Example from overseerr.js:**

```javascript
const titleEl = clone.querySelector(".media-title");
titleEl.textContent = title; // Safe - textContent auto-escapes
titleEl.title = title; // Safe - attribute
```

**SVG Creation (unraid.js):**

```javascript
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("class", "cpu-ring-svg"); // Safe
```

### ✅ Template Usage

The extension uses HTML `<template>` elements for rendering, which are inherently safe when combined with proper DOM manipulation.

---

## 3. Data Security

### ✅ API Key Storage

**Storage Method:**

- API keys stored using `chrome.storage.sync` API
- Encrypted by Chrome's secure storage system
- Synced across user's Chrome instances (if signed in)
- Not accessible to websites or other extensions

**Code Example (options.js:114):**

```javascript
chrome.storage.sync.set(data, () => {
  showStatus(service, "Settings saved!", "success");
});
```

### ✅ localStorage Usage

**Audit Results:**
localStorage is only used for **non-sensitive** UI state:

- Tab preferences: `localStorage.getItem("lastActiveService")`
- Filter selections: `localStorage.getItem("overseerr_hydrated_${filter}")`
- Cached display data (for faster loading)

**No Sensitive Data in localStorage:**

- ✅ API keys NOT stored in localStorage
- ✅ Passwords NOT stored in localStorage
- ✅ Server URLs NOT stored in localStorage

### 🟡 Recommendations

**Consider Cache Encryption:**
While the cached data (Overseerr requests) is not highly sensitive, consider:

1. Adding cache expiration (currently missing)
2. Clearing cache on logout or service disconnect
3. Optionally encrypting cached data for defense-in-depth

**Example Addition:**

```javascript
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes
const cacheData = {
  data: hydratedRequests,
  timestamp: Date.now(),
};
localStorage.setItem(cacheKey, JSON.stringify(cacheData));

// On retrieval:
if (Date.now() - cached.timestamp > CACHE_EXPIRY) {
  localStorage.removeItem(cacheKey); // Expired
}
```

---

## 4. Network Security

### ✅ HTTP/HTTPS Support

**Flexible Protocol Handling:**

- Extension supports both HTTP and HTTPS connections
- User selects protocol in options (dropdown)
- No forced HTTPS (correct for local server use case)

**Protocol Selection (options.html):**

```html
<select id="sabnzbdProtocol">
  <option value="http://">http://</option>
  <option value="https://">https://</option>
</select>
```

**Why HTTP is Acceptable:**

- Local network servers often use HTTP (192.168.x.x)
- Extension targets local/home network scenarios
- User has full control over protocol choice

### ✅ External Resource Loading

**Only Trusted External Resources:**

1. **TMDB Images** (The Movie Database)

   - `https://image.tmdb.org/t/p/w200${posterPath}`
   - `https://image.tmdb.org/t/p/w500${backdropPath}`
   - Industry-standard, CDN-hosted images
   - Read-only, no interaction

2. **SVG Namespace Declaration**
   - `http://www.w3.org/2000/svg` (XML namespace, not a network request)

**Error Handling for Images:**

```javascript
posterImg.addEventListener("error", () => {
  posterImg.src = "icons/icon48.png"; // Fallback to local icon
});
```

### ✅ API Request Security

**Request Patterns:**
All API requests properly include authentication:

```javascript
// Sonarr/Radarr
headers: { 'X-Api-Key': apiKey }

// Unraid
headers: { 'X-API-Key': apiKey }

// Overseerr
headers: { 'X-Api-Key': apiKey }

// SABnzbd/Tautulli
fetch(`${url}/api?apikey=${apiKey}`)
```

**Timeout Protection:**

```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);
fetch(testUrl, { signal: controller.signal });
```

### 🟡 Recommendations

**Add CORS Error Handling:**
Improve user feedback when CORS blocks requests:

```javascript
catch (err) {
    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
        showStatus(service, 'CORS Error - Check server CORS settings', 'error');
    } else {
        showStatus(service, 'Connection Failed', 'error');
    }
}
```

---

## 5. Input Validation

### ✅ URL Sanitization

**URL Cleaning:**

```javascript
let val = urlEl.value.trim().replace(/\/$/, ""); // Remove trailing slash
val = val.replace(/^https?:\/\//, ""); // Strip protocol if pasted
const fullUrl = protocol + val;
```

**URL Validation:**

```javascript
try {
  const urlObj = new URL(fullUrl);
  originToRequest = `${urlObj.origin}/*`;
} catch (e) {
  console.warn("Invalid URL, cannot request permissions:", fullUrl);
}
```

### ✅ User Input Encoding

**Search Input Sanitization:**

```javascript
// overseerr.js - search query
const query = encodeURIComponent(searchInput.value);

// tautulli.js - terminate session message
const message = encodeURIComponent("Terminated by Admin");
```

### ✅ API Response Validation

**Safe Defaults:**

```javascript
const title = item.title || item.name || "Unknown";
const year = item.releaseDate ? item.releaseDate.split("-")[0] : "";
const rating = item.voteAverage ? `★ ${item.voteAverage.toFixed(1)}` : "";
```

---

## 6. Error Handling & Information Disclosure

### ✅ Error Messages

**No Sensitive Information Leaked:**

```javascript
catch (err) {
    showStatus(service, 'Connection Failed (Network/CORS)', 'error');
    console.error(err); // Only in console, not shown to user
}
```

**User-Friendly Messages:**

- Generic error messages for security
- Detailed errors only in console (for debugging)
- No stack traces exposed to UI

---

## 7. Third-Party Dependencies

### ✅ No External Libraries

**Security Advantage:**

- Zero third-party JavaScript libraries
- No supply chain attack surface
- All code is first-party and auditable
- Reduces attack vectors significantly

**Only Dependencies:**

- Chrome Extension APIs (built-in, trusted)
- Native Browser APIs (`fetch`, DOM methods)

---

## 8. Browser API Usage

### ✅ Safe API Usage

**`chrome.storage.sync`:**

- Correct usage for credential storage
- Encrypted by Chrome automatically
- Synced securely across devices

**`chrome.permissions`:**

- Properly requests optional permissions at runtime
- Checks for existing permissions before requesting
- Follows Chrome's permission model

**`chrome.tabs`:**

- Only creates new tabs (safe operation)
- No tab injection or manipulation

---

## 9. Potential Attack Vectors

### ✅ Mitigated Threats

| Threat                         | Status      | Mitigation                                      |
| ------------------------------ | ----------- | ----------------------------------------------- |
| **XSS (Cross-Site Scripting)** | ✅ Secure   | Safe DOM methods, textContent usage, CSP        |
| **Code Injection**             | ✅ Secure   | No eval(), strong CSP, no inline scripts        |
| **Credential Theft**           | ✅ Secure   | chrome.storage.sync, no localStorage for keys   |
| **MITM on API Keys**           | 🟡 Low Risk | HTTP supported (user choice), local network use |
| **Supply Chain Attack**        | ✅ Secure   | No third-party dependencies                     |
| **Clickjacking**               | ✅ N/A      | Extension popup, not embeddable                 |

---

## 10. Privacy Considerations

### ✅ Data Collection

**What is Stored:**

- Server URLs (user-configured)
- API Keys (user-configured)
- UI preferences (theme, tab state)
- Cached API responses (temporary)

**What is NOT Collected:**

- ✅ No telemetry or analytics
- ✅ No usage tracking
- ✅ No data sent to third parties
- ✅ No personal information harvested

### ✅ Data Sharing

**Data Flows:**

1. **User → Extension** (configuration)
2. **Extension → User's Servers** (API calls)
3. **Extension → TMDB** (poster images only, read-only)

**No External Data Sharing:**

- No data sent to extension developer
- No cloud sync (except Chrome's encrypted storage)
- No advertising networks

---

## Final Recommendations

### 🔴 Critical (None)

No critical security issues found.

### 🟡 Medium Priority

1. **Add Cache Expiration**
   - Implement time-based expiration for localStorage cache
   - Clear stale data automatically
2. **Enhance Error Messages**

   - Add specific CORS error detection and user guidance
   - Suggest enabling CORS on server side

3. **Rate Limiting**
   - Add request throttling for API calls
   - Prevent accidental DoS of user's servers

### 🟢 Low Priority

1. **Content Security Policy Enhancement**
   - Already strong, but consider adding `default-src 'none'` for even stricter policy
2. **Subresource Integrity (SRI)**

   - Not applicable (no external scripts), but worth noting for future

3. **Permission Audit**
   - Periodically review and clean up granted optional permissions
   - Add UI to show/revoke granted permissions

---

## Compliance & Best Practices

| Standard                      | Compliance            |
| ----------------------------- | --------------------- |
| **Chrome Web Store Policies** | ✅ Compliant          |
| **Manifest V3 Migration**     | ✅ Complete           |
| **OWASP Extension Security**  | ✅ Follows guidelines |
| **Minimum Permissions**       | ✅ Implemented        |
| **Secure by Default**         | ✅ Yes                |

---

## Conclusion

The **Home Server Companion** extension demonstrates **strong security practices** for a Chrome extension managing sensitive credentials and API access. The development team has implemented proper security controls including:

- Secure credential storage via Chrome APIs
- XSS prevention through safe DOM manipulation
- Strong Content Security Policy
- Minimal permission model
- No third-party dependencies
- Privacy-respecting design

The extension is **ready for Chrome Web Store submission** from a security perspective. The recommendations provided are for further hardening and user experience improvements, not security blockers.

**Security Clearance: ✅ APPROVED**

---

## Appendix: Testing Methodology

### Tools & Techniques Used:

1. **Static Code Analysis**

   - Manual code review of all JavaScript files
   - Pattern matching for dangerous functions (eval, innerHTML)
   - grep-based vulnerability scanning

2. **Manifest Review**

   - Permissions audit
   - CSP validation
   - V3 compliance check

3. **Data Flow Analysis**

   - Credential storage paths
   - API key transmission
   - localStorage usage patterns

4. **Network Request Audit**
   - External resource loading
   - API authentication methods
   - Error handling review

### Files Reviewed:

- `manifest.json`
- `js/popup.js`
- `js/options.js`
- `js/ui/*.js` (all service UI modules)
- `services/*.js` (all service API modules)
- `popup.html`, `options.html`
