import { type BindValue, Database } from "@db/sqlite";
import { getLogger } from "@probitas/logger";
import {
  SqlQueryResult,
  type SqlTransaction,
  type SqlTransactionOptions,
} from "@probitas/client-sql";
import type { SqliteClientConfig } from "./types.ts";
import { convertSqliteError } from "./errors.ts";
import {
  SqliteTransactionImpl,
  type SqliteTransactionOptions,
} from "./transaction.ts";

const logger = getLogger("probitas", "client", "sql", "sqlite");

/** Internal type alias for bind parameters */
type BindParams = BindValue[];

/**
 * Format SQL for logging, truncating if necessary.
 */
function formatSql(sql: string): string {
  return sql.length > 1000 ? sql.slice(0, 1000) + "..." : sql;
}

/**
 * Format parameters for logging, truncating if necessary.
 */
function formatParams(params: unknown): string {
  try {
    const str = JSON.stringify(params);
    return str.length > 500 ? str.slice(0, 500) + "..." : str;
  } catch {
    return "<unserializable>";
  }
}

/**
 * SQLite client interface.
 */
export interface SqliteClient extends AsyncDisposable {
  /** The client configuration. */
  readonly config: SqliteClientConfig;

  /** The SQL dialect identifier. */
  readonly dialect: "sqlite";

  /**
   * Execute a SQL query.
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
   * Execute a function within a transaction.
   * Automatically commits on success or rolls back on error.
   * @param fn - Function to execute within transaction
   * @param options - Transaction options
   */
  transaction<T>(
    fn: (tx: SqlTransaction) => Promise<T>,
    options?: SqlTransactionOptions | SqliteTransactionOptions,
  ): Promise<T>;

  /**
   * Backup the database to a file.
   * Uses VACUUM INTO for a consistent backup.
   * @param destPath - Destination file path for the backup
   */
  backup(destPath: string): Promise<void>;

  /**
   * Run VACUUM to rebuild the database file, reclaiming unused space.
   */
  vacuum(): Promise<void>;

  /**
   * Close the database connection.
   */
  close(): Promise<void>;
}

/**
 * Create a new SQLite client instance.
 *
 * The client provides parameterized queries, transaction support,
 * WAL mode for better concurrency, and SQLite-specific features like backup and vacuum.
 *
 * @param config - SQLite client configuration
 * @returns A promise resolving to a new SQLite client instance
 *
 * @example Using file-based database
 * ```ts
 * import { createSqliteClient } from "@probitas/client-sql-sqlite";
 *
 * const client = await createSqliteClient({
 *   path: "./data.db",
 * });
 *
 * const result = await client.query<{ id: number; name: string }>(
 *   "SELECT * FROM users WHERE id = ?",
 *   [1],
 * );
 * console.log(result.rows.first());
 *
 * await client.close();
 * ```
 *
 * @example Using in-memory database
 * ```ts
 * import { createSqliteClient } from "@probitas/client-sql-sqlite";
 *
 * const client = await createSqliteClient({
 *   path: ":memory:",
 * });
 * await client.close();
 * ```
 *
 * @example Transaction with auto-commit/rollback
 * ```ts
 * import { createSqliteClient } from "@probitas/client-sql-sqlite";
 * import type { SqlTransaction } from "@probitas/client-sql";
 *
 * const client = await createSqliteClient({ path: ":memory:" });
 * const user = await client.transaction(async (tx: SqlTransaction) => {
 *   await tx.query("INSERT INTO users (name) VALUES (?)", ["Alice"]);
 *   const result = await tx.query("SELECT last_insert_rowid() as id");
 *   return result.rows.first();
 * });
 * await client.close();
 * ```
 *
 * @example Database backup
 * ```ts
 * import { createSqliteClient } from "@probitas/client-sql-sqlite";
 *
 * const client = await createSqliteClient({ path: "./data.db" });
 * await client.backup("./backup.db");
 * await client.close();
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * import { createSqliteClient } from "@probitas/client-sql-sqlite";
 *
 * await using client = await createSqliteClient({ path: "./data.db" });
 *
 * const result = await client.query("SELECT 1");
 * // Client automatically closed when scope exits
 * ```
 */
