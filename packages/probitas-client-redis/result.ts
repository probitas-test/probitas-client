import type { ClientResult } from "@probitas/client";
import type { RedisFailureError, RedisOperationError } from "./errors.ts";

// ============================================================================
// Base Interfaces
// ============================================================================

/**
 * Base interface for Redis operation results.
 * All Redis result types extend this interface.
 */
interface RedisResultBase<K extends string> extends ClientResult {
  readonly kind: K;
  readonly duration: number;
}

// ============================================================================
// RedisGetResult
// ============================================================================

/**
 * Base interface for GET result with common fields.
 */
interface RedisGetResultBase extends RedisResultBase<"redis:get"> {
  readonly kind: "redis:get";
  readonly value: string | null;
}

/**
 * Successful GET result.
 */
export interface RedisGetResultSuccess extends RedisGetResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly value: string | null;
}

/**
 * GET result with Redis error.
 */
export interface RedisGetResultError extends RedisGetResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RedisOperationError;
  readonly value: null;
}

/**
 * GET result with connection failure.
 */
export interface RedisGetResultFailure extends RedisGetResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RedisFailureError;
  readonly value: null;
}

/**
 * Redis GET result.
 */
export type RedisGetResult =
  | RedisGetResultSuccess
  | RedisGetResultError
  | RedisGetResultFailure;

// ============================================================================
// RedisSetResult
// ============================================================================

/**
 * Base interface for SET result with common fields.
 */
interface RedisSetResultBase extends RedisResultBase<"redis:set"> {
  readonly kind: "redis:set";
  readonly value: "OK" | null;
}

/**
 * Successful SET result.
 */
export interface RedisSetResultSuccess extends RedisSetResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly value: "OK";
}

/**
 * SET result with Redis error.
 */
export interface RedisSetResultError extends RedisSetResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RedisOperationError;
  readonly value: null;
}

/**
 * SET result with connection failure.
 */
export interface RedisSetResultFailure extends RedisSetResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RedisFailureError;
  readonly value: null;
}

/**
 * Redis SET result.
 */
export type RedisSetResult =
  | RedisSetResultSuccess
  | RedisSetResultError
  | RedisSetResultFailure;

// ============================================================================
// RedisCountResult
// ============================================================================

/**
 * Base interface for count result with common fields.
 */
interface RedisCountResultBase extends RedisResultBase<"redis:count"> {
  readonly kind: "redis:count";
  readonly value: number | null;
}

/**
 * Successful count result.
 */
export interface RedisCountResultSuccess extends RedisCountResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly value: number;
}

/**
 * Count result with Redis error.
 */
export interface RedisCountResultError extends RedisCountResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RedisOperationError;
  readonly value: null;
}

/**
 * Count result with connection failure.
 */
export interface RedisCountResultFailure extends RedisCountResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RedisFailureError;
  readonly value: null;
}

/**
 * Redis numeric result (DEL, LPUSH, SADD, etc.).
 */
export type RedisCountResult =
  | RedisCountResultSuccess
  | RedisCountResultError
  | RedisCountResultFailure;

// ============================================================================
// RedisArrayResult
// ============================================================================

/**
 * Base interface for array result with common fields.
 */
interface RedisArrayResultBase<T = string>
  extends RedisResultBase<"redis:array"> {
  readonly kind: "redis:array";
  readonly value: readonly T[] | null;
}

/**
 * Successful array result.
 */
export interface RedisArrayResultSuccess<T = string>
  extends RedisArrayResultBase<T> {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly value: readonly T[];
}

/**
 * Array result with Redis error.
 */
export interface RedisArrayResultError<T = string>
  extends RedisArrayResultBase<T> {
  readonly processed: true;
  readonly ok: false;
  readonly error: RedisOperationError;
  readonly value: null;
}

/**
 * Array result with connection failure.
 */
export interface RedisArrayResultFailure<T = string>
  extends RedisArrayResultBase<T> {
  readonly processed: false;
  readonly ok: false;
  readonly error: RedisFailureError;
  readonly value: null;
}

/**
 * Redis array result (LRANGE, SMEMBERS, etc.).
 */
export type RedisArrayResult<T = string> =
  | RedisArrayResultSuccess<T>
  | RedisArrayResultError<T>
  | RedisArrayResultFailure<T>;

// ============================================================================
// RedisHashResult
// ============================================================================

/**
 * Base interface for hash result with common fields.
 */
interface RedisHashResultBase extends RedisResultBase<"redis:hash"> {
  readonly kind: "redis:hash";
  readonly value: Record<string, string> | null;
}

/**
 * Successful hash result.
 */
export interface RedisHashResultSuccess extends RedisHashResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly value: Record<string, string>;
}

/**
 * Hash result with Redis error.
 */
export interface RedisHashResultError extends RedisHashResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RedisOperationError;
  readonly value: null;
}

/**
 * Hash result with connection failure.
 */
export interface RedisHashResultFailure extends RedisHashResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RedisFailureError;
  readonly value: null;
}

/**
 * Redis hash result (HGETALL).
 */
export type RedisHashResult =
  | RedisHashResultSuccess
  | RedisHashResultError
  | RedisHashResultFailure;

// ============================================================================
// RedisCommonResult
// ============================================================================

/**
 * Base interface for common result with common fields.
 */
interface RedisCommonResultBase<T> extends RedisResultBase<"redis:common"> {
  readonly kind: "redis:common";
  readonly value: T | null;
}

/**
 * Successful common result.
 */
