import { AbortError, TimeoutError } from "@probitas/client";
import type {
  BodyInit,
  HttpClient,
  HttpClientConfig,
  HttpConnectionConfig,
  HttpOptions,
  HttpRequestOptions,
  QueryParams,
} from "./types.ts";
import type { HttpResponse } from "./response.ts";
import {
  HttpError,
  type HttpFailureError,
  HttpNetworkError,
} from "./errors.ts";
import {
  HttpResponseErrorImpl,
  HttpResponseFailureImpl,
  HttpResponseSuccessImpl,
} from "./response.ts";
import { CookieJar, parseSetCookie } from "./cookie.ts";
import { getLogger } from "@probitas/logger";

const logger = getLogger("probitas", "client", "http");

/**
 * Resolve URL from string or HttpConnectionConfig.
 */
function resolveBaseUrl(url: string | HttpConnectionConfig): string {
  if (typeof url === "string") {
    return url;
  }
  const protocol = url.protocol ?? "http";
  const host = url.host ?? "localhost";
  const port = url.port;
  const path = url.path ?? "";

  // Build URL with port if specified
  const portSuffix = port ? `:${port}` : "";
  return `${protocol}://${host}${portSuffix}${path}`;
}

/**
 * Convert QueryParams to URLSearchParams.
 */
function toURLSearchParams(query: QueryParams): URLSearchParams {
  if (query instanceof URLSearchParams) {
    return query;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        params.append(key, String(v));
      }
    } else {
      params.append(key, String(value));
    }
  }
  return params;
}

/**
 * Build URL with query parameters.
 */
function buildUrl(
  baseUrl: string,
  path: string,
  query?: QueryParams,
): string {
  const url = new URL(path, baseUrl).toString();
  if (!query) {
    return url;
  }
  const q = toURLSearchParams(query).toString();
  return q ? `${url}?${q}` : url;
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
 * Returns Headers instance to properly support multi-value headers.
 */
function mergeHeaders(
  ...sources: (HeadersInit | undefined)[]
): Headers {
  const result = new Headers();
  for (const source of sources) {
    if (source) {
      const headers = new Headers(source);
      for (const [key, value] of headers) {
        result.set(key, value);
      }
    }
  }
  return result;
}

/**
 * Convert fetch error to appropriate client error.
 */
function convertFetchError(error: unknown): HttpFailureError {
  if (error instanceof AbortError || error instanceof TimeoutError) {
    return error;
  }
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return new AbortError(error.message, { cause: error });
    }
    return new HttpNetworkError(error.message, { cause: error });
  }
  return new HttpNetworkError(String(error));
}

/**
 * HttpClient implementation.
 */
class HttpClientImpl implements HttpClient {
  readonly config: HttpClientConfig;
  readonly #baseUrl: string;
  readonly #baseUrlObj: URL;
  readonly #cookieJar?: CookieJar;

  constructor(config: HttpClientConfig) {
    this.config = config;
    this.#baseUrl = resolveBaseUrl(config.url);
    this.#baseUrlObj = new URL(this.#baseUrl);

    // Cookies are enabled by default
    if (!config.cookies?.disabled) {
      this.#cookieJar = new CookieJar();
      // Initialize with initial cookies if provided
      if (config.cookies?.initial) {
        const domain = this.#baseUrlObj.hostname;
        for (const [name, value] of Object.entries(config.cookies.initial)) {
          this.#cookieJar.setCookie(name, value, domain);
        }
        logger.debug("Initial cookies set", {
          count: Object.keys(config.cookies.initial).length,
        });
      }
    }

    logger.debug("HTTP client created", {
      url: this.#baseUrl,
      cookiesEnabled: !!this.#cookieJar,
      redirect: config.redirect ?? "follow",
    });
  }

  get(path: string, options?: HttpOptions): Promise<HttpResponse> {
    return this.#request("GET", path, undefined, options);
  }

  head(path: string, options?: HttpOptions): Promise<HttpResponse> {
    return this.#request("HEAD", path, undefined, options);
  }

  post(path: string, options?: HttpRequestOptions): Promise<HttpResponse> {
    return this.#request("POST", path, options?.body, options);
  }

  put(path: string, options?: HttpRequestOptions): Promise<HttpResponse> {
    return this.#request("PUT", path, options?.body, options);
  }

  patch(path: string, options?: HttpRequestOptions): Promise<HttpResponse> {
    return this.#request("PATCH", path, options?.body, options);
  }

  delete(path: string, options?: HttpRequestOptions): Promise<HttpResponse> {
    return this.#request("DELETE", path, options?.body, options);
  }

  options(path: string, options?: HttpOptions): Promise<HttpResponse> {
    return this.#request("OPTIONS", path, undefined, options);
  }

  request(
    method: string,
    path: string,
    options?: HttpRequestOptions,
  ): Promise<HttpResponse> {
    return this.#request(method, path, options?.body, options);
  }

  getCookies(): Record<string, string> {
    return this.#cookieJar?.getAll() ?? {};
  }

  setCookie(name: string, value: string): void {
    if (!this.#cookieJar) {
      throw new Error(
        "Cookie handling is disabled. Remove cookies.disabled: true from HttpClientConfig.",
      );
    }
    this.#cookieJar.setCookie(name, value, this.#baseUrlObj.hostname);
  }

  clearCookies(): void {
    this.#cookieJar?.clear();
  }

