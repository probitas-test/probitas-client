import mysql from "mysql2/promise";
import { getLogger } from "@probitas/logger";
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
   * @param options - Optional query options
   */
  // deno-lint-ignore no-explicit-any
  query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
    options?: SqlQueryOptions,
  ): Promise<SqlQueryResult<T>>;

  /**
   * Execute a query and return the first row or undefined.
   * @param sql - SQL query string
   * @param params - Optional query parameters
   * @param options - Optional query options
   */
  // deno-lint-ignore no-explicit-any
  queryOne<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
    options?: SqlQueryOptions,
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
 * Resolve a connection URL from string or config object.
 * If a string is provided, it is returned as-is.
 * If a config object is provided, a MySQL connection URL is constructed.
 */
function resolveConnectionUrl(url: string | MySqlConnectionConfig): string {
  if (typeof url === "string") {
    return url;
  }
  const host = url.host ?? "localhost";
  const port = url.port ?? 3306;

  let connectionUrl = `mysql://`;

  if (url.username && url.password) {
    connectionUrl += `${encodeURIComponent(url.username)}:${
      encodeURIComponent(url.password)
    }@`;
  } else if (url.username) {
    connectionUrl += `${encodeURIComponent(url.username)}@`;
  }

  connectionUrl += `${host}:${port}`;

  if (url.database) {
    connectionUrl += `/${url.database}`;
  }

  return connectionUrl;
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
    username: decodeURIComponent(parsed.username),
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
 * @example Using URL string
 * ```ts
 * import { createMySqlClient } from "@probitas/client-sql-mysql";
 *
 * const client = await createMySqlClient({
 *   url: "mysql://user:password@localhost:3306/testdb",
 * });
 *
 * const result = await client.query<{ id: number; name: string }>(
 *   "SELECT * FROM users WHERE id = ?",
 *   [1],
 * );
 * if (result.ok) {
 *   console.log(result.rows[0]);  // { id: 1, name: "Alice" }
 * }
 *
 * await client.close();
 * ```
 *
 * @example Using connection config object
 * ```ts
 * import { createMySqlClient } from "@probitas/client-sql-mysql";
 *
 * const client = await createMySqlClient({
 *   url: {
 *     host: "localhost",
 *     port: 3306,
 *     username: "root",
 *     password: "password",
 *     database: "testdb",
 *   },
 *   pool: { connectionLimit: 20 },
 * });
 * await client.close();
 * ```
 *
 * @example Transaction with auto-commit/rollback
 * ```ts
 * import { createMySqlClient } from "@probitas/client-sql-mysql";
 * import type { SqlTransaction } from "@probitas/client-sql";
 *
 * const client = await createMySqlClient({ url: "mysql://localhost:3306/testdb" });
 * const user = await client.transaction(async (tx: SqlTransaction) => {
 *   await tx.query("INSERT INTO users (name) VALUES (?)", ["Alice"]);
 *   return await tx.queryOne("SELECT LAST_INSERT_ID() as id");
 * });
 * await client.close();
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * import { createMySqlClient } from "@probitas/client-sql-mysql";
 *
 * await using client = await createMySqlClient({
 *   url: "mysql://localhost:3306/testdb",
 * });
 *
 * const result = await client.query("SELECT 1");
 * // Client automatically closed when scope exits
 * ```
 */
export async function createMySqlClient(
  config: MySqlClientConfig,
): Promise<MySqlClient> {
  // Resolve URL to connection config
  const connectionUrl = resolveConnectionUrl(config.url);
  const connConfig = parseConnectionUrl(connectionUrl);

  // Get charset from config object if provided
  const charset = typeof config.url === "object"
    ? config.url.charset
    : undefined;

  // Get TLS from config object if provided
  const tls = typeof config.url === "object" ? config.url.tls : undefined;

  const poolConfig: mysql.PoolOptions = {
    host: connConfig.host ?? "localhost",
    port: connConfig.port ?? 3306,
    user: connConfig.username,
    password: connConfig.password,
    database: connConfig.database,
    charset,
    timezone: config.timezone,
    waitForConnections: config.pool?.waitForConnections ?? true,
    connectionLimit: config.pool?.connectionLimit ?? 10,
    queueLimit: config.pool?.queueLimit ?? 0,
    idleTimeout: config.pool?.idleTimeout ?? 10000,
    enableKeepAlive: true,
  };

  if (tls) {
    poolConfig.ssl = {
      ca: tls.ca,
      cert: tls.cert,
      key: tls.key,
      rejectUnauthorized: tls.rejectUnauthorized ?? true,
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
    const connInfo = typeof config.url === "string"
      ? { url: "[connection-url]" }
      : {
        host: config.url.host ?? "localhost",
        port: config.url.port ?? 3306,
        database: config.url.database,
        username: config.url.username,
      };

    logger.debug("MySQL client created", {
      ...connInfo,
      charset: typeof config.url === "object" ? config.url.charset : undefined,
      timezone: config.timezone,
      connectionLimit: config.pool?.connectionLimit ?? 10,
    });
  }

  // deno-lint-ignore no-explicit-any
  async query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
    options?: SqlQueryOptions,
  ): Promise<SqlQueryResult<T>> {
    // Determine whether to throw on error (request option > config > default false)
    const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
      false;

    if (this.#closed) {
      const error = new SqlConnectionError("Client is closed");
      if (shouldThrow) {
        throw error;
      }
      return createSqlQueryResultFailure<T>(error, 0);
    }

    const startTime = performance.now();
    const sqlPreview = sql.length > 100 ? sql.substring(0, 100) + "..." : sql;

    logger.info("MySQL query starting", {
      sql: sqlPreview,
      paramCount: params?.length ?? 0,
    });

    logger.trace("MySQL query details", {
      sql: formatSql(sql),
      params: params ? formatParams(params) : undefined,
    });

    try {
      // deno-lint-ignore no-explicit-any
      const [rows, _fields] = await (this.#pool as any).execute(sql, params);
      const duration = performance.now() - startTime;

      // Handle SELECT queries
      if (Array.isArray(rows)) {
        logger.info("MySQL query success", {
          duration: `${duration.toFixed(2)}ms`,
          rowCount: rows.length,
        });

        if (rows.length > 0) {
          const sample = rows.slice(0, 1);
          logger.trace("MySQL query row sample", {
            rows: formatParams(sample),
          });
        }

        return createSqlQueryResultSuccess<T>({
          rows: rows as unknown as T[],
          rowCount: rows.length,
          duration,
        });
      }

      // Handle INSERT/UPDATE/DELETE queries (ResultSetHeader)
      // deno-lint-ignore no-explicit-any
      const resultHeader = rows as any;

      logger.info("MySQL query success", {
        duration: `${duration.toFixed(2)}ms`,
        affectedRows: resultHeader.affectedRows,
        lastInsertId: resultHeader.insertId ? resultHeader.insertId : undefined,
        warnings: resultHeader.warningStatus,
      });

      return createSqlQueryResultSuccess<T>({
        rows: [],
        rowCount: resultHeader.affectedRows,
        duration,
        lastInsertId: resultHeader.insertId
          ? BigInt(resultHeader.insertId)
          : undefined,
        warnings: resultHeader.warningStatus > 0
          ? [`${resultHeader.warningStatus} warning(s)`]
          : undefined,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      const sqlError = convertMySqlError(error);

      logger.debug("MySQL query failed", {
        sql: sqlPreview,
        duration: `${duration.toFixed(2)}ms`,
        error: sqlError.message,
      });

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
