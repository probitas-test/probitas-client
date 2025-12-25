/**
 * Deno KV client for [Probitas](https://github.com/probitas-test/probitas) scenario testing framework.
 *
 * This package provides a Deno KV client designed for integration testing of applications using Deno KV storage.
 *
 * ## Features
 *
 * - **Key-Value Operations**: get, set, delete with structured keys
 * - **Listing**: Iterate over keys by prefix, start, end
 * - **Atomic Transactions**: Atomic operations with version checking
 * - **Type Safety**: Generic type parameters for stored values
 * - **Resource Management**: Implements `AsyncDisposable` for proper cleanup
 *
 * ## Installation
 *
 * ```bash
 * deno add jsr:@probitas/client-deno-kv
 * ```
 *
 * ## Quick Start
 *
 * ```ts
 * import { createDenoKvClient } from "@probitas/client-deno-kv";
 *
 * const kv = await createDenoKvClient();
 *
 * // Set a value
 * const setResult = await kv.set(["users", "1"], { name: "Alice", age: 30 });
 * console.log("Versionstamp:", setResult.versionstamp);
 *
 * // Get a value with type
 * const getResult = await kv.get<{ name: string; age: number }>(["users", "1"]);
 * console.log("User:", getResult.value);
 *
 * // List entries by prefix
 * const listResult = await kv.list<{ name: string }>({ prefix: ["users"] });
 * console.log("Entries:", listResult.entries);
 *
 * await kv.close();
 * ```
 *
 * ## Atomic Operations
 *
 * ```ts
 * import { createDenoKvClient } from "@probitas/client-deno-kv";
 *
 * const kv = await createDenoKvClient();
 *
 * // Atomic transaction with version check
 * const atomic = kv.atomic();
 * atomic.check({ key: ["counter"], versionstamp: null }); // Only if key doesn't exist
 * atomic.set(["counter"], 1n);
 * await atomic.commit();
 *
 * // Atomic increment
 * const current = await kv.get<bigint>(["counter"]);
 * const atomic2 = kv.atomic();
 * atomic2.check({ key: ["counter"], versionstamp: current.versionstamp });
 * atomic2.set(["counter"], (current.value ?? 0n) + 1n);
 * await atomic2.commit();
 *
 * await kv.close();
 * ```
 *
 * ## Using with `using` Statement
 *
 * ```ts
 * import { createDenoKvClient } from "@probitas/client-deno-kv";
 *
 * await using kv = await createDenoKvClient();
 *
 * await kv.set(["test"], "value");
 * const result = await kv.get(["test"]);
 * console.log(result.value);
 * // Client automatically closed when block exits
 * ```
 *
 * ## Related Packages
 *
 * | Package | Description |
 * |---------|-------------|
 * | [`@probitas/client`](https://jsr.io/@probitas/client) | Core utilities and types |
 * | [`@probitas/client-redis`](https://jsr.io/@probitas/client-redis) | Redis client |
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/probitas-test/probitas-client)
 * - [Probitas Framework](https://github.com/probitas-test/probitas)
 * - [Deno KV](https://deno.land/manual/runtime/kv)
 *
 * @module
 */

export type * from "./types.ts";
export * from "./errors.ts";
export type * from "./result.ts";
export type * from "./atomic.ts";
export * from "./client.ts";
