import type { ClientResult } from "@probitas/client";

/**
 * Base interface for Redis operation results.
 * All Redis result types extend this interface.
 */
interface RedisResultBase<T = unknown> extends ClientResult {
  readonly kind: string;

  /**
   * The value returned by the Redis operation.
   *
   * Type varies based on the specific operation (string, number, array, etc.).
   */
  readonly value: T;
}

/**
 * Redis operation result (common/generic).
 *
 * Used for operations without a more specific result type.
 */
export interface RedisCommonResult<T = unknown> extends RedisResultBase<T> {
  /**
   * Result kind discriminator.
   *
   * Always `"redis:common"` for generic Redis operations.
   */
  readonly kind: "redis:common";
}

/**
 * Redis GET result.
 */
export interface RedisGetResult extends RedisResultBase<string | null> {
  /**
   * Result kind discriminator.
   *
   * Always `"redis:get"` for GET operations.
   */
  readonly kind: "redis:get";
}

/**
 * Redis SET result.
 */
export interface RedisSetResult extends RedisResultBase<"OK"> {
  /**
   * Result kind discriminator.
   *
   * Always `"redis:set"` for SET operations.
   */
  readonly kind: "redis:set";
}

/**
 * Redis numeric result (DEL, LPUSH, SADD, etc.).
 */
export interface RedisCountResult extends RedisResultBase<number> {
  /**
   * Result kind discriminator.
   *
   * Always `"redis:count"` for operations returning counts.
   */
  readonly kind: "redis:count";
}

/**
 * Redis array result (LRANGE, SMEMBERS, etc.).
 */
export interface RedisArrayResult<T = string>
  extends RedisResultBase<readonly T[]> {
  /**
   * Result kind discriminator.
   *
   * Always `"redis:array"` for operations returning arrays.
   */
  readonly kind: "redis:array";
}

/**
 * Redis hash result (HGETALL).
 */
export interface RedisHashResult
  extends RedisResultBase<Record<string, string>> {
  /**
   * Result kind discriminator.
   *
   * Always `"redis:hash"` for HGETALL operations.
   */
  readonly kind: "redis:hash";
}

/**
 * Union of all Redis result types.
 */
export type RedisResult<T = unknown> =
  | RedisCommonResult<T>
  | RedisGetResult
  | RedisSetResult
  | RedisCountResult
  | RedisArrayResult<T>
  | RedisHashResult;
