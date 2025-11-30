import { type BindValue, Database } from "@db/sqlite";
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

/** Internal type alias for bind parameters */
type BindParams = BindValue[];

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
 * Create a SQLite client.
 *
 * @example
 * ```typescript
 * // Using file-based database
 * const client = await createSqliteClient({
 *   path: "./data.db",
 * });
 *
 * // Using in-memory database
 * const client = await createSqliteClient({
 *   path: ":memory:",
 * });
 *
 * // With WAL mode enabled
 * const client = await createSqliteClient({
 *   path: "./data.db",
 *   wal: true,
 * });
 *
 * // Read-only mode
 * const client = await createSqliteClient({
 *   path: "./data.db",
 *   readonly: true,
 * });
 *
 * const result = await client.query<{ id: number; name: string }>(
 *   "SELECT * FROM users WHERE id = ?",
 *   [1],
 * );
 *
 * console.log(result.rows.first()); // { id: 1, name: "Alice" }
 *
 * await client.close();
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

  async transaction<T>(
    fn: (tx: SqlTransaction) => Promise<T>,
    options?: SqlTransactionOptions | SqliteTransactionOptions,
  ): Promise<T> {
    if (this.#closed) {
      throw convertSqliteError(new Error("Client is closed"));
    }

    const tx = SqliteTransactionImpl.begin(
      this.#db,
      options as SqliteTransactionOptions,
    );

    try {
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  backup(destPath: string): Promise<void> {
    if (this.#closed) {
      return Promise.reject(
        convertSqliteError(new Error("Client is closed")),
      );
    }

    try {
      // SQLite backup using VACUUM INTO (available since SQLite 3.27.0)
      // This creates a complete backup of the database to the specified file
      this.#db.exec(`VACUUM INTO '${destPath.replace(/'/g, "''")}'`);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(convertSqliteError(error));
    }
  }

  vacuum(): Promise<void> {
    if (this.#closed) {
      return Promise.reject(
        convertSqliteError(new Error("Client is closed")),
      );
    }

    try {
      this.#db.exec("VACUUM");
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(convertSqliteError(error));
    }
  }

  close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    this.#db.close();
    return Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
