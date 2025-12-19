import type { CommonConnectionConfig, CommonOptions } from "@probitas/client";
import type { HttpResponse } from "./response.ts";

export type { HttpResponse };

/**
 * Query parameter value type.
 */
export type QueryValue = string | number | boolean;

/**
 * Request body type.
 */
export type BodyInit =
  | string
  | Uint8Array
  | Record<string, unknown>
  | FormData
  | URLSearchParams;

/**
 * Redirect handling mode.
 * - "follow": Automatically follow redirects (default)
 * - "manual": Return redirect response without following
 * - "error": Throw error on redirect
 */
export type RedirectMode = "follow" | "manual" | "error";

/**
 * Options for individual HTTP requests.
 */
export interface HttpOptions extends CommonOptions {
  /** Query parameters (arrays for multi-value params) */
  readonly query?: Record<string, QueryValue | QueryValue[]>;

  /** Additional request headers */
  readonly headers?: Record<string, string>;

  /**
   * Redirect handling mode.
   * @default "follow" (inherited from client config if not specified)
   */
  readonly redirect?: RedirectMode;

  /**
   * Whether to throw HttpError for non-2xx responses.
   * When false, non-2xx responses are returned as HttpResponse.
   * @default true (inherited from client config if not specified)
   */
  readonly throwOnError?: boolean;
}

/**
 * Cookie handling configuration.
 */
export interface CookieConfig {
  /**
   * Disable automatic cookie handling.
   * When disabled, cookies are not stored or sent automatically.
   * @default false
   */
  readonly disabled?: boolean;

  /**
   * Initial cookies to populate the cookie jar.
   */
  readonly initial?: Record<string, string>;
}

/**
 * HTTP connection configuration.
 *
 * Extends CommonConnectionConfig with HTTP-specific options.
 */
export interface HttpConnectionConfig extends CommonConnectionConfig {
  /**
   * Protocol to use.
   * @default "http"
   */
  readonly protocol?: "http" | "https";

  /**
   * Base path prefix for all requests.
   * @default ""
   */
  readonly path?: string;
}

/**
 * HTTP client configuration.
 */
export interface HttpClientConfig extends CommonOptions {
  /**
   * Base URL for all requests.
   *
   * Can be a URL string or a connection configuration object.
   *
   * @example String URL
   * ```ts
   * import type { HttpClientConfig } from "@probitas/client-http";
   * const config: HttpClientConfig = { url: "http://localhost:3000" };
   * ```
   *
   * @example Connection config object
   * ```ts
   * import type { HttpClientConfig } from "@probitas/client-http";
   * const config: HttpClientConfig = {
   *   url: { host: "api.example.com", port: 443, protocol: "https" },
   * };
   * ```
   */
  readonly url: string | HttpConnectionConfig;

  /** Default headers for all requests */
  readonly headers?: Record<string, string>;

  /** Custom fetch implementation (for testing/mocking) */
  readonly fetch?: typeof fetch;

  /**
   * Default redirect handling mode.
   * Can be overridden per-request via HttpOptions.
   * @default "follow"
   */
  readonly redirect?: RedirectMode;

  /**
   * Whether to throw HttpError for non-2xx responses.
   * Can be overridden per-request via HttpOptions.
   * @default true
   */
  readonly throwOnError?: boolean;

  /**
   * Cookie handling configuration.
   * By default, the client maintains a cookie jar for automatic
   * cookie management across requests.
   * Set `cookies: { disabled: true }` to disable.
   */
  readonly cookies?: CookieConfig;
}

/**
 * HTTP client interface.
 */
export interface HttpClient extends AsyncDisposable {
  /** Client configuration */
  readonly config: HttpClientConfig;

  /** Send GET request */
  get(path: string, options?: HttpOptions): Promise<HttpResponse>;

  /** Send POST request */
  post(
    path: string,
    body?: BodyInit,
    options?: HttpOptions,
  ): Promise<HttpResponse>;

  /** Send PUT request */
  put(
    path: string,
    body?: BodyInit,
    options?: HttpOptions,
  ): Promise<HttpResponse>;

  /** Send PATCH request */
  patch(
    path: string,
    body?: BodyInit,
    options?: HttpOptions,
  ): Promise<HttpResponse>;

  /** Send DELETE request */
  delete(path: string, options?: HttpOptions): Promise<HttpResponse>;

  /** Send request with arbitrary method */
  request(
    method: string,
    path: string,
    options?: HttpOptions & { body?: BodyInit },
  ): Promise<HttpResponse>;

  /**
   * Get all cookies in the cookie jar.
   * Returns empty object if cookies are disabled.
   */
  getCookies(): Record<string, string>;

  /**
   * Set a cookie in the cookie jar.
   * @throws Error if cookies are disabled
   */
  setCookie(name: string, value: string): void;

  /**
   * Clear all cookies from the cookie jar.
   * No-op if cookies are disabled.
   */
  clearCookies(): void;

  /** Close the client and release resources */
  close(): Promise<void>;
}
