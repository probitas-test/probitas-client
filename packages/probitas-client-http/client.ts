import type {
  BodyInit,
  HttpClient,
  HttpClientConfig,
  HttpOptions,
  HttpResponse,
  QueryValue,
} from "./types.ts";
import {
  HttpBadRequestError,
  HttpConflictError,
  HttpError,
  HttpForbiddenError,
  HttpInternalServerError,
  HttpNotFoundError,
  HttpTooManyRequestsError,
  HttpUnauthorizedError,
} from "./errors.ts";
import { createHttpResponse } from "./response.ts";
import { getLogger } from "@probitas/logger";

const logger = getLogger("probitas", "client", "http");

/**
 * Format request/response body for logging preview (truncated for large bodies).
 */
function formatBodyPreview(body: unknown): string | undefined {
  if (!body) return undefined;
  if (typeof body === "string") {
    return body.length > 500 ? body.slice(0, 500) + "..." : body;
  }
  if (body instanceof Uint8Array) {
    return `<binary ${body.length} bytes>`;
  }
  if (body instanceof FormData || body instanceof URLSearchParams) {
    return `<${body.constructor.name}>`;
  }
  try {
    const str = JSON.stringify(body);
    return str.length > 500 ? str.slice(0, 500) + "..." : str;
  } catch {
    return "<unserializable>";
  }
}

/**
 * Build URL with query parameters.
 */
