import postgres from "postgres";
import { ConnectionError } from "@probitas/client";
import { getLogger } from "@probitas/logger";
import {
  createSqlQueryResultError,
  createSqlQueryResultFailure,
  createSqlQueryResultSuccess,
  SqlConnectionError,
  type SqlIsolationLevel,
  type SqlQueryOptions,
  type SqlQueryResult,
  type SqlTransaction,
  type SqlTransactionOptions,
} from "@probitas/client-sql";
import { mapPostgresError } from "./errors.ts";
import { PostgresTransaction } from "./transaction.ts";
import type {
  PostgresClientConfig,
  PostgresNotification,
  PostgresSslConfig,
} from "./types.ts";

const logger = getLogger("probitas", "client", "sql", "postgres");

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
 * PostgreSQL client interface.
 */
export interface PostgresClient extends AsyncDisposable {
  /** The client configuration. */
  readonly config: PostgresClientConfig;

  /** The database dialect. */
  readonly dialect: "postgres";

  /**
   * Execute a SQL query.
   *
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
   *
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
   *
   * The transaction is automatically committed if the function completes successfully,
   * or rolled back if the function throws an error.
   *
   * @param fn - Function to execute within the transaction
   * @param options - Transaction options
   */
  transaction<T>(
    fn: (tx: SqlTransaction) => Promise<T>,
    options?: SqlTransactionOptions,
  ): Promise<T>;

  /**
   * Copy data from an iterable into a table using PostgreSQL COPY protocol.
   *
   * @param table - Target table name
   * @param data - Async iterable of row arrays
   * @returns Number of rows copied
   */
  copyFrom(table: string, data: AsyncIterable<unknown[]>): Promise<number>;

  /**
   * Copy data from a query result using PostgreSQL COPY protocol.
   *
   * @param query - SQL query to copy from
   * @returns Async iterable of row arrays
   */
  copyTo(query: string): AsyncIterable<unknown[]>;

  /**
   * Listen for notifications on a channel.
   *
   * @param channel - Channel name to listen on
   * @returns Async iterable of notifications
   */
  listen(channel: string): AsyncIterable<PostgresNotification>;

  /**
   * Send a notification on a channel.
   *
   * @param channel - Channel name
   * @param payload - Optional notification payload
   */
  notify(channel: string, payload?: string): Promise<void>;

  /**
   * Close the client and release all connections.
   */
  close(): Promise<void>;
}

/**
 * Maps SqlIsolationLevel to PostgreSQL isolation level string.
 */
function mapIsolationLevel(level: SqlIsolationLevel): string {
  switch (level) {
    case "read_uncommitted":
      return "READ UNCOMMITTED";
    case "read_committed":
      return "READ COMMITTED";
    case "repeatable_read":
      return "REPEATABLE READ";
    case "serializable":
      return "SERIALIZABLE";
  }
}

/**
 * PostgreSQL client implementation.
 */
class PostgresClientImpl implements PostgresClient {
  readonly config: PostgresClientConfig;
  readonly dialect = "postgres" as const;
  readonly #sql: postgres.Sql;
  #closed = false;

