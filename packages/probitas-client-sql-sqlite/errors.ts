import {
  ConstraintError,
  DeadlockError,
  QuerySyntaxError,
  SqlError,
  type SqlErrorOptions,
} from "@probitas/client-sql";

/**
 * SQLite-specific error kinds.
 */
export type SqliteErrorKind = "database_locked" | "readonly" | "busy";

/**
 * Options for SqliteError constructor.
 */
export interface SqliteErrorOptions extends SqlErrorOptions {
  /** SQLite extended error code. */
  readonly extendedCode?: number;
}

/**
 * Base error class for SQLite-specific errors.
 * Extends SqlError with SQLite-specific properties like extendedCode.
 */
export class SqliteError extends SqlError {
  override readonly name: string = "SqliteError";
  readonly extendedCode?: number;

  constructor(
    message: string,
    options?: SqliteErrorOptions,
  ) {
    super(message, "unknown", options);
    this.extendedCode = options?.extendedCode;
  }
}

/**
 * Error thrown when the database is locked.
 */
export class DatabaseLockedError extends SqliteError {
  override readonly name = "DatabaseLockedError";
  readonly sqliteKind = "database_locked" as const;

  constructor(message: string, options?: SqliteErrorOptions) {
    super(message, options);
  }
}

/**
 * Error thrown when trying to write to a readonly database.
 */
export class ReadonlyDatabaseError extends SqliteError {
  override readonly name = "ReadonlyDatabaseError";
  readonly sqliteKind = "readonly" as const;

  constructor(message: string, options?: SqliteErrorOptions) {
    super(message, options);
  }
}

/**
 * Error thrown when the database is busy.
 */
export class BusyError extends SqliteError {
  override readonly name = "BusyError";
  readonly sqliteKind = "busy" as const;

  constructor(message: string, options?: SqliteErrorOptions) {
    super(message, options);
  }
}

// SQLite Result Codes (primary codes)
// See: https://www.sqlite.org/rescode.html
const SQLITE_ERROR = 1;
const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;
const SQLITE_READONLY = 8;
const SQLITE_CONSTRAINT = 19;

/**
 * Convert a @db/sqlite error to the appropriate error class.
 *
 * Note: @db/sqlite throws plain Error objects without SQLite error codes.
 * Error classification is based on message content analysis.
 */
export function convertSqliteError(error: unknown): SqlError {
  if (!(error instanceof Error)) {
    return new SqliteError(String(error));
  }

  // @db/sqlite errors may have code property (but often don't)
  const err = error as Error & {
    code?: number;
  };

  const options: SqliteErrorOptions = {
    cause: error,
    extendedCode: err.code,
  };

  const message = err.message.toLowerCase();

  // Check for busy/locked errors first (can be retried)
  if (message.includes("database is busy") || message.includes("sqlite_busy")) {
    return new BusyError(err.message, options);
  }

  if (
    message.includes("database is locked") ||
    message.includes("database table is locked") ||
    message.includes("sqlite_locked")
  ) {
    // SQLITE_LOCKED can be a deadlock in some cases
    return new DeadlockError(err.message, options);
  }

  if (
    message.includes("readonly database") ||
    message.includes("attempt to write a readonly database") ||
    message.includes("sqlite_readonly")
  ) {
    return new ReadonlyDatabaseError(err.message, options);
  }

  // Check for constraint violations (most specific patterns first)
  if (message.includes("constraint failed") || message.includes("constraint")) {
    let constraint = "unknown";

    // Try to extract constraint name from message
    // Pattern: "UNIQUE constraint failed: table.column"
    const uniqueMatch = err.message.match(/UNIQUE constraint failed: (\S+)/i);
    if (uniqueMatch) {
      constraint = uniqueMatch[1];
      return new ConstraintError(err.message, constraint, options);
    }

    // Pattern: "PRIMARY KEY constraint failed"
    if (message.includes("primary key constraint")) {
      constraint = "PRIMARY KEY";
      return new ConstraintError(err.message, constraint, options);
    }

    // Pattern: "FOREIGN KEY constraint failed"
    if (message.includes("foreign key constraint")) {
      constraint = "FOREIGN KEY";
      return new ConstraintError(err.message, constraint, options);
    }

    // Pattern: "CHECK constraint failed: constraint_name"
    const checkMatch = err.message.match(/CHECK constraint failed: (\S+)/i);
    if (checkMatch) {
      constraint = checkMatch[1];
      return new ConstraintError(err.message, constraint, options);
    }

    // Pattern: "NOT NULL constraint failed: table.column"
    const notNullMatch = err.message.match(
      /NOT NULL constraint failed: (\S+)/i,
    );
    if (notNullMatch) {
      constraint = notNullMatch[1];
      return new ConstraintError(err.message, constraint, options);
    }

    // Generic constraint error
    return new ConstraintError(err.message, constraint, options);
  }

  // Check for syntax errors based on message content
  // SQLite reports these as general errors with descriptive messages
  if (
    message.includes("syntax error") ||
    message.includes("no such column") ||
    message.includes("no such table") ||
    message.includes("no such function") ||
    message.includes('near "') ||
    message.includes("incomplete input") ||
    message.includes("unrecognized token")
  ) {
    return new QuerySyntaxError(err.message, options);
  }

  // If we have an error code, try to classify by code
  if (err.code !== undefined) {
    const primaryCode = err.code & 0xff;

    if (primaryCode === SQLITE_BUSY) {
      return new BusyError(err.message, options);
    }
    if (primaryCode === SQLITE_LOCKED) {
      return new DeadlockError(err.message, options);
    }
    if (primaryCode === SQLITE_READONLY) {
      return new ReadonlyDatabaseError(err.message, options);
    }
    if (primaryCode === SQLITE_CONSTRAINT) {
      return new ConstraintError(err.message, "unknown", options);
    }
    if (primaryCode === SQLITE_ERROR) {
      return new QuerySyntaxError(err.message, options);
    }
  }

  return new SqliteError(err.message, options);
}
