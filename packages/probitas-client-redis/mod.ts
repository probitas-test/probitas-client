/**
 * Redis client for [Probitas](https://github.com/probitas-test/probitas) scenario testing framework.
 *
 * This package provides a Redis client designed for integration testing of applications using Redis.
 *
 * ## Features
 *
 * - **Data Structures**: Strings, Hashes, Lists, Sets, Sorted Sets
 * - **Pub/Sub**: Publish and subscribe to channels
 * - **Transactions**: Atomic operations with MULTI/EXEC
 * - **Raw Commands**: Execute any Redis command via `command()`
 * - **Resource Management**: Implements `AsyncDisposable` for proper cleanup
 *
 * ## Installation
 *
 * ```bash
 * deno add jsr:@probitas/client-redis
 * ```
 *
 * ## Quick Start
 *
 * ```ts
 * import { createRedisClient } from "@probitas/client-redis";
 *
 * const client = await createRedisClient({
 *   url: "redis://localhost:6379/0",
 * });
 *
 * // String operations
 * await client.set("user:1:name", "Alice", { ex: 3600 });
 * const result = await client.get("user:1:name");
 * console.log("Name:", result.value);
 *
 * // Hash operations
 * await client.hset("user:1", "email", "alice@example.com");
 * const email = await client.hget("user:1", "email");
 * console.log("Email:", email.value);
 *
 * // List operations
 * await client.rpush("queue", ["job1", "job2", "job3"]);
 * const job = await client.lpop("queue");
 * console.log("Job:", job.value);
 *
 * await client.close();
 * ```
 *
 * ## Transactions
 *
 * ```ts
 * import { createRedisClient } from "@probitas/client-redis";
 *
 * const client = await createRedisClient({ url: "redis://localhost:6379" });
 *
 * // Atomic transaction
 * const tx = client.multi();
 * tx.incr("counter");
 * tx.get("counter");
 * await tx.exec();
 *
 * await client.close();
 * ```
 *
 * ## Pub/Sub
 *
 * ```ts
 * import { createRedisClient } from "@probitas/client-redis";
 *
 * const client = await createRedisClient({ url: "redis://localhost:6379" });
 *
 * // Subscribe to a channel
 * const subscription = client.subscribe("events");
 * for await (const message of subscription) {
 *   console.log("Received:", message.message);
 *   break;
 * }
 *
 * // Publish to a channel
 * await client.publish("events", JSON.stringify({ type: "update" }));
 *
 * await client.close();
 * ```
 *
 * ## Connection Configuration
 *
 * ```ts
 * import { createRedisClient } from "@probitas/client-redis";
 *
 * // Using URL string
 * const client1 = await createRedisClient({ url: "redis://localhost:6379" });
 *
 * // Using URL with password and database
 * const client2 = await createRedisClient({ url: "redis://:secret@localhost:6379/1" });
 *
 * // Using config object
 * const client3 = await createRedisClient({
 *   url: { host: "localhost", port: 6379, password: "secret", db: 1 },
 * });
 *
 * await client1.close();
 * await client2.close();
 * await client3.close();
 * ```
 *
 * ## Using with `using` Statement
 *
 * ```ts
 * import { createRedisClient } from "@probitas/client-redis";
 *
 * await using client = await createRedisClient({ url: "redis://localhost:6379" });
 *
 * await client.set("test", "value");
 * const result = await client.get("test");
 * console.log(result.value);
 * // Client automatically closed when block exits
 * ```
 *
 * ## Related Packages
 *
 * | Package | Description |
 * |---------|-------------|
 * | [`@probitas/client`](https://jsr.io/@probitas/client) | Core utilities and types |
 * | [`@probitas/client-deno-kv`](https://jsr.io/@probitas/client-deno-kv) | Deno KV client |
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/probitas-test/probitas-client)
 * - [Probitas Framework](https://github.com/probitas-test/probitas)
 * - [Redis](https://redis.io/)
 *
 * @module
 */

export type * from "./types.ts";
export * from "./errors.ts";
export type * from "./result.ts";
export * from "./client.ts";
