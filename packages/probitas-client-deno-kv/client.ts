import { AbortError, TimeoutError } from "@probitas/client";
import { getLogger } from "@probitas/logger";
import {
  DenoKvConnectionError,
  DenoKvError,
  type DenoKvFailureError,
} from "./errors.ts";
import type {
  DenoKvAtomicOptions,
  DenoKvClientConfig,
  DenoKvDeleteOptions,
  DenoKvGetOptions,
  DenoKvListOptions,
  DenoKvSetOptions,
} from "./types.ts";
import type {
  DenoKvDeleteResult,
  DenoKvEntry,
  DenoKvGetResult,
  DenoKvListResult,
  DenoKvSetResult,
} from "./result.ts";
import {
  DenoKvDeleteResultErrorImpl,
  DenoKvDeleteResultFailureImpl,
  DenoKvDeleteResultSuccessImpl,
  DenoKvGetResultErrorImpl,
  DenoKvGetResultFailureImpl,
  DenoKvGetResultSuccessImpl,
  DenoKvListResultErrorImpl,
  DenoKvListResultFailureImpl,
  DenoKvListResultSuccessImpl,
  DenoKvSetResultErrorImpl,
  DenoKvSetResultFailureImpl,
  DenoKvSetResultSuccessImpl,
} from "./result.ts";
import type { DenoKvAtomicBuilder } from "./atomic.ts";
import { DenoKvAtomicBuilderImpl } from "./atomic.ts";

const logger = getLogger("probitas", "client", "deno-kv");

/**
 * Convert errors to DenoKv-specific errors.
 */
