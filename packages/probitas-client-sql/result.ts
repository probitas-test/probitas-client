import type { ClientResult } from "@probitas/client";
import { SqlRows } from "./rows.ts";

/**
 * Options for creating a SqlQueryResult.
 */
export interface SqlQueryResultInit<T> {
  /** Whether the query succeeded */
  readonly ok: boolean;

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
   * Inherited from ClientResult. Always true for successful queries.
   */
  readonly ok: boolean;

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
    this.ok = init.ok;
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