export function createSqliteClient(
  config: SqliteClientConfig,
): Promise<SqliteClient> {
  try {
    // Build open flags
    // SQLITE_OPEN_READWRITE = 0x00000002
    // SQLITE_OPEN_READONLY = 0x00000001
    // SQLITE_OPEN_CREATE = 0x00000004
    let flags: number;
    if (config.readonly) {
      flags = 0x00000001; // SQLITE_OPEN_READONLY
    } else {
      flags = 0x00000002 | 0x00000004; // SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE
    }

    const db = new Database(config.path, { flags });

    // Apply pragmas (skip if readonly since PRAGMA writes aren't allowed)
    if (!config.readonly) {
      // Apply WAL mode if requested (default: true for better concurrency)
      const walEnabled = config.wal ?? true;
      if (walEnabled) {
        db.exec("PRAGMA journal_mode = WAL");
      }

      // Apply sensible defaults for other pragmas
      db.exec("PRAGMA foreign_keys = ON");
      db.exec("PRAGMA busy_timeout = 5000");
    }

    return Promise.resolve(new SqliteClientImpl(config, db));
  } catch (error) {
    return Promise.reject(convertSqliteError(error));
  }
}

class SqliteClientImpl implements SqliteClient {
  readonly config: SqliteClientConfig;
  readonly dialect = "sqlite" as const;
  readonly #db: Database;
  #closed = false;

  constructor(config: SqliteClientConfig, db: Database) {
    this.config = config;
    this.#db = db;

    logger.debug("SQLite client created", {
      path: config.path,
      readonly: config.readonly ?? false,
      wal: config.wal ?? true,
    });
  }

  // deno-lint-ignore no-explicit-any
  query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<SqlQueryResult<T>> {
    if (this.#closed) {
      return Promise.reject(
        convertSqliteError(new Error("Client is closed")),
      );
    }

    const startTime = performance.now();
    const sqlPreview = sql.length > 100 ? sql.substring(0, 100) + "..." : sql;

    logger.info("SQLite query starting", {
      sql: sqlPreview,
      paramCount: params?.length ?? 0,
    });

    logger.trace("SQLite query details", {
      sql: formatSql(sql),
      params: params ? formatParams(params) : undefined,
    });

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

          logger.info("SQLite query success", {
            duration: `${duration.toFixed(2)}ms`,
            rowCount: rows.length,
          });

          if (rows.length > 0) {
            const sample = rows.slice(0, 1);
            logger.trace("SQLite query row sample", {
              rows: formatParams(sample),
            });
          }

          return Promise.resolve(
            new SqlQueryResult<T>({
              ok: true,
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

          logger.info("SQLite query success", {
            duration: `${duration.toFixed(2)}ms`,
            affectedRows: changes,
            lastInsertId: lastInsertRowId > 0 ? lastInsertRowId : undefined,
          });

          return Promise.resolve(
            new SqlQueryResult<T>({
              ok: true,
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
      logger.error("SQLite query failed", {
        sql: sqlPreview,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
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

  async transaction<T>(
    fn: (tx: SqlTransaction) => Promise<T>,
    options?: SqlTransactionOptions | SqliteTransactionOptions,
  ): Promise<T> {
    if (this.#closed) {
      throw convertSqliteError(new Error("Client is closed"));
    }

    logger.debug("SQLite transaction begin");

    const startTime = performance.now();
    const tx = SqliteTransactionImpl.begin(
      this.#db,
      options as SqliteTransactionOptions,
    );

    try {
      const result = await fn(tx);
      await tx.commit();

      const duration = performance.now() - startTime;
      logger.debug("SQLite transaction commit", {
        duration: `${duration.toFixed(2)}ms`,
      });

      return result;
    } catch (error) {
      await tx.rollback();
      const duration = performance.now() - startTime;
      logger.debug("SQLite transaction rollback", {
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  backup(destPath: string): Promise<void> {
    if (this.#closed) {
      return Promise.reject(
        convertSqliteError(new Error("Client is closed")),
      );
    }

    logger.debug("SQLite backup starting", {
      destPath,
    });

    const startTime = performance.now();

    try {
      // SQLite backup using VACUUM INTO (available since SQLite 3.27.0)
      // This creates a complete backup of the database to the specified file
      this.#db.exec(`VACUUM INTO '${destPath.replace(/'/g, "''")}'`);

      const duration = performance.now() - startTime;
      logger.debug("SQLite backup success", {
        destPath,
        duration: `${duration.toFixed(2)}ms`,
      });

      return Promise.resolve();
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("SQLite backup failed", {
        destPath,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      return Promise.reject(convertSqliteError(error));
    }
  }

  vacuum(): Promise<void> {
    if (this.#closed) {
      return Promise.reject(
        convertSqliteError(new Error("Client is closed")),
      );
    }

    logger.debug("SQLite vacuum starting");

    const startTime = performance.now();

    try {
      this.#db.exec("VACUUM");

      const duration = performance.now() - startTime;
      logger.debug("SQLite vacuum success", {
        duration: `${duration.toFixed(2)}ms`,
      });

      return Promise.resolve();
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("SQLite vacuum failed", {
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      return Promise.reject(convertSqliteError(error));
    }
  }

  close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    logger.debug("SQLite client closing");
    this.#db.close();
    logger.debug("SQLite client closed");
    return Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
