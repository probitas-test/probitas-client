/**
 * Core utilities and types for Probitas client libraries.
 *
 * This package provides shared types, error classes, and utilities used across
 * all [`@probitas/*`](https://jsr.io/@probitas) client packages.
 *
 * ## Features
 *
 * - **Common Options**: Shared configuration types like `CommonOptions` and `RetryOptions`
 * - **Error Hierarchy**: Base error classes (`ClientError`, `ConnectionError`, `TimeoutError`, `AbortError`)
 *
 * ## Installation
 *
 * ```bash
 * deno add jsr:@probitas/client
 * ```
 *
 * ## Usage
 *
 * This package is typically used as a dependency by other client packages.
 * End users rarely need to import from it directly.
 *
 * ```ts
 * import type { CommonOptions, RetryOptions } from "@probitas/client";
 * import { ClientError, ConnectionError, TimeoutError } from "@probitas/client";
 *
 * // Use CommonOptions for timeout and abort signal support
 * async function fetchData(options?: CommonOptions) {
 *   // Implementation with timeout and signal handling
 * }
 *
 * // Catch and handle errors
 * try {
 *   await fetchData({ timeout: 5000 });
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.log(`Timed out after ${error.timeoutMs}ms`);
 *   } else if (error instanceof ConnectionError) {
 *     console.log("Failed to connect");
 *   }
 * }
 * ```
 *
 * ## Related Packages
 *
 * | Package | Description |
 * |---------|-------------|
 * | [`@probitas/client-http`](https://jsr.io/@probitas/client-http) | HTTP client |
 * | [`@probitas/client-graphql`](https://jsr.io/@probitas/client-graphql) | GraphQL client |
 * | [`@probitas/client-grpc`](https://jsr.io/@probitas/client-grpc) | gRPC client |
 * | [`@probitas/client-connectrpc`](https://jsr.io/@probitas/client-connectrpc) | ConnectRPC client |
 * | [`@probitas/client-sql-postgres`](https://jsr.io/@probitas/client-sql-postgres) | PostgreSQL client |
 * | [`@probitas/client-sql-mysql`](https://jsr.io/@probitas/client-sql-mysql) | MySQL client |
 * | [`@probitas/client-sql-sqlite`](https://jsr.io/@probitas/client-sql-sqlite) | SQLite client |
 * | [`@probitas/client-sql-duckdb`](https://jsr.io/@probitas/client-sql-duckdb) | DuckDB client |
 * | [`@probitas/client-deno-kv`](https://jsr.io/@probitas/client-deno-kv) | Deno KV client |
 * | [`@probitas/client-redis`](https://jsr.io/@probitas/client-redis) | Redis client |
 * | [`@probitas/client-mongodb`](https://jsr.io/@probitas/client-mongodb) | MongoDB client |
 * | [`@probitas/client-rabbitmq`](https://jsr.io/@probitas/client-rabbitmq) | RabbitMQ client |
 * | [`@probitas/client-sqs`](https://jsr.io/@probitas/client-sqs) | AWS SQS client |
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/probitas-test/probitas-client)
 * - [Probitas Framework](https://github.com/probitas-test/probitas)
 *
 * @module
 */

export type * from "./types.ts";
export * from "./errors.ts";
