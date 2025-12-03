import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";
import { getLogger } from "@probitas/logger";
import {
  SqlQueryResult,
  type SqlTransaction,
  type SqlTransactionOptions,
} from "@probitas/client-sql";
import type { DuckDbClientConfig } from "./types.ts";
import { convertDuckDbError } from "./errors.ts";
import {
  DuckDbTransactionImpl,
  type DuckDbTransactionOptions,
} from "./transaction.ts";

const logger = getLogger("probitas", "client", "sql", "duckdb");

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
 * DuckDB client interface.
 */
export interface DuckDbClient extends AsyncDisposable {
  /** The client configuration. */
  readonly config: DuckDbClientConfig;

  /** The SQL dialect identifier. */
  readonly dialect: "duckdb";

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
    options?: SqlTransactionOptions | DuckDbTransactionOptions,
  ): Promise<T>;

  /**
   * Query a Parquet file directly.
   * DuckDB can read Parquet files without importing them.
   * @param path - Path to the Parquet file
   */
  // deno-lint-ignore no-explicit-any
  queryParquet<T = Record<string, any>>(
    path: string,
  ): Promise<SqlQueryResult<T>>;

  /**
   * Query a CSV file directly.
   * DuckDB can read CSV files without importing them.
   * @param path - Path to the CSV file
   */
  // deno-lint-ignore no-explicit-any
  queryCsv<T = Record<string, any>>(path: string): Promise<SqlQueryResult<T>>;

  /**
   * Close the database connection.
   */
  close(): Promise<void>;
}

/**
 * Create a DuckDB client.
 *
 * @example
 * ```typescript
 * // Using in-memory database (default)
 * const client = await createDuckDbClient({});
 *
 * // Using file-based database
 * const client = await createDuckDbClient({
 *   path: "./data.duckdb",
 * });
 *
 * // Read-only mode
 * const client = await createDuckDbClient({
 *   path: "./data.duckdb",
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
 * // Query Parquet file directly
 * const parquetResult = await client.queryParquet<{ id: number; value: string }>(
 *   "./data/events.parquet"
 * );
 *
 * await client.close();
 * ```
 */
export async function createDuckDbClient(
  config: DuckDbClientConfig,
): Promise<DuckDbClient> {
  try {
    // DuckDB uses :memory: for in-memory database
    const path = config.path ?? ":memory:";

    // Create instance with optional configuration
    const instanceConfig: Record<string, string> = {};
    if (config.readonly) {
      instanceConfig["access_mode"] = "READ_ONLY";
    }

    const instance = await DuckDBInstance.create(
      path,
      Object.keys(instanceConfig).length > 0 ? instanceConfig : undefined,
    );
    const connection = await instance.connect();

    return new DuckDbClientImpl(config, instance, connection);
  } catch (error) {
    throw convertDuckDbError(error);
  }
}

class DuckDbClientImpl implements DuckDbClient {
  readonly config: DuckDbClientConfig;
  readonly dialect = "duckdb" as const;
  readonly #instance: DuckDBInstance;
  readonly #connection: DuckDBConnection;
  #closed = false;

  constructor(
    config: DuckDbClientConfig,
    instance: DuckDBInstance,
    connection: DuckDBConnection,
  ) {
    this.config = config;
    this.#instance = instance;
    this.#connection = connection;

    logger.debug("DuckDB client created", {
      path: config.path ?? ":memory:",
      readonly: config.readonly ?? false,
    });
  }

  // deno-lint-ignore no-explicit-any
  async query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<SqlQueryResult<T>> {
    if (this.#closed) {
      throw convertDuckDbError(new Error("Client is closed"));
    }

    const startTime = performance.now();
    const sqlPreview = sql.length > 100 ? sql.substring(0, 100) + "..." : sql;

    logger.debug("DuckDB query starting", {
      sql: sqlPreview,
      paramCount: params?.length ?? 0,
    });

    logger.trace("DuckDB query details", {
      sql: formatSql(sql),
      params: params ? formatParams(params) : undefined,
    });

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
        const prepared = await this.#connection.prepare(sql);
        try {
          for (let i = 0; i < params.length; i++) {
            const value = params[i];
            // Bind by position (1-indexed)
            if (value === null || value === undefined) {
              // DuckDB node-api handles null automatically
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
        const reader = await this.#connection.runAndReadAll(sql);
        rows = reader.getRowObjects() as T[];
      }

      const duration = performance.now() - startTime;

      logger.debug("DuckDB query success", {
        duration: `${duration.toFixed(2)}ms`,
        rowCount: rows.length,
      });

      if (rows.length > 0) {
        const sample = rows.slice(0, 1);
        logger.trace("DuckDB query row sample", {
          rows: formatParams(sample),
        });
      }

      if (isSelect) {
        return new SqlQueryResult<T>({
          ok: true,
          rows: rows as T[],
          rowCount: rows.length,
          duration,
          metadata: {},
        });
      } else {
        // For INSERT/UPDATE/DELETE queries
        return new SqlQueryResult<T>({
          ok: true,
          rows: [],
          rowCount: rows.length,
          duration,
          metadata: {},
        });
      }
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("DuckDB query failed", {
        sql: sqlPreview,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
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

  async transaction<T>(
    fn: (tx: SqlTransaction) => Promise<T>,
    options?: SqlTransactionOptions | DuckDbTransactionOptions,
  ): Promise<T> {
    if (this.#closed) {
      throw convertDuckDbError(new Error("Client is closed"));
    }

    logger.debug("DuckDB transaction begin");

    const startTime = performance.now();
    const tx = await DuckDbTransactionImpl.begin(
      this.#connection,
      options as DuckDbTransactionOptions,
    );

    try {
      const result = await fn(tx);
      await tx.commit();

      const duration = performance.now() - startTime;
      logger.debug("DuckDB transaction commit", {
        duration: `${duration.toFixed(2)}ms`,
      });

      return result;
    } catch (error) {
      await tx.rollback();
      const duration = performance.now() - startTime;
      logger.debug("DuckDB transaction rollback", {
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // deno-lint-ignore no-explicit-any
  queryParquet<T = Record<string, any>>(
    path: string,
  ): Promise<SqlQueryResult<T>> {
    logger.debug("DuckDB queryParquet starting", {
      path,
    });

    // Escape single quotes in path
    const escapedPath = path.replace(/'/g, "''");
    return this.query<T>(`SELECT * FROM read_parquet('${escapedPath}')`);
  }

  // deno-lint-ignore no-explicit-any
  queryCsv<T = Record<string, any>>(path: string): Promise<SqlQueryResult<T>> {
    logger.debug("DuckDB queryCsv starting", {
      path,
    });

    // Escape single quotes in path
    const escapedPath = path.replace(/'/g, "''");
    return this.query<T>(`SELECT * FROM read_csv_auto('${escapedPath}')`);
  }

  close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;
    logger.debug("DuckDB client closing");
    this.#connection.closeSync();
    logger.debug("DuckDB client closed");
    // Note: DuckDBInstance doesn't have an explicit close method in the API
    // The instance is garbage collected when no longer referenced
    return Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
