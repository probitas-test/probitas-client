import type { CommonOptions } from "@probitas/client";

/**
 * Configuration for creating a SQLite client.
 */
export interface SqliteClientConfig extends CommonOptions {
  /**
   * Database file path.
   * Use ":memory:" for an in-memory database.
   */
  readonly path: string;

  /**
   * Open the database in read-only mode.
   * @default false
   */
  readonly readonly?: boolean;

  /**
   * Enable WAL (Write-Ahead Logging) mode.
   * WAL mode provides better concurrency and performance.
   * @default true
   */
  readonly wal?: boolean;
}