function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, QueryValue | QueryValue[]>,
): string {
  const url = new URL(path, baseUrl);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          url.searchParams.append(key, String(v));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

/**
 * Convert BodyInit to fetch-compatible body and headers.
 */
function prepareBody(
  body?: BodyInit,
): { body?: BodyInit; headers?: Record<string, string> } {
  if (body === undefined) {
    return {};
  }

  if (typeof body === "string" || body instanceof Uint8Array) {
    return { body };
  }

  if (body instanceof FormData || body instanceof URLSearchParams) {
    return { body };
  }

  // Plain object - serialize as JSON
  return {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

/**
 * Merge headers from multiple sources.
 */
function mergeHeaders(
  ...sources: (Record<string, string> | undefined)[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const source of sources) {
    if (source) {
      Object.assign(result, source);
    }
  }
  return result;
}

/**
 * Serialize cookies to Cookie header value.
 */
function serializeCookies(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/**
 * Parse Set-Cookie header value and extract cookie name/value.
 * Only extracts the name=value pair, ignoring attributes.
 */
function parseSetCookie(
  setCookie: string,
): { name: string; value: string } | null {
  const match = setCookie.match(/^([^=]+)=([^;]*)/);
  if (!match) return null;
  return { name: match[1].trim(), value: match[2].trim() };
}

/**
 * Throw appropriate HttpError based on status code.
 */
function throwHttpError(response: HttpResponse): never {
  const { status, statusText } = response;
  const message = `HTTP ${status}: ${statusText}`;
  const options = { response };

  switch (status) {
    case 400:
      throw new HttpBadRequestError(message, options);
    case 401:
      throw new HttpUnauthorizedError(message, options);
    case 403:
      throw new HttpForbiddenError(message, options);
    case 404:
      throw new HttpNotFoundError(message, options);
    case 409:
      throw new HttpConflictError(message, options);
    case 429:
      throw new HttpTooManyRequestsError(message, options);
    case 500:
      throw new HttpInternalServerError(message, options);
    default:
      throw new HttpError(message, status, statusText, options);
  }
}

/**
 * HttpClient implementation.
 */
class HttpClientImpl implements HttpClient {
  readonly config: HttpClientConfig;
  readonly #cookieJar: Map<string, string>;
  readonly #cookiesEnabled: boolean;

  constructor(config: HttpClientConfig) {
    this.config = config;
    // Cookies are enabled by default
    this.#cookiesEnabled = !(config.cookies?.disabled ?? false);
    this.#cookieJar = new Map();

    // Log client creation
    logger.debug("HTTP client created", {
      baseUrl: config.baseUrl,
      cookiesEnabled: this.#cookiesEnabled,
      redirect: config.redirect ?? "follow",
    });

    // Initialize with initial cookies if provided
    if (config.cookies?.initial) {
      for (const [name, value] of Object.entries(config.cookies.initial)) {
        this.#cookieJar.set(name, value);
      }
      logger.debug("Initial cookies set", {
        count: Object.keys(config.cookies.initial).length,
      });
    }
  }

  get(path: string, options?: HttpOptions): Promise<HttpResponse> {
    return this.#request("GET", path, undefined, options);
  }

  post(
    path: string,
    body?: BodyInit,
    options?: HttpOptions,
  ): Promise<HttpResponse> {
    return this.#request("POST", path, body, options);
  }

  put(
    path: string,
    body?: BodyInit,
    options?: HttpOptions,
  ): Promise<HttpResponse> {
    return this.#request("PUT", path, body, options);
  }

  patch(
    path: string,
    body?: BodyInit,
    options?: HttpOptions,
  ): Promise<HttpResponse> {
    return this.#request("PATCH", path, body, options);
  }

  delete(path: string, options?: HttpOptions): Promise<HttpResponse> {
    return this.#request("DELETE", path, undefined, options);
  }

  request(
    method: string,
    path: string,
    options?: HttpOptions & { body?: BodyInit },
  ): Promise<HttpResponse> {
    return this.#request(method, path, options?.body, options);
  }

  getCookies(): Record<string, string> {
    return Object.fromEntries(this.#cookieJar);
  }

  setCookie(name: string, value: string): void {
    if (!this.#cookiesEnabled) {
      throw new Error(
        "Cookie handling is disabled. Remove cookies.disabled: true from HttpClientConfig.",
      );
    }
    this.#cookieJar.set(name, value);
  }

  clearCookies(): void {
    this.#cookieJar.clear();
  }

  async #request(
    method: string,
    path: string,
    body?: BodyInit,
    options?: HttpOptions,
  ): Promise<HttpResponse> {
    const url = buildUrl(this.config.baseUrl, path, options?.query);
    const prepared = prepareBody(body);
    const headers = mergeHeaders(
      this.config.headers,
      prepared.headers,
      options?.headers,
    );

    // Add Cookie header if cookies are enabled and jar is not empty
    if (this.#cookiesEnabled && this.#cookieJar.size > 0) {
      headers["Cookie"] = serializeCookies(Object.fromEntries(this.#cookieJar));
    }

    // Log request start
    logger.debug("HTTP request starting", {
      method,
      url,
      headers: Object.keys(headers),
      hasBody: prepared.body !== undefined,
      queryParams: options?.query ? Object.keys(options.query) : [],
    });
    logger.trace("HTTP request details", {
      headers,
      bodyPreview: formatBodyPreview(prepared.body),
    });

    const fetchFn = this.config.fetch ?? globalThis.fetch;
    const redirect = options?.redirect ?? this.config.redirect ?? "follow";
    const startTime = performance.now();

    try {
      const rawResponse = await fetchFn(url, {
        method,
        headers,
        body: prepared.body as globalThis.BodyInit,
        signal: options?.signal,
        redirect,
      });

      const duration = performance.now() - startTime;
      const response = await createHttpResponse(rawResponse, duration);

      // Log response
      logger.debug("HTTP response received", {
        method,
        url,
        status: response.status,
        statusText: response.statusText,
        duration: `${duration.toFixed(2)}ms`,
        contentType: response.headers.get("content-type"),
        contentLength: response.body?.length,
      });
      logger.trace("HTTP response details", {
        headers: Object.fromEntries(rawResponse.headers.entries()),
        bodyPreview: response.body
          ? formatBodyPreview(response.text)
          : undefined,
      });

      // Store cookies from Set-Cookie headers if cookies are enabled
      if (this.#cookiesEnabled) {
        // Use getSetCookie() if available (modern API), otherwise fallback to get()
        const setCookies = rawResponse.headers.getSetCookie?.() ??
          (rawResponse.headers.get("set-cookie")?.split(/,(?=\s*\w+=)/) ?? []);
        const parsedCount = setCookies.length;
        for (const cookieStr of setCookies) {
          const parsed = parseSetCookie(cookieStr.trim());
          if (parsed) {
            this.#cookieJar.set(parsed.name, parsed.value);
          }
        }
        if (parsedCount > 0) {
          logger.debug("Cookies received and stored", {
            count: parsedCount,
          });
        }
      }

      // Determine whether to throw on error (request option > config > default true)
      const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
        true;

      if (!response.ok && shouldThrow) {
        logger.warn("HTTP error response", {
          method,
          url,
          status: response.status,
          statusText: response.statusText,
          duration: `${duration.toFixed(2)}ms`,
        });
        throwHttpError(response);
      }

      return response;
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("HTTP request failed", {
        method,
        url,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      logger.trace("HTTP request error details", {
        stack: error instanceof Error ? error.stack : undefined,
        cause: error instanceof Error ? error.cause : undefined,
      });
      throw error;
    }
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

/**
 * Create a new HTTP client instance.
 *
 * The client provides methods for making HTTP requests with automatic
 * cookie handling, response body pre-loading, and error handling.
 *
 * @param config - Client configuration including base URL and default options
 * @returns A new HTTP client instance
 *
 * @example Basic usage
 * ```ts
 * const http = createHttpClient({ baseUrl: "http://localhost:3000" });
 *
 * const response = await http.get("/users/123");
 * console.log(response.json());
 *
 * await http.close();
 * ```
 *
 * @example With default headers
 * ```ts
 * const http = createHttpClient({
 *   baseUrl: "http://localhost:3000",
 *   headers: {
 *     "Authorization": "Bearer token123",
 *     "Accept": "application/json",
 *   },
 * });
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * await using http = createHttpClient({ baseUrl: "http://localhost:3000" });
 * const response = await http.get("/health");
 * // Client automatically closed when scope exits
 * ```
 */
export function createHttpClient(config: HttpClientConfig): HttpClient {
  return new HttpClientImpl(config);
}
