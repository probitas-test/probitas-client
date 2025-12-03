import type { DuckDBConnection } from "@duckdb/node-api";
import {
  SqlQueryResult,
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
  ): Promise<SqlQueryResult<T>> {
    if (this.#finished) {
      throw convertDuckDbError(new Error("Transaction is already finished"));
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
        return new SqlQueryResult<T>({
          ok: true,
          rows: rows as T[],
          rowCount: rows.length,
          duration,
          metadata: {},
        });
      } else {
        // For INSERT/UPDATE/DELETE, rows will be empty
        return new SqlQueryResult<T>({
          ok: true,
          rows: [],
          rowCount: rows.length,
          duration,
          metadata: {},
        });
      }
    } catch (error) {
      throw convertDuckDbError(error);
    }
  }

  // deno-lint-ignore no-explicit-any
  async queryOne<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | undefined> {
    const result = await this.query<T>(sql, params);
    return result.rows.first();
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
