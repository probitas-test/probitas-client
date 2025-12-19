import type { CommonConnectionConfig, CommonOptions } from "@probitas/client";
import type {
  RedisArrayResult,
  RedisCommonResult,
  RedisCountResult,
  RedisGetResult,
  RedisHashResult,
  RedisSetResult,
} from "./result.ts";

export type * from "./result.ts";
export type { RedisFailureError, RedisOperationError } from "./errors.ts";

/**
 * Redis command options.
 *
 * Extends CommonOptions with Redis-specific behavior options.
 */
export interface RedisCommandOptions extends CommonOptions {
  /**
   * Whether to throw an error when the operation fails.
   *
   * When `true`, failures will throw an error instead of returning a result
   * with `ok: false`.
   *
   * @default false (inherited from client config or defaults to false)
   */
  readonly throwOnError?: boolean;
}

/**
 * Redis SET options
 */
export interface RedisSetOptions extends RedisCommandOptions {
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
   * @example String URL
   * ```ts
   * import type { RedisClientConfig } from "@probitas/client-redis";
   * const config: RedisClientConfig = { url: "redis://localhost:6379" };
   * ```
   *
   * @example With password
   * ```ts
   * import type { RedisClientConfig } from "@probitas/client-redis";
   * const config: RedisClientConfig = { url: "redis://:password@localhost:6379/0" };
   * ```
   *
   * @example Config object
   * ```ts
   * import type { RedisClientConfig } from "@probitas/client-redis";
   * const config: RedisClientConfig = {
   *   url: { port: 6379, password: "secret", db: 1 },
   * };
   * ```
   */
  readonly url: string | RedisConnectionConfig;

  /**
   * Whether to throw an error when operations fail.
   *
   * When `true`, failures will throw an error instead of returning a result
   * with `ok: false`. This can be overridden per-command.
   *
   * @default false
   */
  readonly throwOnError?: boolean;
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
  exec(options?: RedisCommandOptions): Promise<RedisArrayResult<unknown>>;
  discard(): void;
}

/**
 * Redis client interface
 */
export interface RedisClient extends AsyncDisposable {
  readonly config: RedisClientConfig;

  // Strings
  get(key: string, options?: RedisCommandOptions): Promise<RedisGetResult>;
  set(
    key: string,
    value: string,
    options?: RedisSetOptions,
  ): Promise<RedisSetResult>;
  del(keys: string[], options?: RedisCommandOptions): Promise<RedisCountResult>;
  incr(key: string, options?: RedisCommandOptions): Promise<RedisCountResult>;
  decr(key: string, options?: RedisCommandOptions): Promise<RedisCountResult>;

  // Hashes
  hget(
    key: string,
    field: string,
    options?: RedisCommandOptions,
  ): Promise<RedisGetResult>;
  hset(
    key: string,
    field: string,
    value: string,
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult>;
  hgetall(key: string, options?: RedisCommandOptions): Promise<RedisHashResult>;
  hdel(
    key: string,
    fields: string[],
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult>;

  // Lists
  lpush(
    key: string,
    values: string[],
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult>;
  rpush(
    key: string,
    values: string[],
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult>;
  lpop(key: string, options?: RedisCommandOptions): Promise<RedisGetResult>;
  rpop(key: string, options?: RedisCommandOptions): Promise<RedisGetResult>;
  lrange(
    key: string,
    start: number,
    stop: number,
    options?: RedisCommandOptions,
  ): Promise<RedisArrayResult>;
  llen(key: string, options?: RedisCommandOptions): Promise<RedisCountResult>;

  // Sets
  sadd(
    key: string,
    members: string[],
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult>;
  srem(
    key: string,
    members: string[],
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult>;
  smembers(
    key: string,
    options?: RedisCommandOptions,
  ): Promise<RedisArrayResult>;
  sismember(
    key: string,
    member: string,
    options?: RedisCommandOptions,
  ): Promise<RedisCommonResult<boolean>>;

  // Sorted Sets
  zadd(
    key: string,
    entries: { score: number; member: string }[],
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult>;
  zrange(
    key: string,
    start: number,
    stop: number,
    options?: RedisCommandOptions,
  ): Promise<RedisArrayResult>;
  zscore(
    key: string,
    member: string,
    options?: RedisCommandOptions,
  ): Promise<RedisCommonResult<number | null>>;

  // Pub/Sub
  publish(
    channel: string,
    message: string,
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult>;
  subscribe(channel: string): AsyncIterable<RedisMessage>;

  // Transaction
  multi(): RedisTransaction;

  // Raw command
  // deno-lint-ignore no-explicit-any
  command<T = any>(
    cmd: string,
    args: unknown[],
    options?: RedisCommandOptions,
  ): Promise<RedisCommonResult<T>>;

  close(): Promise<void>;
}
