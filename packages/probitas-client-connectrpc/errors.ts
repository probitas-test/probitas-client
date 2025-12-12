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
  readonly metadata?: Headers;

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
  readonly statusCode: ConnectRpcStatusCode;
  readonly statusMessage: string;
  readonly metadata?: Headers;
  readonly details: readonly ErrorDetail[];

  constructor(
    message: string,
    statusCode: ConnectRpcStatusCode,
    statusMessage: string,
    options?: ConnectRpcErrorOptions,
  ) {
    super(message, "ConnectRpcError", options);
    this.statusCode = statusCode;
    this.statusMessage = statusMessage;
    this.metadata = options?.metadata;
    this.details = options?.details ?? [];
  }
}

/**
 * Error thrown when the client is not authenticated (code 16).
 */
export class ConnectRpcUnauthenticatedError extends ConnectRpcError {
  override readonly name = "ConnectRpcUnauthenticatedError" as const;
  override readonly statusCode = 16 as const;

  constructor(statusMessage: string, options?: ConnectRpcErrorOptions) {
    super(`Unauthenticated: ${statusMessage}`, 16, statusMessage, options);
  }
}

/**
 * Error thrown when the client lacks permission (code 7).
 */
export class ConnectRpcPermissionDeniedError extends ConnectRpcError {
  override readonly name = "ConnectRpcPermissionDeniedError" as const;
  override readonly statusCode = 7 as const;

  constructor(statusMessage: string, options?: ConnectRpcErrorOptions) {
    super(`Permission denied: ${statusMessage}`, 7, statusMessage, options);
  }
}

/**
 * Error thrown when the requested resource is not found (code 5).
 */
export class ConnectRpcNotFoundError extends ConnectRpcError {
  override readonly name = "ConnectRpcNotFoundError" as const;
  override readonly statusCode = 5 as const;

  constructor(statusMessage: string, options?: ConnectRpcErrorOptions) {
    super(`Not found: ${statusMessage}`, 5, statusMessage, options);
  }
}

/**
 * Error thrown when a resource is exhausted (code 8).
 */
export class ConnectRpcResourceExhaustedError extends ConnectRpcError {
  override readonly name = "ConnectRpcResourceExhaustedError" as const;
  override readonly statusCode = 8 as const;

  constructor(statusMessage: string, options?: ConnectRpcErrorOptions) {
    super(`Resource exhausted: ${statusMessage}`, 8, statusMessage, options);
  }
}

/**
 * Error thrown for internal server errors (code 13).
 */
export class ConnectRpcInternalError extends ConnectRpcError {
  override readonly name = "ConnectRpcInternalError" as const;
  override readonly statusCode = 13 as const;

  constructor(statusMessage: string, options?: ConnectRpcErrorOptions) {
    super(`Internal error: ${statusMessage}`, 13, statusMessage, options);
  }
}

/**
 * Error thrown when the service is unavailable (code 14).
 */
export class ConnectRpcUnavailableError extends ConnectRpcError {
  override readonly name = "ConnectRpcUnavailableError" as const;
  override readonly statusCode = 14 as const;

  constructor(statusMessage: string, options?: ConnectRpcErrorOptions) {
    super(`Unavailable: ${statusMessage}`, 14, statusMessage, options);
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

  const options: ConnectRpcErrorOptions = {
    cause: error,
    metadata,
    details,
  };

  // Return specific error subclass based on code
  switch (statusCode) {
    case 5:
      return new ConnectRpcNotFoundError(statusMessage, options);
    case 7:
      return new ConnectRpcPermissionDeniedError(statusMessage, options);
    case 8:
      return new ConnectRpcResourceExhaustedError(statusMessage, options);
    case 13:
      return new ConnectRpcInternalError(statusMessage, options);
    case 14:
      return new ConnectRpcUnavailableError(statusMessage, options);
    case 16:
      return new ConnectRpcUnauthenticatedError(statusMessage, options);
    default:
      return new ConnectRpcError(
        error.message,
        statusCode,
        statusMessage,
        options,
      );
  }
}
