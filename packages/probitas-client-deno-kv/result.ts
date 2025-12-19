import type { ClientResult } from "@probitas/client";
import type { DenoKvError, DenoKvFailureError } from "./errors.ts";

// ============================================================================
// DenoKvGetResult
// ============================================================================

/**
 * Base interface for get operation results.
 */
// deno-lint-ignore no-explicit-any
interface DenoKvGetResultBase<T = any> extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:get"` for KV get operations.
   */
  readonly kind: "deno-kv:get";

  /**
   * Whether the operation was processed by the server.
   */
  readonly processed: boolean;

  /**
   * Whether the operation was successful.
   */
  readonly ok: boolean;

  /**
   * Error that occurred during the operation.
   */
  readonly error: DenoKvError | DenoKvFailureError | null;

  /**
   * The key that was requested (null for connection failures).
   */
  readonly key: Deno.KvKey | null;

  /**
   * The retrieved value (null if key doesn't exist or operation failed).
   */
  readonly value: T | null;

  /**
   * Version identifier for optimistic concurrency (null if key doesn't exist or failed).
   */
  readonly versionstamp: string | null;
}

/**
 * Successful get operation result.
 */
// deno-lint-ignore no-explicit-any
export interface DenoKvGetResultSuccess<T = any>
  extends DenoKvGetResultBase<T> {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly key: Deno.KvKey;
  readonly value: T | null;
  readonly versionstamp: string | null;
}

/**
 * Get operation result with KV error (quota exceeded, etc.).
 */
// deno-lint-ignore no-explicit-any
export interface DenoKvGetResultError<T = any> extends DenoKvGetResultBase<T> {
  readonly processed: true;
  readonly ok: false;
  readonly error: DenoKvError;
  readonly key: Deno.KvKey;
  readonly value: null;
  readonly versionstamp: null;
}

/**
 * Get operation result with connection failure.
 */
// deno-lint-ignore no-explicit-any
export interface DenoKvGetResultFailure<T = any>
  extends DenoKvGetResultBase<T> {
  readonly processed: false;
  readonly ok: false;
  readonly error: DenoKvFailureError;
  readonly key: null;
  readonly value: null;
  readonly versionstamp: null;
}

/**
 * Result of a get operation.
 *
 * Use `ok` to check for success, then narrow the type:
 * - `ok === true`: Success - value may be present
 * - `ok === false && processed === true`: KV error (quota, etc.)
 * - `ok === false && processed === false`: Connection failure
 */
// deno-lint-ignore no-explicit-any
export type DenoKvGetResult<T = any> =
  | DenoKvGetResultSuccess<T>
  | DenoKvGetResultError<T>
  | DenoKvGetResultFailure<T>;

/**
 * Implementation class for DenoKvGetResultSuccess.
 * @internal
 */
