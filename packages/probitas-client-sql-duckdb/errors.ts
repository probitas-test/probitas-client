import {
  ConstraintError,
  QuerySyntaxError,
  SqlConnectionError,
  SqlError,
  type SqlErrorOptions,
} from "@probitas/client-sql";

/**
 * DuckDB-specific error kinds.
 */
export type DuckDbErrorKind = "io" | "catalog" | "parser" | "binder";

/**
 * Options for DuckDbError constructor.
 */
export interface DuckDbErrorOptions extends SqlErrorOptions {
  /** DuckDB error type if available. */
  readonly errorType?: string;
}

/**
 * Base error class for DuckDB-specific errors.
 * Extends SqlError with DuckDB-specific properties.
 */
export class DuckDbError extends SqlError {
  override readonly name: string = "DuckDbError";
  readonly errorType?: string;

  constructor(
    message: string,
    options?: DuckDbErrorOptions,
  ) {
    super(message, "unknown", options);
    this.errorType = options?.errorType;
  }
}

/**
 * Error thrown for IO-related errors (file not found, permission denied, etc.).
 */
export class IoError extends DuckDbError {
  override readonly name = "IoError";
  readonly duckdbKind = "io" as const;

  constructor(message: string, options?: DuckDbErrorOptions) {
    super(message, options);
  }
}

/**
 * Error thrown for catalog errors (table not found, etc.).
 */
export class CatalogError extends DuckDbError {
  override readonly name = "CatalogError";
  readonly duckdbKind = "catalog" as const;

  constructor(message: string, options?: DuckDbErrorOptions) {
    super(message, options);
  }
}

/**
 * Convert a DuckDB error to the appropriate error class.
 *
 * DuckDB errors are classified based on message content analysis.
 */
export function convertDuckDbError(error: unknown): SqlError {
  if (!(error instanceof Error)) {
    return new DuckDbError(String(error));
  }

  const options: DuckDbErrorOptions = {
    cause: error,
  };

  // Check for connection errors first
  if (isConnectionError(error)) {
    return new SqlConnectionError(error.message, options);
  }

  const message = error.message.toLowerCase();

  // Check for constraint violations
  if (
    message.includes("constraint") ||
    message.includes("duplicate key") ||
    message.includes("unique") ||
    message.includes("foreign key") ||
    message.includes("not null")
  ) {
    let constraint = "unknown";

    // Try to extract constraint information
    const uniqueMatch = error.message.match(/unique constraint/i);
    if (uniqueMatch) {
      constraint = "UNIQUE";
    }

    const fkMatch = error.message.match(/foreign key/i);
    if (fkMatch) {
      constraint = "FOREIGN KEY";
    }

    const pkMatch = error.message.match(/primary key/i);
    if (pkMatch) {
      constraint = "PRIMARY KEY";
    }

    const notNullMatch = error.message.match(/not null/i);
    if (notNullMatch) {
      constraint = "NOT NULL";
    }

    return new ConstraintError(error.message, constraint, options);
  }

  // Check for IO errors (before syntax errors, as "file not found" is more specific)
  if (
    message.includes("io error") ||
    message.includes("permission denied") ||
    message.includes("no such file") ||
    message.includes("file not found") ||
    message.includes("cannot open")
  ) {
    return new IoError(error.message, options);
  }

  // Check for syntax/parser errors
  if (
    message.includes("parser error") ||
    message.includes("syntax error") ||
    message.includes("binder error") ||
    message.includes("catalog error") ||
    message.includes("does not exist") ||
    message.includes("invalid") ||
    message.includes("expected")
  ) {
    // Catalog-specific errors
    if (
      message.includes("catalog error") ||
      message.includes("does not exist") ||
      message.includes("table") && message.includes("not found")
    ) {
      return new CatalogError(error.message, options);
    }

    return new QuerySyntaxError(error.message, options);
  }

  return new DuckDbError(error.message, options);
}

/**
 * Check if an error is a connection-level error.
 * These are errors that indicate the database cannot be accessed at all,
 * not errors that occur during query execution.
 */
export function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  // Connection-level patterns only (client state, not file operations)
  const connectionPatterns = [
    "client is closed",
    "connection closed",
    "unable to open database",
    "database is locked",
  ];

  return connectionPatterns.some((pattern) => message.includes(pattern));
}
