import type { ClientResult } from "@probitas/client";

/**
 * Base interface for Redis operation results.
 * All Redis result types extend this interface.
 */
interface RedisResultBase<T = unknown> extends ClientResult {
  readonly kind: string;
  readonly value: T;
}

/**
 * Redis operation result (common/generic)
 */
export interface RedisCommonResult<T = unknown> extends RedisResultBase<T> {
  readonly kind: "redis:common";
}

/**
 * Redis GET result
 */
export interface RedisGetResult extends RedisResultBase<string | null> {
  readonly kind: "redis:get";
}

/**
 * Redis SET result
 */
export interface RedisSetResult extends RedisResultBase<"OK"> {
  readonly kind: "redis:set";
}

/**
 * Redis numeric result (DEL, LPUSH, SADD, etc.)
 */
export interface RedisCountResult extends RedisResultBase<number> {
  readonly kind: "redis:count";
}

/**
 * Redis array result (LRANGE, SMEMBERS, etc.)
 */
export interface RedisArrayResult<T = string>
  extends RedisResultBase<readonly T[]> {
  readonly kind: "redis:array";
}

/**
 * Redis hash result (HGETALL)
 */
export interface RedisHashResult
  extends RedisResultBase<Record<string, string>> {
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
