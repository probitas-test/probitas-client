import mysql from "mysql2/promise";
import { getLogger } from "@probitas/logger";
import {
  SqlQueryResult,
  type SqlTransaction,
  type SqlTransactionOptions,
} from "@probitas/client-sql";
import type { MySqlClientConfig, MySqlConnectionConfig } from "./types.ts";
import { convertMySqlError } from "./errors.ts";
import { MySqlTransactionImpl } from "./transaction.ts";
import type { MySqlTransaction } from "./transaction.ts";

const logger = getLogger("probitas", "client", "sql", "mysql");

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
 * MySQL client interface.
 */
export interface MySqlClient extends AsyncDisposable {
  /** The client configuration. */
  readonly config: MySqlClientConfig;

  /** The SQL dialect identifier. */
  readonly dialect: "mysql";

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
    options?: SqlTransactionOptions,
  ): Promise<T>;

  /**
   * Close the client and release all connections.
   */
  close(): Promise<void>;
}

/**
 * Parse a MySQL connection URL into connection config.
 * Supports format: mysql://user:password@host:port/database
 */
function parseConnectionUrl(url: string): MySqlConnectionConfig {
  const parsed = new URL(url);
  if (parsed.protocol !== "mysql:") {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port, 10) : undefined,
    user: decodeURIComponent(parsed.username),
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    database: parsed.pathname.slice(1), // Remove leading "/"
  };
}

/**
 * Create a new MySQL client instance with connection pooling.
 *
 * The client provides connection pooling, parameterized queries, transaction support,
 * and automatic result type mapping.
 *
 * @param config - MySQL client configuration
 * @returns A promise resolving to a new MySQL client instance
 *
 * @example Using connection URL
 * ```ts
 * const client = await createMySqlClient({
 *   connection: "mysql://user:password@localhost:3306/testdb",
 * });
 *
 * const result = await client.query<{ id: number; name: string }>(
 *   "SELECT * FROM users WHERE id = ?",
 *   [1],
 * );
 * console.log(result.rows.first());  // { id: 1, name: "Alice" }
 *
 * await client.close();
 * ```
 *
 * @example Using connection config object
 * ```ts
 * const client = await createMySqlClient({
 *   connection: {
 *     host: "localhost",
 *     port: 3306,
 *     user: "root",
 *     password: "password",
 *     database: "testdb",
 *   },
 *   pool: { connectionLimit: 20 },
 * });
 * ```
 *
 * @example Transaction with auto-commit/rollback
 * ```ts
 * const user = await client.transaction(async (tx) => {
 *   await tx.query("INSERT INTO users (name) VALUES (?)", ["Alice"]);
 *   return await tx.queryOne("SELECT LAST_INSERT_ID() as id");
 * });
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * await using client = await createMySqlClient({
 *   connection: "mysql://localhost:3306/testdb",
 * });
 *
 * const result = await client.query("SELECT 1");
 * // Client automatically closed when scope exits
 * ```
 */
export async function createMySqlClient(
  config: MySqlClientConfig,
): Promise<MySqlClient> {
  const connConfig = typeof config.connection === "string"
    ? parseConnectionUrl(config.connection)
    : config.connection;

  const poolConfig: mysql.PoolOptions = {
    host: connConfig.host,
    port: connConfig.port ?? 3306,
    user: connConfig.user,
    password: connConfig.password,
    database: connConfig.database,
    charset: config.charset,
    timezone: config.timezone,
    waitForConnections: config.pool?.waitForConnections ?? true,
    connectionLimit: config.pool?.connectionLimit ?? 10,
    queueLimit: config.pool?.queueLimit ?? 0,
    idleTimeout: config.pool?.idleTimeout ?? 10000,
    enableKeepAlive: true,
    multipleStatements: connConfig.multipleStatements ?? false,
  };

  if (connConfig.tls) {
    poolConfig.ssl = {
      ca: connConfig.tls.ca,
      cert: connConfig.tls.cert,
      key: connConfig.tls.key,
      rejectUnauthorized: connConfig.tls.rejectUnauthorized ?? true,
    };
  }

  let pool: mysql.Pool;
  try {
    pool = mysql.createPool(poolConfig);
    // Test connection
    const connection = await pool.getConnection();
    connection.release();
  } catch (error) {
    throw convertMySqlError(error);
  }

  return new MySqlClientImpl(config, pool);
}

