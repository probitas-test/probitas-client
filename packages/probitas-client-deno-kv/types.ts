import type { CommonOptions } from "@probitas/client";

/**
 * Options for Deno KV operations.
 *
 * Extends CommonOptions with error handling behavior configuration.
 */
export interface DenoKvOptions extends CommonOptions {
  /**
   * Whether to throw errors instead of returning them in the result.
   *
   * - `false` (default): Errors are returned in the result's `error` property
   * - `true`: Errors are thrown as exceptions
   *
   * This applies to both KV errors (quota exceeded, etc.) and connection errors.
   * Note: Atomic check failures are NOT errors and will never be thrown.
   *
   * @default false
   */
  readonly throwOnError?: boolean;
}

/**
 * Configuration for DenoKvClient.
 */
export interface DenoKvClientConfig extends DenoKvOptions {
  /**
   * Path to the KV database file.
   * If not specified, uses in-memory storage or Deno Deploy's KV.
   */
  readonly path?: string;
}

/**
 * Options for get operations.
 */
export interface DenoKvGetOptions extends DenoKvOptions {}

/**
 * Options for set operations.
 */
export interface DenoKvSetOptions extends DenoKvOptions {
  /**
   * Time-to-live in milliseconds.
   * The entry will automatically expire after this duration.
   */
  readonly expireIn?: number;
}

/**
 * Options for delete operations.
 */
export interface DenoKvDeleteOptions extends DenoKvOptions {}

/**
 * Options for list operations.
 */
export interface DenoKvListOptions extends DenoKvOptions {
  /**
   * Maximum number of entries to return.
   */
  readonly limit?: number;

  /**
   * Cursor for pagination.
   */
  readonly cursor?: string;

  /**
   * Whether to iterate in reverse order.
   */
  readonly reverse?: boolean;
}

/**
 * Options for atomic operations.
 */
export interface DenoKvAtomicOptions extends DenoKvOptions {}
