import type { CommonConnectionConfig, CommonOptions } from "@probitas/client";

/**
 * TLS/SSL configuration for MySQL connections.
 */
export interface MySqlTlsConfig {
  /** Root CA certificate (PEM format). */
  readonly ca?: string;
  /** Client certificate (PEM format). */
  readonly cert?: string;
  /** Client private key (PEM format). */
  readonly key?: string;
  /** Skip server certificate verification (use only for testing). */
  readonly rejectUnauthorized?: boolean;
}

/**
 * Connection pool configuration.
 */
export interface MySqlPoolConfig {
  /**
   * Maximum number of connections in the pool.
   * @default 10
   */
  readonly connectionLimit?: number;

  /**
   * Minimum number of idle connections.
   * @default 0
   */
  readonly minConnections?: number;

  /**
   * Maximum number of connection requests the pool will queue.
   * @default 0 (unlimited)
   */
  readonly queueLimit?: number;

  /**
   * Whether to wait for connections to become available.
   * @default true
   */
  readonly waitForConnections?: boolean;

  /**
   * Time in milliseconds before connection is considered idle.
   * @default 10000
   */
  readonly idleTimeout?: number;
}

/**
 * MySQL connection configuration.
 *
 * Extends CommonConnectionConfig with MySQL-specific options.
 */
export interface MySqlConnectionConfig extends CommonConnectionConfig {
  /**
   * Database name to connect to.
   */
  readonly database?: string;

  /**
   * TLS configuration.
   */
  readonly tls?: MySqlTlsConfig;

  /**
   * Character set.
   */
  readonly charset?: string;
}

/**
 * Configuration for creating a MySQL client.
 */
export interface MySqlClientConfig extends CommonOptions {
  /**
   * Connection URL or configuration.
   *
   * Can be a connection URL string (e.g., "mysql://user:pass@host:port/database")
   * or a detailed MySqlConnectionConfig object.
   */
  readonly url: string | MySqlConnectionConfig;

  /** Connection pool configuration. */
  readonly pool?: MySqlPoolConfig;

  /** Timezone for the connection. */
  readonly timezone?: string;
}
