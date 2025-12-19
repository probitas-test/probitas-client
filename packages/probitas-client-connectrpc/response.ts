/**
 * ConnectRPC response wrapper.
 *
 * @module
 */

import type { ConnectError } from "@connectrpc/connect";
import type { ClientResult } from "@probitas/client";
import type { ConnectRpcStatusCode } from "./status.ts";

/**
 * ConnectRPC response interface.
 */
export interface ConnectRpcResponse extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"connectrpc"` for ConnectRPC responses. Use this in switch statements
   * for type-safe narrowing of union types.
   */
  readonly kind: "connectrpc";

  /**
   * Whether the request was successful (statusCode === 0).
   *
   * Inherited from ClientResult. True when statusCode is 0 (OK),
   * false for any error code.
   */
  readonly ok: boolean;

  /**
   * ConnectRPC/gRPC status code.
   *
   * 0 indicates success (OK). Non-zero values represent various error conditions
   * compatible with gRPC status codes.
   */
  readonly statusCode: ConnectRpcStatusCode;

  /**
   * Status message (null for successful responses).
   *
   * Contains error description when ok is false.
   */
  readonly statusMessage: string | null;

  /**
   * Response headers.
   *
   * HTTP headers sent at the beginning of the response.
   */
  readonly headers: Headers;

  /**
   * Response trailers (sent at end of RPC).
   *
   * Additional metadata sent after the response body in streaming RPCs.
   */
  readonly trailers: Headers;

  /**
   * Response time in milliseconds.
   *
   * Inherited from ClientResult. Measures the full RPC duration.
   */
  readonly duration: number;

  /**
   * Get deserialized response data.
   * Returns the response message as-is (already deserialized by Connect).
   * Returns null if the response is an error or has no data.
   */
  // deno-lint-ignore no-explicit-any
  data<T = any>(): T | null;

  /**
   * Get raw response or error.
   */
  raw(): unknown;
}

/**
 * Parameters for creating a ConnectRpcResponse.
 */
export interface ConnectRpcResponseParams<T = unknown> {
  readonly response?: T;
  readonly error?: ConnectError;
  readonly headers: Headers;
  readonly trailers: Headers;
  readonly duration: number;
}

/**
 * Implementation of ConnectRpcResponse.
 */
export class ConnectRpcResponseImpl<T = unknown> implements ConnectRpcResponse {
  readonly kind = "connectrpc" as const;
  readonly ok: boolean;
  readonly statusCode: ConnectRpcStatusCode;
  readonly statusMessage: string | null;
  readonly headers: Headers;
  readonly trailers: Headers;
  readonly duration: number;

  readonly #response?: T;
  readonly #error?: ConnectError;

  constructor(params: ConnectRpcResponseParams<T>) {
    this.headers = params.headers;
    this.trailers = params.trailers;
    this.duration = params.duration;
    this.#response = params.response;
    this.#error = params.error;

    if (params.error) {
      this.ok = false;
      this.statusCode = params.error.code as ConnectRpcStatusCode;
      this.statusMessage = params.error.rawMessage || params.error.message;
    } else {
      this.ok = true;
      this.statusCode = 0;
      this.statusMessage = null;
    }
  }

  // deno-lint-ignore no-explicit-any
  data<U = any>(): U | null {
    if (this.#response === null || this.#response === undefined) {
      return null;
    }
    return this.#response as U;
  }

  raw(): T | ConnectError | undefined {
    return this.#response ?? this.#error;
  }
}
