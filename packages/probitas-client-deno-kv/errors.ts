import { AbortError, ClientError, TimeoutError } from "@probitas/client";

/**
 * Base error class for Deno KV operations.
 *
 * Use the `kind` property to distinguish between error types:
 * - `"kv"`: General KV operation error
 * - `"quota"`: Quota limit exceeded
 * - `"connection"`: Network/connection failure
 */
export class DenoKvError extends ClientError {
  override readonly name: string = "DenoKvError";

  constructor(message: string, kind: string = "kv", options?: ErrorOptions) {
    super(message, kind, options);
  }
}

/**
 * Error thrown when a connection to Deno KV fails.
 *
 * This typically occurs when:
 * - Network errors prevent reaching Deno Deploy KV
 * - Authentication/authorization fails
 * - Service is unavailable
 */
export class DenoKvConnectionError extends DenoKvError {
  override readonly name = "DenoKvConnectionError";
  override readonly kind = "connection" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, "connection", options);
  }
}

/**
 * Error types that indicate the operation was not processed.
 * These are errors that occur before the operation reaches the Deno KV server.
 */
export type DenoKvFailureError =
  | DenoKvConnectionError
  | AbortError
  | TimeoutError;
