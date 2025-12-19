/**
 * Cookie handling based on RFC 6265.
 *
 * This module provides a simplified cookie jar that respects Path and Domain
 * attributes for proper cookie scoping in HTTP requests.
 */

/**
 * Represents a parsed cookie with its attributes.
 */
export interface Cookie {
  /** Cookie name */
  readonly name: string;
  /** Cookie value */
  readonly value: string;
  /** Domain attribute (lowercase, with leading dot removed) */
  readonly domain?: string;
  /** Path attribute */
  readonly path: string;
  /** Secure attribute */
  readonly secure: boolean;
  /** HttpOnly attribute */
  readonly httpOnly: boolean;
  /** Expiration time (null for session cookies) */
  readonly expires: Date | null;
  /** SameSite attribute */
  readonly sameSite?: "strict" | "lax" | "none";
}

/**
 * Parse a Set-Cookie header value into a Cookie object.
 *
 * @param setCookieHeader - The Set-Cookie header value
 * @param requestUrl - The URL of the request that received this cookie
 * @returns Parsed cookie or null if invalid
 */
export function parseSetCookie(
  setCookieHeader: string,
  requestUrl: URL,
): Cookie | null {
  const parts = setCookieHeader.split(";").map((p) => p.trim());
  if (parts.length === 0 || !parts[0]) return null;

  // First part is name=value
  const nameValuePart = parts[0];
  const eqIndex = nameValuePart.indexOf("=");
  if (eqIndex === -1) return null;

  const name = nameValuePart.slice(0, eqIndex).trim();
  const value = nameValuePart.slice(eqIndex + 1).trim();

  if (!name) return null;

  // Parse attributes
  let domain: string | undefined;
  let path = getDefaultPath(requestUrl.pathname);
  let secure = false;
  let httpOnly = false;
  let expires: Date | null = null;
  let sameSite: "strict" | "lax" | "none" | undefined;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const attrEqIndex = part.indexOf("=");
    const attrName = (attrEqIndex === -1 ? part : part.slice(0, attrEqIndex))
      .toLowerCase().trim();
    const attrValue = attrEqIndex === -1 ? "" : part.slice(attrEqIndex + 1)
      .trim();

    switch (attrName) {
      case "domain": {
        // Remove leading dot and lowercase
        let d = attrValue.toLowerCase();
        if (d.startsWith(".")) {
          d = d.slice(1);
        }
        // Validate domain matches request
        if (domainMatches(requestUrl.hostname.toLowerCase(), d)) {
          domain = d;
        }
        break;
      }
      case "path":
        path = attrValue || "/";
        break;
      case "secure":
        secure = true;
        break;
      case "httponly":
        httpOnly = true;
        break;
      case "expires": {
        const parsed = new Date(attrValue);
        if (!isNaN(parsed.getTime())) {
          expires = parsed;
        }
        break;
      }
      case "max-age": {
        const seconds = parseInt(attrValue, 10);
        if (!isNaN(seconds)) {
          expires = new Date(Date.now() + seconds * 1000);
        }
        break;
      }
      case "samesite":
        switch (attrValue.toLowerCase()) {
          case "strict":
            sameSite = "strict";
            break;
          case "lax":
            sameSite = "lax";
            break;
          case "none":
            sameSite = "none";
            break;
        }
        break;
    }
  }

  return {
    name,
    value,
    domain,
    path,
    secure,
    httpOnly,
    expires,
    sameSite,
  };
}

/**
 * Get the default path for a cookie based on the request path.
 * RFC 6265 Section 5.1.4
 */
function getDefaultPath(requestPath: string): string {
  // If the uri-path is empty or doesn't start with "/", return "/"
  if (!requestPath || !requestPath.startsWith("/")) {
    return "/";
  }

  // Find the last "/" in the path (excluding the final character)
  const lastSlash = requestPath.lastIndexOf("/", requestPath.length - 2);
  if (lastSlash <= 0) {
    return "/";
  }

  return requestPath.slice(0, lastSlash);
}

/**
 * Check if a request domain matches a cookie domain.
 * RFC 6265 Section 5.1.3
 */
