import type { BindValue, Database } from "@db/sqlite";
import {
  type SqlIsolationLevel,
  SqlQueryResult,
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
export interface SqliteTransactionOptions extends SqlTransactionOptions {
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
  #finished = false;

  private constructor(db: Database) {
    this.#db = db;
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

      return new SqliteTransactionImpl(db);
    } catch (error) {
      throw convertSqliteError(error);
    }
  }

  // deno-lint-ignore no-explicit-any
  query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<SqlQueryResult<T>> {
    if (this.#finished) {
      return Promise.reject(
        convertSqliteError(new Error("Transaction is already finished")),
      );
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
        const rows = (
          params
            // deno-lint-ignore no-explicit-any
            ? stmt.all<Record<string, any>>(...(params as BindParams))
            // deno-lint-ignore no-explicit-any
            : stmt.all<Record<string, any>>()
        ) as T[];
        stmt.finalize();
        const duration = performance.now() - startTime;

        return Promise.resolve(
          new SqlQueryResult<T>({
            ok: true,
            rows: rows,
            rowCount: rows.length,
            duration,
            metadata: {},
          }),
        );
      } else {
        // For INSERT/UPDATE/DELETE queries
        const stmt = this.#db.prepare(sql);
        if (params) {
          stmt.run(...(params as BindParams));
        } else {
          stmt.run();
        }
        stmt.finalize();
        const duration = performance.now() - startTime;

        // Get affected rows and last insert id
        const changes = this.#db.changes;
        const lastInsertRowId = this.#db.lastInsertRowId;

        return Promise.resolve(
          new SqlQueryResult<T>({
            ok: true,
            rows: [],
            rowCount: changes,
            duration,
            metadata: {
              lastInsertId: lastInsertRowId > 0
                ? BigInt(lastInsertRowId)
                : undefined,
            },
          }),
        );
      }
    } catch (error) {
      return Promise.reject(convertSqliteError(error));
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
