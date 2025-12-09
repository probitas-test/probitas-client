/**
 * Result of a get operation.
 */
export interface DenoKvGetResult<T> {
  readonly type: "deno-kv:get";
  readonly ok: boolean;
  readonly key: Deno.KvKey;
  readonly value: T | null;
  readonly versionstamp: string | null;
  readonly duration: number;
}

/**
 * Result of a set operation.
 */
export interface DenoKvSetResult {
  readonly type: "deno-kv:set";
  readonly ok: boolean;
  readonly versionstamp: string;
  readonly duration: number;
}

/**
 * Result of a delete operation.
 */
export interface DenoKvDeleteResult {
  readonly type: "deno-kv:delete";
  readonly ok: boolean;
  readonly duration: number;
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
 * Result of a list operation.
 */
export interface DenoKvListResult<T> {
  readonly type: "deno-kv:list";
  readonly ok: boolean;
  readonly entries: DenoKvEntries<T>;
  readonly duration: number;
}

/**
 * Result of an atomic operation.
 */
export interface DenoKvAtomicResult {
  readonly type: "deno-kv:atomic";
  readonly ok: boolean;
  readonly versionstamp?: string;
  readonly duration: number;
}

/**
 * Union of all Deno KV result types.
 */
export type DenoKvResult<T = unknown> =
  | DenoKvGetResult<T>
  | DenoKvSetResult
  | DenoKvDeleteResult
  | DenoKvListResult<T>
  | DenoKvAtomicResult;
