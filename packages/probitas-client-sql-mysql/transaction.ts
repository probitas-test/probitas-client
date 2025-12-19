import type mysql from "mysql2/promise";
import {
  type SqlIsolationLevel,
  SqlQueryResult,
  type SqlTransaction,
  type SqlTransactionOptions,
} from "@probitas/client-sql";
import { convertMySqlError } from "./errors.ts";

/**
 * MySQL-specific transaction interface.
 * Extends SqlTransaction with MySQL-specific features.
 */
export interface MySqlTransaction extends SqlTransaction {
  /**
   * Create a savepoint.
   * @param name - Savepoint name
   */
  savepoint(name: string): Promise<void>;

  /**
   * Rollback to a savepoint.
   * @param name - Savepoint name
   */
  rollbackToSavepoint(name: string): Promise<void>;

  /**
   * Release a savepoint.
   * @param name - Savepoint name
   */
  releaseSavepoint(name: string): Promise<void>;
}

const ISOLATION_LEVEL_MAP: Record<SqlIsolationLevel, string> = {
  read_uncommitted: "READ UNCOMMITTED",
  read_committed: "READ COMMITTED",
  repeatable_read: "REPEATABLE READ",
  serializable: "SERIALIZABLE",
};

// deno-lint-ignore no-explicit-any
type AnyPoolConnection = mysql.PoolConnection | any;

export class MySqlTransactionImpl implements MySqlTransaction {
  readonly #connection: AnyPoolConnection;
  #finished = false;

  private constructor(connection: AnyPoolConnection) {
    this.#connection = connection;
  }

  /**
   * Begin a new transaction.
   */
  static async begin(
    connection: AnyPoolConnection,
    options?: SqlTransactionOptions,
  ): Promise<MySqlTransactionImpl> {
    try {
      if (options?.isolationLevel) {
        const level = ISOLATION_LEVEL_MAP[options.isolationLevel];
        // Use SESSION to ensure isolation level applies to the current connection
        await connection.execute(
          `SET SESSION TRANSACTION ISOLATION LEVEL ${level}`,
        );
      }
      await connection.beginTransaction();
      return new MySqlTransactionImpl(connection);
    } catch (error) {
      connection.release();
      throw convertMySqlError(error);
    }
  }

  // deno-lint-ignore no-explicit-any
  async query<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<SqlQueryResult<T>> {
    if (this.#finished) {
      throw convertMySqlError(new Error("Transaction is already finished"));
    }

    const startTime = performance.now();

    try {
      const [rows, _fields] = await this.#connection.execute(sql, params);
      const duration = performance.now() - startTime;

      // Handle SELECT queries
      if (Array.isArray(rows)) {
        return new SqlQueryResult<T>({
          ok: true,
          rows: rows as unknown as T[],
          rowCount: rows.length,
          duration,
        });
      }

      // Handle INSERT/UPDATE/DELETE queries (ResultSetHeader)
      // deno-lint-ignore no-explicit-any
      const resultHeader = rows as any;
      return new SqlQueryResult<T>({
        ok: true,
        rows: [],
        rowCount: resultHeader.affectedRows,
        duration,
        lastInsertId: resultHeader.insertId
          ? BigInt(resultHeader.insertId)
          : undefined,
        warnings: resultHeader.warningStatus > 0
          ? [`${resultHeader.warningStatus} warning(s)`]
          : undefined,
      });
    } catch (error) {
      throw convertMySqlError(error);
    }
  }

  // deno-lint-ignore no-explicit-any
  async queryOne<T = Record<string, any>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | undefined> {
    const result = await this.query<T>(sql, params);
    return result.rows.first();
  }

  async commit(): Promise<void> {
    if (this.#finished) {
      throw convertMySqlError(new Error("Transaction is already finished"));
    }

    try {
      await this.#connection.commit();
    } catch (error) {
      throw convertMySqlError(error);
    } finally {
      this.#finished = true;
      this.#connection.release();
    }
  }

  async rollback(): Promise<void> {
    if (this.#finished) {
      throw convertMySqlError(new Error("Transaction is already finished"));
    }

    try {
      await this.#connection.rollback();
    } catch (error) {
      throw convertMySqlError(error);
    } finally {
      this.#finished = true;
      this.#connection.release();
    }
  }

  async savepoint(name: string): Promise<void> {
    if (this.#finished) {
      throw convertMySqlError(new Error("Transaction is already finished"));
    }

    try {
      // Use query instead of execute - SAVEPOINT doesn't support prepared statements
      await this.#connection.query(`SAVEPOINT ${this.#escapeName(name)}`);
    } catch (error) {
      throw convertMySqlError(error);
    }
  }

  async rollbackToSavepoint(name: string): Promise<void> {
    if (this.#finished) {
      throw convertMySqlError(new Error("Transaction is already finished"));
    }

    try {
      // Use query instead of execute - ROLLBACK TO doesn't support prepared statements
      await this.#connection.query(
        `ROLLBACK TO SAVEPOINT ${this.#escapeName(name)}`,
      );
    } catch (error) {
      throw convertMySqlError(error);
    }
  }

  async releaseSavepoint(name: string): Promise<void> {
    if (this.#finished) {
      throw convertMySqlError(new Error("Transaction is already finished"));
    }

    try {
      // Use query instead of execute - RELEASE SAVEPOINT doesn't support prepared statements
      await this.#connection.query(
        `RELEASE SAVEPOINT ${this.#escapeName(name)}`,
      );
    } catch (error) {
      throw convertMySqlError(error);
    }
  }

  #escapeName(name: string): string {
    // Simple identifier escaping for savepoint names
    // MySQL allows alphanumeric and underscore in identifiers
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid savepoint name: ${name}`);
    }
    return name;
  }
}
