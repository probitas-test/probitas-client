import type { BindValue, Database } from "@db/sqlite";
import { AbortError, TimeoutError } from "@probitas/client";
import {
  createSqlQueryFailure,
  type SqlIsolationLevel,
  type SqlOptions,
  SqlQueryResult,
  type SqlQueryResultType,
  type SqlTransaction,
  type SqlTransactionOptions,
} from "@probitas/client-sql";
import { convertSqliteError } from "./errors.ts";

/** Internal type alias for bind parameters */
type BindParams = BindValue[];

/**
 * SQLite transaction behavior mode.
 *
 * - "deferred": Locks are acquired on first read/write (default)
 * - "immediate": Acquires RESERVED lock immediately
 * - "exclusive": Acquires EXCLUSIVE lock immediately
 */
export type SqliteTransactionMode = "deferred" | "immediate" | "exclusive";

/**
 * SQLite-specific transaction options.
 */
export interface SqliteTransactionOptions
  extends SqlTransactionOptions, SqlOptions {
  /**
   * Transaction behavior mode.
   * @default "deferred"
   */
  readonly mode?: SqliteTransactionMode;
}

/**
 * Map isolation levels to SQLite transaction modes.
 * SQLite has limited isolation level support:
 * - read_uncommitted requires PRAGMA read_uncommitted = 1 (not recommended)
 * - read_committed, repeatable_read, serializable are all effectively serializable in SQLite
 */
function mapIsolationLevelToMode(
  level: SqlIsolationLevel,
): SqliteTransactionMode {
  switch (level) {
    case "read_uncommitted":
    case "read_committed":
      return "deferred";
    case "repeatable_read":
      return "immediate";
    case "serializable":
      return "exclusive";
    default:
      return "deferred";
  }
}

export class SqliteTransactionImpl implements SqlTransaction {
  readonly #db: Database;
  readonly #options?: SqliteTransactionOptions;
  #finished = false;

  private constructor(db: Database, options?: SqliteTransactionOptions) {
    this.#db = db;
    this.#options = options;
  }

  /**
   * Begin a new transaction.
   */
  static begin(
    db: Database,
    options?: SqliteTransactionOptions,
  ): SqliteTransactionImpl {
    try {
      // Determine transaction mode
      let mode: SqliteTransactionMode = options?.mode ?? "deferred";
      if (!options?.mode && options?.isolationLevel) {
        mode = mapIsolationLevelToMode(options.isolationLevel);
      }

      // Begin transaction with appropriate mode
      const modeStr = mode.toUpperCase();
      db.exec(`BEGIN ${modeStr} TRANSACTION`);

      return new SqliteTransactionImpl(db, options);
    } catch (error) {
      throw convertSqliteError(error);
    }
  }

  /**
   * Determine if errors should be thrown based on options and transaction config.
   * Priority: request option > transaction config > default (false)
   */
  #shouldThrow(options?: SqlOptions): boolean {
    return options?.throwOnError ?? this.#options?.throwOnError ?? false;
  }

  // deno-lint-ignore no-explicit-any
  query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
    options?: SqlOptions,
  ): Promise<SqlQueryResultType<T>> {
    if (this.#finished) {
      const error = convertSqliteError(
        new Error("Transaction is already finished"),
      );
      if (this.#shouldThrow(options)) {
        return Promise.reject(error);
      }
      return Promise.resolve(createSqlQueryFailure(error, 0));
    }

    const startTime = performance.now();

    try {
      // Check if this is a SELECT query
      const trimmedSql = sql.trim().toUpperCase();
      const isSelect = trimmedSql.startsWith("SELECT") ||
        trimmedSql.startsWith("PRAGMA") ||
        trimmedSql.startsWith("EXPLAIN");

      if (isSelect) {
        // For SELECT queries, use query method
        const stmt = this.#db.prepare(sql);
        try {
          const rows = (
            params
              // deno-lint-ignore no-explicit-any
              ? stmt.all<Record<string, any>>(...(params as BindParams))
              // deno-lint-ignore no-explicit-any
              : stmt.all<Record<string, any>>()
          ) as T[];
          const duration = performance.now() - startTime;

          return Promise.resolve(
            new SqlQueryResult<T>({
              rows: rows,
              rowCount: rows.length,
              duration,
            }),
          );
        } finally {
          stmt.finalize();
        }
      } else {
        // For INSERT/UPDATE/DELETE queries
        const stmt = this.#db.prepare(sql);
        try {
          if (params) {
            stmt.run(...(params as BindParams));
          } else {
            stmt.run();
          }
          const duration = performance.now() - startTime;

          // Get affected rows and last insert id
          const changes = this.#db.changes;
          const lastInsertRowId = this.#db.lastInsertRowId;

          return Promise.resolve(
            new SqlQueryResult<T>({
              rows: [],
              rowCount: changes,
              duration,
              lastInsertId: lastInsertRowId > 0
                ? BigInt(lastInsertRowId)
                : undefined,
            }),
          );
        } finally {
          stmt.finalize();
        }
      }
    } catch (error) {
      const duration = performance.now() - startTime;
      const sqlError = convertSqliteError(error);

      // TimeoutError and AbortError should always be thrown
      if (error instanceof TimeoutError || error instanceof AbortError) {
        throw error;
      }

      if (this.#shouldThrow(options)) {
        return Promise.reject(sqlError);
      }
      return Promise.resolve(createSqlQueryFailure(sqlError, duration));
    }
  }

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

  commit(): Promise<void> {
    if (this.#finished) {
      return Promise.reject(
        convertSqliteError(new Error("Transaction is already finished")),
      );
    }

    try {
      this.#db.exec("COMMIT");
      this.#finished = true;
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(convertSqliteError(error));
    }
  }

  rollback(): Promise<void> {
    if (this.#finished) {
      return Promise.reject(
        convertSqliteError(new Error("Transaction is already finished")),
      );
    }

    try {
      this.#db.exec("ROLLBACK");
      this.#finished = true;
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(convertSqliteError(error));
    }
  }
}
