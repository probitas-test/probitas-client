/**
 * MySQL client for [Probitas](https://github.com/probitas-test/probitas) scenario testing framework.
 *
 * This package provides a MySQL client designed for integration testing,
 * with transaction support and prepared statement capabilities.
 *
 * ## Features
 *
 * - **Query Execution**: Parameterized queries with type-safe results
 * - **Transactions**: Full transaction support with isolation levels
 * - **Prepared Statements**: Automatic parameter escaping and type conversion
 * - **Connection Pooling**: Configurable pool with idle timeout
 * - **Resource Management**: Implements `AsyncDisposable` for proper cleanup
 *
 * ## Installation
 *
 * ```bash
 * deno add jsr:@probitas/client-sql-mysql
 * ```
 *
 * ## Quick Start
 *
 * ```ts
 * import { createMySqlClient } from "@probitas/client-sql-mysql";
 *
 * const client = await createMySqlClient({
 *   url: {
 *     host: "localhost",
 *     port: 3306,
 *     username: "root",
 *     password: "secret",
 *     database: "mydb",
 *   },
 * });
 *
 * // Query with parameters (uses ? placeholders)
 * const result = await client.query<{ id: number; name: string }>(
 *   "SELECT id, name FROM users WHERE active = ?",
 *   [true]
 * );
 * console.log(result.rows);
 *
 * // Get first row
 * const user = await client.queryOne<{ id: number; name: string }>(
 *   "SELECT * FROM users WHERE id = ?",
 *   [1]
 * );
 *
 * await client.close();
 * ```
 *
 * ## Transactions
 *
 * ```ts
 * import { createMySqlClient } from "@probitas/client-sql-mysql";
 * import type { SqlTransaction } from "@probitas/client-sql";
 *
 * const client = await createMySqlClient({ url: "mysql://localhost:3306/testdb" });
 * await client.transaction(async (tx: SqlTransaction) => {
 *   await tx.query("INSERT INTO accounts (id, balance) VALUES (?, ?)", [1, 100]);
 *   await tx.query("INSERT INTO accounts (id, balance) VALUES (?, ?)", [2, 200]);
 *   // Automatically committed if no error, rolled back on exception
 * }, { isolationLevel: "serializable" });
 * await client.close();
 * ```
 *
 * ## Using with `using` Statement
 *
 * ```ts
 * import { createMySqlClient } from "@probitas/client-sql-mysql";
 *
 * await using client = await createMySqlClient({
 *   url: { host: "localhost", username: "root", database: "testdb" },
 * });
 *
 * const result = await client.query("SELECT 1 as n");
 * // Client automatically closed when block exits
 * ```
 *
 * ## Related Packages
 *
 * | Package | Description |
 * |---------|-------------|
 * | [`@probitas/client-sql`](https://jsr.io/@probitas/client-sql) | Common SQL types and utilities |
 * | [`@probitas/client-sql-postgres`](https://jsr.io/@probitas/client-sql-postgres) | PostgreSQL client |
 * | [`@probitas/client-sql-sqlite`](https://jsr.io/@probitas/client-sql-sqlite) | SQLite client |
 * | [`@probitas/client-sql-duckdb`](https://jsr.io/@probitas/client-sql-duckdb) | DuckDB client |
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/probitas-test/probitas-client)
 * - [Probitas Framework](https://github.com/probitas-test/probitas)
 * - [MySQL](https://www.mysql.com/)
 *
 * @module
 */

// Client
export * from "./client.ts";

// Transaction
export type * from "./transaction.ts";

// Types
export type * from "./types.ts";

// Errors
export * from "./errors.ts";

// Re-export common types from @probitas/client-sql
export * from "@probitas/client-sql";
