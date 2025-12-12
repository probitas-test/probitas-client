import { getLogger } from "@probitas/logger";
import type { DenoKvAtomicResult } from "./results.ts";

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
  #operationCount: number = 0;

  constructor(kv: Deno.Kv) {
    this.#atomic = kv.atomic();
  }

  check(...checks: Deno.AtomicCheck[]): this {
    for (const check of checks) {
      this.#atomic.check(check);
      this.#checks.push(check);
    }
    logger.debug("Deno KV atomic check added", {
      checkCount: checks.length,
      totalChecks: this.#checks.length,
    });
    return this;
  }

  set<T>(key: Deno.KvKey, value: T, options?: { expireIn?: number }): this {
    this.#atomic.set(key, value, options);
    this.#operationCount++;
    logger.debug("Deno KV atomic set added", {
      key: key.map((k) => typeof k === "string" ? k : String(k)),
      expireIn: options?.expireIn,
      operationCount: this.#operationCount,
    });
    logger.trace("Deno KV atomic set details", {
      value: formatValue(value),
    });
    return this;
  }

  delete(key: Deno.KvKey): this {
    this.#atomic.delete(key);
    this.#operationCount++;
    logger.debug("Deno KV atomic delete added", {
      key: key.map((k) => typeof k === "string" ? k : String(k)),
      operationCount: this.#operationCount,
    });
    return this;
  }

  sum(key: Deno.KvKey, n: bigint): this {
    this.#atomic.sum(key, n);
    this.#operationCount++;
    logger.debug("Deno KV atomic sum added", {
      key: key.map((k) => typeof k === "string" ? k : String(k)),
      value: n.toString(),
      operationCount: this.#operationCount,
    });
    return this;
  }

  min(key: Deno.KvKey, n: bigint): this {
    this.#atomic.min(key, n);
    this.#operationCount++;
    logger.debug("Deno KV atomic min added", {
      key: key.map((k) => typeof k === "string" ? k : String(k)),
      value: n.toString(),
      operationCount: this.#operationCount,
    });
    return this;
  }

  max(key: Deno.KvKey, n: bigint): this {
    this.#atomic.max(key, n);
    this.#operationCount++;
    logger.debug("Deno KV atomic max added", {
      key: key.map((k) => typeof k === "string" ? k : String(k)),
      value: n.toString(),
      operationCount: this.#operationCount,
    });
    return this;
  }

  async commit(): Promise<DenoKvAtomicResult> {
    const start = performance.now();

    // Log atomic commit start
    logger.debug("Deno KV atomic commit starting", {
      operationCount: this.#operationCount,
      checkCount: this.#checks.length,
    });

    try {
      const result = await this.#atomic.commit();
      const duration = performance.now() - start;

      // Log atomic commit result
      logger.debug("Deno KV atomic commit completed", {
        operationCount: this.#operationCount,
        checkCount: this.#checks.length,
        success: result.ok,
        duration: `${duration.toFixed(2)}ms`,
      });

      // Log detailed content
      logger.trace("Deno KV atomic commit details", {
        versionstamp: result.ok ? result.versionstamp : null,
      });

      if (result.ok) {
        return {
          kind: "deno-kv:atomic",
          ok: true,
          versionstamp: result.versionstamp,
          duration,
        };
      }

      return {
        kind: "deno-kv:atomic",
        ok: false,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - start;
      logger.error("Deno KV atomic commit failed", {
        operationCount: this.#operationCount,
        checkCount: this.#checks.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
