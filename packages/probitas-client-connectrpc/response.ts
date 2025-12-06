/**
 * ConnectRPC response wrapper.
 *
 * @module
 */

import type { ConnectRpcStatusCode } from "./status.ts";

/**
 * ConnectRPC response interface.
 */
export interface ConnectRpcResponse {
  /** Whether the request was successful (code === 0). */
  readonly ok: boolean;

  /** ConnectRPC/gRPC status code. */
  readonly code: ConnectRpcStatusCode;

  /** Status message (empty string for successful responses). */
  readonly message: string;

  /** Response headers */
  readonly headers: Record<string, string>;

  /** Response trailers (sent at end of RPC) */
  readonly trailers: Record<string, string>;

  /** Response time in milliseconds. */
  readonly duration: number;

  /**
   * Get deserialized response data.
   * Returns the response message as-is (already deserialized by Connect).
   * Returns null if the response is an error or has no data.
   */
  // deno-lint-ignore no-explicit-any
  data<T = any>(): T | null;

  /**
   * Get raw response message.
   */
  raw(): unknown;
}

/**
 * Options for creating a ConnectRpcResponse.
 */
export interface ConnectRpcResponseOptions {
  readonly code: ConnectRpcStatusCode;
  readonly message: string;
  readonly headers: Record<string, string>;
  readonly trailers: Record<string, string>;
  readonly duration: number;
  readonly responseMessage: unknown;
}

/**
 * Implementation of ConnectRpcResponse.
 */
export class ConnectRpcResponseImpl implements ConnectRpcResponse {
  readonly ok: boolean;
  readonly code: ConnectRpcStatusCode;
  readonly message: string;
  readonly headers: Record<string, string>;
  readonly trailers: Record<string, string>;
  readonly duration: number;

  readonly #responseMessage: unknown;

  constructor(options: ConnectRpcResponseOptions) {
    this.code = options.code;
    this.ok = options.code === 0;
    this.message = options.message;
    this.headers = options.headers;
    this.trailers = options.trailers;
    this.duration = options.duration;
    this.#responseMessage = options.responseMessage;
  }

  // deno-lint-ignore no-explicit-any
  data<T = any>(): T | null {
    if (this.#responseMessage === null || this.#responseMessage === undefined) {
      return null;
    }
    return this.#responseMessage as T;
  }

  raw(): unknown {
    return this.#responseMessage;
  }
}
