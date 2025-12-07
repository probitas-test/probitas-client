import type { CommonConnectionConfig, CommonOptions } from "@probitas/client";

/**
 * Base interface for Redis operation results.
 * All Redis result types extend this interface.
 */
export interface RedisResultBase<T = unknown> {
  readonly type: string;
  readonly ok: boolean;
  readonly value: T;
  readonly duration: number;
}

/**
 * Redis operation result (common/generic)
 */
export interface RedisCommonResult<T = unknown> extends RedisResultBase<T> {
  readonly type: "redis:common";
}

/**
 * Redis GET result
 */
export interface RedisGetResult extends RedisResultBase<string | null> {
  readonly type: "redis:get";
}

/**
 * Redis SET result
 */
export interface RedisSetResult extends RedisResultBase<"OK"> {
  readonly type: "redis:set";
}

/**
 * Redis numeric result (DEL, LPUSH, SADD, etc.)
 */
export interface RedisCountResult extends RedisResultBase<number> {
  readonly type: "redis:count";
}

/**
 * Redis array result (LRANGE, SMEMBERS, etc.)
 */
export interface RedisArrayResult<T = string>
  extends RedisResultBase<readonly T[]> {
  readonly type: "redis:array";
}

/**
 * Redis hash result (HGETALL)
 */
export interface RedisHashResult
  extends RedisResultBase<Record<string, string>> {
  readonly type: "redis:hash";
}

/**
 * Union of all Redis result types.
 * Used by expectRedisResult to determine the appropriate expectation type.
 */
export type RedisResult<T = unknown> =
  | RedisCommonResult<T>
  | RedisGetResult
  | RedisSetResult
  | RedisCountResult
  | RedisArrayResult<T>
  | RedisHashResult;

/**
 * Redis SET options
 */
export interface RedisSetOptions extends CommonOptions {
  /** Expiration in seconds */
  readonly ex?: number;
  /** Expiration in milliseconds */
  readonly px?: number;
  /** Only set if key does not exist */
  readonly nx?: boolean;
  /** Only set if key exists */
  readonly xx?: boolean;
}

/**
 * Redis Pub/Sub message
 */
export interface RedisMessage {
  readonly channel: string;
  readonly message: string;
}

/**
 * Redis connection configuration.
 *
 * Extends CommonConnectionConfig with Redis-specific options.
 */
export interface RedisConnectionConfig extends CommonConnectionConfig {
  /**
   * Database index.
   * @default 0
   */
  readonly db?: number;
}

/**
 * Redis client configuration.
 */
export interface RedisClientConfig extends CommonOptions {
  /**
   * Redis connection URL or configuration object.
   *
   * @example
   * ```ts
   * // String URL
   * { url: "redis://localhost:6379" }
   *
   * // With password
   * { url: "redis://:password@localhost:6379/0" }
   *
   * // Config object
   * { url: { port: 6379, password: "secret", db: 1 } }
   * ```
   */
  readonly url: string | RedisConnectionConfig;
}

/**
 * Redis transaction interface
 */
export interface RedisTransaction {
  get(key: string): this;
  set(key: string, value: string, options?: RedisSetOptions): this;
  del(...keys: string[]): this;
  incr(key: string): this;
  decr(key: string): this;
  hget(key: string, field: string): this;
  hset(key: string, field: string, value: string): this;
  hgetall(key: string): this;
  hdel(key: string, ...fields: string[]): this;
  lpush(key: string, ...values: string[]): this;
  rpush(key: string, ...values: string[]): this;
  lpop(key: string): this;
  rpop(key: string): this;
  lrange(key: string, start: number, stop: number): this;
  llen(key: string): this;
  sadd(key: string, ...members: string[]): this;
  srem(key: string, ...members: string[]): this;
  smembers(key: string): this;
  sismember(key: string, member: string): this;
  zadd(key: string, ...entries: { score: number; member: string }[]): this;
  zrange(key: string, start: number, stop: number): this;
  zscore(key: string, member: string): this;
  exec(): Promise<RedisArrayResult<unknown>>;
  discard(): void;
}

/**
 * Redis client interface
 */
export interface RedisClient extends AsyncDisposable {
  readonly config: RedisClientConfig;

  // Strings
  get(key: string, options?: CommonOptions): Promise<RedisGetResult>;
  set(
    key: string,
    value: string,
    options?: RedisSetOptions,
  ): Promise<RedisSetResult>;
  del(...keys: string[]): Promise<RedisCountResult>;
  incr(key: string): Promise<RedisCountResult>;
  decr(key: string): Promise<RedisCountResult>;

  // Hashes
  hget(
    key: string,
    field: string,
    options?: CommonOptions,
  ): Promise<RedisGetResult>;
  hset(
    key: string,
    field: string,
    value: string,
    options?: CommonOptions,
  ): Promise<RedisCountResult>;
  hgetall(key: string, options?: CommonOptions): Promise<RedisHashResult>;
  hdel(key: string, ...fields: string[]): Promise<RedisCountResult>;

  // Lists
  lpush(key: string, ...values: string[]): Promise<RedisCountResult>;
  rpush(key: string, ...values: string[]): Promise<RedisCountResult>;
  lpop(key: string): Promise<RedisGetResult>;
  rpop(key: string): Promise<RedisGetResult>;
  lrange(
    key: string,
    start: number,
    stop: number,
    options?: CommonOptions,
  ): Promise<RedisArrayResult>;
  llen(key: string): Promise<RedisCountResult>;

  // Sets
  sadd(key: string, ...members: string[]): Promise<RedisCountResult>;
  srem(key: string, ...members: string[]): Promise<RedisCountResult>;
  smembers(key: string, options?: CommonOptions): Promise<RedisArrayResult>;
  sismember(key: string, member: string): Promise<RedisCommonResult<boolean>>;

  // Sorted Sets
  zadd(
    key: string,
    ...entries: { score: number; member: string }[]
  ): Promise<RedisCountResult>;
  zrange(
    key: string,
    start: number,
    stop: number,
    options?: CommonOptions,
  ): Promise<RedisArrayResult>;
  zscore(
    key: string,
    member: string,
  ): Promise<RedisCommonResult<number | null>>;

  // Pub/Sub
  publish(channel: string, message: string): Promise<RedisCountResult>;
  subscribe(channel: string): AsyncIterable<RedisMessage>;

  // Transaction
  multi(): RedisTransaction;

  // Raw command
  command<T = unknown>(
    cmd: string,
    ...args: unknown[]
  ): Promise<RedisCommonResult<T>>;

  close(): Promise<void>;
}
