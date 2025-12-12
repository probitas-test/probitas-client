import type { ClientResult } from "@probitas/client";
import type { Document, MongoDocs } from "./types.ts";
import { MongoNotFoundError } from "./errors.ts";

/**
 * Query result (find, aggregate)
 */
export interface MongoFindResult<T = Document> extends ClientResult {
  readonly kind: "mongo:find";
  readonly docs: MongoDocs<T>;
}

/**
 * Insert one result
 */
export interface MongoInsertOneResult extends ClientResult {
  readonly kind: "mongo:insert-one";
  readonly insertedId: string;
}

/**
 * Insert many result
 */
export interface MongoInsertManyResult extends ClientResult {
  readonly kind: "mongo:insert-many";
  readonly insertedIds: readonly string[];
  readonly insertedCount: number;
}

/**
 * Update result
 */
export interface MongoUpdateResult extends ClientResult {
  readonly kind: "mongo:update";
  readonly matchedCount: number;
  readonly modifiedCount: number;
  readonly upsertedId?: string;
}

/**
 * Delete result
 */
export interface MongoDeleteResult extends ClientResult {
  readonly kind: "mongo:delete";
  readonly deletedCount: number;
}

/**
 * FindOne result
 */
export interface MongoFindOneResult<T = Document> extends ClientResult {
  readonly kind: "mongo:find-one";
  readonly doc: T | undefined;
}

/**
 * Count result
 */
export interface MongoCountResult extends ClientResult {
  readonly kind: "mongo:count";
  readonly count: number;
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
