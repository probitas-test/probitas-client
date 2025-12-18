import type { DuckDBConnection } from "@duckdb/node-api";
import {
  createSqlQueryResultError,
  createSqlQueryResultFailure,
  createSqlQueryResultSuccess,
  SqlConnectionError,
  type SqlQueryOptions,
  type SqlQueryResult,
  type SqlTransaction,
  type SqlTransactionOptions,
} from "@probitas/client-sql";
import { convertDuckDbError } from "./errors.ts";

/**
 * DuckDB-specific transaction options.
 */
export interface DuckDbTransactionOptions extends SqlTransactionOptions {
  // DuckDB uses standard isolation levels, no custom options needed
}

export class DuckDbTransactionImpl implements SqlTransaction {
  readonly #conn: DuckDBConnection;
  #finished = false;

  private constructor(conn: DuckDBConnection) {
    this.#conn = conn;
  }

  /**
   * Begin a new transaction.
   */
  static async begin(
    conn: DuckDBConnection,
    _options?: DuckDbTransactionOptions,
  ): Promise<DuckDbTransactionImpl> {
    try {
      // DuckDB uses "BEGIN TRANSACTION" and doesn't support
      // isolation level syntax in BEGIN statement directly.
      // It operates with snapshot isolation by default.
      await conn.run("BEGIN TRANSACTION");
      return new DuckDbTransactionImpl(conn);
    } catch (error) {
      throw convertDuckDbError(error);
    }
  }

  // deno-lint-ignore no-explicit-any
  async query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
    options?: SqlQueryOptions,
  ): Promise<SqlQueryResult<T>> {
    // Determine whether to throw on error (default false for transactions)
    const shouldThrow = options?.throwOnError ?? false;

    if (this.#finished) {
      const error = new SqlConnectionError("Transaction is already finished");
      if (shouldThrow) {
        throw error;
      }
      return createSqlQueryResultFailure<T>(error, 0);
    }

    const startTime = performance.now();

    try {
      // Check if this is a SELECT query
      const trimmedSql = sql.trim().toUpperCase();
      const isSelect = trimmedSql.startsWith("SELECT") ||
        trimmedSql.startsWith("PRAGMA") ||
        trimmedSql.startsWith("EXPLAIN") ||
        trimmedSql.startsWith("DESCRIBE") ||
        trimmedSql.startsWith("SHOW") ||
        trimmedSql.startsWith("WITH");

      // deno-lint-ignore no-explicit-any
      let rows: any[];

      if (params && params.length > 0) {
        // Use prepared statement with positional parameters ($1, $2, etc.)
        const prepared = await this.#conn.prepare(sql);
        try {
          for (let i = 0; i < params.length; i++) {
            const value = params[i];
            // Bind by position (1-indexed)
            if (value === null || value === undefined) {
              prepared.bindNull(i + 1);
            } else if (typeof value === "number") {
              if (Number.isInteger(value)) {
                prepared.bindInteger(i + 1, value);
              } else {
                prepared.bindDouble(i + 1, value);
              }
            } else if (typeof value === "string") {
              prepared.bindVarchar(i + 1, value);
            } else if (typeof value === "boolean") {
              prepared.bindBoolean(i + 1, value);
            } else if (typeof value === "bigint") {
              prepared.bindBigInt(i + 1, value);
            } else if (value instanceof Date) {
              // DuckDB expects ISO format for dates
              prepared.bindVarchar(i + 1, value.toISOString());
            } else if (value instanceof Uint8Array) {
              prepared.bindBlob(i + 1, value);
            } else {
              // Fallback: convert to string
              prepared.bindVarchar(i + 1, String(value));
            }
          }
          const reader = await prepared.runAndReadAll();
          rows = reader.getRowObjects() as T[];
        } finally {
          // Note: DuckDB node-api doesn't provide an explicit cleanup method
          // for prepared statements. They are garbage collected automatically.
        }
      } else {
        const reader = await this.#conn.runAndReadAll(sql);
        rows = reader.getRowObjects() as T[];
      }

      const duration = performance.now() - startTime;

      if (isSelect) {
        return createSqlQueryResultSuccess<T>({
          rows: rows as T[],
          rowCount: rows.length,
          duration,
        });
      } else {
        // For INSERT/UPDATE/DELETE, rows will be empty
        return createSqlQueryResultSuccess<T>({
          rows: [],
          rowCount: rows.length,
          duration,
        });
      }
    } catch (error) {
      const duration = performance.now() - startTime;
      const sqlError = convertDuckDbError(error);

      // Throw error if required
      if (shouldThrow) {
        throw sqlError;
      }

      // Return Failure for connection errors, Error for query errors
      if (sqlError instanceof SqlConnectionError) {
        return createSqlQueryResultFailure<T>(sqlError, duration);
      }

      return createSqlQueryResultError<T>(sqlError, duration);
    }
  }

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

  async commit(): Promise<void> {
    if (this.#finished) {
      throw convertDuckDbError(new Error("Transaction is already finished"));
    }

    try {
      await this.#conn.run("COMMIT");
      this.#finished = true;
    } catch (error) {
      throw convertDuckDbError(error);
    }
  }

  async rollback(): Promise<void> {
    if (this.#finished) {
      throw convertDuckDbError(new Error("Transaction is already finished"));
    }

    try {
      await this.#conn.run("ROLLBACK");
      this.#finished = true;
    } catch (error) {
      throw convertDuckDbError(error);
    }
  }
}
