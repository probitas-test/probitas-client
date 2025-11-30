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

    // Initialize with initial cookies if provided
    if (config.cookies?.initial) {
      for (const [name, value] of Object.entries(config.cookies.initial)) {
        this.#cookieJar.set(name, value);
      }
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

    const fetchFn = this.config.fetch ?? globalThis.fetch;
    const redirect = options?.redirect ?? this.config.redirect ?? "follow";
    const startTime = performance.now();

    const rawResponse = await fetchFn(url, {
      method,
      headers,
      body: prepared.body as globalThis.BodyInit,
      signal: options?.signal,
      redirect,
    });

    const duration = performance.now() - startTime;
    const response = await createHttpResponse(rawResponse, duration);

    // Store cookies from Set-Cookie headers if cookies are enabled
    if (this.#cookiesEnabled) {
      // Use getSetCookie() if available (modern API), otherwise fallback to get()
      const setCookies = rawResponse.headers.getSetCookie?.() ??
        (rawResponse.headers.get("set-cookie")?.split(/,(?=\s*\w+=)/) ?? []);
      for (const cookieStr of setCookies) {
        const parsed = parseSetCookie(cookieStr.trim());
        if (parsed) {
          this.#cookieJar.set(parsed.name, parsed.value);
        }
      }
    }

    // Determine whether to throw on error (request option > config > default true)
    const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
      true;

    if (!response.ok && shouldThrow) {
      throwHttpError(response);
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
 * Create a new HTTP client.
 */
export function createHttpClient(config: HttpClientConfig): HttpClient {
  return new HttpClientImpl(config);
}