function convertDenoKvError(error: unknown): DenoKvError | DenoKvFailureError {
  if (error instanceof DenoKvError) {
    return error;
  }
  if (error instanceof AbortError || error instanceof TimeoutError) {
    return error;
  }
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return new AbortError(error.message, { cause: error });
    }
    return new DenoKvConnectionError(error.message, { cause: error });
  }
  return new DenoKvConnectionError(String(error));
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
  // deno-lint-ignore no-explicit-any
  get<T = any>(
    key: Deno.KvKey,
    options?: DenoKvGetOptions,
  ): Promise<DenoKvGetResult<T>>;

  /**
   * Get multiple values by keys.
   */
  // deno-lint-ignore no-explicit-any
  getMany<T extends readonly any[]>(
    keys: readonly [...{ [K in keyof T]: Deno.KvKey }],
    options?: DenoKvGetOptions,
  ): Promise<{ [K in keyof T]: DenoKvGetResult<T[K]> }>;

  /**
   * Set a value.
   */
  // deno-lint-ignore no-explicit-any
  set<T = any>(
    key: Deno.KvKey,
    value: T,
    options?: DenoKvSetOptions,
  ): Promise<DenoKvSetResult>;

  /**
   * Delete a key.
   */
  delete(
    key: Deno.KvKey,
    options?: DenoKvDeleteOptions,
  ): Promise<DenoKvDeleteResult>;

  /**
   * List entries by selector.
   */
  // deno-lint-ignore no-explicit-any
  list<T = any>(
    selector: Deno.KvListSelector,
    options?: DenoKvListOptions,
  ): Promise<DenoKvListResult<T>>;

  /**
   * Create an atomic operation builder.
   */
  atomic(options?: DenoKvAtomicOptions): DenoKvAtomicBuilder;

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

  /**
   * Check if throwOnError is enabled for this operation.
   */
  #shouldThrow(options?: { throwOnError?: boolean }): boolean {
    return options?.throwOnError ?? this.config.throwOnError ?? false;
  }

  // deno-lint-ignore no-explicit-any
  async get<T = any>(
    key: Deno.KvKey,
    options?: DenoKvGetOptions,
  ): Promise<DenoKvGetResult<T>> {
    const start = performance.now();
    const shouldThrow = this.#shouldThrow(options);

    // Log get operation start
    logger.info("Deno KV get starting", {
      key: key.map((k) => typeof k === "string" ? k : String(k)),
    });

    try {
      const entry = await this.#kv.get<T>(key);
      const duration = performance.now() - start;

      // Log get operation result
      logger.info("Deno KV get completed", {
        key: key.map((k) => typeof k === "string" ? k : String(k)),
        found: entry.value !== null,
        duration: `${duration.toFixed(2)}ms`,
      });

      return new DenoKvGetResultSuccessImpl<T>({
        key: entry.key,
        value: entry.value,
        versionstamp: entry.versionstamp,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - start;
      logger.debug("Deno KV get failed", {
        key: key.map((k) => typeof k === "string" ? k : String(k)),
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      // Handle AbortError and TimeoutError as Failure (not processed)
      if (error instanceof AbortError || error instanceof TimeoutError) {
        if (shouldThrow) {
          throw error;
        }
        return new DenoKvGetResultFailureImpl<T>({
          error,
          duration,
        });
      }

      const wrappedError = convertDenoKvError(error);

      if (shouldThrow) {
        throw wrappedError;
      }

      if (wrappedError instanceof DenoKvConnectionError) {
        return new DenoKvGetResultFailureImpl<T>({
          error: wrappedError,
          duration,
        });
      }

      return new DenoKvGetResultErrorImpl<T>({
        key,
        error: wrappedError,
        duration,
      });
    }
  }

  // deno-lint-ignore no-explicit-any
  async getMany<T extends readonly any[]>(
    keys: readonly [...{ [K in keyof T]: Deno.KvKey }],
    options?: DenoKvGetOptions,
  ): Promise<{ [K in keyof T]: DenoKvGetResult<T[K]> }> {
    const start = performance.now();
    const shouldThrow = this.#shouldThrow(options);

    // Log getMany operation start
    logger.info("Deno KV getMany starting", {
      count: keys.length,
    });

    try {
      const entries = await this.#kv.getMany<[...T]>(keys);
      const duration = performance.now() - start;

      // Log getMany operation result
      logger.info("Deno KV getMany completed", {
        count: keys.length,
        found: entries.filter((e) => e.value !== null).length,
        duration: `${duration.toFixed(2)}ms`,
      });

      return entries.map((entry) =>
        new DenoKvGetResultSuccessImpl({
          key: entry.key,
          value: entry.value,
          versionstamp: entry.versionstamp,
          duration,
        })
      ) as { [K in keyof T]: DenoKvGetResult<T[K]> };
    } catch (error) {
      const duration = performance.now() - start;
      logger.debug("Deno KV getMany failed", {
        count: keys.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      // Handle AbortError and TimeoutError as Failure (not processed)
      if (error instanceof AbortError || error instanceof TimeoutError) {
        if (shouldThrow) {
          throw error;
        }
        return keys.map(() =>
          new DenoKvGetResultFailureImpl({
            error,
            duration,
          })
        ) as { [K in keyof T]: DenoKvGetResult<T[K]> };
      }

      const wrappedError = convertDenoKvError(error);

      if (shouldThrow) {
        throw wrappedError;
      }

      // Return failure results for all keys
      if (wrappedError instanceof DenoKvConnectionError) {
        return keys.map(() =>
          new DenoKvGetResultFailureImpl({
            error: wrappedError,
            duration,
          })
        ) as { [K in keyof T]: DenoKvGetResult<T[K]> };
      }

      return keys.map((key) =>
        new DenoKvGetResultErrorImpl({
          key,
          error: wrappedError,
          duration,
        })
      ) as { [K in keyof T]: DenoKvGetResult<T[K]> };
    }
  }

  // deno-lint-ignore no-explicit-any
  async set<T = any>(
    key: Deno.KvKey,
    value: T,
    options?: DenoKvSetOptions,
  ): Promise<DenoKvSetResult> {
    const start = performance.now();
    const shouldThrow = this.#shouldThrow(options);

    // Log set operation start
    logger.info("Deno KV set starting", {
      key: key.map((k) => typeof k === "string" ? k : String(k)),
      expireIn: options?.expireIn,
    });

    try {
      const result = await this.#kv.set(key, value, {
        expireIn: options?.expireIn,
      });
      const duration = performance.now() - start;

      // Log set operation result
      logger.info("Deno KV set completed", {
        key: key.map((k) => typeof k === "string" ? k : String(k)),
        success: result.ok,
        duration: `${duration.toFixed(2)}ms`,
      });

      return new DenoKvSetResultSuccessImpl({
        versionstamp: result.versionstamp,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - start;
      logger.debug("Deno KV set failed", {
        key: key.map((k) => typeof k === "string" ? k : String(k)),
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      // Handle AbortError and TimeoutError as Failure (not processed)
      if (error instanceof AbortError || error instanceof TimeoutError) {
        if (shouldThrow) {
          throw error;
        }
        return new DenoKvSetResultFailureImpl({
          error,
          duration,
        });
      }

      const wrappedError = convertDenoKvError(error);

      if (shouldThrow) {
        throw wrappedError;
      }

      if (wrappedError instanceof DenoKvConnectionError) {
        return new DenoKvSetResultFailureImpl({
          error: wrappedError,
          duration,
        });
      }

      return new DenoKvSetResultErrorImpl({
        error: wrappedError,
        duration,
      });
    }
  }

  async delete(
    key: Deno.KvKey,
    options?: DenoKvDeleteOptions,
  ): Promise<DenoKvDeleteResult> {
    const start = performance.now();
    const shouldThrow = this.#shouldThrow(options);

    // Log delete operation start
    logger.info("Deno KV delete starting", {
      key: key.map((k) => typeof k === "string" ? k : String(k)),
    });

    try {
      await this.#kv.delete(key);
      const duration = performance.now() - start;

      // Log delete operation result
      logger.info("Deno KV delete completed", {
        key: key.map((k) => typeof k === "string" ? k : String(k)),
        duration: `${duration.toFixed(2)}ms`,
      });

      return new DenoKvDeleteResultSuccessImpl({
        duration,
      });
    } catch (error) {
      const duration = performance.now() - start;
      logger.debug("Deno KV delete failed", {
        key: key.map((k) => typeof k === "string" ? k : String(k)),
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      // Handle AbortError and TimeoutError as Failure (not processed)
      if (error instanceof AbortError || error instanceof TimeoutError) {
        if (shouldThrow) {
          throw error;
        }
        return new DenoKvDeleteResultFailureImpl({
          error,
          duration,
        });
      }

      const wrappedError = convertDenoKvError(error);

      if (shouldThrow) {
        throw wrappedError;
      }

      if (wrappedError instanceof DenoKvConnectionError) {
        return new DenoKvDeleteResultFailureImpl({
          error: wrappedError,
          duration,
        });
      }

      return new DenoKvDeleteResultErrorImpl({
        error: wrappedError,
        duration,
      });
    }
  }

  // deno-lint-ignore no-explicit-any
  async list<T = any>(
    selector: Deno.KvListSelector,
    options?: DenoKvListOptions,
  ): Promise<DenoKvListResult<T>> {
    const start = performance.now();
    const shouldThrow = this.#shouldThrow(options);

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
    logger.info("Deno KV list starting", {
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
      logger.info("Deno KV list completed", {
        selector: selectorInfo,
        limit: options?.limit,
        returned: entries.length,
        duration: `${duration.toFixed(2)}ms`,
      });

      return new DenoKvListResultSuccessImpl<T>({
        entries,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - start;
      logger.debug("Deno KV list failed", {
        selector: selectorInfo,
        limit: options?.limit,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      // Handle AbortError and TimeoutError as Failure (not processed)
      if (error instanceof AbortError || error instanceof TimeoutError) {
        if (shouldThrow) {
          throw error;
        }
        return new DenoKvListResultFailureImpl<T>({
          error,
          duration,
        });
      }

      const wrappedError = convertDenoKvError(error);

      if (shouldThrow) {
        throw wrappedError;
      }

      if (wrappedError instanceof DenoKvConnectionError) {
        return new DenoKvListResultFailureImpl<T>({
          error: wrappedError,
          duration,
        });
      }

      return new DenoKvListResultErrorImpl<T>({
        error: wrappedError,
        duration,
      });
    }
  }

  atomic(options?: DenoKvAtomicOptions): DenoKvAtomicBuilder {
    const throwOnError = options?.throwOnError ?? this.config.throwOnError ??
      false;
    return new DenoKvAtomicBuilderImpl(this.#kv, { throwOnError });
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
 * if (result.ok) {
 *   console.log(result.value);  // { name: "Alice", email: "alice@example.com" }
 * }
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
 * if (result.ok) {
 *   for (const entry of result.entries) {
 *     console.log(entry.key, entry.value);
 *   }
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
 *
 * @example Error handling with Failure pattern
 * ```ts
 * import { createDenoKvClient } from "@probitas/client-deno-kv";
 *
 * async function example() {
 *   const kv = await createDenoKvClient();
 *
 *   const result = await kv.get<string>(["key"]);
 *
 *   if (!result.ok) {
 *     if (!result.processed) {
 *       // Connection failure
 *       console.error("Connection failed:", result.error.message);
 *     } else {
 *       // KV error (quota exceeded, etc.)
 *       console.error("KV error:", result.error.message);
 *     }
 *     await kv.close();
 *     return;
 *   }
 *
 *   console.log("Value:", result.value);
 *   await kv.close();
 * }
 * ```
 *
 * @example Using throwOnError for traditional exception handling
 * ```ts
 * import { createDenoKvClient, DenoKvError } from "@probitas/client-deno-kv";
 *
 * const kv = await createDenoKvClient({ throwOnError: true });
 *
 * try {
 *   const result = await kv.get<string>(["key"]);
 *   console.log("Value:", result.value);
 * } catch (error) {
 *   if (error instanceof DenoKvError) {
 *     console.error("KV error:", error.message);
 *   }
 * }
 *
 * await kv.close();
 * ```
 */
export async function createDenoKvClient(
  config?: DenoKvClientConfig,
): Promise<DenoKvClient> {
  const kv = await Deno.openKv(config?.path);
  return new DenoKvClientImpl(kv, config ?? {});
}
