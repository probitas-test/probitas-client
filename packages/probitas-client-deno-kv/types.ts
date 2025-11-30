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
}
