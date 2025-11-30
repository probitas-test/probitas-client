/**
 * @probitas/client-deno-kv - Deno KV client for Probitas scenario testing framework.
 *
 * @example
 * ```ts
 * import {
 *   createDenoKvClient,
 *   expectDenoKvGetResult,
 *   expectDenoKvListResult,
 * } from "@probitas/client-deno-kv";
 *
 * const kv = await createDenoKvClient();
 *
 * // Set
 * await kv.set(["users", "1"], { name: "Alice", age: 30 });
 *
 * // Get
 * const getResult = await kv.get<{ name: string; age: number }>(["users", "1"]);
 * expectDenoKvGetResult(getResult).ok().hasContent().valueContains({ name: "Alice" });
 *
 * // List
 * const listResult = await kv.list<{ name: string }>({ prefix: ["users"] });
 * expectDenoKvListResult(listResult).ok().countAtLeast(1);
 *
 * // Atomic
 * const atomic = kv.atomic();
 * atomic.check({ key: ["counter"], versionstamp: null });
 * atomic.set(["counter"], 1n);
 * const atomicResult = await atomic.commit();
 *
 * await kv.close();
 * ```
 *
 * @module
 */

export type * from "./types.ts";
export * from "./errors.ts";
export * from "./results.ts";
export type * from "./atomic.ts";
export * from "./client.ts";
export * from "./expect.ts";
