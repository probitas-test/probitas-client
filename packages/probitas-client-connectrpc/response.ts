/**
 * ConnectRPC response wrapper.
 *
 * @module
 */

import type { ConnectError } from "@connectrpc/connect";
import type { ClientResult } from "@probitas/client";
import type {
  ConnectRpcError,
  ConnectRpcFailureError,
  ConnectRpcNetworkError,
} from "./errors.ts";
import type { ConnectRpcStatusCode } from "./status.ts";

/**
 * ConnectRPC error type union.
 *
 * Contains either:
 * - ConnectRpcError: gRPC error returned by the server
 * - ConnectRpcNetworkError: Network-level failure before reaching the server
 */
export type ConnectRpcErrorType = ConnectRpcError | ConnectRpcNetworkError;

/**
 * Base interface for all ConnectRPC response types.
 */
// deno-lint-ignore no-explicit-any
interface ConnectRpcResponseBase<T = any> extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"connectrpc"` for ConnectRPC responses. Use this in switch statements
   * for type-safe narrowing of union types.
   */
  readonly kind: "connectrpc";

  /**
   * Whether the request was processed by the server.
   *
   * - `true`: Server responded (success or gRPC error)
   * - `false`: Request failed before processing (network error, connection refused)
   */
  readonly processed: boolean;

  /**
   * Whether the request was successful.
   *
   * - `true`: statusCode === 0 (OK)
   * - `false`: gRPC error or request failure
   */
  readonly ok: boolean;

  /**
   * Error information (null if successful).
   *
   * Contains:
   * - ConnectRpcError for gRPC errors
   * - ConnectRpcNetworkError/AbortError/TimeoutError for failures
   */
  readonly error: ConnectRpcErrorType | ConnectRpcFailureError | null;

  /**
   * Response time in milliseconds.
   */
  readonly duration: number;

  /**
   * Get deserialized response data.
   * Returns the response message as-is (already deserialized by Connect).
   * Returns null if the response is an error or has no data.
   */
  data<U = T>(): U | null;

  /**
   * Get raw response or error.
   * Returns null for failure responses.
   */
  raw(): unknown | null;
}

/**
 * Successful ConnectRPC response (statusCode === 0).
 */
// deno-lint-ignore no-explicit-any
export interface ConnectRpcResponseSuccess<T = any>
  extends ConnectRpcResponseBase<T> {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;

  /** gRPC status code (always 0 for success). */
  readonly statusCode: 0;

  /** Status message (null for successful responses). */
  readonly statusMessage: null;

  /** Response headers. */
  readonly headers: Headers;

  /** Response trailers (sent at end of RPC). */
  readonly trailers: Headers;

  raw(): unknown;
}

/**
 * ConnectRPC response with gRPC error (statusCode !== 0).
 *
 * The server processed the request but returned an error status.
 */
// deno-lint-ignore no-explicit-any
export interface ConnectRpcResponseError<T = any>
  extends ConnectRpcResponseBase<T> {
  readonly processed: true;
  readonly ok: false;
  readonly error: ConnectRpcError;

  /** gRPC status code (1-16). */
  readonly statusCode: ConnectRpcStatusCode;

  /** Status message describing the error. */
  readonly statusMessage: string;

  /** Response headers. */
  readonly headers: Headers;

  /** Response trailers (sent at end of RPC). */
  readonly trailers: Headers;

  raw(): ConnectError;
}

/**
 * Failed ConnectRPC request (network error, connection refused, etc.).
 *
 * The request did not reach gRPC processing.
 */
// deno-lint-ignore no-explicit-any
export interface ConnectRpcResponseFailure<T = any>
  extends ConnectRpcResponseBase<T> {
  readonly processed: false;
  readonly ok: false;
  readonly error: ConnectRpcFailureError;

  /** Status code (null for network failures). */
  readonly statusCode: null;

  /** Status message (null for network failures). */
  readonly statusMessage: null;

  /** Response headers (null for failures). */
  readonly headers: null;

  /** Response trailers (null for failures). */
  readonly trailers: null;

  raw(): null;
}

/**
 * ConnectRPC response union type.
 *
 * Use `processed` to distinguish between server responses and failures:
 * - `processed === true`: Server responded (Success or Error)
 * - `processed === false`: Request failed (Failure)
 *
 * Use `ok` to check for success:
 * - `ok === true`: Success (statusCode === 0)
 * - `ok === false`: Error or Failure
 */
// deno-lint-ignore no-explicit-any
export type ConnectRpcResponse<T = any> =
  | ConnectRpcResponseSuccess<T>
  | ConnectRpcResponseError<T>
  | ConnectRpcResponseFailure<T>;

/**
 * Parameters for creating a successful ConnectRpcResponse.
 */
// deno-lint-ignore no-explicit-any
export interface ConnectRpcResponseSuccessParams<T = any> {
  readonly response: T | null;
  readonly headers: Headers;
  readonly trailers: Headers;
  readonly duration: number;
}

/**
 * Parameters for creating an error ConnectRpcResponse.
 */
export interface ConnectRpcResponseErrorParams {
  readonly error: ConnectError;
  readonly rpcError: ConnectRpcError;
  readonly headers: Headers;
  readonly trailers: Headers;
  readonly duration: number;
}

/**
 * Parameters for creating a failure ConnectRpcResponse.
 */
export interface ConnectRpcResponseFailureParams {
  readonly error: ConnectRpcFailureError;
  readonly duration: number;
}

/**
 * Implementation of ConnectRpcResponseSuccess.
 * @internal
 */
export class ConnectRpcResponseSuccessImpl<T>
  implements ConnectRpcResponseSuccess<T> {
  readonly kind = "connectrpc" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly statusCode = 0 as const;
  readonly statusMessage = null;
  readonly headers: Headers;
  readonly trailers: Headers;
  readonly duration: number;

  readonly #response: T | null;

  constructor(params: ConnectRpcResponseSuccessParams<T>) {
    this.headers = params.headers;
    this.trailers = params.trailers;
    this.duration = params.duration;
    this.#response = params.response;
  }

  data<U = T>(): U | null {
    if (this.#response === null || this.#response === undefined) {
      return null;
    }
    return this.#response as U;
  }

  raw(): T | null {
    return this.#response;
  }
}

/**
 * Implementation of ConnectRpcResponseError.
 * @internal
 */
export class ConnectRpcResponseErrorImpl<T>
  implements ConnectRpcResponseError<T> {
  readonly kind = "connectrpc" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: ConnectRpcError;
  readonly statusCode: ConnectRpcStatusCode;
  readonly statusMessage: string;
  readonly headers: Headers;
  readonly trailers: Headers;
  readonly duration: number;

  readonly #connectError: ConnectError;

  constructor(params: ConnectRpcResponseErrorParams) {
    this.headers = params.headers;
    this.trailers = params.trailers;
    this.duration = params.duration;
    this.error = params.rpcError;
    this.#connectError = params.error;
    this.statusCode = params.rpcError.statusCode;
    this.statusMessage = params.rpcError.statusMessage;
  }

  data<U = T>(): U | null {
    return null;
  }

  raw(): ConnectError {
    return this.#connectError;
  }
}

/**
 * Implementation of ConnectRpcResponseFailure.
 * @internal
 */
export class ConnectRpcResponseFailureImpl<T>
  implements ConnectRpcResponseFailure<T> {
  readonly kind = "connectrpc" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: ConnectRpcFailureError;
  readonly statusCode = null;
  readonly statusMessage = null;
  readonly headers = null;
  readonly trailers = null;
  readonly duration: number;

  constructor(params: ConnectRpcResponseFailureParams) {
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