// deno-lint-ignore no-explicit-any
export class DenoKvGetResultSuccessImpl<T = any>
  implements DenoKvGetResultSuccess<T> {
  readonly kind = "deno-kv:get" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly key: Deno.KvKey;
  readonly value: T | null;
  readonly versionstamp: string | null;
  readonly duration: number;

  constructor(params: {
    key: Deno.KvKey;
    value: T | null;
    versionstamp: string | null;
    duration: number;
  }) {
    this.key = params.key;
    this.value = params.value;
    this.versionstamp = params.versionstamp;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for DenoKvGetResultError.
 * @internal
 */
// deno-lint-ignore no-explicit-any
export class DenoKvGetResultErrorImpl<T = any>
  implements DenoKvGetResultError<T> {
  readonly kind = "deno-kv:get" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: DenoKvError;
  readonly key: Deno.KvKey;
  readonly value = null;
  readonly versionstamp = null;
  readonly duration: number;

  constructor(params: {
    key: Deno.KvKey;
    error: DenoKvError;
    duration: number;
  }) {
    this.key = params.key;
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for DenoKvGetResultFailure.
 * @internal
 */
// deno-lint-ignore no-explicit-any
export class DenoKvGetResultFailureImpl<T = any>
  implements DenoKvGetResultFailure<T> {
  readonly kind = "deno-kv:get" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: DenoKvFailureError;
  readonly key = null;
  readonly value = null;
  readonly versionstamp = null;
  readonly duration: number;

  constructor(params: {
    error: DenoKvFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// DenoKvSetResult
// ============================================================================

/**
 * Base interface for set operation results.
 */
interface DenoKvSetResultBase extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:set"` for KV set operations.
   */
  readonly kind: "deno-kv:set";

  /**
   * Whether the operation was processed by the server.
   */
  readonly processed: boolean;

  /**
   * Whether the operation was successful.
   */
  readonly ok: boolean;

  /**
   * Error that occurred during the operation.
   */
  readonly error: DenoKvError | DenoKvFailureError | null;

  /**
   * Version identifier for the newly written value (null if failed).
   */
  readonly versionstamp: string | null;
}

/**
 * Successful set operation result.
 */
export interface DenoKvSetResultSuccess extends DenoKvSetResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly versionstamp: string;
}

/**
 * Set operation result with KV error (quota exceeded, etc.).
 */
export interface DenoKvSetResultError extends DenoKvSetResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: DenoKvError;
  readonly versionstamp: null;
}

/**
 * Set operation result with connection failure.
 */
export interface DenoKvSetResultFailure extends DenoKvSetResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: DenoKvFailureError;
  readonly versionstamp: null;
}

/**
 * Result of a set operation.
 */
export type DenoKvSetResult =
  | DenoKvSetResultSuccess
  | DenoKvSetResultError
  | DenoKvSetResultFailure;

/**
 * Implementation class for DenoKvSetResultSuccess.
 * @internal
 */
export class DenoKvSetResultSuccessImpl implements DenoKvSetResultSuccess {
  readonly kind = "deno-kv:set" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly versionstamp: string;
  readonly duration: number;

  constructor(params: {
    versionstamp: string;
    duration: number;
  }) {
    this.versionstamp = params.versionstamp;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for DenoKvSetResultError.
 * @internal
 */
export class DenoKvSetResultErrorImpl implements DenoKvSetResultError {
  readonly kind = "deno-kv:set" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: DenoKvError;
  readonly versionstamp = null;
  readonly duration: number;

  constructor(params: {
    error: DenoKvError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for DenoKvSetResultFailure.
 * @internal
 */
export class DenoKvSetResultFailureImpl implements DenoKvSetResultFailure {
  readonly kind = "deno-kv:set" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: DenoKvFailureError;
  readonly versionstamp = null;
  readonly duration: number;

  constructor(params: {
    error: DenoKvFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// DenoKvDeleteResult
// ============================================================================

/**
 * Base interface for delete operation results.
 */
interface DenoKvDeleteResultBase extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:delete"` for KV delete operations.
   */
  readonly kind: "deno-kv:delete";

  /**
   * Whether the operation was processed by the server.
   */
  readonly processed: boolean;

  /**
   * Whether the operation was successful.
   */
  readonly ok: boolean;

  /**
   * Error that occurred during the operation.
   */
  readonly error: DenoKvError | DenoKvFailureError | null;
}

/**
 * Successful delete operation result.
 */
export interface DenoKvDeleteResultSuccess extends DenoKvDeleteResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
}

/**
 * Delete operation result with KV error.
 */
export interface DenoKvDeleteResultError extends DenoKvDeleteResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: DenoKvError;
}

/**
 * Delete operation result with connection failure.
 */
export interface DenoKvDeleteResultFailure extends DenoKvDeleteResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: DenoKvFailureError;
}

/**
 * Result of a delete operation.
 */
export type DenoKvDeleteResult =
  | DenoKvDeleteResultSuccess
  | DenoKvDeleteResultError
  | DenoKvDeleteResultFailure;

/**
 * Implementation class for DenoKvDeleteResultSuccess.
 * @internal
 */
export class DenoKvDeleteResultSuccessImpl
  implements DenoKvDeleteResultSuccess {
  readonly kind = "deno-kv:delete" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly duration: number;

  constructor(params: {
    duration: number;
  }) {
    this.duration = params.duration;
  }
}

/**
 * Implementation class for DenoKvDeleteResultError.
 * @internal
 */
export class DenoKvDeleteResultErrorImpl implements DenoKvDeleteResultError {
  readonly kind = "deno-kv:delete" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: DenoKvError;
  readonly duration: number;

  constructor(params: {
    error: DenoKvError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for DenoKvDeleteResultFailure.
 * @internal
 */
export class DenoKvDeleteResultFailureImpl
  implements DenoKvDeleteResultFailure {
  readonly kind = "deno-kv:delete" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: DenoKvFailureError;
  readonly duration: number;

  constructor(params: {
    error: DenoKvFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// DenoKvListResult
// ============================================================================

/**
 * A single entry in the KV store.
 */
// deno-lint-ignore no-explicit-any
export interface DenoKvEntry<T = any> {
  readonly key: Deno.KvKey;
  readonly value: T;
  readonly versionstamp: string;
}

/**
 * Base interface for list operation results.
 */
// deno-lint-ignore no-explicit-any
interface DenoKvListResultBase<T = any> extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:list"` for KV list operations.
   */
  readonly kind: "deno-kv:list";

  /**
   * Whether the operation was processed by the server.
   */
  readonly processed: boolean;

  /**
   * Whether the operation was successful.
   */
  readonly ok: boolean;

  /**
   * Error that occurred during the operation.
   */
  readonly error: DenoKvError | DenoKvFailureError | null;

  /**
   * Array of entries matching the list selector.
   */
  readonly entries: readonly DenoKvEntry<T>[];
}

/**
 * Successful list operation result.
 */
// deno-lint-ignore no-explicit-any
export interface DenoKvListResultSuccess<T = any>
  extends DenoKvListResultBase<T> {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly entries: readonly DenoKvEntry<T>[];
}

/**
 * List operation result with KV error.
 */
// deno-lint-ignore no-explicit-any
export interface DenoKvListResultError<T = any>
  extends DenoKvListResultBase<T> {
  readonly processed: true;
  readonly ok: false;
  readonly error: DenoKvError;
  readonly entries: readonly DenoKvEntry<T>[];
}

/**
 * List operation result with connection failure.
 */
// deno-lint-ignore no-explicit-any
export interface DenoKvListResultFailure<T = any>
  extends DenoKvListResultBase<T> {
  readonly processed: false;
  readonly ok: false;
  readonly error: DenoKvFailureError;
  readonly entries: readonly DenoKvEntry<T>[];
}

/**
 * Result of a list operation.
 */
// deno-lint-ignore no-explicit-any
export type DenoKvListResult<T = any> =
  | DenoKvListResultSuccess<T>
  | DenoKvListResultError<T>
  | DenoKvListResultFailure<T>;

/**
 * Implementation class for DenoKvListResultSuccess.
 * @internal
 */
// deno-lint-ignore no-explicit-any
export class DenoKvListResultSuccessImpl<T = any>
  implements DenoKvListResultSuccess<T> {
  readonly kind = "deno-kv:list" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly entries: readonly DenoKvEntry<T>[];
  readonly duration: number;

  constructor(params: {
    entries: readonly DenoKvEntry<T>[];
    duration: number;
  }) {
    this.entries = params.entries;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for DenoKvListResultError.
 * @internal
 */
// deno-lint-ignore no-explicit-any
export class DenoKvListResultErrorImpl<T = any>
  implements DenoKvListResultError<T> {
  readonly kind = "deno-kv:list" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: DenoKvError;
  readonly entries: readonly DenoKvEntry<T>[] = [];
  readonly duration: number;

  constructor(params: {
    error: DenoKvError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for DenoKvListResultFailure.
 * @internal
 */
// deno-lint-ignore no-explicit-any
export class DenoKvListResultFailureImpl<T = any>
  implements DenoKvListResultFailure<T> {
  readonly kind = "deno-kv:list" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: DenoKvFailureError;
  readonly entries: readonly DenoKvEntry<T>[] = [];
  readonly duration: number;

  constructor(params: {
    error: DenoKvFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// DenoKvAtomicResult
// ============================================================================

/**
 * Base interface for atomic operation results.
 */
interface DenoKvAtomicResultBase extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"deno-kv:atomic"` for KV atomic operations.
   */
  readonly kind: "deno-kv:atomic";

  /**
   * Whether the operation was processed by the server.
   */
  readonly processed: boolean;

  /**
   * Whether the atomic operation was committed successfully.
   *
   * - `true`: All checks passed and mutations were applied
   * - `false`: Either a check failed, an error occurred, or connection failed
   */
  readonly ok: boolean;

  /**
   * Error that occurred during the operation.
   *
   * - `null` for success or check failure (check failure is not an error)
   * - `DenoKvError` for KV errors (quota exceeded, etc.)
   * - `DenoKvConnectionError` for connection failures
   */
  readonly error: DenoKvError | null;

  /**
   * Version identifier for the atomic commit (null if not committed).
   */
  readonly versionstamp: string | null;
}

/**
 * Atomic operation successfully committed.
 */
export interface DenoKvAtomicResultCommitted extends DenoKvAtomicResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly versionstamp: string;
}

/**
 * Atomic operation check failed (version mismatch).
 *
 * This is NOT an error - it's an expected outcome when using optimistic concurrency.
 * Retry the operation with updated versionstamps.
 */
export interface DenoKvAtomicResultCheckFailed extends DenoKvAtomicResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: null;
  readonly versionstamp: null;
}

/**
 * Atomic operation failed with KV error.
 */
export interface DenoKvAtomicResultError extends DenoKvAtomicResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: DenoKvError;
  readonly versionstamp: null;
}

/**
 * Atomic operation failed with connection error.
 */
export interface DenoKvAtomicResultFailure extends DenoKvAtomicResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: DenoKvFailureError;
  readonly versionstamp: null;
}

/**
 * Result of an atomic operation.
 *
 * Use `ok` and `error` to distinguish between outcomes:
 * - `ok === true`: Committed successfully
 * - `ok === false && error === null`: Check failed (retry with new versionstamp)
 * - `ok === false && error !== null`: KV error or connection failure
 */
export type DenoKvAtomicResult =
  | DenoKvAtomicResultCommitted
  | DenoKvAtomicResultCheckFailed
  | DenoKvAtomicResultError
  | DenoKvAtomicResultFailure;

/**
 * Implementation class for DenoKvAtomicResultCommitted.
 * @internal
 */
export class DenoKvAtomicResultCommittedImpl
  implements DenoKvAtomicResultCommitted {
  readonly kind = "deno-kv:atomic" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly versionstamp: string;
  readonly duration: number;

  constructor(params: {
    versionstamp: string;
    duration: number;
  }) {
    this.versionstamp = params.versionstamp;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for DenoKvAtomicResultCheckFailed.
 * @internal
 */
export class DenoKvAtomicResultCheckFailedImpl
  implements DenoKvAtomicResultCheckFailed {
  readonly kind = "deno-kv:atomic" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error = null;
  readonly versionstamp = null;
  readonly duration: number;

  constructor(params: {
    duration: number;
  }) {
    this.duration = params.duration;
  }
}

/**
 * Implementation class for DenoKvAtomicResultError.
 * @internal
 */
export class DenoKvAtomicResultErrorImpl implements DenoKvAtomicResultError {
  readonly kind = "deno-kv:atomic" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: DenoKvError;
  readonly versionstamp = null;
  readonly duration: number;

  constructor(params: {
    error: DenoKvError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for DenoKvAtomicResultFailure.
 * @internal
 */
export class DenoKvAtomicResultFailureImpl
  implements DenoKvAtomicResultFailure {
  readonly kind = "deno-kv:atomic" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: DenoKvFailureError;
  readonly versionstamp = null;
  readonly duration: number;

  constructor(params: {
    error: DenoKvFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// Union Types
// ============================================================================

/**
 * Union of all Deno KV result types.
 */
// deno-lint-ignore no-explicit-any
export type DenoKvResult<T = any> =
  | DenoKvGetResult<T>
  | DenoKvSetResult
  | DenoKvDeleteResult
  | DenoKvListResult<T>
  | DenoKvAtomicResult;
