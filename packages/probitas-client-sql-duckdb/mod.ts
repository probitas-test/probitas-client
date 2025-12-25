/**
 * DuckDB client for [Probitas](https://github.com/probitas-test/probitas) scenario testing framework.
 *
 * This package provides a DuckDB client designed for integration testing,
 * with analytical query capabilities and Parquet/CSV file support.
 *
 * ## Features
 *
 * - **Query Execution**: Parameterized queries with type-safe results
 * - **Transactions**: Full transaction support
 * - **File Formats**: Native support for Parquet, CSV, and JSON files
 * - **In-Memory Databases**: Perfect for isolated test scenarios
 * - **Analytical Queries**: Optimized for OLAP workloads
 * - **Resource Management**: Implements `AsyncDisposable` for proper cleanup
 *
 * ## Installation
 *
 * ```bash
 * deno add jsr:@probitas/client-sql-duckdb
 * ```
 *
 * ## Quick Start
 *
 * ```ts
 * import { createDuckDbClient } from "@probitas/client-sql-duckdb";
 *
 * // In-memory database for testing
 * const client = await createDuckDbClient({
 *   path: ":memory:",
 * });
 *
 * // Query from Parquet files
 * const result = await client.query<{ id: number; name: string }>(
 *   "SELECT id, name FROM read_parquet('data/*.parquet') WHERE active = ?",
 *   [true]
 * );
 * console.log(result.rows);
 *
 * // Analytical queries
 * const stats = await client.query(`
 *   SELECT
 *     date_trunc('month', created_at) as month,
 *     COUNT(*) as count,
 *     AVG(amount) as avg_amount
 *   FROM transactions
 *   GROUP BY 1
 *   ORDER BY 1
 * `);
 *
 * await client.close();
 * ```
 *
 * ## Transactions
 *
 * ```ts
 * import { createDuckDbClient } from "@probitas/client-sql-duckdb";
 * import type { SqlTransaction } from "@probitas/client-sql";
 *
 * const client = await createDuckDbClient({ path: ":memory:" });
 * await client.transaction(async (tx: SqlTransaction) => {
 *   await tx.query("INSERT INTO accounts (id, balance) VALUES (?, ?)", [1, 100]);
 *   await tx.query("INSERT INTO accounts (id, balance) VALUES (?, ?)", [2, 200]);
 *   // Automatically committed if no error, rolled back on exception
 * });
 * await client.close();
 * ```
 *
 * ## Using with `using` Statement
 *
 * ```ts
 * import { createDuckDbClient } from "@probitas/client-sql-duckdb";
 *
 * await using client = await createDuckDbClient({ path: ":memory:" });
 *
 * const result = await client.query("SELECT 42 as answer");
 * // Client automatically closed when block exits
 * ```
 *
 * ## Related Packages
 *
 * | Package | Description |
 * |---------|-------------|
 * | [`@probitas/client-sql`](https://jsr.io/@probitas/client-sql) | Common SQL types and utilities |
 * | [`@probitas/client-sql-postgres`](https://jsr.io/@probitas/client-sql-postgres) | PostgreSQL client |
 * | [`@probitas/client-sql-mysql`](https://jsr.io/@probitas/client-sql-mysql) | MySQL client |
 * | [`@probitas/client-sql-sqlite`](https://jsr.io/@probitas/client-sql-sqlite) | SQLite client |
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/probitas-test/probitas-client)
 * - [Probitas Framework](https://github.com/probitas-test/probitas)
 * - [DuckDB](https://duckdb.org/)
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