class MySqlClientImpl implements MySqlClient {
  readonly config: MySqlClientConfig;
  readonly dialect = "mysql" as const;
  readonly #pool: mysql.Pool;
  #closed = false;

  constructor(config: MySqlClientConfig, pool: mysql.Pool) {
    this.config = config;
    this.#pool = pool;

    // Log client creation with sanitized connection info
    const connInfo = typeof config.connection === "string"
      ? { connection: "[connection-url]" }
      : {
        host: config.connection.host,
        port: config.connection.port ?? 3306,
        database: config.connection.database,
        user: config.connection.user,
      };

    logger.debug("MySQL client created", {
      ...connInfo,
      charset: config.charset,
      timezone: config.timezone,
      connectionLimit: config.pool?.connectionLimit ?? 10,
    });
  }

  // deno-lint-ignore no-explicit-any
  async query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<SqlQueryResult<T>> {
    if (this.#closed) {
      throw convertMySqlError(new Error("Client is closed"));
    }

    const startTime = performance.now();
    const sqlPreview = sql.length > 100 ? sql.substring(0, 100) + "..." : sql;

    logger.debug("MySQL query starting", {
      sql: sqlPreview,
      paramCount: params?.length ?? 0,
    });

    logger.trace("MySQL query details", {
      sql: formatSql(sql),
      params: params ? formatParams(params) : undefined,
    });

    try {
      // deno-lint-ignore no-explicit-any
      const [rows, fields] = await (this.#pool as any).execute(sql, params);
      const duration = performance.now() - startTime;

      // Handle SELECT queries
      if (Array.isArray(rows)) {
        logger.debug("MySQL query success", {
          duration: `${duration.toFixed(2)}ms`,
          rowCount: rows.length,
        });

        if (rows.length > 0) {
          const sample = rows.slice(0, 1);
          logger.trace("MySQL query row sample", {
            rows: formatParams(sample),
          });
        }

        return new SqlQueryResult<T>({
          ok: true,
          rows: rows as unknown as T[],
          rowCount: rows.length,
          duration,
          metadata: {
            warnings: fields ? undefined : undefined,
          },
        });
      }

      // Handle INSERT/UPDATE/DELETE queries (ResultSetHeader)
      // deno-lint-ignore no-explicit-any
      const resultHeader = rows as any;

      logger.debug("MySQL query success", {
        duration: `${duration.toFixed(2)}ms`,
        affectedRows: resultHeader.affectedRows,
        lastInsertId: resultHeader.insertId ? resultHeader.insertId : undefined,
        warnings: resultHeader.warningStatus,
      });

      return new SqlQueryResult<T>({
        ok: true,
        rows: [],
        rowCount: resultHeader.affectedRows,
        duration,
        metadata: {
          lastInsertId: resultHeader.insertId
            ? BigInt(resultHeader.insertId)
            : undefined,
          warnings: resultHeader.warningStatus > 0
            ? [`${resultHeader.warningStatus} warning(s)`]
            : undefined,
        },
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("MySQL query failed", {
        sql: sqlPreview,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      throw convertMySqlError(error);
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
    options?: SqlTransactionOptions,
  ): Promise<T> {
    if (this.#closed) {
      throw convertMySqlError(new Error("Client is closed"));
    }

    logger.debug("MySQL transaction begin", {
      isolationLevel: options?.isolationLevel,
    });

    const startTime = performance.now();

    let tx: MySqlTransaction;
    try {
      const connection = await this.#pool.getConnection();
      tx = await MySqlTransactionImpl.begin(connection, options);
    } catch (error) {
      throw convertMySqlError(error);
    }
    try {
      const result = await fn(tx);
      await tx.commit();

      const duration = performance.now() - startTime;
      logger.debug("MySQL transaction commit", {
        duration: `${duration.toFixed(2)}ms`,
      });

      return result;
    } catch (error) {
      await tx.rollback();
      const duration = performance.now() - startTime;
      logger.debug("MySQL transaction rollback", {
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    logger.debug("MySQL client closing");
    await this.#pool.end();
    logger.debug("MySQL client closed");
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
