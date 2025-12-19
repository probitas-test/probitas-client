import type { ClientResult } from "@probitas/client";
import type { Document } from "./types.ts";
import { MongoError, type MongoFailureError } from "./errors.ts";

// ============================================================================
// MongoFindResult
// ============================================================================

/**
 * Base interface for find result with common fields.
 */
interface MongoFindResultBase<T> extends ClientResult {
  readonly kind: "mongo:find";
  readonly docs: readonly T[] | null;
}

/**
 * Successful find result.
 */
export interface MongoFindResultSuccess<T = Document>
  extends MongoFindResultBase<T> {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly docs: readonly T[];
}

/**
 * Find result with MongoDB error.
 */
export interface MongoFindResultError<T = Document>
  extends MongoFindResultBase<T> {
  readonly processed: true;
  readonly ok: false;
  readonly error: MongoError;
  readonly docs: readonly T[];
}

/**
 * Find result with connection failure.
 */
export interface MongoFindResultFailure<T = Document>
  extends MongoFindResultBase<T> {
  readonly processed: false;
  readonly ok: false;
  readonly error: MongoFailureError;
  readonly docs: null;
}

/**
 * Query result (find, aggregate).
 */
export type MongoFindResult<T = Document> =
  | MongoFindResultSuccess<T>
  | MongoFindResultError<T>
  | MongoFindResultFailure<T>;

// ============================================================================
// MongoFindOneResult
// ============================================================================

/**
 * Base interface for findOne result with common fields.
 */
interface MongoFindOneResultBase<T> extends ClientResult {
  readonly kind: "mongo:find-one";
  readonly doc: T | null;
}

/**
 * Successful findOne result.
 */
export interface MongoFindOneResultSuccess<T = Document>
  extends MongoFindOneResultBase<T> {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly doc: T | null;
}

/**
 * FindOne result with MongoDB error.
 */
export interface MongoFindOneResultError<T = Document>
  extends MongoFindOneResultBase<T> {
  readonly processed: true;
  readonly ok: false;
  readonly error: MongoError;
  readonly doc: null;
}

/**
 * FindOne result with connection failure.
 */
export interface MongoFindOneResultFailure<T = Document>
  extends MongoFindOneResultBase<T> {
  readonly processed: false;
  readonly ok: false;
  readonly error: MongoFailureError;
  readonly doc: null;
}

/**
 * FindOne result.
 */
export type MongoFindOneResult<T = Document> =
  | MongoFindOneResultSuccess<T>
  | MongoFindOneResultError<T>
  | MongoFindOneResultFailure<T>;

// ============================================================================
// MongoInsertOneResult
// ============================================================================

/**
 * Base interface for insertOne result with common fields.
 */
interface MongoInsertOneResultBase extends ClientResult {
  readonly kind: "mongo:insert-one";
  readonly insertedId: string | null;
}

/**
 * Successful insertOne result.
 */
export interface MongoInsertOneResultSuccess extends MongoInsertOneResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly insertedId: string;
}

/**
 * InsertOne result with MongoDB error.
 */
export interface MongoInsertOneResultError extends MongoInsertOneResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: MongoError;
  readonly insertedId: null;
}

/**
 * InsertOne result with connection failure.
 */
export interface MongoInsertOneResultFailure extends MongoInsertOneResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: MongoFailureError;
  readonly insertedId: null;
}

/**
 * Insert one result.
 */
export type MongoInsertOneResult =
  | MongoInsertOneResultSuccess
  | MongoInsertOneResultError
  | MongoInsertOneResultFailure;

// ============================================================================
// MongoInsertManyResult
// ============================================================================

/**
 * Base interface for insertMany result with common fields.
 */
interface MongoInsertManyResultBase extends ClientResult {
  readonly kind: "mongo:insert-many";
  readonly insertedIds: readonly string[] | null;
  readonly insertedCount: number | null;
}

/**
 * Successful insertMany result.
 */
