import type { ClientResult } from "@probitas/client";
import type { DenoKvError } from "./errors.ts";

/**
 * Result of a successful get operation.
 */
export interface DenoKvGetResult<T> extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:get"` for KV get operations.
   */
  readonly kind: "deno-kv:get";

  /**
   * Indicates successful operation.
   */
  readonly ok: true;

  /**
   * The key that was requested.
   */
  readonly key: Deno.KvKey;

  /**
   * The retrieved value (null if key doesn't exist).
   */
  readonly value: T | null;

  /**
   * Version identifier for optimistic concurrency (null if key doesn't exist).
   */
  readonly versionstamp: string | null;
}

/**
 * Result of a failed get operation.
 */
export interface DenoKvGetResultFailure {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:get"` for KV get operations.
   */
  readonly kind: "deno-kv:get";

  /**
   * Indicates failed operation.
   */
  readonly ok: false;

  /**
   * The key that was requested.
   */
  readonly key: Deno.KvKey;

  /**
   * The error that occurred.
   */
  readonly error: DenoKvError;

  /**
   * Operation duration in milliseconds.
   */
  readonly duration: number;
}

/**
 * Union type for get operation results.
 */
export type DenoKvGetResultType<T> =
  | DenoKvGetResult<T>
  | DenoKvGetResultFailure;

/**
 * Creates a failure result for get operations.
 */
export function createDenoKvGetFailure(
  error: DenoKvError,
  key: Deno.KvKey,
  duration: number,
): DenoKvGetResultFailure {
  return {
    kind: "deno-kv:get",
    ok: false,
    key,
    error,
    duration,
  };
}

/**
 * Result of a successful set operation.
 */
export interface DenoKvSetResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:set"` for KV set operations.
   */
  readonly kind: "deno-kv:set";

  /**
   * Indicates successful operation.
   */
  readonly ok: true;

  /**
   * Version identifier for the newly written value.
   *
   * Use this for subsequent conditional updates.
   */
  readonly versionstamp: string;
}

/**
 * Result of a failed set operation.
 */
export interface DenoKvSetResultFailure {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:set"` for KV set operations.
   */
  readonly kind: "deno-kv:set";

  /**
   * Indicates failed operation.
   */
  readonly ok: false;

  /**
   * The error that occurred.
   */
  readonly error: DenoKvError;

  /**
   * Operation duration in milliseconds.
   */
  readonly duration: number;
}

/**
 * Union type for set operation results.
 */
export type DenoKvSetResultType = DenoKvSetResult | DenoKvSetResultFailure;

/**
 * Creates a failure result for set operations.
 */
export function createDenoKvSetFailure(
  error: DenoKvError,
  duration: number,
): DenoKvSetResultFailure {
  return {
    kind: "deno-kv:set",
    ok: false,
    error,
    duration,
  };
}

/**
 * Result of a successful delete operation.
 */
export interface DenoKvDeleteResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:delete"` for KV delete operations.
   */
  readonly kind: "deno-kv:delete";

  /**
   * Indicates successful operation.
   */
  readonly ok: true;
}

/**
 * Result of a failed delete operation.
 */
export interface DenoKvDeleteResultFailure {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:delete"` for KV delete operations.
   */
  readonly kind: "deno-kv:delete";

  /**
   * Indicates failed operation.
   */
  readonly ok: false;

  /**
   * The error that occurred.
   */
  readonly error: DenoKvError;

  /**
   * Operation duration in milliseconds.
   */
  readonly duration: number;
}

/**
 * Union type for delete operation results.
 */
export type DenoKvDeleteResultType =
  | DenoKvDeleteResult
  | DenoKvDeleteResultFailure;

/**
 * Creates a failure result for delete operations.
 */
export function createDenoKvDeleteFailure(
  error: DenoKvError,
  duration: number,
): DenoKvDeleteResultFailure {
  return {
    kind: "deno-kv:delete",
    ok: false,
    error,
    duration,
  };
}

/**
 * A single entry in the KV store.
 */
export interface DenoKvEntry<T> {
  readonly key: Deno.KvKey;
  readonly value: T;
  readonly versionstamp: string;
}

/**
 * Collection of KV entries with helper methods.
 */
export interface DenoKvEntries<T> extends ReadonlyArray<DenoKvEntry<T>> {
  /**
   * Returns the first entry, or undefined if empty.
   */
  first(): DenoKvEntry<T> | undefined;

  /**
   * Returns the first entry, or throws if empty.
   */
  firstOrThrow(): DenoKvEntry<T>;

  /**
   * Returns the last entry, or undefined if empty.
   */
  last(): DenoKvEntry<T> | undefined;

  /**
   * Returns the last entry, or throws if empty.
   */
  lastOrThrow(): DenoKvEntry<T>;
}

/**
 * Implementation of DenoKvEntries.
 */
