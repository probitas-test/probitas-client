import type postgres from "postgres";
import { AbortError, TimeoutError } from "@probitas/client";
import {
  createSqlQueryFailure,
  type SqlOptions,
  SqlQueryResult,
  type SqlQueryResultType,
  type SqlTransaction,
  type SqlTransactionOptions,
} from "@probitas/client-sql";
import { mapPostgresError } from "./errors.ts";

/**
 * PostgreSQL-specific transaction options.
 */
export interface PostgresTransactionOptions
  extends SqlTransactionOptions, SqlOptions {
}

/**
 * PostgreSQL transaction implementation.
 *
 * Wraps a postgres.js reserved connection to provide transaction semantics.
 */
export class PostgresTransaction implements SqlTransaction {
  readonly #sql: postgres.ReservedSql;
  readonly #options?: PostgresTransactionOptions;
  #committed = false;
  #rolledBack = false;

  /**
   * Creates a new PostgresTransaction.
   *
   * @param sql - Reserved SQL connection from postgres.js
   * @param options - Transaction options including throwOnError
   */
  constructor(sql: postgres.ReservedSql, options?: PostgresTransactionOptions) {
    this.#sql = sql;
    this.#options = options;
  }

  /**
   * Determine if errors should be thrown based on options and transaction config.
   * Priority: request option > transaction config > default (false)
   */
  #shouldThrow(options?: SqlOptions): boolean {
    return options?.throwOnError ?? this.#options?.throwOnError ?? false;
  }

  /**
   * Checks if the transaction is still active.
   */
  #assertActive(options?: SqlOptions): SqlQueryResultType<never> | null {
    if (this.#committed) {
      const error = mapPostgresError({
        message: "Transaction has already been committed",
      });
      if (this.#shouldThrow(options)) {
        throw error;
      }
      return createSqlQueryFailure(error, 0);
    }
    if (this.#rolledBack) {
      const error = mapPostgresError({
        message: "Transaction has already been rolled back",
      });
      if (this.#shouldThrow(options)) {
        throw error;
      }
      return createSqlQueryFailure(error, 0);
    }
    return null;
  }

  /**
   * Execute a query within the transaction.
   *
   * @param sql - SQL query string
   * @param params - Optional query parameters
   * @param options - Optional query options (e.g., throwOnError)
   */
  // deno-lint-ignore no-explicit-any
  async query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
    options?: SqlOptions,
  ): Promise<SqlQueryResultType<T>> {
    const activeError = this.#assertActive(options);
    if (activeError) {
      return activeError as SqlQueryResultType<T>;
    }

    const startTime = performance.now();

    try {
      const result = await this.#sql.unsafe<T[]>(sql, params as never[]);
      const duration = performance.now() - startTime;

      return new SqlQueryResult<T>({
        rows: result as unknown as readonly T[],
        rowCount: result.count ?? result.length,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      const sqlError = mapPostgresError(
        error as { message: string; code?: string },
      );

      // TimeoutError and AbortError should always be thrown
      if (error instanceof TimeoutError || error instanceof AbortError) {
        throw error;
      }

      if (this.#shouldThrow(options)) {
        throw sqlError;
      }
      return createSqlQueryFailure(sqlError, duration);
    }
  }

  /**
   * Execute a query and return the first row or undefined.
   *
   * @param sql - SQL query string
   * @param params - Optional query parameters
   * @param options - Optional query options (e.g., throwOnError)
   */
  // deno-lint-ignore no-explicit-any
  async queryOne<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
    options?: SqlOptions,
  ): Promise<T | undefined> {
    const result = await this.query<T>(sql, params, options);
    if (!result.ok) {
      throw result.error;
    }
    return result.rows.first();
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
