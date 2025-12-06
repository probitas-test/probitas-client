import { SqlRows } from "./rows.ts";

/**
 * Metadata for SQL query results.
 */
export interface SqlQueryResultMetadata {
  /** Last inserted ID (for INSERT statements) */
  readonly lastInsertId?: bigint | string;

  /** Warning messages from the database */
  readonly warnings?: readonly string[];
}

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

  /** Additional metadata */
  readonly metadata: SqlQueryResultMetadata;
}

/**
 * SQL query result with rows, metadata, and transformation methods.
 */
// deno-lint-ignore no-explicit-any
export class SqlQueryResult<T = Record<string, any>> {
  readonly type = "sql" as const;
  readonly ok: boolean;
  readonly rows: SqlRows<T>;
  readonly rowCount: number;
  readonly duration: number;
  readonly metadata: SqlQueryResultMetadata;

  constructor(init: SqlQueryResultInit<T>) {
    this.ok = init.ok;
    this.rows = new SqlRows(init.rows);
    this.rowCount = init.rowCount;
    this.duration = init.duration;
    this.metadata = init.metadata;
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