export function domainMatches(
  requestDomain: string,
  cookieDomain: string,
): boolean {
  // Exact match
  if (requestDomain === cookieDomain) {
    return true;
  }

  // Request domain ends with cookie domain and the character immediately before
  // the cookie domain is a "."
  if (
    requestDomain.endsWith(cookieDomain) &&
    requestDomain[requestDomain.length - cookieDomain.length - 1] === "."
  ) {
    // Also ensure the cookie domain is not an IP address
    if (!isIpAddress(cookieDomain)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a string looks like an IP address.
 */
function isIpAddress(str: string): boolean {
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(str)) {
    return true;
  }
  // IPv6 (simplified check - contains colons)
  if (str.includes(":")) {
    return true;
  }
  return false;
}

/**
 * Check if a request path matches a cookie path.
 * RFC 6265 Section 5.1.4
 */
export function pathMatches(requestPath: string, cookiePath: string): boolean {
  // The cookie-path and the request-path are identical
  if (requestPath === cookiePath) {
    return true;
  }

  // The cookie-path is a prefix of the request-path, and either:
  // - the last character of the cookie-path is "/"
  // - the first character of the request-path not included in cookie-path is "/"
  if (requestPath.startsWith(cookiePath)) {
    if (cookiePath.endsWith("/")) {
      return true;
    }
    if (requestPath[cookiePath.length] === "/") {
      return true;
    }
  }

  return false;
}

/**
 * A cookie jar that stores cookies with proper Path/Domain scoping.
 */
export class CookieJar {
  readonly #cookies: Map<string, Cookie> = new Map();

  /**
   * Create a cookie key from name, domain, and path.
   */
  #key(name: string, domain: string, path: string): string {
    return `${name}|${domain}|${path}`;
  }

  /**
   * Store a cookie in the jar.
   */
  set(cookie: Cookie, requestUrl: URL): void {
    // Determine the effective domain
    const effectiveDomain = cookie.domain ??
      requestUrl.hostname.toLowerCase();

    // Check if cookie has expired
    if (cookie.expires && cookie.expires.getTime() < Date.now()) {
      // Remove the cookie if it exists
      this.#cookies.delete(
        this.#key(cookie.name, effectiveDomain, cookie.path),
      );
      return;
    }

    const key = this.#key(cookie.name, effectiveDomain, cookie.path);
    this.#cookies.set(key, {
      ...cookie,
      domain: effectiveDomain,
    });
  }

  /**
   * Get all cookies that should be sent with a request to the given URL.
   */
  getCookiesForUrl(url: URL): Cookie[] {
    const requestDomain = url.hostname.toLowerCase();
    const requestPath = url.pathname || "/";
    const isSecure = url.protocol === "https:";
    const now = Date.now();

    const matchingCookies: Cookie[] = [];

    for (const cookie of this.#cookies.values()) {
      // Check expiration
      if (cookie.expires && cookie.expires.getTime() < now) {
        continue;
      }

      // Check secure flag
      if (cookie.secure && !isSecure) {
        continue;
      }

      // Check domain match
      const cookieDomain = cookie.domain ?? requestDomain;
      if (!domainMatches(requestDomain, cookieDomain)) {
        continue;
      }

      // Check path match
      if (!pathMatches(requestPath, cookie.path)) {
        continue;
      }

      matchingCookies.push(cookie);
    }

    // Sort by path length (longer paths first) then by creation time
    // RFC 6265 Section 5.4
    matchingCookies.sort((a, b) => b.path.length - a.path.length);

    return matchingCookies;
  }

  /**
   * Serialize cookies for the Cookie header.
   */
  getCookieHeader(url: URL): string | null {
    const cookies = this.getCookiesForUrl(url);
    if (cookies.length === 0) {
      return null;
    }
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  /**
   * Set a cookie directly by name and value (for simple use cases).
   * This sets a session cookie for the root path of the given domain.
   */
  setCookie(name: string, value: string, domain: string): void {
    const key = this.#key(name, domain.toLowerCase(), "/");
    this.#cookies.set(key, {
      name,
      value,
      domain: domain.toLowerCase(),
      path: "/",
      secure: false,
      httpOnly: false,
      expires: null,
    });
  }

  /**
   * Get all cookies as a simple name-value record.
   * Note: This flattens all cookies regardless of path/domain.
   */
  getAll(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const cookie of this.#cookies.values()) {
      // Later cookies with same name overwrite earlier ones
      result[cookie.name] = cookie.value;
    }
    return result;
  }

  /**
   * Clear all cookies from the jar.
   */
  clear(): void {
    this.#cookies.clear();
  }

  /**
   * Get the number of cookies in the jar.
   */
  get size(): number {
    return this.#cookies.size;
  }
}