class DenoKvEntriesImpl<T> extends Array<DenoKvEntry<T>>
  implements DenoKvEntries<T> {
  first(): DenoKvEntry<T> | undefined {
    return this[0];
  }

  firstOrThrow(): DenoKvEntry<T> {
    const entry = this[0];
    if (entry === undefined) {
      throw new Error("No entries found");
    }
    return entry;
  }

  last(): DenoKvEntry<T> | undefined {
    return this[this.length - 1];
  }

  lastOrThrow(): DenoKvEntry<T> {
    const entry = this[this.length - 1];
    if (entry === undefined) {
      throw new Error("No entries found");
    }
    return entry;
  }
}

/**
 * Creates a DenoKvEntries instance from an array of entries.
 */
export function createDenoKvEntries<T>(
  entries: DenoKvEntry<T>[],
): DenoKvEntries<T> {
  const result = new DenoKvEntriesImpl<T>();
  result.push(...entries);
  return result;
}

/**
 * Result of a successful list operation.
 */
export interface DenoKvListResult<T> extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:list"` for KV list operations.
   */
  readonly kind: "deno-kv:list";

  /**
   * Indicates successful operation.
   */
  readonly ok: true;

  /**
   * Array of entries matching the list selector.
   *
   * Includes helper methods like first(), last(), etc.
   */
  readonly entries: DenoKvEntries<T>;
}

/**
 * Result of a failed list operation.
 */
export interface DenoKvListResultFailure {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:list"` for KV list operations.
   */
  readonly kind: "deno-kv:list";

  /**
   * Indicates failed operation.
   */
  readonly ok: false;

  /**
   * The error that occurred.
   */
  readonly error: DenoKvError;

  /**
   * Operation duration in milliseconds.
   */
  readonly duration: number;
}

/**
 * Union type for list operation results.
 */
export type DenoKvListResultType<T> =
  | DenoKvListResult<T>
  | DenoKvListResultFailure;

/**
 * Creates a failure result for list operations.
 */
export function createDenoKvListFailure(
  error: DenoKvError,
  duration: number,
): DenoKvListResultFailure {
  return {
    kind: "deno-kv:list",
    ok: false,
    error,
    duration,
  };
}

/**
 * Result of a successful atomic operation.
 */
export interface DenoKvAtomicResultSuccess extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:atomic"` for KV atomic operations.
   */
  readonly kind: "deno-kv:atomic";

  /**
   * Indicates successful operation.
   */
  readonly ok: true;

  /**
   * Version identifier for the atomic commit.
   */
  readonly versionstamp: string;
}

/**
 * Result of an atomic operation that failed due to version check.
 * This is not an error - it's expected behavior when optimistic locking detects a conflict.
 */
export interface DenoKvAtomicResultCheckFailed extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:atomic"` for KV atomic operations.
   */
  readonly kind: "deno-kv:atomic";

  /**
   * Indicates the atomic operation failed due to version mismatch.
   */
  readonly ok: false;
}

/**
 * Result of an atomic operation that failed due to an error.
 */
export interface DenoKvAtomicResultFailure {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:atomic"` for KV atomic operations.
   */
  readonly kind: "deno-kv:atomic";

  /**
   * Indicates failed operation.
   */
  readonly ok: false;

  /**
   * The error that occurred.
   */
  readonly error: DenoKvError;

  /**
   * Operation duration in milliseconds.
   */
  readonly duration: number;
}

/**
 * Union type for atomic operation results (success or check failure).
 * Does not include error failures.
 */
export type DenoKvAtomicResult =
  | DenoKvAtomicResultSuccess
  | DenoKvAtomicResultCheckFailed;

/**
 * Union type for all atomic operation results including error failures.
 */
export type DenoKvAtomicResultType =
  | DenoKvAtomicResultSuccess
  | DenoKvAtomicResultCheckFailed
  | DenoKvAtomicResultFailure;

/**
 * Creates a failure result for atomic operations.
 */
export function createDenoKvAtomicFailure(
  error: DenoKvError,
  duration: number,
): DenoKvAtomicResultFailure {
  return {
    kind: "deno-kv:atomic",
    ok: false,
    error,
    duration,
  };
}

/**
 * Union of all Deno KV success result types.
 */
export type DenoKvResult<T = unknown> =
  | DenoKvGetResult<T>
  | DenoKvSetResult
  | DenoKvDeleteResult
  | DenoKvListResult<T>
  | DenoKvAtomicResultSuccess
  | DenoKvAtomicResultCheckFailed;

/**
 * Union of all Deno KV result types including failures.
 */
export type DenoKvResultType<T = unknown> =
  | DenoKvGetResultType<T>
  | DenoKvSetResultType
  | DenoKvDeleteResultType
  | DenoKvListResultType<T>
  | DenoKvAtomicResultType;
