import { ClientError } from "@probitas/client";
import type { GrpcStatusCode } from "./status.ts";

/**
 * Rich error detail from google.rpc.Status.
 *
 * gRPC errors can include structured details encoded in the
 * `grpc-status-details-bin` trailing metadata. These details
 * follow the google.protobuf.Any format with a type URL and value.
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
 * Options for GrpcError construction.
 */
export interface GrpcErrorOptions extends ErrorOptions {
  /**
   * Trailing metadata from the gRPC response.
   */
  readonly metadata?: Record<string, string>;

  /**
   * Rich error details from google.rpc.Status.
   */
  readonly details?: readonly ErrorDetail[];
}

/**
 * Base error class for gRPC errors.
 */
export class GrpcError extends ClientError {
  override readonly name: string = "GrpcError";
  readonly code: GrpcStatusCode;
  readonly grpcMessage: string;
  readonly metadata?: Record<string, string>;
  readonly details: readonly ErrorDetail[];

  constructor(
    message: string,
    code: GrpcStatusCode,
    grpcMessage: string,
    options?: GrpcErrorOptions,
  ) {
    super(message, "unknown", options);
    this.code = code;
    this.grpcMessage = grpcMessage;
    this.metadata = options?.metadata;
    this.details = options?.details ?? [];
  }
}

/**
 * Error thrown when the client is not authenticated (code 16).
 */
export class GrpcUnauthenticatedError extends GrpcError {
  override readonly name = "GrpcUnauthenticatedError";
  override readonly code = 16 as const;

  constructor(grpcMessage: string, options?: GrpcErrorOptions) {
    super(`Unauthenticated: ${grpcMessage}`, 16, grpcMessage, options);
  }
}

/**
 * Error thrown when the client lacks permission (code 7).
 */
export class GrpcPermissionDeniedError extends GrpcError {
  override readonly name = "GrpcPermissionDeniedError";
  override readonly code = 7 as const;

  constructor(grpcMessage: string, options?: GrpcErrorOptions) {
    super(`Permission denied: ${grpcMessage}`, 7, grpcMessage, options);
  }
}

/**
 * Error thrown when the requested resource is not found (code 5).
 */
export class GrpcNotFoundError extends GrpcError {
  override readonly name = "GrpcNotFoundError";
  override readonly code = 5 as const;

  constructor(grpcMessage: string, options?: GrpcErrorOptions) {
    super(`Not found: ${grpcMessage}`, 5, grpcMessage, options);
  }
}

/**
 * Error thrown when a resource is exhausted (code 8).
 */
export class GrpcResourceExhaustedError extends GrpcError {
  override readonly name = "GrpcResourceExhaustedError";
  override readonly code = 8 as const;

  constructor(grpcMessage: string, options?: GrpcErrorOptions) {
    super(`Resource exhausted: ${grpcMessage}`, 8, grpcMessage, options);
  }
}

/**
 * Error thrown for internal server errors (code 13).
 */
export class GrpcInternalError extends GrpcError {
  override readonly name = "GrpcInternalError";
  override readonly code = 13 as const;

  constructor(grpcMessage: string, options?: GrpcErrorOptions) {
    super(`Internal error: ${grpcMessage}`, 13, grpcMessage, options);
  }
}

/**
 * Error thrown when the service is unavailable (code 14).
 */
export class GrpcUnavailableError extends GrpcError {
  override readonly name = "GrpcUnavailableError";
  override readonly code = 14 as const;

  constructor(grpcMessage: string, options?: GrpcErrorOptions) {
    super(`Unavailable: ${grpcMessage}`, 14, grpcMessage, options);
  }
}