  async #request(
    method: string,
    path: string,
    body?: BodyInit,
    options?: HttpOptions,
  ): Promise<HttpResponse> {
    const url = buildUrl(this.#baseUrl, path, options?.query);
    const urlObj = new URL(url);
    const prepared = prepareBody(body);
    const headers = mergeHeaders(
      this.config.headers,
      prepared.headers,
      options?.headers,
    );

    // Add Cookie header if cookies are enabled
    if (this.#cookieJar) {
      const cookieHeader = this.#cookieJar.getCookieHeader(urlObj);
      if (cookieHeader) {
        headers.set("Cookie", cookieHeader);
      }
    }

    // Log request start
    logger.info("HTTP request starting", {
      method,
      url,
      headers: [...headers.keys()],
      hasBody: prepared.body !== undefined,
      queryParams: options?.query
        ? (options.query instanceof URLSearchParams
          ? [...options.query.keys()]
          : Object.keys(options.query))
        : [],
    });
    logger.trace("HTTP request details", {
      headers: Object.fromEntries(headers),
      body: prepared.body,
    });

    const fetchFn = this.config.fetch ?? globalThis.fetch;
    const redirect = options?.redirect ?? this.config.redirect ?? "follow";
    const startTime = performance.now();

    // Determine whether to throw on error (request option > config > default false)
    const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
      false;

    // Attempt fetch - may fail due to network errors
    let rawResponse: globalThis.Response;
    try {
      rawResponse = await fetchFn(url, {
        method,
        headers,
        body: prepared.body as globalThis.BodyInit,
        signal: options?.signal,
        redirect,
      });
    } catch (fetchError) {
      const duration = performance.now() - startTime;
      const error = convertFetchError(fetchError);

      // Return failure response or throw based on throwOnError
      if (shouldThrow) {
        throw error;
      }
      return new HttpResponseFailureImpl(url, duration, error);
    }

    const duration = performance.now() - startTime;

    // Read body (needed for both success/error response and error message)
    // Distinguish between "no body" (null) and "empty body" (empty Uint8Array)
    let responseBody: Uint8Array | null = null;
    if (rawResponse.body !== null) {
      const arrayBuffer = await rawResponse.arrayBuffer();
      // Use empty Uint8Array for zero-length body to distinguish from null (no body)
      responseBody = new Uint8Array(arrayBuffer);
    }

    // Create appropriate response type based on status
    let response: HttpResponse;
    if (rawResponse.ok) {
      response = new HttpResponseSuccessImpl(
        rawResponse,
        responseBody,
        duration,
      );
    } else {
      const httpError = new HttpError(
        rawResponse.status,
        rawResponse.statusText,
        { body: responseBody, headers: rawResponse.headers },
      );
      response = new HttpResponseErrorImpl(rawResponse, duration, httpError);
    }

    // Log response
    logger.info("HTTP response received", {
      method,
      url,
      status: response.status,
      statusText: response.statusText,
      duration: `${duration.toFixed(2)}ms`,
      contentType: response.headers?.get("content-type"),
      contentLength: response.body?.length,
    });
    logger.trace("HTTP response details", {
      headers: Object.fromEntries(rawResponse.headers.entries()),
      body: response.body,
    });

    // Store cookies from Set-Cookie headers if cookies are enabled
    // Note: For redirect: "follow", cookies from intermediate responses are not accessible
    // via the fetch API. Only cookies from the final response are stored.
    if (this.#cookieJar) {
      // Use getSetCookie() if available (modern API), otherwise fallback to get()
      const setCookies = rawResponse.headers.getSetCookie?.() ??
        (rawResponse.headers.get("set-cookie")?.split(/,(?=\s*\w+=)/) ?? []);
      const responseUrl = new URL(rawResponse.url || url);
      let storedCount = 0;
      for (const cookieStr of setCookies) {
        const parsed = parseSetCookie(cookieStr.trim(), responseUrl);
        if (parsed) {
          this.#cookieJar.set(parsed, responseUrl);
          storedCount++;
        }
      }
      if (storedCount > 0) {
        logger.debug("Cookies received and stored", {
          count: storedCount,
        });
      }
    }

    // Throw error if required
    if (!response.ok && shouldThrow) {
      throw response.error;
    }

    return response;
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
 * @param config - Client configuration including URL and default options
 * @returns A new HTTP client instance
 *
 * @example Basic usage with string URL
 * ```ts
 * import { createHttpClient } from "@probitas/client-http";
 *
 * const http = createHttpClient({ url: "http://localhost:3000" });
 *
 * const response = await http.get("/users/123");
 * console.log(response.json());
 *
 * await http.close();
 * ```
 *
 * @example With connection config object
 * ```ts
 * import { createHttpClient } from "@probitas/client-http";
 *
 * const http = createHttpClient({
 *   url: { host: "api.example.com", port: 443, protocol: "https" },
 * });
 * await http.close();
 * ```
 *
 * @example With default headers
 * ```ts
 * import { createHttpClient } from "@probitas/client-http";
 *
 * const http = createHttpClient({
 *   url: "http://localhost:3000",
 *   headers: {
 *     "Authorization": "Bearer token123",
 *     "Accept": "application/json",
 *   },
 * });
 * await http.close();
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * import { createHttpClient } from "@probitas/client-http";
 *
 * await using http = createHttpClient({ url: "http://localhost:3000" });
 * const response = await http.get("/health");
 * console.log(response.ok);
 * ```
 */
export function createHttpClient(config: HttpClientConfig): HttpClient {
  return new HttpClientImpl(config);
}
