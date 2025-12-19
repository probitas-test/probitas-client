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
}
