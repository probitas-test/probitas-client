import type { CommonConnectionConfig, CommonOptions } from "@probitas/client";

/**
 * SSL/TLS configuration for PostgreSQL connection.
 */
export interface PostgresSslConfig {
  /**
   * Whether to reject unauthorized certificates.
   * @default true
   */
  readonly rejectUnauthorized?: boolean;

  /**
   * CA certificate(s) for verification.
   */
  readonly ca?: string;

  /**
   * Client certificate for mutual TLS.
   */
  readonly cert?: string;

  /**
   * Client private key for mutual TLS.
   */
  readonly key?: string;
}

/**
 * PostgreSQL connection configuration.
 *
 * Extends CommonConnectionConfig with PostgreSQL-specific options.
 */
export interface PostgresConnectionConfig extends CommonConnectionConfig {
  /**
   * Database name to connect to.
   */
  readonly database?: string;

  /**
   * SSL/TLS configuration.
   */
  readonly ssl?: boolean | PostgresSslConfig;
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
  /**
   * Connection URL string or configuration object.
   *
   * @example Using a URL string
   * ```ts
   * import type { PostgresClientConfig } from "@probitas/client-sql-postgres";
   * const config: PostgresClientConfig = { url: "postgres://user:pass@localhost:5432/mydb" };
   * ```
   *
   * @example Using a configuration object
   * ```ts
   * import type { PostgresClientConfig } from "@probitas/client-sql-postgres";
   * const config: PostgresClientConfig = {
   *   url: {
   *     host: "localhost",
   *     port: 5432,
   *     database: "mydb",
   *     username: "user",
   *     password: "pass",
   *   },
   * };
   * ```
   */
  readonly url: string | PostgresConnectionConfig;

  /** Pool configuration */
  readonly pool?: PostgresPoolConfig;

  /** Application name for PostgreSQL connection */
  readonly applicationName?: string;

  /**
   * Whether to throw an error for query failures.
   * When false, failures are returned as SqlQueryResultError or SqlQueryResultFailure.
   * Can be overridden per-query via SqlQueryOptions.
   * @default false
   */
  readonly throwOnError?: boolean;
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
