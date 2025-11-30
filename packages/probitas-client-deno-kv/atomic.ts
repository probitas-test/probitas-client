import type { DenoKvAtomicResult } from "./results.ts";

/**
 * Builder for atomic KV operations.
 */
export interface DenoKvAtomicBuilder {
  /**
   * Add version checks to the atomic operation.
   * If any check fails, the entire operation will fail.
   */
  check(...checks: Deno.AtomicCheck[]): this;

  /**
   * Set a value in the KV store.
   */
  set<T>(key: Deno.KvKey, value: T, options?: { expireIn?: number }): this;

  /**
   * Delete a key from the KV store.
   */
  delete(key: Deno.KvKey): this;

  /**
   * Atomically add to a bigint value (Deno.KvU64).
   */
  sum(key: Deno.KvKey, n: bigint): this;

  /**
   * Atomically set to minimum of current and provided value.
   */
  min(key: Deno.KvKey, n: bigint): this;

  /**
   * Atomically set to maximum of current and provided value.
   */
  max(key: Deno.KvKey, n: bigint): this;

  /**
   * Commit the atomic operation.
   */
  commit(): Promise<DenoKvAtomicResult>;
}

/**
 * Implementation of DenoKvAtomicBuilder.
 */
export class DenoKvAtomicBuilderImpl implements DenoKvAtomicBuilder {
  readonly #atomic: Deno.AtomicOperation;
  readonly #checks: Deno.AtomicCheck[] = [];

  constructor(kv: Deno.Kv) {
    this.#atomic = kv.atomic();
  }

  check(...checks: Deno.AtomicCheck[]): this {
    for (const check of checks) {
      this.#atomic.check(check);
      this.#checks.push(check);
    }
    return this;
  }

  set<T>(key: Deno.KvKey, value: T, options?: { expireIn?: number }): this {
    this.#atomic.set(key, value, options);
    return this;
  }

  delete(key: Deno.KvKey): this {
    this.#atomic.delete(key);
    return this;
  }

  sum(key: Deno.KvKey, n: bigint): this {
    this.#atomic.sum(key, n);
    return this;
  }

  min(key: Deno.KvKey, n: bigint): this {
    this.#atomic.min(key, n);
    return this;
  }

  max(key: Deno.KvKey, n: bigint): this {
    this.#atomic.max(key, n);
    return this;
  }

  async commit(): Promise<DenoKvAtomicResult> {
    const start = performance.now();
    const result = await this.#atomic.commit();
    const duration = performance.now() - start;

    if (result.ok) {
      return {
        ok: true,
        versionstamp: result.versionstamp,
        duration,
      };
    }

    return {
      ok: false,
      duration,
    };
  }
}
