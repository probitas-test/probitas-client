import type { CommonOptions } from "@probitas/client";
import type { SqlQueryResult } from "./result.ts";

/**
 * Options for individual SQL queries.
 */
export interface SqlQueryOptions extends CommonOptions {
  /**
   * Whether to throw an error for query failures.
   * When false, failures are returned as SqlQueryResultError or SqlQueryResultFailure.
   * @default false (inherited from client config if not specified)
   */
  readonly throwOnError?: boolean;
}

/**
 * Transaction isolation level.
 */
export type SqlIsolationLevel =
  | "read_uncommitted"
  | "read_committed"
  | "repeatable_read"
  | "serializable";

/**
 * Options for starting a transaction.
 */
export interface SqlTransactionOptions {
  /** Isolation level for the transaction */
  readonly isolationLevel?: SqlIsolationLevel;
}

/**
 * SQL transaction interface.
 * Implementations should provide actual database-specific transaction handling.
 */
export interface SqlTransaction {
  /**
   * Execute a query within the transaction.
   * @param sql - SQL query string
   * @param params - Optional query parameters
   * @param options - Optional query options
   */
  // deno-lint-ignore no-explicit-any
  query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
    options?: SqlQueryOptions,
  ): Promise<SqlQueryResult<T>>;

  /**
   * Execute a query and return the first row or undefined.
   * @param sql - SQL query string
   * @param params - Optional query parameters
   * @param options - Optional query options
   */
  // deno-lint-ignore no-explicit-any
  queryOne<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
    options?: SqlQueryOptions,
  ): Promise<T | undefined>;

  /**
   * Commit the transaction.
   */
  commit(): Promise<void>;

  /**
   * Rollback the transaction.
   */
  rollback(): Promise<void>;
}
