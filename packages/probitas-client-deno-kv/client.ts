import { getLogger } from "@probitas/logger";
import type {
  DenoKvClientConfig,
  DenoKvGetDeleteOptions,
  DenoKvListOptions,
  DenoKvSetOptions,
} from "./types.ts";
import type {
  DenoKvDeleteResultType,
  DenoKvEntry,
  DenoKvGetResultType,
  DenoKvListResultType,
  DenoKvSetResultType,
} from "./results.ts";
import {
  createDenoKvDeleteFailure,
  createDenoKvEntries,
  createDenoKvGetFailure,
  createDenoKvListFailure,
  createDenoKvSetFailure,
} from "./results.ts";
import type { DenoKvAtomicBuilder } from "./atomic.ts";
import { DenoKvAtomicBuilderImpl } from "./atomic.ts";
import { DenoKvError } from "./errors.ts";

const logger = getLogger("probitas", "client", "deno-kv");

/**
 * Format a value for logging, truncating long values.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") {
    return value.length > 200 ? value.slice(0, 200) + "..." : value;
  }
  try {
    const str = JSON.stringify(value);
    return str.length > 200 ? str.slice(0, 200) + "..." : str;
  } catch {
    return "<unserializable>";
  }
}

/**
 * Deno KV client for Probitas scenario testing.
 */
export interface DenoKvClient extends AsyncDisposable {
  /**
   * Client configuration.
   */
  readonly config: DenoKvClientConfig;

  /**
   * Get a single value by key.
   */
  get<T>(
    key: Deno.KvKey,
    options?: DenoKvGetDeleteOptions,
  ): Promise<DenoKvGetResultType<T>>;

  /**
   * Get multiple values by keys.
   */
  getMany<T extends readonly unknown[]>(
    keys: readonly [...{ [K in keyof T]: Deno.KvKey }],
    options?: DenoKvGetDeleteOptions,
  ): Promise<{ [K in keyof T]: DenoKvGetResultType<T[K]> }>;

  /**
   * Set a value.
   */
  set<T>(
    key: Deno.KvKey,
    value: T,
    options?: DenoKvSetOptions,
  ): Promise<DenoKvSetResultType>;

  /**
   * Delete a key.
   */
  delete(
    key: Deno.KvKey,
    options?: DenoKvGetDeleteOptions,
  ): Promise<DenoKvDeleteResultType>;

  /**
   * List entries by selector.
   */
  list<T>(
    selector: Deno.KvListSelector,
    options?: DenoKvListOptions,
  ): Promise<DenoKvListResultType<T>>;

  /**
   * Create an atomic operation builder.
   */
  atomic(): DenoKvAtomicBuilder;

  /**
   * Close the KV connection.
   */
  close(): Promise<void>;
}

/**
 * DenoKvClient implementation.
 */
class DenoKvClientImpl implements DenoKvClient {
  readonly config: DenoKvClientConfig;
  readonly #kv: Deno.Kv;

  constructor(kv: Deno.Kv, config: DenoKvClientConfig) {
    this.#kv = kv;
    this.config = config;

    // Log client opening
    logger.debug("Deno KV client opened", {
      path: config.path ?? "in-memory",
    });
  }

