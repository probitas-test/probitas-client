import type postgres from "postgres";
import { SqlQueryResult, type SqlTransaction } from "@probitas/client-sql";
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
   */
  // deno-lint-ignore no-explicit-any
  async query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<SqlQueryResult<T>> {
    this.#assertActive();

    const startTime = performance.now();

    try {
      const result = await this.#sql.unsafe<T[]>(sql, params as never[]);
      const duration = performance.now() - startTime;

      return new SqlQueryResult<T>({
        ok: true,
        rows: result as unknown as readonly T[],
        rowCount: result.count ?? result.length,
        duration,
      });
    } catch (error) {
      throw mapPostgresError(error as { message: string; code?: string });
    }
  }

  /**
   * Execute a query and return the first row or undefined.
   *
   * @param sql - SQL query string
   * @param params - Optional query parameters
   */
  // deno-lint-ignore no-explicit-any
  async queryOne<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | undefined> {
    const result = await this.query<T>(sql, params);
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