export interface MongoInsertManyResultSuccess
  extends MongoInsertManyResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly insertedIds: readonly string[];
  readonly insertedCount: number;
}

/**
 * InsertMany result with MongoDB error.
 */
export interface MongoInsertManyResultError extends MongoInsertManyResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: MongoError;
  readonly insertedIds: null;
  readonly insertedCount: null;
}

/**
 * InsertMany result with connection failure.
 */
export interface MongoInsertManyResultFailure
  extends MongoInsertManyResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: MongoFailureError;
  readonly insertedIds: null;
  readonly insertedCount: null;
}

/**
 * Insert many result.
 */
export type MongoInsertManyResult =
  | MongoInsertManyResultSuccess
  | MongoInsertManyResultError
  | MongoInsertManyResultFailure;

// ============================================================================
// MongoUpdateResult
// ============================================================================

/**
 * Base interface for update result with common fields.
 */
interface MongoUpdateResultBase extends ClientResult {
  readonly kind: "mongo:update";
  readonly matchedCount: number | null;
  readonly modifiedCount: number | null;
  readonly upsertedId: string | null;
}

/**
 * Successful update result.
 */
export interface MongoUpdateResultSuccess extends MongoUpdateResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly matchedCount: number;
  readonly modifiedCount: number;
  readonly upsertedId: string | null;
}

/**
 * Update result with MongoDB error.
 */
export interface MongoUpdateResultError extends MongoUpdateResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: MongoError;
  readonly matchedCount: null;
  readonly modifiedCount: null;
  readonly upsertedId: null;
}

/**
 * Update result with connection failure.
 */
export interface MongoUpdateResultFailure extends MongoUpdateResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: MongoFailureError;
  readonly matchedCount: null;
  readonly modifiedCount: null;
  readonly upsertedId: null;
}

/**
 * Update result.
 */
export type MongoUpdateResult =
  | MongoUpdateResultSuccess
  | MongoUpdateResultError
  | MongoUpdateResultFailure;

// ============================================================================
// MongoDeleteResult
// ============================================================================

/**
 * Base interface for delete result with common fields.
 */
interface MongoDeleteResultBase extends ClientResult {
  readonly kind: "mongo:delete";
  readonly deletedCount: number | null;
}

/**
 * Successful delete result.
 */
export interface MongoDeleteResultSuccess extends MongoDeleteResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly deletedCount: number;
}

/**
 * Delete result with MongoDB error.
 */
export interface MongoDeleteResultError extends MongoDeleteResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: MongoError;
  readonly deletedCount: null;
}

/**
 * Delete result with connection failure.
 */
export interface MongoDeleteResultFailure extends MongoDeleteResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: MongoFailureError;
  readonly deletedCount: null;
}

/**
 * Delete result.
 */
export type MongoDeleteResult =
  | MongoDeleteResultSuccess
  | MongoDeleteResultError
  | MongoDeleteResultFailure;

// ============================================================================
// MongoCountResult
// ============================================================================

/**
 * Base interface for count result with common fields.
 */
interface MongoCountResultBase extends ClientResult {
  readonly kind: "mongo:count";
  readonly count: number | null;
}

/**
 * Successful count result.
 */
export interface MongoCountResultSuccess extends MongoCountResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly count: number;
}

/**
 * Count result with MongoDB error.
 */
export interface MongoCountResultError extends MongoCountResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: MongoError;
  readonly count: null;
}

/**
 * Count result with connection failure.
 */
export interface MongoCountResultFailure extends MongoCountResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: MongoFailureError;
  readonly count: null;
}

/**
 * Count result.
 */
export type MongoCountResult =
  | MongoCountResultSuccess
  | MongoCountResultError
  | MongoCountResultFailure;

// ============================================================================
// Union Type
// ============================================================================

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

// ============================================================================
// MongoFindResult Implementation Classes
// ============================================================================