  async get<T>(
    key: Deno.KvKey,
    options?: DenoKvGetDeleteOptions,
  ): Promise<DenoKvGetResultType<T>> {
    const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
      false;
    const start = performance.now();

    // Log get operation start
    logger.debug("Deno KV get starting", {
      key: key.map((k) => typeof k === "string" ? k : String(k)),
    });

    try {
      const entry = await this.#kv.get<T>(key);
      const duration = performance.now() - start;

      // Log get operation result
      logger.debug("Deno KV get completed", {
        key: key.map((k) => typeof k === "string" ? k : String(k)),
        found: entry.value !== null,
        duration: `${duration.toFixed(2)}ms`,
      });

      // Log detailed content
      if (entry.value !== null) {
        logger.trace("Deno KV get details", {
          value: formatValue(entry.value),
        });
      }

      return {
        kind: "deno-kv:get",
        ok: true as const,
        key: entry.key,
        value: entry.value,
        versionstamp: entry.versionstamp,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - start;
      logger.debug("Deno KV get failed", {
        key: key.map((k) => typeof k === "string" ? k : String(k)),
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const kvError = new DenoKvError(
        error instanceof Error ? error.message : String(error),
        "kv",
        { cause: error },
      );
      if (shouldThrow) {
        throw kvError;
      }
      return createDenoKvGetFailure(kvError, key, duration);
    }
  }

  async getMany<T extends readonly unknown[]>(
    keys: readonly [...{ [K in keyof T]: Deno.KvKey }],
    options?: DenoKvGetDeleteOptions,
  ): Promise<{ [K in keyof T]: DenoKvGetResultType<T[K]> }> {
    const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
      false;
    const start = performance.now();

    // Log getMany operation start
    logger.debug("Deno KV getMany starting", {
      count: keys.length,
    });

    try {
      const entries = await this.#kv.getMany<[...T]>(keys);
      const duration = performance.now() - start;

      // Log getMany operation result
      logger.debug("Deno KV getMany completed", {
        count: keys.length,
        found: entries.filter((e) => e.value !== null).length,
        duration: `${duration.toFixed(2)}ms`,
      });

      // Log detailed content
      logger.trace("Deno KV getMany details", {
        entries: entries.map((e) => ({
          value: e.value !== null ? formatValue(e.value) : null,
        })),
      });

      return entries.map((entry) => ({
        kind: "deno-kv:get" as const,
        ok: true as const,
        key: entry.key,
        value: entry.value,
        versionstamp: entry.versionstamp,
        duration,
      })) as { [K in keyof T]: DenoKvGetResultType<T[K]> };
    } catch (error) {
      const duration = performance.now() - start;
      logger.debug("Deno KV getMany failed", {
        count: keys.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const kvError = new DenoKvError(
        error instanceof Error ? error.message : String(error),
        "kv",
        { cause: error },
      );
      if (shouldThrow) {
        throw kvError;
      }
      // Return failure results for all keys
      return keys.map((key) =>
        createDenoKvGetFailure(kvError, key, duration)
      ) as { [K in keyof T]: DenoKvGetResultType<T[K]> };
    }
  }

  async set<T>(
    key: Deno.KvKey,
    value: T,
    options?: DenoKvSetOptions,
  ): Promise<DenoKvSetResultType> {
    const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
      false;
    const start = performance.now();

    // Log set operation start
    logger.debug("Deno KV set starting", {
      key: key.map((k) => typeof k === "string" ? k : String(k)),
      expireIn: options?.expireIn,
    });

    try {
      const result = await this.#kv.set(key, value, {
        expireIn: options?.expireIn,
      });
      const duration = performance.now() - start;

      // Log set operation result
      logger.debug("Deno KV set completed", {
        key: key.map((k) => typeof k === "string" ? k : String(k)),
        success: result.ok,
        duration: `${duration.toFixed(2)}ms`,
      });

      // Log detailed content
      logger.trace("Deno KV set details", {
        value: formatValue(value),
      });

      return {
        kind: "deno-kv:set",
        ok: true as const,
        versionstamp: result.versionstamp,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - start;
      logger.debug("Deno KV set failed", {
        key: key.map((k) => typeof k === "string" ? k : String(k)),
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const kvError = new DenoKvError(
        error instanceof Error ? error.message : String(error),
        "kv",
        { cause: error },
      );
      if (shouldThrow) {
        throw kvError;
      }
      return createDenoKvSetFailure(kvError, duration);
    }
  }

  async delete(
    key: Deno.KvKey,
    options?: DenoKvGetDeleteOptions,
  ): Promise<DenoKvDeleteResultType> {
    const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
      false;
    const start = performance.now();

    // Log delete operation start
    logger.debug("Deno KV delete starting", {
      key: key.map((k) => typeof k === "string" ? k : String(k)),
    });

    try {
      await this.#kv.delete(key);
      const duration = performance.now() - start;

      // Log delete operation result
      logger.debug("Deno KV delete completed", {
        key: key.map((k) => typeof k === "string" ? k : String(k)),
        duration: `${duration.toFixed(2)}ms`,
      });

      return {
        kind: "deno-kv:delete",
        ok: true as const,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - start;
      logger.debug("Deno KV delete failed", {
        key: key.map((k) => typeof k === "string" ? k : String(k)),
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const kvError = new DenoKvError(
        error instanceof Error ? error.message : String(error),
        "kv",
        { cause: error },
      );
      if (shouldThrow) {
        throw kvError;
      }
      return createDenoKvDeleteFailure(kvError, duration);
    }
  }

  async list<T>(
    selector: Deno.KvListSelector,
    options?: DenoKvListOptions,
  ): Promise<DenoKvListResultType<T>> {
    const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
      false;
    const start = performance.now();

    // Log list operation start
    const selectorInfo = "prefix" in selector
      ? {
        prefix: (selector.prefix as Deno.KvKey).map((k) =>
          typeof k === "string" ? k : String(k)
        ),
      }
      : {
        start: (selector.start as Deno.KvKey).map((k) =>
          typeof k === "string" ? k : String(k)
        ),
        end: (selector.end as Deno.KvKey).map((k) =>
          typeof k === "string" ? k : String(k)
        ),
      };
    logger.debug("Deno KV list starting", {
      selector: selectorInfo,
      limit: options?.limit,
    });

    try {
      const iter = this.#kv.list<T>(selector, {
        limit: options?.limit,
        cursor: options?.cursor,
        reverse: options?.reverse,
      });

      const entries: DenoKvEntry<T>[] = [];
      for await (const entry of iter) {
        entries.push({
          key: entry.key,
          value: entry.value,
          versionstamp: entry.versionstamp,
        });
      }

      const duration = performance.now() - start;

      // Log list operation result
      logger.debug("Deno KV list completed", {
        selector: selectorInfo,
        limit: options?.limit,
        returned: entries.length,
        duration: `${duration.toFixed(2)}ms`,
      });

      // Log detailed content
      logger.trace("Deno KV list details", {
        entries: entries.map((e) => ({
          value: formatValue(e.value),
        })),
      });

      return {
        kind: "deno-kv:list",
        ok: true as const,
        entries: createDenoKvEntries(entries),
        duration,
      };
    } catch (error) {
      const duration = performance.now() - start;
      logger.debug("Deno KV list failed", {
        selector: selectorInfo,
        limit: options?.limit,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const kvError = new DenoKvError(
        error instanceof Error ? error.message : String(error),
        "kv",
        { cause: error },
      );
      if (shouldThrow) {
        throw kvError;
      }
      return createDenoKvListFailure(kvError, duration);
    }
  }

  atomic(): DenoKvAtomicBuilder {
    return new DenoKvAtomicBuilderImpl(this.#kv, this.config);
  }

  async close(): Promise<void> {
    logger.debug("Deno KV client closing");
    this.#kv.close();
    await Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

/**
 * Create a new Deno KV client instance.
 *
 * The client provides key-value operations with support for atomic transactions,
 * time-to-live (TTL), and prefix-based listing.
 *
 * @param config - Deno KV client configuration (optional)
 * @returns A promise resolving to a new Deno KV client instance
 *
 * @example Basic usage with in-memory database
 * ```ts
 * import { createDenoKvClient } from "@probitas/client-deno-kv";
 *
 * interface User {
 *   name: string;
 *   email: string;
 * }
 *
 * const kv = await createDenoKvClient();
 *
 * await kv.set(["users", "123"], { name: "Alice", email: "alice@example.com" });
 *
 * const result = await kv.get<User>(["users", "123"]);
 * if (!result.ok) throw new Error("Get failed");
 * console.log(result.value);  // { name: "Alice", email: "alice@example.com" }
 *
 * await kv.close();
 * ```
 *
 * @example Using persistent storage
 * ```ts
 * import { createDenoKvClient } from "@probitas/client-deno-kv";
 *
 * const kv = await createDenoKvClient({
 *   path: "./data.kv",
 * });
 *
 * await kv.close();
 * ```
 *
 * @example Set with expiration (TTL)
 * ```ts
 * import { createDenoKvClient } from "@probitas/client-deno-kv";
 *
 * const kv = await createDenoKvClient();
 * const sessionId = "abc123";
 * const sessionData = { userId: "123", token: "xyz" };
 *
 * await kv.set(["sessions", sessionId], sessionData, {
 *   expireIn: 3600_000,  // Expire in 1 hour
 * });
 *
 * await kv.close();
 * ```
 *
 * @example List entries by prefix
 * ```ts
 * import { createDenoKvClient } from "@probitas/client-deno-kv";
 *
 * interface User {
 *   name: string;
 *   email: string;
 * }
 *
 * const kv = await createDenoKvClient();
 *
 * const result = await kv.list<User>({ prefix: ["users"] });
 * if (!result.ok) throw new Error("List failed");
 * for (const entry of result.entries) {
 *   console.log(entry.key, entry.value);
 * }
 *
 * await kv.close();
 * ```
 *
 * @example Atomic transactions
 * ```ts
 * import { createDenoKvClient } from "@probitas/client-deno-kv";
 *
 * const kv = await createDenoKvClient();
 *
 * const atomicResult = await kv.atomic()
 *   .check({ key: ["counter"], versionstamp: null })
 *   .set(["counter"], 1)
 *   .commit();
 *
 * await kv.close();
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * import { createDenoKvClient } from "@probitas/client-deno-kv";
 *
 * await using kv = await createDenoKvClient();
 *
 * await kv.set(["test"], "value");
 * // Client automatically closed when scope exits
 * ```
 */
export async function createDenoKvClient(
  config?: DenoKvClientConfig,
): Promise<DenoKvClient> {
  const kv = await Deno.openKv(config?.path);
  return new DenoKvClientImpl(kv, config ?? {});
}
