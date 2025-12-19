import type { SqlQueryResult } from "./result.ts";

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
   */
  // deno-lint-ignore no-explicit-any
  query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<SqlQueryResult<T>>;

  /**
   * Execute a query and return the first row or undefined.
   * @param sql - SQL query string
   * @param params - Optional query parameters
   */
  // deno-lint-ignore no-explicit-any
  queryOne<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
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
