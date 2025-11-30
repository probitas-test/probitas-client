import type { CommonOptions } from "@probitas/client";
import type {
  DenoKvClientConfig,
  DenoKvListOptions,
  DenoKvSetOptions,
} from "./types.ts";
import type {
  DenoKvDeleteResult,
  DenoKvEntry,
  DenoKvGetResult,
  DenoKvListResult,
  DenoKvSetResult,
} from "./results.ts";
import { createDenoKvEntries } from "./results.ts";
import type { DenoKvAtomicBuilder } from "./atomic.ts";
import { DenoKvAtomicBuilderImpl } from "./atomic.ts";

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
  get<T>(key: Deno.KvKey, options?: CommonOptions): Promise<DenoKvGetResult<T>>;

  /**
   * Get multiple values by keys.
   */
  getMany<T extends readonly unknown[]>(
    keys: readonly [...{ [K in keyof T]: Deno.KvKey }],
    options?: CommonOptions,
  ): Promise<{ [K in keyof T]: DenoKvGetResult<T[K]> }>;

  /**
   * Set a value.
   */
  set<T>(
    key: Deno.KvKey,
    value: T,
    options?: DenoKvSetOptions,
  ): Promise<DenoKvSetResult>;

  /**
   * Delete a key.
   */
  delete(key: Deno.KvKey, options?: CommonOptions): Promise<DenoKvDeleteResult>;

  /**
   * List entries by selector.
   */
  list<T>(
    selector: Deno.KvListSelector,
    options?: DenoKvListOptions,
  ): Promise<DenoKvListResult<T>>;

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
  }

  async get<T>(
    key: Deno.KvKey,
    _options?: CommonOptions,
  ): Promise<DenoKvGetResult<T>> {
    const start = performance.now();
    const entry = await this.#kv.get<T>(key);
    const duration = performance.now() - start;

    return {
      ok: true,
      key: entry.key,
      value: entry.value,
      versionstamp: entry.versionstamp,
      duration,
    };
  }

  async getMany<T extends readonly unknown[]>(
    keys: readonly [...{ [K in keyof T]: Deno.KvKey }],
    _options?: CommonOptions,
  ): Promise<{ [K in keyof T]: DenoKvGetResult<T[K]> }> {
    const start = performance.now();
    const entries = await this.#kv.getMany<[...T]>(keys);
    const duration = performance.now() - start;

    return entries.map((entry) => ({
      ok: true,
      key: entry.key,
      value: entry.value,
      versionstamp: entry.versionstamp,
      duration,
    })) as { [K in keyof T]: DenoKvGetResult<T[K]> };
  }

  async set<T>(
    key: Deno.KvKey,
    value: T,
    options?: DenoKvSetOptions,
  ): Promise<DenoKvSetResult> {
    const start = performance.now();
    const result = await this.#kv.set(key, value, {
      expireIn: options?.expireIn,
    });
    const duration = performance.now() - start;

    return {
      ok: result.ok,
      versionstamp: result.versionstamp,
      duration,
    };
  }

  async delete(
    key: Deno.KvKey,
    _options?: CommonOptions,
  ): Promise<DenoKvDeleteResult> {
    const start = performance.now();
    await this.#kv.delete(key);
    const duration = performance.now() - start;

    return {
      ok: true,
      duration,
    };
  }

  async list<T>(
    selector: Deno.KvListSelector,
    options?: DenoKvListOptions,
  ): Promise<DenoKvListResult<T>> {
    const start = performance.now();

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

    return {
      ok: true,
      entries: createDenoKvEntries(entries),
      duration,
    };
  }

  atomic(): DenoKvAtomicBuilder {
    return new DenoKvAtomicBuilderImpl(this.#kv);
  }

  async close(): Promise<void> {
    this.#kv.close();
    await Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

/**
 * Create a new Deno KV client.
 */
export async function createDenoKvClient(
  config?: DenoKvClientConfig,
): Promise<DenoKvClient> {
  const kv = await Deno.openKv(config?.path);
  return new DenoKvClientImpl(kv, config ?? {});
}
