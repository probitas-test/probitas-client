import type postgres from "postgres";
import {
  SqlConnectionError,
  type SqlQueryOptions,
  type SqlQueryResult,
  SqlQueryResultErrorImpl,
  SqlQueryResultFailureImpl,
  SqlQueryResultSuccessImpl,
  type SqlTransaction,
} from "@probitas/client-sql";
import { mapPostgresError } from "./errors.ts";

/**
 * PostgreSQL transaction implementation.
 *
 * Wraps a postgres.js reserved connection to provide transaction semantics.
 */
export class PostgresTransaction implements SqlTransaction {
  readonly #sql: postgres.ReservedSql;
  #committed = false;
  #rolledBack = false;

  /**
   * Creates a new PostgresTransaction.
   *
   * @param sql - Reserved SQL connection from postgres.js
   */
  constructor(sql: postgres.ReservedSql) {
    this.#sql = sql;
  }

  /**
   * Checks if the transaction is still active.
   */
  #assertActive(): void {
    if (this.#committed) {
      throw new Error("Transaction has already been committed");
    }
    if (this.#rolledBack) {
      throw new Error("Transaction has already been rolled back");
    }
  }

  /**
   * Execute a query within the transaction.
   *
   * @param sql - SQL query string
   * @param params - Optional query parameters
   * @param options - Optional query options
   */
  // deno-lint-ignore no-explicit-any
  async query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
    options?: SqlQueryOptions,
  ): Promise<SqlQueryResult<T>> {
    // Determine whether to throw on error (default false for transactions)
    const shouldThrow = options?.throwOnError ?? false;

    this.#assertActive();

    const startTime = performance.now();

    try {
      const result = await this.#sql.unsafe<T[]>(sql, params as never[]);
      const duration = performance.now() - startTime;

      return new SqlQueryResultSuccessImpl<T>({
        rows: result as unknown as readonly T[],
        rowCount: result.count ?? result.length,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      const sqlError = mapPostgresError(
        error as { message: string; code?: string },
      );

      // Throw error if required
      if (shouldThrow) {
        throw sqlError;
      }

      // Return Failure for connection errors, Error for query errors
      if (sqlError instanceof SqlConnectionError) {
        return new SqlQueryResultFailureImpl<T>(sqlError, duration);
      }

      return new SqlQueryResultErrorImpl<T>(sqlError, duration);
    }
  }

  /**
   * Execute a query and return the first row or undefined.
   *
   * @param sql - SQL query string
   * @param params - Optional query parameters
   * @param options - Optional query options
   */
  // deno-lint-ignore no-explicit-any
  async queryOne<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
    options?: SqlQueryOptions,
  ): Promise<T | undefined> {
    // queryOne always throws on error for convenience
    const result = await this.query<T>(sql, params, {
      ...options,
      throwOnError: true,
    });
    // result.ok is guaranteed to be true here due to throwOnError: true
    if (!result.ok) {
      throw result.error;
    }
    return result.rows[0];
  }

  /**
   * Commit the transaction.
   */
  async commit(): Promise<void> {
    this.#assertActive();
    try {
      await this.#sql.unsafe("COMMIT");
      this.#committed = true;
    } catch (error) {
      throw mapPostgresError(error as { message: string; code?: string });
    } finally {
      this.#sql.release();
    }
  }

  /**
   * Rollback the transaction.
   */
  async rollback(): Promise<void> {
    this.#assertActive();
    try {
      await this.#sql.unsafe("ROLLBACK");
      this.#rolledBack = true;
    } catch (error) {
      throw mapPostgresError(error as { message: string; code?: string });
    } finally {
      this.#sql.release();
    }
  }
}
