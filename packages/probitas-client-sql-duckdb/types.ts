import type { CommonOptions } from "@probitas/client";

/**
 * Configuration for creating a DuckDB client.
 */
export interface DuckDbClientConfig extends CommonOptions {
  /**
   * Database file path.
   * Use `:memory:` or omit for an in-memory database.
   */
  readonly path?: string;

  /**
   * Open the database in read-only mode.
   * @default false
   */
  readonly readonly?: boolean;

  /**
   * Whether to throw an error for query failures.
   * When false, failures are returned as SqlQueryResultError or SqlQueryResultFailure.
   * Can be overridden per-query via SqlQueryOptions.
   * @default false
   */
  readonly throwOnError?: boolean;
}