  constructor(config: PostgresClientConfig, sql: postgres.Sql) {
    this.config = config;
    this.#sql = sql;

    // Log client creation with sanitized connection info
    const connInfo = typeof config.url === "string"
      ? { url: "[connection-string]" }
      : {
        host: config.url.host ?? "localhost",
        port: config.url.port ?? 5432,
        database: config.url.database,
        username: config.url.username,
      };

    logger.debug("PostgreSQL client created", {
      ...connInfo,
      poolMax: config.pool?.max ?? 10,
      applicationName: config.applicationName,
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

    logger.info("PostgreSQL query starting", {
      sql: sqlPreview,
      paramCount: params?.length ?? 0,
    });

    logger.trace("PostgreSQL query details", {
      sql: formatSql(sql),
      params: params ? formatParams(params) : undefined,
    });

    try {
      const result = await this.#sql.unsafe<T[]>(
        sql,
        params as postgres.ParameterOrJSON<never>[],
      );
      const duration = performance.now() - startTime;

      logger.info("PostgreSQL query success", {
        duration: `${duration.toFixed(2)}ms`,
        rowCount: result.count ?? result.length,
      });

      if (result.length > 0) {
        const sample = result.slice(0, 1);
        logger.trace("PostgreSQL query row sample", {
          rows: formatParams(sample),
        });
      }

      return createSqlQueryResultSuccess<T>({
        rows: result as unknown as readonly T[],
        rowCount: result.count ?? result.length,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      const pgError = error as { message: string; code?: string };

      logger.debug("PostgreSQL query failed", {
        sql: sqlPreview,
        duration: `${duration.toFixed(2)}ms`,
        error: pgError.message,
      });

      const sqlError = mapPostgresError(pgError);

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
    this.#assertNotClosed();

    const isolationLevel = options?.isolationLevel
      ? mapIsolationLevel(options.isolationLevel)
      : "READ COMMITTED";

    logger.debug("PostgreSQL transaction begin", {
      isolationLevel,
    });

    const startTime = performance.now();
    const reserved = await this.#sql.reserve();

    try {
      await reserved.unsafe(`BEGIN ISOLATION LEVEL ${isolationLevel}`);

      const tx = new PostgresTransaction(reserved);

      try {
        const result = await fn(tx);
        await reserved.unsafe("COMMIT");

        const duration = performance.now() - startTime;
        logger.debug("PostgreSQL transaction commit", {
          duration: `${duration.toFixed(2)}ms`,
        });

        return result;
      } catch (error) {
        await reserved.unsafe("ROLLBACK");
        const duration = performance.now() - startTime;
        logger.debug("PostgreSQL transaction rollback", {
          duration: `${duration.toFixed(2)}ms`,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    } catch (error) {
      throw mapPostgresError(error as { message: string; code?: string });
    } finally {
      reserved.release();
    }
  }

  async copyFrom(
    table: string,
    data: AsyncIterable<unknown[]>,
  ): Promise<number> {
    this.#assertNotClosed();

    logger.info("PostgreSQL COPY FROM starting", {
      table,
    });

    let count = 0;
    const startTime = performance.now();
    const reserved = await this.#sql.reserve();

    try {
      await reserved.unsafe(`COPY ${table} FROM STDIN`);

      for await (const row of data) {
        const line = row
          .map((v) => (v === null ? "\\N" : String(v)))
          .join("\t");
        await reserved.unsafe(line);
        count++;
      }

      await reserved.unsafe("\\.");

      const duration = performance.now() - startTime;
      logger.info("PostgreSQL COPY FROM success", {
        table,
        rowCount: count,
        duration: `${duration.toFixed(2)}ms`,
      });

      return count;
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("PostgreSQL COPY FROM failed", {
        table,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      throw mapPostgresError(error as { message: string; code?: string });
    } finally {
      reserved.release();
    }
  }

  async *copyTo(query: string): AsyncIterable<unknown[]> {
    this.#assertNotClosed();

    const sqlPreview = query.length > 100
      ? query.substring(0, 100) + "..."
      : query;

    logger.info("PostgreSQL COPY TO starting", {
      sql: sqlPreview,
    });

    logger.trace("PostgreSQL COPY TO details", {
      sql: formatSql(query),
    });

    const startTime = performance.now();
    const reserved = await this.#sql.reserve();
    let rowCount = 0;
    let rowSampleLogged = false;

    try {
      const result = await reserved.unsafe<Record<string, unknown>[]>(query);

      for (const row of result) {
        rowCount++;
        if (!rowSampleLogged && rowCount === 1) {
          logger.trace("PostgreSQL COPY TO row sample", {
            row: formatParams(Object.values(row)),
          });
          rowSampleLogged = true;
        }
        yield Object.values(row);
      }

      const duration = performance.now() - startTime;
      logger.info("PostgreSQL COPY TO success", {
        rowCount,
        duration: `${duration.toFixed(2)}ms`,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("PostgreSQL COPY TO failed", {
        sql: sqlPreview,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      throw mapPostgresError(error as { message: string; code?: string });
    } finally {
      reserved.release();
    }
  }

  async *listen(channel: string): AsyncIterable<PostgresNotification> {
    this.#assertNotClosed();

    logger.info("PostgreSQL LISTEN starting", {
      channel,
    });

    const notifications: PostgresNotification[] = [];
    let resolve: (() => void) | null = null;
    let notificationCount = 0;

    const listenRequest = this.#sql.listen(channel, (payload) => {
      notificationCount++;
      notifications.push({
        channel,
        payload,
        processId: 0,
      });
      if (resolve) {
        resolve();
        resolve = null;
      }
    });

    // Wait for listen to be established
    await listenRequest;
    logger.info("PostgreSQL LISTEN established", {
      channel,
    });

    try {
      while (!this.#closed) {
        while (notifications.length > 0) {
          yield notifications.shift()!;
        }

        await new Promise<void>((r) => {
          resolve = r;
          // Timeout to check if closed
          setTimeout(r, 1000);
        });
      }
    } finally {
      // postgres.js listen returns a ListenRequest with an unlisten method
      await (listenRequest as unknown as { unlisten: () => Promise<void> })
        .unlisten();

      logger.info("PostgreSQL LISTEN closed", {
        channel,
        notificationCount,
      });
    }
  }

  async notify(channel: string, payload?: string): Promise<void> {
    this.#assertNotClosed();

    logger.info("PostgreSQL NOTIFY sending", {
      channel,
      payloadLength: payload?.length ?? 0,
    });

    try {
      await this.#sql.notify(channel, payload ?? "");
      logger.info("PostgreSQL NOTIFY sent", {
        channel,
      });
    } catch (error) {
      logger.debug("PostgreSQL NOTIFY failed", {
        channel,
        error: error instanceof Error ? error.message : String(error),
      });
      throw mapPostgresError(error as { message: string; code?: string });
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    logger.debug("PostgreSQL client closing");
    await this.#sql.end();
    logger.debug("PostgreSQL client closed");
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  #assertNotClosed(): void {
    if (this.#closed) {
      throw new ConnectionError("Client is closed");
    }
  }
}

/**
 * Resolve SSL configuration for postgres.js.
 */
function resolveSslOptions(
  ssl: boolean | PostgresSslConfig | undefined,
): postgres.Options<Record<string, postgres.PostgresType>>["ssl"] {
  if (ssl === undefined) {
    return undefined;
  }
  if (ssl === true) {
    return { rejectUnauthorized: true };
  }
  if (ssl === false) {
    return false;
  }
  // PostgresSslConfig object
  return {
    rejectUnauthorized: ssl.rejectUnauthorized ?? true,
    ca: ssl.ca,
    cert: ssl.cert,
    key: ssl.key,
  };
}

/**
 * Create a new PostgreSQL client instance.
 *
 * The client provides connection pooling, parameterized queries, transaction support,
 * and PostgreSQL-specific features like COPY and LISTEN/NOTIFY.
 *
 * @param config - PostgreSQL client configuration
 * @returns A promise resolving to a new PostgreSQL client instance
 *
 * @example Using URL string
 * ```ts
 * import { createPostgresClient } from "@probitas/client-sql-postgres";
 *
 * const client = await createPostgresClient({
 *   url: "postgres://user:pass@localhost:5432/mydb",
 * });
 *
 * const result = await client.query("SELECT * FROM users WHERE id = $1", [1]);
 * if (result.ok) {
 *   console.log(result.rows[0]);
 * }
 *
 * await client.close();
 * ```
 *
 * @example Using connection config object
 * ```ts
 * import { createPostgresClient } from "@probitas/client-sql-postgres";
 *
 * const client = await createPostgresClient({
 *   url: {
 *     host: "localhost",
 *     port: 5432,
 *     database: "mydb",
 *     username: "user",
 *     password: "pass",
 *   },
 *   pool: { max: 10 },
 *   applicationName: "my-app",
 * });
 *
 * await client.close();
 * ```
 *
 * @example Transaction with auto-commit/rollback
 * ```ts
 * import { createPostgresClient } from "@probitas/client-sql-postgres";
 * import type { SqlTransaction } from "@probitas/client-sql";
 *
 * const client = await createPostgresClient({
 *   url: "postgres://localhost:5432/mydb",
 * });
 *
 * const user = await client.transaction(async (tx: SqlTransaction) => {
 *   await tx.query("INSERT INTO users (name) VALUES ($1)", ["John"]);
 *   return await tx.queryOne("SELECT * FROM users WHERE name = $1", ["John"]);
 * });
 *
 * await client.close();
 * ```
 *
 * @example LISTEN/NOTIFY for real-time events
 * ```ts
 * import { createPostgresClient } from "@probitas/client-sql-postgres";
 *
 * const client = await createPostgresClient({
 *   url: "postgres://localhost:5432/mydb",
 * });
 *
 * // Listen for notifications
 * for await (const notification of client.listen("user_events")) {
 *   console.log("Received:", notification.payload);
 * }
 *
 * // In another session
 * await client.notify("user_events", JSON.stringify({ userId: 123 }));
 *
 * await client.close();
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * import { createPostgresClient } from "@probitas/client-sql-postgres";
 *
 * await using client = await createPostgresClient({
 *   url: "postgres://localhost:5432/mydb",
 * });
 *
 * const result = await client.query("SELECT 1");
 * // Client automatically closed when scope exits
 * ```
 */
export async function createPostgresClient(
  config: PostgresClientConfig,
): Promise<PostgresClient> {
  const poolConfig = config.pool ?? {};

  // Build postgres.js options
  const options: postgres.Options<Record<string, postgres.PostgresType>> = {
    max: poolConfig.max ?? 10,
    idle_timeout: poolConfig.idleTimeout
      ? poolConfig.idleTimeout / 1000
      : undefined,
    connect_timeout: poolConfig.connectTimeout
      ? poolConfig.connectTimeout / 1000
      : 30,
  };

  if (config.applicationName) {
    options.connection = {
      application_name: config.applicationName,
    };
  }

  let sql: postgres.Sql;

  if (typeof config.url === "string") {
    // URL string
    sql = postgres(config.url, options);
  } else {
    // Connection config object
    const connConfig = config.url;
    if (connConfig.host) options.host = connConfig.host;
    if (connConfig.port) options.port = connConfig.port;
    if (connConfig.database) options.database = connConfig.database;
    if (connConfig.username) options.username = connConfig.username;
    if (connConfig.password) options.password = connConfig.password;

    // Handle SSL configuration
    const sslOptions = resolveSslOptions(connConfig.ssl);
    if (sslOptions !== undefined) {
      options.ssl = sslOptions;
    }

    sql = postgres(options);
  }

  // Test connection
  try {
    await sql`SELECT 1`;
  } catch (error) {
    await sql.end();
    throw new ConnectionError(
      `Failed to connect to PostgreSQL: ${(error as Error).message}`,
      { cause: error },
    );
  }

  return new PostgresClientImpl(config, sql);
}
