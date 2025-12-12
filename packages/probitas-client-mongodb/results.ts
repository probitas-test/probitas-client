import type { Document, MongoDocs } from "./types.ts";
import { MongoNotFoundError } from "./errors.ts";

/**
 * Query result (find, aggregate)
 */
export interface MongoFindResult<T = Document> {
  readonly type: "mongo:find";
  readonly ok: boolean;
  readonly docs: MongoDocs<T>;
  readonly duration: number;
}

/**
 * Insert one result
 */
export interface MongoInsertOneResult {
  readonly type: "mongo:insert-one";
  readonly ok: boolean;
  readonly insertedId: string;
  readonly duration: number;
}

/**
 * Insert many result
 */
export interface MongoInsertManyResult {
  readonly type: "mongo:insert-many";
  readonly ok: boolean;
  readonly insertedIds: readonly string[];
  readonly insertedCount: number;
  readonly duration: number;
}

/**
 * Update result
 */
export interface MongoUpdateResult {
  readonly type: "mongo:update";
  readonly ok: boolean;
  readonly matchedCount: number;
  readonly modifiedCount: number;
  readonly upsertedId?: string;
  readonly duration: number;
}

/**
 * Delete result
 */
export interface MongoDeleteResult {
  readonly type: "mongo:delete";
  readonly ok: boolean;
  readonly deletedCount: number;
  readonly duration: number;
}

/**
 * FindOne result
 */
export interface MongoFindOneResult<T = Document> {
  readonly type: "mongo:find-one";
  readonly ok: boolean;
  readonly doc: T | undefined;
  readonly duration: number;
}

/**
 * Count result
 */
export interface MongoCountResult {
  readonly type: "mongo:count";
  readonly ok: boolean;
  readonly count: number;
  readonly duration: number;
}

/**
 * Union of all MongoDB result types.
 */
// deno-lint-ignore no-explicit-any
export type MongoResult<T = any> =
  | MongoFindResult<T>
  | MongoInsertOneResult
  | MongoInsertManyResult
  | MongoUpdateResult
  | MongoDeleteResult
  | MongoFindOneResult<T>
  | MongoCountResult;

/**
 * Create a MongoDocs array from a regular array.
 */
export function createMongoDocs<T>(items: T[]): MongoDocs<T> {
  const arr = [...items] as unknown as MongoDocs<T>;

  Object.defineProperty(arr, "first", {
    value: function (): T | undefined {
      return this[0];
    },
    enumerable: false,
  });

  Object.defineProperty(arr, "firstOrThrow", {
    value: function (): T {
      if (this.length === 0) {
        throw new MongoNotFoundError("No documents found (firstOrThrow)");
      }
      return this[0];
    },
    enumerable: false,
  });

  Object.defineProperty(arr, "last", {
    value: function (): T | undefined {
      return this.length > 0 ? this[this.length - 1] : undefined;
    },
    enumerable: false,
  });

  Object.defineProperty(arr, "lastOrThrow", {
    value: function (): T {
      if (this.length === 0) {
        throw new MongoNotFoundError("No documents found (lastOrThrow)");
      }
      return this[this.length - 1];
    },
    enumerable: false,
  });

  return arr;
}
