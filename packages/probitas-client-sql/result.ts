import type { ClientResult } from "@probitas/client";
import type { SqlError, SqlFailureError } from "./errors.ts";

/**
 * Base interface for all SQL query result types.
 *
 * Provides common properties and methods shared by Success, Error, and Failure results.
 */
interface SqlQueryResultBase<T> extends ClientResult {
  /** Result kind discriminator. Always `"sql"` for SQL query results. */
  readonly kind: "sql";

  /** Whether the query was processed by the database server. */
  readonly processed: boolean;

  /** Whether the query succeeded. */
  readonly ok: boolean;

  /** Error that occurred during the operation. */
  readonly error: SqlError | SqlFailureError | null;

  /** Query execution duration in milliseconds. */
  readonly duration: number;

  /**
   * Map rows to a new type.
   * Returns empty array if query failed or was not processed.
   */
  map<U>(mapper: (row: T) => U): U[];

  /**
   * Create class instances from rows.
   * Returns empty array if query failed or was not processed.
   */
  as<U>(ctor: new (row: T) => U): U[];
}

/**
 * SQL query result for successful queries.
 *
 * The query was executed successfully and returned results.
 */
// deno-lint-ignore no-explicit-any
export interface SqlQueryResultSuccess<T = any> extends SqlQueryResultBase<T> {
  /** Server processed the query. */
  readonly processed: true;

  /** Query succeeded. */
  readonly ok: true;

  /** No error for successful queries. */
  readonly error: null;

  /** Query result rows. */
  readonly rows: readonly T[];

  /** Number of affected rows. */
  readonly rowCount: number;

  /** Last inserted ID (for INSERT statements). */
  readonly lastInsertId: bigint | string | null;

  /** Warning messages from the database. */
  readonly warnings: (readonly string[]) | null;
}

/**
 * SQL query result for query errors (syntax errors, constraint violations, etc.).
 *
 * Server received and processed the query, but it failed due to a SQL error.
 */
// deno-lint-ignore no-explicit-any
export interface SqlQueryResultError<T = any> extends SqlQueryResultBase<T> {
  /** Server processed the query. */
  readonly processed: true;

  /** Query failed. */
  readonly ok: false;

  /** Error describing the SQL error. */
  readonly error: SqlError;

  /** Empty rows for failed queries. */
  readonly rows: readonly never[];

  /** Zero affected rows for failed queries. */
  readonly rowCount: 0;

  /** No lastInsertId for failed queries. */
  readonly lastInsertId: null;

  /** No warnings for failed queries. */
  readonly warnings: null;
}

/**
 * SQL query result for connection failures (network errors, timeouts, etc.).
 *
 * Query could not be processed by the server (connection refused, timeout,
 * pool exhausted, authentication failure, etc.).
 */
// deno-lint-ignore no-explicit-any
export interface SqlQueryResultFailure<T = any> extends SqlQueryResultBase<T> {
  /** Server did not process the query. */
  readonly processed: false;

  /** Query failed. */
  readonly ok: false;

  /** Error describing the failure. */
  readonly error: SqlFailureError;

  /** No rows (query didn't reach server). */
  readonly rows: null;

  /** No row count (query didn't reach server). */
  readonly rowCount: null;

  /** No lastInsertId (query didn't reach server). */
  readonly lastInsertId: null;

  /** No warnings (query didn't reach server). */
  readonly warnings: null;
}

/**
 * SQL query result union type representing all possible result states.
 *
 * - **Success**: `processed: true, ok: true, error: null`
 * - **Error**: `processed: true, ok: false, error: SqlError`
 * - **Failure**: `processed: false, ok: false, error: SqlConnectionError`
 *
 * @example Type narrowing by ok
 * ```ts
 * import { createPostgresClient } from "@probitas/client-sql-postgres";
 *
 * await using client = await createPostgresClient({ url: "postgres://localhost/db" });
 * const result = await client.query("SELECT * FROM users");
 * if (result.ok) {
 *   // TypeScript knows: SqlQueryResultSuccess
 *   console.log(result.rows[0]);
 * } else {
 *   // TypeScript knows: SqlQueryResultError | SqlQueryResultFailure
 *   console.log(result.error.message);
 * }
 * ```
 *
 * @example Type narrowing by processed
 * ```ts
 * import { createPostgresClient } from "@probitas/client-sql-postgres";
 *
 * await using client = await createPostgresClient({ url: "postgres://localhost/db" });
 * const result = await client.query("SELECT * FROM users");
 * if (result.processed) {
 *   // TypeScript knows: SqlQueryResultSuccess | SqlQueryResultError
 *   console.log(result.rowCount);
 * } else {
 *   // TypeScript knows: SqlQueryResultFailure
 *   console.log(result.error.message); // Connection error
 * }
 * ```
 */
// deno-lint-ignore no-explicit-any
export type SqlQueryResult<T = any> =
  | SqlQueryResultSuccess<T>
  | SqlQueryResultError<T>
  | SqlQueryResultFailure<T>;

/**
 * Parameters for creating a SqlQueryResultSuccess.
 */
// deno-lint-ignore no-explicit-any
export interface SqlQueryResultSuccessParams<T = any> {
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
 * Implementation of SqlQueryResultSuccess.
 * @internal
 */
export class SqlQueryResultSuccessImpl<T> implements SqlQueryResultSuccess<T> {
  readonly kind = "sql" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly rows: readonly T[];
  readonly rowCount: number;
  readonly duration: number;
  readonly lastInsertId: bigint | string | null;
  readonly warnings: (readonly string[]) | null;

  constructor(params: SqlQueryResultSuccessParams<T>) {
    this.rows = params.rows;
    this.rowCount = params.rowCount;
    this.duration = params.duration;
    this.lastInsertId = params.lastInsertId ?? null;
    this.warnings = params.warnings ?? null;
  }

  map<U>(mapper: (row: T) => U): U[] {
    const result: U[] = [];
    for (const row of this.rows) {
      result.push(mapper(row));
    }
    return result;
  }

  as<U>(ctor: new (row: T) => U): U[] {
    const result: U[] = [];
    for (const row of this.rows) {
      result.push(new ctor(row));
    }
    return result;
  }
}

/**
 * Implementation of SqlQueryResultError.
 * @internal
 */
export class SqlQueryResultErrorImpl<T> implements SqlQueryResultError<T> {
  readonly kind = "sql" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: SqlError;
  readonly rows: readonly never[] = [];
  readonly rowCount = 0 as const;
  readonly duration: number;
  readonly lastInsertId = null;
  readonly warnings = null;

  constructor(error: SqlError, duration: number) {
    this.error = error;
    this.duration = duration;
  }

  map<U>(_mapper: (row: T) => U): U[] {
    return [];
  }

  as<U>(_ctor: new (row: T) => U): U[] {
    return [];
  }
}

/**
 * Implementation of SqlQueryResultFailure.
 * @internal
 */
export class SqlQueryResultFailureImpl<T> implements SqlQueryResultFailure<T> {
  readonly kind = "sql" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: SqlFailureError;
  readonly rows = null;
  readonly rowCount = null;
  readonly duration: number;
  readonly lastInsertId = null;
  readonly warnings = null;

  constructor(error: SqlFailureError, duration: number) {
    this.error = error;
    this.duration = duration;
  }

  map<U>(_mapper: (row: T) => U): U[] {
    return [];
  }

  as<U>(_ctor: new (row: T) => U): U[] {
    return [];
  }
}