// deno-lint-ignore no-explicit-any
export interface RedisCommonResultSuccess<T = any>
  extends RedisCommonResultBase<T> {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly value: T;
}

/**
 * Common result with Redis error.
 */
// deno-lint-ignore no-explicit-any
export interface RedisCommonResultError<T = any>
  extends RedisCommonResultBase<T> {
  readonly processed: true;
  readonly ok: false;
  readonly error: RedisOperationError;
  readonly value: null;
}

/**
 * Common result with connection failure.
 */
// deno-lint-ignore no-explicit-any
export interface RedisCommonResultFailure<T = any>
  extends RedisCommonResultBase<T> {
  readonly processed: false;
  readonly ok: false;
  readonly error: RedisFailureError;
  readonly value: null;
}

/**
 * Redis operation result (common/generic).
 *
 * Used for operations without a more specific result type.
 */
// deno-lint-ignore no-explicit-any
export type RedisCommonResult<T = any> =
  | RedisCommonResultSuccess<T>
  | RedisCommonResultError<T>
  | RedisCommonResultFailure<T>;

// ============================================================================
// Union Type
// ============================================================================

/**
 * Union of all Redis result types.
 */
// deno-lint-ignore no-explicit-any
export type RedisResult<T = any> =
  | RedisCommonResult<T>
  | RedisGetResult
  | RedisSetResult
  | RedisCountResult
  | RedisArrayResult<T>
  | RedisHashResult;

// ============================================================================
// Result Impl Classes
// ============================================================================

/**
 * @internal
 */
export class RedisGetResultSuccessImpl implements RedisGetResultSuccess {
  readonly kind = "redis:get" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly value: string | null;
  readonly duration: number;

  constructor(value: string | null, duration: number) {
    this.value = value;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisGetResultErrorImpl implements RedisGetResultError {
  readonly kind = "redis:get" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: RedisOperationError;
  readonly value = null;
  readonly duration: number;

  constructor(error: RedisOperationError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisGetResultFailureImpl implements RedisGetResultFailure {
  readonly kind = "redis:get" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: RedisFailureError;
  readonly value = null;
  readonly duration: number;

  constructor(error: RedisFailureError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisSetResultSuccessImpl implements RedisSetResultSuccess {
  readonly kind = "redis:set" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly value = "OK" as const;
  readonly duration: number;

  constructor(duration: number) {
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisSetResultErrorImpl implements RedisSetResultError {
  readonly kind = "redis:set" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: RedisOperationError;
  readonly value = null;
  readonly duration: number;

  constructor(error: RedisOperationError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisSetResultFailureImpl implements RedisSetResultFailure {
  readonly kind = "redis:set" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: RedisFailureError;
  readonly value = null;
  readonly duration: number;

  constructor(error: RedisFailureError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisCountResultSuccessImpl implements RedisCountResultSuccess {
  readonly kind = "redis:count" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly value: number;
  readonly duration: number;

  constructor(value: number, duration: number) {
    this.value = value;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisCountResultErrorImpl implements RedisCountResultError {
  readonly kind = "redis:count" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: RedisOperationError;
  readonly value = null;
  readonly duration: number;

  constructor(error: RedisOperationError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisCountResultFailureImpl implements RedisCountResultFailure {
  readonly kind = "redis:count" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: RedisFailureError;
  readonly value = null;
  readonly duration: number;

  constructor(error: RedisFailureError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisArrayResultSuccessImpl<T = string>
  implements RedisArrayResultSuccess<T> {
  readonly kind = "redis:array" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly value: readonly T[];
  readonly duration: number;

  constructor(value: readonly T[], duration: number) {
    this.value = value;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisArrayResultErrorImpl<T = string>
  implements RedisArrayResultError<T> {
  readonly kind = "redis:array" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: RedisOperationError;
  readonly value = null;
  readonly duration: number;

  constructor(error: RedisOperationError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisArrayResultFailureImpl<T = string>
  implements RedisArrayResultFailure<T> {
  readonly kind = "redis:array" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: RedisFailureError;
  readonly value = null;
  readonly duration: number;

  constructor(error: RedisFailureError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisHashResultSuccessImpl implements RedisHashResultSuccess {
  readonly kind = "redis:hash" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly value: Record<string, string>;
  readonly duration: number;

  constructor(value: Record<string, string>, duration: number) {
    this.value = value;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisHashResultErrorImpl implements RedisHashResultError {
  readonly kind = "redis:hash" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: RedisOperationError;
  readonly value = null;
  readonly duration: number;

  constructor(error: RedisOperationError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisHashResultFailureImpl implements RedisHashResultFailure {
  readonly kind = "redis:hash" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: RedisFailureError;
  readonly value = null;
  readonly duration: number;

  constructor(error: RedisFailureError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisCommonResultSuccessImpl<T>
  implements RedisCommonResultSuccess<T> {
  readonly kind = "redis:common" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly value: T;
  readonly duration: number;

  constructor(value: T, duration: number) {
    this.value = value;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisCommonResultErrorImpl<T>
  implements RedisCommonResultError<T> {
  readonly kind = "redis:common" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: RedisOperationError;
  readonly value = null;
  readonly duration: number;

  constructor(error: RedisOperationError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * @internal
 */
export class RedisCommonResultFailureImpl<T>
  implements RedisCommonResultFailure<T> {
  readonly kind = "redis:common" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: RedisFailureError;
  readonly value = null;
  readonly duration: number;

  constructor(error: RedisFailureError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}
