import type { CommonOptions } from "@probitas/client";

/**
 * Configuration for DenoKvClient.
 */
export interface DenoKvClientConfig extends CommonOptions {
  /**
   * Path to the KV database file.
   * If not specified, uses in-memory storage or Deno Deploy's KV.
   */
  readonly path?: string;

  /**
   * Whether to throw errors instead of returning failure results.
   * When true, operations throw DenoKvError on failure.
   * When false (default), operations return failure results with ok: false.
   */
  readonly throwOnError?: boolean;
}

/**
 * Options for set operations.
 */
export interface DenoKvSetOptions extends CommonOptions {
  /**
   * Time-to-live in milliseconds.
   * The entry will automatically expire after this duration.
   */
  readonly expireIn?: number;

  /**
   * Whether to throw errors instead of returning failure results.
   * Overrides the client-level throwOnError setting.
   */
  readonly throwOnError?: boolean;
}

/**
 * Options for list operations.
 */
export interface DenoKvListOptions extends CommonOptions {
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

  /**
   * Whether to throw errors instead of returning failure results.
   * Overrides the client-level throwOnError setting.
   */
  readonly throwOnError?: boolean;
}

/**
 * Options for get/delete operations.
 */
export interface DenoKvGetDeleteOptions extends CommonOptions {
  /**
   * Whether to throw errors instead of returning failure results.
   * Overrides the client-level throwOnError setting.
   */
  readonly throwOnError?: boolean;
}

/**
 * Options for atomic commit operations.
 */
export interface DenoKvAtomicOptions {
  /**
   * Whether to throw errors instead of returning failure results.
   * Overrides the client-level throwOnError setting.
   * Note: Version check failures (ok: false) are not considered errors
   * and will not throw even when throwOnError is true.
   */
  readonly throwOnError?: boolean;
}
