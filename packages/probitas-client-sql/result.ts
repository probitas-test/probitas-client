import type { ClientResult, CommonOptions } from "@probitas/client";
import type { SqlError } from "./errors.ts";
import { SqlRows } from "./rows.ts";

/**
 * Common options for SQL operations with throwOnError support.
 */
export interface SqlOptions extends CommonOptions {
  /**
   * Whether to throw an error when an operation fails.
   *
   * When `false` (default), errors are returned as part of the result object
   * with `ok: false` and an `error` property containing the error details.
   *
   * When `true`, errors are thrown as exceptions.
   *
   * @default false (inherited from client config, or false if not set)
   */
  readonly throwOnError?: boolean;
}

/**
 * Options for creating a SqlQueryResult.
 */
export interface SqlQueryResultInit<T> {
  /** The result rows */
  readonly rows: readonly T[];

  /** Number of affected rows (for INSERT/UPDATE/DELETE) */
  readonly rowCount: number;

  /** Query execution duration in milliseconds */
  readonly duration: number;

  /** Last inserted ID (for INSERT statements) */
  readonly lastInsertId?: bigint | string;

  /** Warning messages from the database */
  readonly warnings?: readonly string[];
}

/**
 * SQL query result with rows, metadata, and transformation methods.
 * Represents a successful query result where `ok` is always `true`.
 */
// deno-lint-ignore no-explicit-any
export class SqlQueryResult<T = Record<string, any>> implements ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sql"` for SQL query results. Use this in switch statements
   * for type-safe narrowing of union types.
   */
  readonly kind = "sql" as const;

  /**
   * Whether the query succeeded.
   *
   * Always `true` for `SqlQueryResult`. Use type narrowing with
   * `result.ok` to distinguish from `SqlQueryResultFailure`.
   */
  readonly ok: true = true;

  /**
   * Query result rows.
   *
   * Provides iteration and helper methods for row access.
   */
  readonly rows: SqlRows<T>;

  /**
   * Number of affected rows (for INSERT/UPDATE/DELETE).
   *
   * For SELECT queries, this may be 0 or match rows.length depending on the driver.
   */
  readonly rowCount: number;

  /**
   * Query execution duration in milliseconds.
   *
   * Inherited from ClientResult. Measures the full query execution time.
   */
  readonly duration: number;

  /**
   * Last inserted ID (for INSERT statements).
   *
   * Type varies by database (bigint for MySQL, string for others).
   */
  readonly lastInsertId?: bigint | string;

  /**
   * Warning messages from the database.
   *
   * Present only when the query generates warnings.
   */
  readonly warnings?: readonly string[];

  constructor(init: SqlQueryResultInit<T>) {
    this.rows = new SqlRows(init.rows);
    this.rowCount = init.rowCount;
    this.duration = init.duration;
    this.lastInsertId = init.lastInsertId;
    this.warnings = init.warnings;
  }

  /**
   * Map rows to a new type.
   */
  map<U>(mapper: (row: T) => U): U[] {
    const result: U[] = [];
    for (const row of this.rows) {
      result.push(mapper(row));
    }
    return result;
  }

  /**
   * Create class instances from rows.
   */
  as<U>(ctor: new (row: T) => U): U[] {
    const result: U[] = [];
    for (const row of this.rows) {
      result.push(new ctor(row));
    }
    return result;
  }
}

/**
 * Represents a failed SQL query result.
 *
 * This type is returned when `throwOnError` is `false` (the default)
 * and an error occurs during query execution.
 */
export interface SqlQueryResultFailure extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sql"` for SQL query results.
   */
  readonly kind: "sql";

  /**
   * Whether the query succeeded.
   *
   * Always `false` for failure results.
   */
  readonly ok: false;

  /**
   * The error that caused the query to fail.
   */
  readonly error: SqlError;

  /**
   * Query execution duration in milliseconds.
   *
   * Measures the time until the error occurred.
   */
  readonly duration: number;
}

/**
 * Union type for SQL query results.
 *
 * Use type narrowing with `result.ok` to distinguish between success and failure:
 *
 * @example
 * ```ts ignore
 * const result = await client.query("SELECT * FROM users");
 * if (result.ok) {
 *   // result is SqlQueryResult<T>
 *   console.log(result.rows.first());
 * } else {
 *   // result is SqlQueryResultFailure
 *   console.error(result.error.message);
 * }
 * ```
 */
// deno-lint-ignore no-explicit-any
export type SqlQueryResultType<T = Record<string, any>> =
  | SqlQueryResult<T>
  | SqlQueryResultFailure;

/**
 * Create a failure result for a SQL query.
 *
 * @param error - The error that caused the query to fail
 * @param duration - The time until the error occurred in milliseconds
 * @returns A failure result object
 */
export function createSqlQueryFailure(
  error: SqlError,
  duration: number,
): SqlQueryResultFailure {
  return {
    kind: "sql",
    ok: false,
    error,
    duration,
  };
}
