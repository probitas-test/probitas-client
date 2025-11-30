import {
  ConstraintError,
  DeadlockError,
  QuerySyntaxError,
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
 * Maps a PostgreSQL error to the appropriate SqlError subclass.
 *
 * @param error - PostgreSQL error from the driver
 * @returns Mapped SqlError or subclass
 */
export function mapPostgresError(error: PostgresErrorLike): SqlError {
  const sqlState = error.code;
  const options: SqlErrorOptions = { sqlState, cause: error };

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
