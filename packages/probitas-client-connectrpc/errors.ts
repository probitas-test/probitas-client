/**
 * Error classes for ConnectRPC client.
 *
 * @module
 */

import { type Code, ConnectError } from "@connectrpc/connect";
import { AbortError, ClientError, TimeoutError } from "@probitas/client";
import type { ConnectRpcStatusCode } from "./status.ts";

/**
 * Error thrown when a network-level failure occurs.
 *
 * This error indicates that the request could not be processed by the server
 * due to network issues (connection refused, DNS resolution failure, timeout, etc.).
 * Unlike ConnectRpcError, this error means the server was never reached.
 */
export class ConnectRpcNetworkError extends ClientError {
  override readonly name: string = "ConnectRpcNetworkError";
  override readonly kind = "connectrpc" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, "network", options);
  }
}

/**
 * Rich error detail from google.rpc.Status.
 *
 * ConnectRPC errors can include structured details encoded in error responses.
 * These details follow the google.protobuf.Any format with a type URL and value.
 */
export interface ErrorDetail {
  /**
   * Type URL identifying the error detail type.
   * Common types include:
   * - "type.googleapis.com/google.rpc.BadRequest"
   * - "type.googleapis.com/google.rpc.DebugInfo"
   * - "type.googleapis.com/google.rpc.RetryInfo"
   * - "type.googleapis.com/google.rpc.QuotaFailure"
   */
  readonly typeUrl: string;

  /**
   * Decoded error detail value.
   * The structure depends on the typeUrl.
   */
  readonly value: unknown;
}

/**
 * Options for ConnectRpcError construction.
 */
export interface ConnectRpcErrorOptions extends ErrorOptions {
  /**
   * Headers/metadata from the ConnectRPC response.
   */
  readonly metadata?: Headers | null;

  /**
   * Rich error details from google.rpc.Status.
   */
  readonly details?: readonly ErrorDetail[] | null;
}

/**
 * Error class for ConnectRPC/gRPC errors.
 *
 * Use `statusCode` to distinguish between different gRPC error codes.
 */
export class ConnectRpcError extends ClientError {
  override readonly name: string = "ConnectRpcError";
  override readonly kind = "connectrpc" as const;
  readonly statusCode: ConnectRpcStatusCode;
  readonly statusMessage: string;
  readonly metadata: Headers | null;
  readonly details: readonly ErrorDetail[];

  constructor(
    message: string,
    statusCode: ConnectRpcStatusCode,
    statusMessage: string,
    options?: ConnectRpcErrorOptions,
  ) {
    super(message, "connectrpc", options);
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.metadata = options?.metadata ?? null;
    this.details = options?.details ?? [];
  }
}

/**
 * Convert ConnectRPC's ConnectError to ConnectRpcError.
 *
 * @param error - The ConnectError from @connectrpc/connect
 * @param metadata - Optional metadata from the response
 * @returns ConnectRpcError with statusCode for discrimination
 */
export function fromConnectError(
  error: ConnectError,
  metadata?: Headers,
): ConnectRpcError {
  const statusCode = error.code as Code as ConnectRpcStatusCode;
  const statusMessage = error.rawMessage || error.message;

  // Extract error details.
  // ConnectError.details contains unprocessed detail objects with `desc` and `value` properties.
  // We convert them to our ErrorDetail format with typeUrl and value.
  const details: ErrorDetail[] = error.details.map((detail) => {
    // detail has `desc` (schema with typeName) and `value` (the actual data)
    const d = detail as { desc?: { typeName?: string }; value?: unknown };
    return {
      typeUrl: d.desc?.typeName ?? "",
      value: d.value,
    };
  });

  return new ConnectRpcError(error.message, statusCode, statusMessage, {
    cause: error,
    metadata,
    details,
  });
}

/**
 * Error types that indicate the operation was not processed.
 * These are errors that occur before the request reaches the server.
 */
export type ConnectRpcFailureError =
  | ConnectRpcNetworkError
  | AbortError
  | TimeoutError;
