/**
 * Common SQL types and utilities for [Probitas](https://github.com/probitas-test/probitas) SQL client packages.
 *
 * This package provides shared types, result classes, and errors used across
 * all SQL-related client packages.
 *
 * ## Features
 *
 * - **Query Results**: `SqlQueryResult` class with row iteration and metadata
 * - **Transactions**: Common transaction interface with isolation levels
 * - **Error Hierarchy**: SQL-specific errors (`SqlError`, `QuerySyntaxError`, `ConstraintError`, `DeadlockError`)
 *
 * ## Installation
 *
 * ```bash
 * deno add jsr:@probitas/client-sql
 * ```
 *
 * ## Usage
 *
 * This package is typically used as a dependency by database-specific packages.
 * End users should import from the specific database client packages instead.
 *
 * ```ts
 * // Example of SQL error handling (requires database-specific client)
 * import {
 *   SqlQueryResult,
 *   SqlError,
 *   ConstraintError,
 * } from "@probitas/client-sql";
 * import type { SqlTransaction, SqlIsolationLevel } from "@probitas/client-sql";
 *
 * // Error types are available for use with database-specific clients
 * const isolationLevel: SqlIsolationLevel = "read_committed";
 * console.log("Isolation level:", isolationLevel);
 * ```
 *
 * ## Database-Specific Packages
 *
 * | Package | Description |
 * |---------|-------------|
 * | [`@probitas/client-sql-postgres`](https://jsr.io/@probitas/client-sql-postgres) | PostgreSQL client |
 * | [`@probitas/client-sql-mysql`](https://jsr.io/@probitas/client-sql-mysql) | MySQL client |
 * | [`@probitas/client-sql-sqlite`](https://jsr.io/@probitas/client-sql-sqlite) | SQLite client |
 * | [`@probitas/client-sql-duckdb`](https://jsr.io/@probitas/client-sql-duckdb) | DuckDB client |
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/probitas-test/probitas-client)
 * - [Probitas Framework](https://github.com/probitas-test/probitas)
 *
 * @module
 */

export type * from "./transaction.ts";
export * from "./errors.ts";
export * from "./result.ts";
