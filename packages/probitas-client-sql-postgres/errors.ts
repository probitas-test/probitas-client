import {
  ConstraintError,
  DeadlockError,
  QuerySyntaxError,
  SqlConnectionError,
  SqlError,
  type SqlErrorOptions,
} from "@probitas/client-sql";

/**
 * PostgreSQL SQLSTATE class codes for error categorization.
 *
 * @see https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
const SQLSTATE_CLASS = {
  /** Syntax Error or Access Rule Violation */
  SYNTAX_ERROR: "42",
  /** Integrity Constraint Violation */
  CONSTRAINT_VIOLATION: "23",
  /** Transaction Rollback */
  TRANSACTION_ROLLBACK: "40",
  /** Connection Exception */
  CONNECTION_EXCEPTION: "08",
  /** Operator Intervention */
  OPERATOR_INTERVENTION: "57",
} as const;

/**
 * Specific SQLSTATE codes for fine-grained error handling.
 */
const SQLSTATE = {
  /** Serialization failure (40001) */
  SERIALIZATION_FAILURE: "40001",
  /** Deadlock detected (40P01) */
  DEADLOCK_DETECTED: "40P01",
} as const;

/**
 * PostgreSQL error structure from the driver.
 */
export interface PostgresErrorLike {
  readonly message: string;
  readonly code?: string;
  readonly constraint?: string;
}

/**
 * Check if an error is a connection-level error based on SQLSTATE or error characteristics.
 */
export function isConnectionError(error: PostgresErrorLike): boolean {
  const sqlState = error.code;

  // Check SQLSTATE class
  if (sqlState) {
    if (sqlState.startsWith(SQLSTATE_CLASS.CONNECTION_EXCEPTION)) {
      return true;
    }
    if (sqlState.startsWith(SQLSTATE_CLASS.OPERATOR_INTERVENTION)) {
      return true;
    }
  }

  // Check error message patterns for connection-related errors
  const message = error.message.toLowerCase();
  const connectionPatterns = [
    "connection refused",
    "connection reset",
    "connection terminated",
    "timed out",
    "timeout",
    "econnrefused",
    "econnreset",
    "etimedout",
    "ehostunreach",
    "enetunreach",
    "socket",
    "authentication failed",
    "password authentication failed",
    "pool",
  ];

  return connectionPatterns.some((pattern) => message.includes(pattern));
}

/**
 * Maps a PostgreSQL error to the appropriate SqlError subclass.
 *
 * @param error - PostgreSQL error from the driver
 * @returns Mapped SqlError or subclass
 */
export function mapPostgresError(error: PostgresErrorLike): SqlError {
  const sqlState = error.code;
  const options: SqlErrorOptions = { sqlState, cause: error };

  // Check for connection errors first
  if (isConnectionError(error)) {
    return new SqlConnectionError(error.message, options);
  }

  if (!sqlState) {
    return new SqlError(error.message, "unknown", options);
  }

  // Check for deadlock and serialization errors first (class 40)
  if (sqlState.startsWith(SQLSTATE_CLASS.TRANSACTION_ROLLBACK)) {
    if (
      sqlState === SQLSTATE.DEADLOCK_DETECTED ||
      sqlState === SQLSTATE.SERIALIZATION_FAILURE
    ) {
      return new DeadlockError(error.message, options);
    }
    // Other transaction rollback errors
    return new SqlError(error.message, "unknown", options);
  }

  // Syntax errors (class 42)
  if (sqlState.startsWith(SQLSTATE_CLASS.SYNTAX_ERROR)) {
    return new QuerySyntaxError(error.message, options);
  }

  // Constraint violations (class 23)
  if (sqlState.startsWith(SQLSTATE_CLASS.CONSTRAINT_VIOLATION)) {
    const constraint = error.constraint ?? "unknown";
    return new ConstraintError(error.message, constraint, options);
  }

  // Default to generic SqlError for unknown error types
  return new SqlError(error.message, "unknown", options);
}
