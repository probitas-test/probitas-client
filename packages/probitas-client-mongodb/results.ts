import type { ClientResult } from "@probitas/client";
import type { Document, MongoDocs } from "./types.ts";
import { MongoNotFoundError } from "./errors.ts";

/**
 * Query result (find, aggregate).
 */
export interface MongoFindResult<T = Document> extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"mongo:find"` for MongoDB find operations.
   */
  readonly kind: "mongo:find";

  /**
   * Array of documents matching the query.
   *
   * Includes helper methods like first(), last(), etc.
   */
  readonly docs: MongoDocs<T>;
}

/**
 * Insert one result.
 */
export interface MongoInsertOneResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"mongo:insert-one"` for single document inserts.
   */
  readonly kind: "mongo:insert-one";

  /**
   * ID of the inserted document.
   *
   * Serialized as string for consistency.
   */
  readonly insertedId: string;
}

/**
 * Insert many result.
 */
export interface MongoInsertManyResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"mongo:insert-many"` for batch inserts.
   */
  readonly kind: "mongo:insert-many";

  /**
   * Array of IDs for inserted documents.
   *
   * Order matches the input array.
   */
  readonly insertedIds: readonly string[];

  /**
   * Number of successfully inserted documents.
   */
  readonly insertedCount: number;
}

/**
 * Update result.
 */
export interface MongoUpdateResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"mongo:update"` for update operations.
   */
  readonly kind: "mongo:update";

  /**
   * Number of documents matching the filter.
   */
  readonly matchedCount: number;

  /**
   * Number of documents actually modified.
   *
   * May be less than matchedCount if documents already had the target values.
   */
  readonly modifiedCount: number;

  /**
   * ID of the upserted document (present only for upsert operations).
   */
  readonly upsertedId?: string;
}

/**
 * Delete result.
 */
export interface MongoDeleteResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"mongo:delete"` for delete operations.
   */
  readonly kind: "mongo:delete";

  /**
   * Number of documents deleted.
   */
  readonly deletedCount: number;
}

/**
 * FindOne result.
 */
export interface MongoFindOneResult<T = Document> extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"mongo:find-one"` for single document queries.
   */
  readonly kind: "mongo:find-one";

  /**
   * The found document (undefined if not found).
   */
  readonly doc: T | undefined;
}

/**
 * Count result.
 */
export interface MongoCountResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"mongo:count"` for count operations.
   */
  readonly kind: "mongo:count";

  /**
   * Number of documents matching the filter.
   */
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
