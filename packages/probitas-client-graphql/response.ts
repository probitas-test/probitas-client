import type { ClientResult } from "@probitas/client";
import type {
  GraphqlError,
  GraphqlExecutionError,
  GraphqlFailureError,
} from "./errors.ts";

/**
 * Base interface for all GraphQL response types.
 */
// deno-lint-ignore no-explicit-any
interface GraphqlResponseBase<T = any> extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"graphql"` for GraphQL responses. Use this in switch statements
   * for type-safe narrowing of union types.
   */
  readonly kind: "graphql";

  /**
   * Whether the request was processed by the server.
   *
   * - `true`: Server responded (success or GraphQL error)
   * - `false`: Request failed before processing (network error, HTTP error)
   */
  readonly processed: boolean;

  /**
   * Whether the request was successful.
   *
   * - `true`: No errors, data available
   * - `false`: GraphQL errors or request failure
   */
  readonly ok: boolean;

  /**
   * Error information (null if successful).
   *
   * Contains:
   * - GraphqlExecutionError for GraphQL errors
   * - GraphqlNetworkError/AbortError/TimeoutError for failures
   */
  readonly error: GraphqlError | GraphqlFailureError | null;

  /**
   * Response extensions (only available when processed).
   *
   * Custom metadata added by the GraphQL server (tracing, metrics, etc.).
   */
  readonly extensions?: Record<string, unknown>;

  /**
   * Response time in milliseconds.
   */
  readonly duration: number;

  /**
   * Request URL.
   */
  readonly url: string;

  /**
   * Get response data (null if no data or request failed).
   * Does not throw even if errors are present.
   */
  data<U = T>(): U | null;

  /**
   * Get the raw Web standard Response object.
   * Returns null for failure responses.
   */
  raw(): globalThis.Response | null;
}

/**
 * Successful GraphQL response (no errors).
 */
// deno-lint-ignore no-explicit-any
export interface GraphqlResponseSuccess<T = any>
  extends GraphqlResponseBase<T> {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;

  /** HTTP status code. */
  readonly status: number;

  /** HTTP response headers. */
  readonly headers: Headers;

  /** Response extensions. */
  readonly extensions?: Record<string, unknown>;

  raw(): globalThis.Response;
}

/**
 * GraphQL response with execution errors.
 *
 * Note: GraphQL allows partial success where both data and errors are present.
 * Use data() to access any partial data.
 */
// deno-lint-ignore no-explicit-any
export interface GraphqlResponseError<T = any> extends GraphqlResponseBase<T> {
  readonly processed: true;
  readonly ok: false;
  readonly error: GraphqlExecutionError;

  /** HTTP status code. */
  readonly status: number;

  /** HTTP response headers. */
  readonly headers: Headers;

  /** Response extensions. */
  readonly extensions?: Record<string, unknown>;

  raw(): globalThis.Response;
}

/**
 * Failed GraphQL request (network error, HTTP error, etc.).
 *
 * The request did not reach GraphQL processing.
 */
// deno-lint-ignore no-explicit-any
export interface GraphqlResponseFailure<T = any>
  extends GraphqlResponseBase<T> {
  readonly processed: false;
  readonly ok: false;
  readonly error: GraphqlFailureError;

  /** HTTP status code (null for network failures). */
  readonly status: null;

  /** HTTP response headers (null for failures). */
  readonly headers: null;

  raw(): null;
}

/**
 * GraphQL response union type.
 *
 * Use `processed` to distinguish between server responses and failures:
 * - `processed === true`: Server responded (Success or Error)
 * - `processed === false`: Request failed (Failure)
 *
 * Use `ok` to check for success:
 * - `ok === true`: Success (no errors)
 * - `ok === false`: Error or Failure
 */
// deno-lint-ignore no-explicit-any
export type GraphqlResponse<T = any> =
  | GraphqlResponseSuccess<T>
  | GraphqlResponseError<T>
  | GraphqlResponseFailure<T>;

/**
 * Parameters for creating a successful GraphqlResponse.
 */
export interface GraphqlResponseSuccessParams<T> {
  readonly url: string;
  readonly data: T | null;
  readonly extensions?: Record<string, unknown>;
  readonly duration: number;
  readonly status: number;
  readonly raw: globalThis.Response;
}

/**
 * Parameters for creating an error GraphqlResponse.
 */
export interface GraphqlResponseErrorParams<T> {
  readonly url: string;
  readonly data: T | null;
  readonly error: GraphqlExecutionError;
  readonly extensions?: Record<string, unknown>;
  readonly duration: number;
  readonly status: number;
  readonly raw: globalThis.Response;
}

/**
 * Parameters for creating a failure GraphqlResponse.
 */
export interface GraphqlResponseFailureParams {
  readonly url: string;
  readonly error: GraphqlFailureError;
  readonly duration: number;
}

/**
 * Implementation of GraphqlResponseSuccess.
 */
class GraphqlResponseSuccessImpl<T> implements GraphqlResponseSuccess<T> {
  readonly kind = "graphql" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly extensions?: Record<string, unknown>;
  readonly duration: number;
  readonly url: string;
  readonly status: number;
  readonly headers: Headers;

  readonly #data: T | null;
  readonly #raw: globalThis.Response;

  constructor(params: GraphqlResponseSuccessParams<T>) {
    this.url = params.url;
    this.#data = params.data;
    this.#raw = params.raw;
    this.extensions = params.extensions;
    this.duration = params.duration;
    this.status = params.status;
    this.headers = params.raw.headers;
  }

  data<U = T>(): U | null {
    return this.#data as U | null;
  }

  raw(): globalThis.Response {
    return this.#raw;
  }
}

/**
 * Implementation of GraphqlResponseError.
 */
class GraphqlResponseErrorImpl<T> implements GraphqlResponseError<T> {
  readonly kind = "graphql" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: GraphqlExecutionError;
  readonly extensions?: Record<string, unknown>;
  readonly duration: number;
  readonly url: string;
  readonly status: number;
  readonly headers: Headers;

  readonly #data: T | null;
  readonly #raw: globalThis.Response;

  constructor(params: GraphqlResponseErrorParams<T>) {
    this.url = params.url;
    this.#data = params.data;
    this.#raw = params.raw;
    this.error = params.error;
    this.extensions = params.extensions;
    this.duration = params.duration;
    this.status = params.status;
    this.headers = params.raw.headers;
  }

  data<U = T>(): U | null {
    return this.#data as U | null;
  }

  raw(): globalThis.Response {
    return this.#raw;
  }
}

/**
 * Implementation of GraphqlResponseFailure.
 */
class GraphqlResponseFailureImpl<T> implements GraphqlResponseFailure<T> {
  readonly kind = "graphql" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: GraphqlFailureError;
  readonly status = null;
  readonly headers = null;
  readonly duration: number;
  readonly url: string;

  constructor(params: GraphqlResponseFailureParams) {
    this.url = params.url;
    this.error = params.error;
    this.duration = params.duration;
  }

  data(): null {
    return null;
  }

  raw(): null {
    return null;
  }
}

/**
 * Create a successful GraphQL response.
 */
export function createGraphqlResponseSuccess<T>(
  params: GraphqlResponseSuccessParams<T>,
): GraphqlResponseSuccess<T> {
  return new GraphqlResponseSuccessImpl(params);
}

/**
 * Create a GraphQL response with execution errors.
 */
export function createGraphqlResponseError<T>(
  params: GraphqlResponseErrorParams<T>,
): GraphqlResponseError<T> {
  return new GraphqlResponseErrorImpl(params);
}

/**
 * Create a failed GraphQL response.
 */
export function createGraphqlResponseFailure<T>(
  params: GraphqlResponseFailureParams,
): GraphqlResponseFailure<T> {
  return new GraphqlResponseFailureImpl(params);
}