/**
 * Implementation class for MongoFindResultSuccess.
 * @internal
 */
export class MongoFindResultSuccessImpl<T = Document>
  implements MongoFindResultSuccess<T> {
  readonly kind = "mongo:find" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly docs: readonly T[];
  readonly duration: number;

  constructor(params: {
    docs: readonly T[];
    duration: number;
  }) {
    this.docs = params.docs;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoFindResultError.
 * @internal
 */
export class MongoFindResultErrorImpl<T = Document>
  implements MongoFindResultError<T> {
  readonly kind = "mongo:find" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: MongoError;
  readonly docs: readonly T[] = [];
  readonly duration: number;

  constructor(params: {
    error: MongoError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoFindResultFailure.
 * @internal
 */
export class MongoFindResultFailureImpl<T = Document>
  implements MongoFindResultFailure<T> {
  readonly kind = "mongo:find" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: MongoFailureError;
  readonly docs = null;
  readonly duration: number;

  constructor(params: {
    error: MongoFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// MongoFindOneResult Implementation Classes
// ============================================================================

/**
 * Implementation class for MongoFindOneResultSuccess.
 * @internal
 */
export class MongoFindOneResultSuccessImpl<T = Document>
  implements MongoFindOneResultSuccess<T> {
  readonly kind = "mongo:find-one" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly doc: T | null;
  readonly duration: number;

  constructor(params: {
    doc: T | null;
    duration: number;
  }) {
    this.doc = params.doc;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoFindOneResultError.
 * @internal
 */
export class MongoFindOneResultErrorImpl<T = Document>
  implements MongoFindOneResultError<T> {
  readonly kind = "mongo:find-one" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: MongoError;
  readonly doc = null;
  readonly duration: number;

  constructor(params: {
    error: MongoError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoFindOneResultFailure.
 * @internal
 */
export class MongoFindOneResultFailureImpl<T = Document>
  implements MongoFindOneResultFailure<T> {
  readonly kind = "mongo:find-one" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: MongoFailureError;
  readonly doc = null;
  readonly duration: number;

  constructor(params: {
    error: MongoFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// MongoInsertOneResult Implementation Classes
// ============================================================================

/**
 * Implementation class for MongoInsertOneResultSuccess.
 * @internal
 */
export class MongoInsertOneResultSuccessImpl
  implements MongoInsertOneResultSuccess {
  readonly kind = "mongo:insert-one" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly insertedId: string;
  readonly duration: number;

  constructor(params: {
    insertedId: string;
    duration: number;
  }) {
    this.insertedId = params.insertedId;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoInsertOneResultError.
 * @internal
 */
export class MongoInsertOneResultErrorImpl
  implements MongoInsertOneResultError {
  readonly kind = "mongo:insert-one" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: MongoError;
  readonly insertedId = null;
  readonly duration: number;

  constructor(params: {
    error: MongoError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoInsertOneResultFailure.
 * @internal
 */
export class MongoInsertOneResultFailureImpl
  implements MongoInsertOneResultFailure {
  readonly kind = "mongo:insert-one" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: MongoFailureError;
  readonly insertedId = null;
  readonly duration: number;

  constructor(params: {
    error: MongoFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// MongoInsertManyResult Implementation Classes
// ============================================================================

/**
 * Implementation class for MongoInsertManyResultSuccess.
 * @internal
 */
export class MongoInsertManyResultSuccessImpl
  implements MongoInsertManyResultSuccess {
  readonly kind = "mongo:insert-many" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly insertedIds: readonly string[];
  readonly insertedCount: number;
  readonly duration: number;

  constructor(params: {
    insertedIds: readonly string[];
    insertedCount: number;
    duration: number;
  }) {
    this.insertedIds = params.insertedIds;
    this.insertedCount = params.insertedCount;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoInsertManyResultError.
 * @internal
 */
export class MongoInsertManyResultErrorImpl
  implements MongoInsertManyResultError {
  readonly kind = "mongo:insert-many" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: MongoError;
  readonly insertedIds = null;
  readonly insertedCount = null;
  readonly duration: number;

  constructor(params: {
    error: MongoError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoInsertManyResultFailure.
 * @internal
 */
export class MongoInsertManyResultFailureImpl
  implements MongoInsertManyResultFailure {
  readonly kind = "mongo:insert-many" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: MongoFailureError;
  readonly insertedIds = null;
  readonly insertedCount = null;
  readonly duration: number;

  constructor(params: {
    error: MongoFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// MongoUpdateResult Implementation Classes
// ============================================================================

/**
 * Implementation class for MongoUpdateResultSuccess.
 * @internal
 */
export class MongoUpdateResultSuccessImpl implements MongoUpdateResultSuccess {
  readonly kind = "mongo:update" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly matchedCount: number;
  readonly modifiedCount: number;
  readonly upsertedId: string | null;
  readonly duration: number;

  constructor(params: {
    matchedCount: number;
    modifiedCount: number;
    upsertedId: string | null;
    duration: number;
  }) {
    this.matchedCount = params.matchedCount;
    this.modifiedCount = params.modifiedCount;
    this.upsertedId = params.upsertedId;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoUpdateResultError.
 * @internal
 */
export class MongoUpdateResultErrorImpl implements MongoUpdateResultError {
  readonly kind = "mongo:update" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: MongoError;
  readonly matchedCount = null;
  readonly modifiedCount = null;
  readonly upsertedId = null;
  readonly duration: number;

  constructor(params: {
    error: MongoError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoUpdateResultFailure.
 * @internal
 */
export class MongoUpdateResultFailureImpl implements MongoUpdateResultFailure {
  readonly kind = "mongo:update" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: MongoFailureError;
  readonly matchedCount = null;
  readonly modifiedCount = null;
  readonly upsertedId = null;
  readonly duration: number;

  constructor(params: {
    error: MongoFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// MongoDeleteResult Implementation Classes
// ============================================================================

/**
 * Implementation class for MongoDeleteResultSuccess.
 * @internal
 */
export class MongoDeleteResultSuccessImpl implements MongoDeleteResultSuccess {
  readonly kind = "mongo:delete" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly deletedCount: number;
  readonly duration: number;

  constructor(params: {
    deletedCount: number;
    duration: number;
  }) {
    this.deletedCount = params.deletedCount;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoDeleteResultError.
 * @internal
 */
export class MongoDeleteResultErrorImpl implements MongoDeleteResultError {
  readonly kind = "mongo:delete" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: MongoError;
  readonly deletedCount = null;
  readonly duration: number;

  constructor(params: {
    error: MongoError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoDeleteResultFailure.
 * @internal
 */
export class MongoDeleteResultFailureImpl implements MongoDeleteResultFailure {
  readonly kind = "mongo:delete" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: MongoFailureError;
  readonly deletedCount = null;
  readonly duration: number;

  constructor(params: {
    error: MongoFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// MongoCountResult Implementation Classes
// ============================================================================

/**
 * Implementation class for MongoCountResultSuccess.
 * @internal
 */
export class MongoCountResultSuccessImpl implements MongoCountResultSuccess {
  readonly kind = "mongo:count" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly count: number;
  readonly duration: number;

  constructor(params: {
    count: number;
    duration: number;
  }) {
    this.count = params.count;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoCountResultError.
 * @internal
 */
export class MongoCountResultErrorImpl implements MongoCountResultError {
  readonly kind = "mongo:count" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: MongoError;
  readonly count = null;
  readonly duration: number;

  constructor(params: {
    error: MongoError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for MongoCountResultFailure.
 * @internal
 */
export class MongoCountResultFailureImpl implements MongoCountResultFailure {
  readonly kind = "mongo:count" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: MongoFailureError;
  readonly count = null;
  readonly duration: number;

  constructor(params: {
    error: MongoFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}
