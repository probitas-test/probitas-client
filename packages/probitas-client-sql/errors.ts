import { AbortError, ClientError, TimeoutError } from "@probitas/client";

/**
 * SQL-specific error kinds.
 */
export type SqlErrorKind =
  | "query"
  | "constraint"
  | "deadlock"
  | "connection"
  | "unknown";

/**
 * Options for SqlError constructor.
 */
export interface SqlErrorOptions extends ErrorOptions {
  /** SQL State code (e.g., "23505" for unique violation) */
  readonly sqlState?: string;
}

/**
 * Base error class for SQL-specific errors.
 * Extends ClientError with SQL-specific properties.
 */
export class SqlError extends ClientError {
  override readonly name: string = "SqlError";
  override readonly kind: SqlErrorKind;
  readonly sqlState: string | null;

  constructor(
    message: string,
    kind: SqlErrorKind,
    options?: SqlErrorOptions,
  ) {
    super(message, kind, options);
    this.kind = kind;
    this.sqlState = options?.sqlState ?? null;
  }
}

/**
 * Error thrown when a SQL query has syntax errors.
 */
export class QuerySyntaxError extends SqlError {
  override readonly name = "QuerySyntaxError";
  override readonly kind = "query" as const;

  constructor(message: string, options?: SqlErrorOptions) {
    super(message, "query", options);
  }
}

/**
 * Error thrown when a constraint violation occurs.
 */
export class ConstraintError extends SqlError {
  override readonly name = "ConstraintError";
  override readonly kind = "constraint" as const;
  readonly constraint: string;

  constructor(message: string, constraint: string, options?: SqlErrorOptions) {
    super(message, "constraint", options);
    this.constraint = constraint;
  }
}

/**
 * Error thrown when a deadlock is detected.
 */
export class DeadlockError extends SqlError {
  override readonly name = "DeadlockError";
  override readonly kind = "deadlock" as const;

  constructor(message: string, options?: SqlErrorOptions) {
    super(message, "deadlock", options);
  }
}

/**
 * Error thrown when a connection or network-level error occurs.
 *
 * This includes:
 * - Connection refused (server not running)
 * - Authentication failure
 * - Connection timeout
 * - Pool exhaustion
 * - TLS handshake failure
 * - DNS resolution failure
 */
export class SqlConnectionError extends SqlError {
  override readonly name = "SqlConnectionError";
  override readonly kind = "connection" as const;

  constructor(message: string, options?: SqlErrorOptions) {
    super(message, "connection", options);
  }
}

/**
 * Error types that indicate an operation was processed by the server.
 * These errors occur after the query reaches the SQL server.
 */
export type SqlOperationError =
  | QuerySyntaxError
  | ConstraintError
  | DeadlockError
  | SqlError;

/**
 * Error types that indicate the operation was not processed.
 * These are errors that occur before the query reaches the SQL server.
 */
export type SqlFailureError =
  | SqlConnectionError
  | AbortError
  | TimeoutError;
