import postgres from "postgres";
import type { CommonOptions } from "@probitas/client";
import { ConnectionError } from "@probitas/client";
import {
  type SqlIsolationLevel,
  SqlQueryResult,
  type SqlQueryResultMetadata,
  type SqlTransaction,
  type SqlTransactionOptions,
} from "@probitas/client-sql";
import { mapPostgresError } from "./errors.ts";
import { PostgresTransaction } from "./transaction.ts";

/**
 * Connection configuration for PostgreSQL.
 */
export interface PostgresConnectionConfig {
  /** Database host */
  readonly host?: string;

  /** Database port */
  readonly port?: number;

  /** Database name */
  readonly database?: string;

  /** Database user */
  readonly user?: string;

  /** Database password */
  readonly password?: string;
}

/**
 * Pool configuration for PostgreSQL.
 */
export interface PostgresPoolConfig {
  /** Maximum number of connections in the pool */
  readonly max?: number;

  /** Idle timeout in milliseconds before closing unused connections */
  readonly idleTimeout?: number;

  /** Connection timeout in milliseconds */
  readonly connectTimeout?: number;
}

/**
 * Configuration for creating a PostgreSQL client.
 */
export interface PostgresClientConfig extends CommonOptions {
  /** Connection string or configuration object */
  readonly connection: string | PostgresConnectionConfig;

  /** Pool configuration */
  readonly pool?: PostgresPoolConfig;

  /** Application name for PostgreSQL connection */
  readonly applicationName?: string;
}

/**
 * PostgreSQL LISTEN/NOTIFY notification.
 */
export interface PostgresNotification {
  /** Channel name */
  readonly channel: string;

  /** Notification payload */
  readonly payload: string;

  /** Process ID of the notifying backend */
  readonly processId: number;
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
   */
  // deno-lint-ignore no-explicit-any
  query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<SqlQueryResult<T>>;

  /**
   * Execute a query and return the first row or undefined.
   *
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
  }

  // deno-lint-ignore no-explicit-any
  async query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<SqlQueryResult<T>> {
    this.#assertNotClosed();

    const startTime = performance.now();

    try {
      const result = await this.#sql.unsafe<T[]>(
        sql,
        params as postgres.ParameterOrJSON<never>[],
      );
      const duration = performance.now() - startTime;

      const metadata: SqlQueryResultMetadata = {};

      return new SqlQueryResult<T>({
        ok: true,
        rows: result as unknown as readonly T[],
        rowCount: result.count ?? result.length,
        duration,
        metadata,
      });
    } catch (error) {
      throw mapPostgresError(error as { message: string; code?: string });
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
    this.#assertNotClosed();

    const reserved = await this.#sql.reserve();

    try {
      // Start the transaction with the specified isolation level
      const isolationLevel = options?.isolationLevel
        ? mapIsolationLevel(options.isolationLevel)
        : "READ COMMITTED";

      await reserved.unsafe(`BEGIN ISOLATION LEVEL ${isolationLevel}`);

      const tx = new PostgresTransaction(reserved);

      try {
        const result = await fn(tx);
        await reserved.unsafe("COMMIT");
        return result;
      } catch (error) {
        await reserved.unsafe("ROLLBACK");
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

    let count = 0;
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
      return count;
    } catch (error) {
      throw mapPostgresError(error as { message: string; code?: string });
    } finally {
      reserved.release();
    }
  }

  async *copyTo(query: string): AsyncIterable<unknown[]> {
    this.#assertNotClosed();

    const reserved = await this.#sql.reserve();

    try {
      const result = await reserved.unsafe<Record<string, unknown>[]>(query);

      for (const row of result) {
        yield Object.values(row);
      }
    } catch (error) {
      throw mapPostgresError(error as { message: string; code?: string });
    } finally {
      reserved.release();
    }
  }

  async *listen(channel: string): AsyncIterable<PostgresNotification> {
    this.#assertNotClosed();

    const notifications: PostgresNotification[] = [];
    let resolve: (() => void) | null = null;

    const listenRequest = this.#sql.listen(channel, (payload) => {
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
    }
  }

  async notify(channel: string, payload?: string): Promise<void> {
    this.#assertNotClosed();

    try {
      await this.#sql.notify(channel, payload ?? "");
    } catch (error) {
      throw mapPostgresError(error as { message: string; code?: string });
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#sql.end();
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
 * Creates a new PostgreSQL client.
 *
 * @example
 * ```typescript
 * // Using connection string
 * const client = await createPostgresClient({
 *   connection: "postgres://user:pass@localhost:5432/mydb",
 * });
 *
 * // Using connection config object
 * const client = await createPostgresClient({
 *   connection: {
 *     host: "localhost",
 *     port: 5432,
 *     database: "mydb",
 *     user: "user",
 *     password: "pass",
 *   },
 *   pool: { max: 10 },
 *   applicationName: "my-app",
 * });
 *
 * const result = await client.query("SELECT * FROM users WHERE id = $1", [1]);
 * console.log(result.rows.first());
 *
 * // Transaction with auto-commit/rollback
 * const user = await client.transaction(async (tx) => {
 *   await tx.query("INSERT INTO users (name) VALUES ($1)", ["John"]);
 *   return await tx.queryOne("SELECT * FROM users WHERE name = $1", ["John"]);
 * });
 *
 * await client.close();
 * ```
 *
 * @requires --allow-net Permission to connect to the database
 * @requires --allow-env Permission to read environment variables (if using env-based config)
 *
 * @param config - PostgreSQL client configuration
 * @returns PostgreSQL client instance
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

  if (typeof config.connection === "string") {
    // Connection string
    sql = postgres(config.connection, options);
  } else {
    // Connection config object
    const connConfig = config.connection;
    if (connConfig.host) options.host = connConfig.host;
    if (connConfig.port) options.port = connConfig.port;
    if (connConfig.database) options.database = connConfig.database;
    if (connConfig.user) options.username = connConfig.user;
    if (connConfig.password) options.password = connConfig.password;

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
