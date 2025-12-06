/**
 * Error classes for ConnectRPC client.
 *
 * @module
 */

import { type Code, ConnectError } from "@connectrpc/connect";
import { ClientError } from "@probitas/client";
import type { ConnectRpcStatusCode } from "./status.ts";

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
  readonly metadata?: Record<string, string>;

  /**
   * Rich error details from google.rpc.Status.
   */
  readonly details?: readonly ErrorDetail[];
}

/**
 * Base error class for ConnectRPC/gRPC errors.
 */
export class ConnectRpcError extends ClientError {
  override readonly name: string = "ConnectRpcError";
  override readonly kind = "connectrpc" as const;
  readonly code: ConnectRpcStatusCode;
  readonly rawMessage: string;
  readonly metadata?: Record<string, string>;
  readonly details: readonly ErrorDetail[];

  constructor(
    message: string,
    code: ConnectRpcStatusCode,
    rawMessage: string,
    options?: ConnectRpcErrorOptions,
  ) {
    super(message, "ConnectRpcError", options);
    this.code = code;
    this.rawMessage = rawMessage;
    this.metadata = options?.metadata;
    this.details = options?.details ?? [];
  }
}

/**
 * Error thrown when the client is not authenticated (code 16).
 */
export class ConnectRpcUnauthenticatedError extends ConnectRpcError {
  override readonly name = "ConnectRpcUnauthenticatedError" as const;
  override readonly code = 16 as const;

  constructor(rawMessage: string, options?: ConnectRpcErrorOptions) {
    super(`Unauthenticated: ${rawMessage}`, 16, rawMessage, options);
  }
}

/**
 * Error thrown when the client lacks permission (code 7).
 */
export class ConnectRpcPermissionDeniedError extends ConnectRpcError {
  override readonly name = "ConnectRpcPermissionDeniedError" as const;
  override readonly code = 7 as const;

  constructor(rawMessage: string, options?: ConnectRpcErrorOptions) {
    super(`Permission denied: ${rawMessage}`, 7, rawMessage, options);
  }
}

/**
 * Error thrown when the requested resource is not found (code 5).
 */
export class ConnectRpcNotFoundError extends ConnectRpcError {
  override readonly name = "ConnectRpcNotFoundError" as const;
  override readonly code = 5 as const;

  constructor(rawMessage: string, options?: ConnectRpcErrorOptions) {
    super(`Not found: ${rawMessage}`, 5, rawMessage, options);
  }
}

/**
 * Error thrown when a resource is exhausted (code 8).
 */
export class ConnectRpcResourceExhaustedError extends ConnectRpcError {
  override readonly name = "ConnectRpcResourceExhaustedError" as const;
  override readonly code = 8 as const;

  constructor(rawMessage: string, options?: ConnectRpcErrorOptions) {
    super(`Resource exhausted: ${rawMessage}`, 8, rawMessage, options);
  }
}

/**
 * Error thrown for internal server errors (code 13).
 */
export class ConnectRpcInternalError extends ConnectRpcError {
  override readonly name = "ConnectRpcInternalError" as const;
  override readonly code = 13 as const;

  constructor(rawMessage: string, options?: ConnectRpcErrorOptions) {
    super(`Internal error: ${rawMessage}`, 13, rawMessage, options);
  }
}

/**
 * Error thrown when the service is unavailable (code 14).
 */
export class ConnectRpcUnavailableError extends ConnectRpcError {
  override readonly name = "ConnectRpcUnavailableError" as const;
  override readonly code = 14 as const;

  constructor(rawMessage: string, options?: ConnectRpcErrorOptions) {
    super(`Unavailable: ${rawMessage}`, 14, rawMessage, options);
  }
}

/**
 * Convert ConnectRPC's ConnectError to ConnectRpcError.
 *
 * @param error - The ConnectError from @connectrpc/connect
 * @param metadata - Optional metadata from the response
 * @returns Appropriate ConnectRpcError subclass based on error code
 */
export function fromConnectError(
  error: ConnectError,
  metadata?: Record<string, string>,
): ConnectRpcError {
  const code = error.code as Code as ConnectRpcStatusCode;
  const rawMessage = error.rawMessage || error.message;

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

  const options: ConnectRpcErrorOptions = {
    cause: error,
    metadata,
    details,
  };

  // Return specific error subclass based on code
  switch (code) {
    case 5:
      return new ConnectRpcNotFoundError(rawMessage, options);
    case 7:
      return new ConnectRpcPermissionDeniedError(rawMessage, options);
    case 8:
      return new ConnectRpcResourceExhaustedError(rawMessage, options);
    case 13:
      return new ConnectRpcInternalError(rawMessage, options);
    case 14:
      return new ConnectRpcUnavailableError(rawMessage, options);
    case 16:
      return new ConnectRpcUnauthenticatedError(rawMessage, options);
    default:
      return new ConnectRpcError(error.message, code, rawMessage, options);
  }
}
