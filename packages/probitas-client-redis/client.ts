import { Redis } from "ioredis";
import { AbortError, TimeoutError } from "@probitas/client";
import { getLogger } from "@probitas/logger";
import { deadline } from "@std/async/deadline";
import type {
  RedisArrayResult,
  RedisClient,
  RedisClientConfig,
  RedisCommandOptions,
  RedisCommonResult,
  RedisConnectionConfig,
  RedisCountResult,
  RedisGetResult,
  RedisHashResult,
  RedisMessage,
  RedisSetOptions,
  RedisSetResult,
  RedisTransaction,
} from "./types.ts";
import { RedisCommandError, RedisConnectionError } from "./errors.ts";
import type { RedisFailureError, RedisOperationError } from "./errors.ts";
import {
  RedisArrayResultErrorImpl,
  RedisArrayResultFailureImpl,
  RedisArrayResultSuccessImpl,
  RedisCommonResultErrorImpl,
  RedisCommonResultFailureImpl,
  RedisCommonResultSuccessImpl,
  RedisCountResultErrorImpl,
  RedisCountResultFailureImpl,
  RedisCountResultSuccessImpl,
  RedisGetResultErrorImpl,
  RedisGetResultFailureImpl,
  RedisGetResultSuccessImpl,
  RedisHashResultErrorImpl,
  RedisHashResultFailureImpl,
  RedisHashResultSuccessImpl,
  RedisSetResultErrorImpl,
  RedisSetResultFailureImpl,
  RedisSetResultSuccessImpl,
} from "./result.ts";

/**
 * Check if an error is a failure error (operation not processed).
 */
function isFailureError(error: unknown): error is RedisFailureError {
  return (
    error instanceof AbortError ||
    error instanceof TimeoutError ||
    error instanceof RedisConnectionError
  );
}

type RedisInstance = InstanceType<typeof Redis>;

const logger = getLogger("probitas", "client", "redis");

/**
 * Resolve Redis connection URL from string or configuration object.
 */
function resolveRedisUrl(url: string | RedisConnectionConfig): string {
  if (typeof url === "string") {
    return url;
  }
  const host = url.host ?? "localhost";
  const port = url.port ?? 6379;
  const db = url.db ?? 0;

  let connectionUrl = "redis://";

  if (url.password) {
    connectionUrl += `:${encodeURIComponent(url.password)}@`;
  }

  connectionUrl += `${host}:${port}`;

  if (db !== 0) {
    connectionUrl += `/${db}`;
  }

  return connectionUrl;
}

/**
 * Convert DOMException to TimeoutError or AbortError.
 * Uses name-based checking instead of instanceof for cross-realm compatibility.
 */
function convertDeadlineError(
  err: unknown,
  command: string,
  timeoutMs: number,
): unknown {
  if (err instanceof Error) {
    if (err.name === "TimeoutError") {
      return new TimeoutError(`Command timed out: ${command}`, timeoutMs);
    }
    if (err.name === "AbortError") {
      return new AbortError(`Command aborted: ${command}`);
    }
  }
  return err;
}

/**
 * Execute a promise with abort signal support only.
 *
 * This function exists as a workaround for @std/async@1.0.15's `deadline` limitation.
 * In v1.0.15, `deadline(promise, Infinity, { signal })` throws:
 *   "TypeError: Failed to execute 'AbortSignal.timeout': Argument 1 is not a finite number"
 *
 * This is because v1.0.15 unconditionally calls `AbortSignal.timeout(ms)`:
 *   const signals = [AbortSignal.timeout(ms)];  // Always called, even when ms=Infinity
 *
 * The fix has been merged to main branch (adding `ms < Number.MAX_SAFE_INTEGER` check)
 * and is expected to be released in @std/async@1.0.16 or later.
 *
 * Once the fix is released, this function can be removed and `withOptions` can
 * simply use `deadline(promise, Infinity, { signal })` for signal-only cases.
 *
 * @see https://github.com/denoland/std/blob/main/async/deadline.ts
 */
function withSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  command: string,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new AbortError(`Command aborted: ${command}`));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new AbortError(`Command aborted: ${command}`));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise
      .then((value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      })
      .catch((err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      });
  });
}

/**
 * Execute a promise with timeout and abort signal support.
 *
 * Routes to appropriate implementation based on options:
 * - No options: return promise as-is
 * - Signal only: use withSignal (workaround for @std/async@1.0.15)
 * - Timeout (±signal): use deadline from @std/async
 */
function withOptions<T>(
  promise: Promise<T>,
  options: RedisCommandOptions | undefined,
  command: string,
): Promise<T> {
  if (!options?.timeout && !options?.signal) {
    return promise;
  }
  // Signal-only: use withSignal workaround (see withSignal JSDoc for details)
  // TODO: Replace with `deadline(promise, Infinity, { signal })` after @std/async@1.0.16
  if (!options.timeout && options.signal) {
    return withSignal(promise, options.signal, command);
  }
  // Timeout (with optional signal): use deadline
  const timeoutMs = options.timeout!;
  return deadline(promise, timeoutMs, { signal: options.signal })
    .catch((err: unknown) => {
      throw convertDeadlineError(err, command, timeoutMs);
    });
}

/**
 * Convert unknown error to a Redis error.
 */
function convertRedisError(
  error: unknown,
  command: string,
): RedisOperationError | RedisFailureError {
  if (error instanceof TimeoutError || error instanceof AbortError) {
    return error;
  }
  if (error instanceof RedisConnectionError) {
    return error;
  }
  if (error instanceof RedisCommandError) {
    return error;
  }
  if (error instanceof Error) {
    return new RedisCommandError(error.message, {
      command,
      cause: error,
    });
  }
  return new RedisCommandError(String(error), { command });
}

/**
 * Create a new Redis client instance.
 *
 * The client provides comprehensive Redis data structure support including strings,
 * hashes, lists, sets, sorted sets, pub/sub, and transactions.
 *
 * @param config - Redis client configuration
 * @returns A promise resolving to a new Redis client instance
 *
 * @example Using URL string
 * ```ts
 * import { createRedisClient } from "@probitas/client-redis";
 *
 * const client = await createRedisClient({
 *   url: "redis://localhost:6379/0",
 * });
 *
 * await client.set("key", "value");
 * const result = await client.get("key");
 * if (result.ok) {
 *   console.log(result.value);  // "value"
 * }
 *
 * await client.close();
 * ```
 *
 * @example Using connection config object
 * ```ts
 * import { createRedisClient } from "@probitas/client-redis";
 *
 * const client = await createRedisClient({
 *   url: {
 *     host: "localhost",
 *     port: 6379,
 *     password: "secret",
 *     db: 0,
 *   },
 * });
 * await client.close();
 * ```
 *
 * @example Set with expiration
 * ```ts
 * import { createRedisClient } from "@probitas/client-redis";
 *
 * const client = await createRedisClient({ url: "redis://localhost:6379" });
 * const sessionData = JSON.stringify({ userId: "123" });
 * const data = "temporary value";
 *
 * // Set key with 1 hour TTL
 * await client.set("session", sessionData, { ex: 3600 });
 *
 * // Set key with 5 second TTL in milliseconds
 * await client.set("temp", data, { px: 5000 });
 *
 * await client.close();
 * ```
 *
 * @example Hash operations
 * ```ts
 * import { createRedisClient } from "@probitas/client-redis";
 *
 * const client = await createRedisClient({ url: "redis://localhost:6379" });
 *
 * await client.hset("user:123", "name", "Alice");
 * await client.hset("user:123", "email", "alice@example.com");
 *
 * const user = await client.hgetall("user:123");
 * if (user.ok) {
 *   console.log(user.value);  // { name: "Alice", email: "alice@example.com" }
 * }
 *
 * await client.close();
 * ```
 *
 * @example Pub/Sub
 * ```ts
 * import { createRedisClient } from "@probitas/client-redis";
 *
 * const client = await createRedisClient({ url: "redis://localhost:6379" });
 *
 * // Subscribe to channel (this would run indefinitely in practice)
 * // for await (const message of client.subscribe("events")) {
 * //   console.log("Received:", message.message);
 * // }
 *
 * // Publish to channel
 * await client.publish("events", JSON.stringify({ type: "user.created" }));
 *
 * await client.close();
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * import { createRedisClient } from "@probitas/client-redis";
 *
 * await using client = await createRedisClient({
 *   url: "redis://localhost:6379",
 * });
 *
 * await client.set("test", "value");
 * // Client automatically closed when scope exits
 * ```
 */
export async function createRedisClient(
  config: RedisClientConfig,
): Promise<RedisClient> {
  let redis: RedisInstance | undefined;

  try {
    const resolvedUrl = resolveRedisUrl(config.url);

    logger.debug("Creating Redis client", {
      url: typeof config.url === "string" ? config.url : resolvedUrl,
      timeout: config.timeout ?? 10000,
    });

    redis = new Redis(resolvedUrl, {
      lazyConnect: true,
      connectTimeout: config.timeout ?? 10000,
    });

    await redis.connect();
    logger.debug("Redis client connected successfully");
  } catch (error) {
    if (redis) {
      redis.disconnect();
    }
    logger.error("Failed to connect to Redis", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new RedisConnectionError(
      `Failed to connect to Redis: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error instanceof Error ? error : undefined },
    );
  }

  return new RedisClientImpl(config, redis);
}

class RedisClientImpl implements RedisClient {
  readonly config: RedisClientConfig;
  readonly #redis: RedisInstance;
  #closed = false;

  constructor(config: RedisClientConfig, redis: RedisInstance) {
    this.config = config;
    this.#redis = redis;
  }

  #shouldThrow(options?: RedisCommandOptions): boolean {
    return options?.throwOnError ?? this.config.throwOnError ?? false;
  }

  #getClosedError(): RedisConnectionError | null {
    if (this.#closed) {
      return new RedisConnectionError("Client is closed");
    }
    return null;
  }

  // Strings

  async get(
    key: string,
    options?: RedisCommandOptions,
  ): Promise<RedisGetResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisGetResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `GET ${key}`;
    logger.info("Redis command starting", { command: "GET", key });
    try {
      const value = await withOptions(this.#redis.get(key), options, command);
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "GET",
        key,
        duration: `${duration.toFixed(2)}ms`,
        valueType: value === null ? "null" : typeof value,
      });
      logger.trace("Redis GET result", { value });
      return new RedisGetResultSuccessImpl(value, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "GET",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisGetResultFailureImpl(redisError, duration);
      }
      return new RedisGetResultErrorImpl(redisError, duration);
    }
  }

  async set(
    key: string,
    value: string,
    options?: RedisSetOptions,
  ): Promise<RedisSetResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisSetResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `SET ${key}`;
    logger.info("Redis command starting", {
      command: "SET",
      key,
      options: {
        ex: options?.ex,
        px: options?.px,
        nx: options?.nx,
        xx: options?.xx,
      },
    });
    logger.trace("Redis SET arguments", { key, value, options });
    try {
      const args: (string | number)[] = [key, value];

      if (options?.ex !== undefined) {
        args.push("EX", options.ex);
      } else if (options?.px !== undefined) {
        args.push("PX", options.px);
      }

      if (options?.nx) {
        args.push("NX");
      } else if (options?.xx) {
        args.push("XX");
      }

      const result = await withOptions(
        this.#redis.set(...(args as [string, string])),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "SET",
        key,
        duration: `${duration.toFixed(2)}ms`,
        result: result === "OK" ? "OK" : "NULL",
      });
      logger.trace("Redis SET result", { result });
      return new RedisSetResultSuccessImpl(duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "SET",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisSetResultFailureImpl(redisError, duration);
      }
      return new RedisSetResultErrorImpl(redisError, duration);
    }
  }

  async del(
    keys: string[],
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCountResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `DEL ${keys.join(" ")}`;
    logger.info("Redis command starting", {
      command: "DEL",
      keyCount: keys.length,
    });
    logger.trace("Redis DEL arguments", { keys });
    try {
      const count = await withOptions(
        this.#redis.del(...keys),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "DEL",
        keyCount: keys.length,
        deletedCount: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis DEL result", { deletedCount: count });
      return new RedisCountResultSuccessImpl(count, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "DEL",
        keyCount: keys.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCountResultFailureImpl(redisError, duration);
      }
      return new RedisCountResultErrorImpl(redisError, duration);
    }
  }

  async incr(
    key: string,
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCountResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `INCR ${key}`;
    logger.info("Redis command starting", { command: "INCR", key });
    try {
      const value = await withOptions(this.#redis.incr(key), options, command);
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "INCR",
        key,
        value,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis INCR result", { value });
      return new RedisCountResultSuccessImpl(value, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "INCR",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCountResultFailureImpl(redisError, duration);
      }
      return new RedisCountResultErrorImpl(redisError, duration);
    }
  }

  async decr(
    key: string,
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCountResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `DECR ${key}`;
    logger.info("Redis command starting", { command: "DECR", key });
    try {
      const value = await withOptions(this.#redis.decr(key), options, command);
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "DECR",
        key,
        value,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis DECR result", { value });
      return new RedisCountResultSuccessImpl(value, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "DECR",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCountResultFailureImpl(redisError, duration);
      }
      return new RedisCountResultErrorImpl(redisError, duration);
    }
  }

  // Hashes

  async hget(
    key: string,
    field: string,
    options?: RedisCommandOptions,
  ): Promise<RedisGetResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisGetResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `HGET ${key} ${field}`;
    logger.info("Redis command starting", { command: "HGET", key, field });
    try {
      const value = await withOptions(
        this.#redis.hget(key, field),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "HGET",
        key,
        field,
        duration: `${duration.toFixed(2)}ms`,
        valueType: value === null ? "null" : typeof value,
      });
      logger.trace("Redis HGET result", { value });
      return new RedisGetResultSuccessImpl(value, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "HGET",
        key,
        field,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisGetResultFailureImpl(redisError, duration);
      }
      return new RedisGetResultErrorImpl(redisError, duration);
    }
  }

  async hset(
    key: string,
    field: string,
    value: string,
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCountResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `HSET ${key} ${field}`;
    logger.info("Redis command starting", { command: "HSET", key, field });
    logger.trace("Redis HSET arguments", { key, field, value });
    try {
      const count = await withOptions(
        this.#redis.hset(key, field, value),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "HSET",
        key,
        field,
        duration: `${duration.toFixed(2)}ms`,
        count,
      });
      logger.trace("Redis HSET result", { count });
      return new RedisCountResultSuccessImpl(count, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "HSET",
        key,
        field,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCountResultFailureImpl(redisError, duration);
      }
      return new RedisCountResultErrorImpl(redisError, duration);
    }
  }

  async hgetall(
    key: string,
    options?: RedisCommandOptions,
  ): Promise<RedisHashResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisHashResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `HGETALL ${key}`;
    logger.info("Redis command starting", { command: "HGETALL", key });
    try {
      const value = await withOptions(
        this.#redis.hgetall(key),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "HGETALL",
        key,
        duration: `${duration.toFixed(2)}ms`,
        fieldCount: Object.keys(value).length,
      });
      logger.trace("Redis HGETALL result", { value });
      return new RedisHashResultSuccessImpl(value, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "HGETALL",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisHashResultFailureImpl(redisError, duration);
      }
      return new RedisHashResultErrorImpl(redisError, duration);
    }
  }

  async hdel(
    key: string,
    fields: string[],
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCountResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `HDEL ${key} ${fields.join(" ")}`;
    logger.info("Redis command starting", {
      command: "HDEL",
      key,
      fieldCount: fields.length,
    });
    logger.trace("Redis HDEL arguments", { key, fields });
    try {
      const count = await withOptions(
        this.#redis.hdel(key, ...fields),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "HDEL",
        key,
        fieldCount: fields.length,
        deletedCount: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis HDEL result", { deletedCount: count });
      return new RedisCountResultSuccessImpl(count, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "HDEL",
        key,
        fieldCount: fields.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCountResultFailureImpl(redisError, duration);
      }
      return new RedisCountResultErrorImpl(redisError, duration);
    }
  }

  // Lists

  async lpush(
    key: string,
    values: string[],
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCountResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `LPUSH ${key}`;
    logger.info("Redis command starting", {
      command: "LPUSH",
      key,
      valueCount: values.length,
    });
    logger.trace("Redis LPUSH arguments", { key, values });
    try {
      const count = await withOptions(
        this.#redis.lpush(key, ...values),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "LPUSH",
        key,
        valueCount: values.length,
        newLength: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis LPUSH result", { newLength: count });
      return new RedisCountResultSuccessImpl(count, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "LPUSH",
        key,
        valueCount: values.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCountResultFailureImpl(redisError, duration);
      }
      return new RedisCountResultErrorImpl(redisError, duration);
    }
  }

  async rpush(
    key: string,
    values: string[],
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCountResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `RPUSH ${key}`;
    logger.info("Redis command starting", {
      command: "RPUSH",
      key,
      valueCount: values.length,
    });
    logger.trace("Redis RPUSH arguments", { key, values });
    try {
      const count = await withOptions(
        this.#redis.rpush(key, ...values),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "RPUSH",
        key,
        valueCount: values.length,
        newLength: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis RPUSH result", { newLength: count });
      return new RedisCountResultSuccessImpl(count, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "RPUSH",
        key,
        valueCount: values.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCountResultFailureImpl(redisError, duration);
      }
      return new RedisCountResultErrorImpl(redisError, duration);
    }
  }

  async lpop(
    key: string,
    options?: RedisCommandOptions,
  ): Promise<RedisGetResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisGetResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `LPOP ${key}`;
    logger.info("Redis command starting", { command: "LPOP", key });
    try {
      const value = await withOptions(this.#redis.lpop(key), options, command);
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "LPOP",
        key,
        duration: `${duration.toFixed(2)}ms`,
        valueType: value === null ? "null" : typeof value,
      });
      logger.trace("Redis LPOP result", { value });
      return new RedisGetResultSuccessImpl(value, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "LPOP",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisGetResultFailureImpl(redisError, duration);
      }
      return new RedisGetResultErrorImpl(redisError, duration);
    }
  }

  async rpop(
    key: string,
    options?: RedisCommandOptions,
  ): Promise<RedisGetResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisGetResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `RPOP ${key}`;
    logger.info("Redis command starting", { command: "RPOP", key });
    try {
      const value = await withOptions(this.#redis.rpop(key), options, command);
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "RPOP",
        key,
        duration: `${duration.toFixed(2)}ms`,
        valueType: value === null ? "null" : typeof value,
      });
      logger.trace("Redis RPOP result", { value });
      return new RedisGetResultSuccessImpl(value, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "RPOP",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisGetResultFailureImpl(redisError, duration);
      }
      return new RedisGetResultErrorImpl(redisError, duration);
    }
  }

  async lrange(
    key: string,
    start: number,
    stop: number,
    options?: RedisCommandOptions,
  ): Promise<RedisArrayResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisArrayResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `LRANGE ${key} ${start} ${stop}`;
    logger.info("Redis command starting", {
      command: "LRANGE",
      key,
      start,
      stop,
    });
    try {
      const value = await withOptions(
        this.#redis.lrange(key, start, stop),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "LRANGE",
        key,
        start,
        stop,
        duration: `${duration.toFixed(2)}ms`,
        elementCount: value.length,
      });
      logger.trace("Redis LRANGE result", { elements: value });
      return new RedisArrayResultSuccessImpl(value, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "LRANGE",
        key,
        start,
        stop,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisArrayResultFailureImpl(redisError, duration);
      }
      return new RedisArrayResultErrorImpl(redisError, duration);
    }
  }

  async llen(
    key: string,
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCountResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `LLEN ${key}`;
    logger.info("Redis command starting", { command: "LLEN", key });
    try {
      const value = await withOptions(this.#redis.llen(key), options, command);
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "LLEN",
        key,
        duration: `${duration.toFixed(2)}ms`,
        length: value,
      });
      logger.trace("Redis LLEN result", { length: value });
      return new RedisCountResultSuccessImpl(value, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "LLEN",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCountResultFailureImpl(redisError, duration);
      }
      return new RedisCountResultErrorImpl(redisError, duration);
    }
  }

  // Sets

  async sadd(
    key: string,
    members: string[],
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCountResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `SADD ${key}`;
    logger.info("Redis command starting", {
      command: "SADD",
      key,
      memberCount: members.length,
    });
    logger.trace("Redis SADD arguments", { key, members });
    try {
      const count = await withOptions(
        this.#redis.sadd(key, ...members),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "SADD",
        key,
        memberCount: members.length,
        addedCount: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis SADD result", { addedCount: count });
      return new RedisCountResultSuccessImpl(count, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "SADD",
        key,
        memberCount: members.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCountResultFailureImpl(redisError, duration);
      }
      return new RedisCountResultErrorImpl(redisError, duration);
    }
  }

  async srem(
    key: string,
    members: string[],
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCountResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `SREM ${key}`;
    logger.info("Redis command starting", {
      command: "SREM",
      key,
      memberCount: members.length,
    });
    logger.trace("Redis SREM arguments", { key, members });
    try {
      const count = await withOptions(
        this.#redis.srem(key, ...members),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "SREM",
        key,
        memberCount: members.length,
        removedCount: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis SREM result", { removedCount: count });
      return new RedisCountResultSuccessImpl(count, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "SREM",
        key,
        memberCount: members.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCountResultFailureImpl(redisError, duration);
      }
      return new RedisCountResultErrorImpl(redisError, duration);
    }
  }

  async smembers(
    key: string,
    options?: RedisCommandOptions,
  ): Promise<RedisArrayResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisArrayResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `SMEMBERS ${key}`;
    logger.info("Redis command starting", { command: "SMEMBERS", key });
    try {
      const value = await withOptions(
        this.#redis.smembers(key),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "SMEMBERS",
        key,
        duration: `${duration.toFixed(2)}ms`,
        memberCount: value.length,
      });
      logger.trace("Redis SMEMBERS result", { members: value });
      return new RedisArrayResultSuccessImpl(value, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "SMEMBERS",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisArrayResultFailureImpl(redisError, duration);
      }
      return new RedisArrayResultErrorImpl(redisError, duration);
    }
  }

  async sismember(
    key: string,
    member: string,
    options?: RedisCommandOptions,
  ): Promise<RedisCommonResult<boolean>> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCommonResultFailureImpl<boolean>(closedError, 0);
    }

    const startTime = performance.now();
    const command = `SISMEMBER ${key} ${member}`;
    logger.info("Redis command starting", {
      command: "SISMEMBER",
      key,
      member,
    });
    try {
      const result = await withOptions(
        this.#redis.sismember(key, member),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "SISMEMBER",
        key,
        member,
        duration: `${duration.toFixed(2)}ms`,
        isMember: result === 1,
      });
      logger.trace("Redis SISMEMBER result", { isMember: result === 1 });
      return new RedisCommonResultSuccessImpl(result === 1, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "SISMEMBER",
        key,
        member,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCommonResultFailureImpl<boolean>(redisError, duration);
      }
      return new RedisCommonResultErrorImpl<boolean>(redisError, duration);
    }
  }

  // Sorted Sets

  async zadd(
    key: string,
    entries: { score: number; member: string }[],
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCountResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `ZADD ${key}`;
    logger.info("Redis command starting", {
      command: "ZADD",
      key,
      entryCount: entries.length,
    });
    logger.trace("Redis ZADD arguments", { key, entries });
    try {
      const args: (string | number)[] = [];
      for (const entry of entries) {
        args.push(entry.score, entry.member);
      }
      const count = await withOptions(
        this.#redis.zadd(key, ...args),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "ZADD",
        key,
        entryCount: entries.length,
        addedCount: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis ZADD result", { addedCount: count });
      return new RedisCountResultSuccessImpl(count as number, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "ZADD",
        key,
        entryCount: entries.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCountResultFailureImpl(redisError, duration);
      }
      return new RedisCountResultErrorImpl(redisError, duration);
    }
  }

  async zrange(
    key: string,
    start: number,
    stop: number,
    options?: RedisCommandOptions,
  ): Promise<RedisArrayResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisArrayResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `ZRANGE ${key} ${start} ${stop}`;
    logger.info("Redis command starting", {
      command: "ZRANGE",
      key,
      start,
      stop,
    });
    try {
      const value = await withOptions(
        this.#redis.zrange(key, start, stop),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "ZRANGE",
        key,
        start,
        stop,
        duration: `${duration.toFixed(2)}ms`,
        memberCount: value.length,
      });
      logger.trace("Redis ZRANGE result", { members: value });
      return new RedisArrayResultSuccessImpl(value, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "ZRANGE",
        key,
        start,
        stop,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisArrayResultFailureImpl(redisError, duration);
      }
      return new RedisArrayResultErrorImpl(redisError, duration);
    }
  }

  async zscore(
    key: string,
    member: string,
    options?: RedisCommandOptions,
  ): Promise<RedisCommonResult<number | null>> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCommonResultFailureImpl<number | null>(closedError, 0);
    }

    const startTime = performance.now();
    const command = `ZSCORE ${key} ${member}`;
    logger.info("Redis command starting", { command: "ZSCORE", key, member });
    try {
      const value = await withOptions(
        this.#redis.zscore(key, member),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "ZSCORE",
        key,
        member,
        duration: `${duration.toFixed(2)}ms`,
        scoreType: value === null ? "null" : "number",
      });
      logger.trace("Redis ZSCORE result", {
        score: value !== null ? parseFloat(value) : null,
      });
      return new RedisCommonResultSuccessImpl(
        value !== null ? parseFloat(value) : null,
        duration,
      );
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "ZSCORE",
        key,
        member,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCommonResultFailureImpl<number | null>(
          redisError,
          duration,
        );
      }
      return new RedisCommonResultErrorImpl<number | null>(
        redisError,
        duration,
      );
    }
  }

  // Pub/Sub

  async publish(
    channel: string,
    message: string,
    options?: RedisCommandOptions,
  ): Promise<RedisCountResult> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCountResultFailureImpl(closedError, 0);
    }

    const startTime = performance.now();
    const command = `PUBLISH ${channel}`;
    logger.info("Redis command starting", { command: "PUBLISH", channel });
    logger.trace("Redis PUBLISH arguments", { channel, message });
    try {
      const count = await withOptions(
        this.#redis.publish(channel, message),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: "PUBLISH",
        channel,
        duration: `${duration.toFixed(2)}ms`,
        subscriberCount: count,
      });
      logger.trace("Redis PUBLISH result", { subscriberCount: count });
      return new RedisCountResultSuccessImpl(count, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "PUBLISH",
        channel,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCountResultFailureImpl(redisError, duration);
      }
      return new RedisCountResultErrorImpl(redisError, duration);
    }
  }

  async *subscribe(channel: string): AsyncIterable<RedisMessage> {
    const closedError = this.#getClosedError();
    if (closedError) {
      throw closedError;
    }

    logger.debug("Redis subscribe starting", {
      command: "SUBSCRIBE",
      channel,
    });

    // Create a duplicate connection for subscription
    const subscriber = this.#redis.duplicate();
    const startTime = performance.now();
    let messageCount = 0;

    const messageQueue: RedisMessage[] = [];
    let resolver: ((value: RedisMessage) => void) | null = null;
    let done = false;

    const messageHandler = (ch: string, msg: string) => {
      const message = { channel: ch, message: msg };
      logger.trace("Redis SUBSCRIBE message received", {
        channel: ch,
        message: msg,
      });
      if (resolver) {
        resolver(message);
        resolver = null;
      } else {
        messageQueue.push(message);
      }
    };

    const endHandler = () => {
      done = true;
      if (resolver) {
        // Signal end by resolving with a special marker
        resolver = null;
      }
    };

    try {
      await subscriber.subscribe(channel);
      logger.debug("Redis subscribe connected", { channel });

      subscriber.on("message", messageHandler);
      subscriber.on("end", endHandler);

      while (!done && !this.#closed) {
        if (messageQueue.length > 0) {
          messageCount++;
          yield messageQueue.shift()!;
        } else {
          const message = await new Promise<RedisMessage | null>((resolve) => {
            resolver = resolve as (value: RedisMessage) => void;
            // Check if already done
            if (done) resolve(null);
          });
          if (message) {
            messageCount++;
            yield message;
          } else {
            break;
          }
        }
      }
      const duration = performance.now() - startTime;
      logger.debug("Redis subscribe ended", {
        command: "SUBSCRIBE",
        channel,
        messageCount,
        duration: `${duration.toFixed(2)}ms`,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis subscribe failed", {
        command: "SUBSCRIBE",
        channel,
        messageCount,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      // Clean up event listeners
      subscriber.removeListener("message", messageHandler);
      subscriber.removeListener("end", endHandler);
      await subscriber.unsubscribe(channel);
      subscriber.disconnect();
    }
  }

  // Transaction

  multi(): RedisTransaction {
    const closedError = this.#getClosedError();
    if (closedError) {
      throw closedError;
    }

    logger.debug("Redis transaction starting", { command: "MULTI" });
    return new RedisTransactionImpl(this.#redis, this.config);
  }

  // Raw command

  // deno-lint-ignore no-explicit-any
  async command<T = any>(
    cmd: string,
    args: unknown[],
    options?: RedisCommandOptions,
  ): Promise<RedisCommonResult<T>> {
    const closedError = this.#getClosedError();
    if (closedError) {
      if (this.#shouldThrow(options)) throw closedError;
      return new RedisCommonResultFailureImpl<T>(closedError, 0);
    }

    const startTime = performance.now();
    const command = `${cmd} ${args.join(" ")}`;
    logger.info("Redis command starting", {
      command: cmd,
      argCount: args.length,
    });
    logger.trace("Redis command arguments", { command: cmd, args });
    try {
      // Using .call() for dynamic command execution (not in ioredis public types)
      const redis = this.#redis as RedisInstance & {
        call(cmd: string, ...args: unknown[]): Promise<unknown>;
      };
      const value = await withOptions(
        redis.call(cmd, ...args),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.info("Redis command succeeded", {
        command: cmd,
        argCount: args.length,
        duration: `${duration.toFixed(2)}ms`,
        resultType: typeof value,
      });
      logger.trace("Redis command result", { value });
      return new RedisCommonResultSuccessImpl<T>(value as T, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: cmd,
        argCount: args.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, command);
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisCommonResultFailureImpl<T>(redisError, duration);
      }
      return new RedisCommonResultErrorImpl<T>(redisError, duration);
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    logger.debug("Redis client closing");
    this.#closed = true;
    this.#redis.disconnect();
    logger.debug("Redis client closed successfully");
    await Promise.resolve(); // Ensure async for consistency
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

class RedisTransactionImpl implements RedisTransaction {
  // deno-lint-ignore no-explicit-any
  readonly #pipeline: any;
  readonly #config: RedisClientConfig;
  #discarded = false;

  constructor(redis: RedisInstance, config: RedisClientConfig) {
    this.#pipeline = redis.multi();
    this.#config = config;
  }

  #shouldThrow(options?: RedisCommandOptions): boolean {
    return options?.throwOnError ?? this.#config.throwOnError ?? false;
  }

  get(key: string): this {
    this.#pipeline.get(key);
    return this;
  }

  set(key: string, value: string, options?: RedisSetOptions): this {
    if (options?.ex !== undefined) {
      this.#pipeline.set(key, value, "EX", options.ex);
    } else if (options?.px !== undefined) {
      this.#pipeline.set(key, value, "PX", options.px);
    } else if (options?.nx) {
      this.#pipeline.set(key, value, "NX");
    } else if (options?.xx) {
      this.#pipeline.set(key, value, "XX");
    } else {
      this.#pipeline.set(key, value);
    }
    return this;
  }

  del(...keys: string[]): this {
    this.#pipeline.del(...keys);
    return this;
  }

  incr(key: string): this {
    this.#pipeline.incr(key);
    return this;
  }

  decr(key: string): this {
    this.#pipeline.decr(key);
    return this;
  }

  hget(key: string, field: string): this {
    this.#pipeline.hget(key, field);
    return this;
  }

  hset(key: string, field: string, value: string): this {
    this.#pipeline.hset(key, field, value);
    return this;
  }

  hgetall(key: string): this {
    this.#pipeline.hgetall(key);
    return this;
  }

  hdel(key: string, ...fields: string[]): this {
    this.#pipeline.hdel(key, ...fields);
    return this;
  }

  lpush(key: string, ...values: string[]): this {
    this.#pipeline.lpush(key, ...values);
    return this;
  }

  rpush(key: string, ...values: string[]): this {
    this.#pipeline.rpush(key, ...values);
    return this;
  }

  lpop(key: string): this {
    this.#pipeline.lpop(key);
    return this;
  }

  rpop(key: string): this {
    this.#pipeline.rpop(key);
    return this;
  }

  lrange(key: string, start: number, stop: number): this {
    this.#pipeline.lrange(key, start, stop);
    return this;
  }

  llen(key: string): this {
    this.#pipeline.llen(key);
    return this;
  }

  sadd(key: string, ...members: string[]): this {
    this.#pipeline.sadd(key, ...members);
    return this;
  }

  srem(key: string, ...members: string[]): this {
    this.#pipeline.srem(key, ...members);
    return this;
  }

  smembers(key: string): this {
    this.#pipeline.smembers(key);
    return this;
  }

  sismember(key: string, member: string): this {
    this.#pipeline.sismember(key, member);
    return this;
  }

  zadd(key: string, ...entries: { score: number; member: string }[]): this {
    const args: (string | number)[] = [];
    for (const entry of entries) {
      args.push(entry.score, entry.member);
    }
    this.#pipeline.zadd(key, ...args);
    return this;
  }

  zrange(key: string, start: number, stop: number): this {
    this.#pipeline.zrange(key, start, stop);
    return this;
  }

  zscore(key: string, member: string): this {
    this.#pipeline.zscore(key, member);
    return this;
  }

  async exec(
    options?: RedisCommandOptions,
  ): Promise<RedisArrayResult<unknown>> {
    if (this.#discarded) {
      const error = new RedisCommandError("Transaction was discarded", {
        command: "EXEC",
      });
      logger.error("Redis transaction exec on discarded transaction", {
        command: "EXEC",
      });
      if (this.#shouldThrow(options)) throw error;
      return new RedisArrayResultErrorImpl<unknown>(error, 0);
    }

    logger.debug("Redis transaction executing", { command: "EXEC" });
    const startTime = performance.now();
    try {
      const results = await this.#pipeline.exec();
      // ioredis returns [[error, result], ...] format
      // deno-lint-ignore no-explicit-any
      const values = results?.map(([err, val]: [Error | null, any]) => {
        if (err) throw err;
        return val;
      }) ?? [];

      const duration = performance.now() - startTime;
      logger.debug("Redis transaction succeeded", {
        command: "EXEC",
        commandCount: values.length,
        duration: `${duration.toFixed(2)}ms`,
      });
      return new RedisArrayResultSuccessImpl<unknown>(values, duration);
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis transaction failed", {
        command: "EXEC",
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      const redisError = convertRedisError(error, "EXEC");
      if (this.#shouldThrow(options)) throw redisError;
      if (isFailureError(redisError)) {
        return new RedisArrayResultFailureImpl<unknown>(redisError, duration);
      }
      return new RedisArrayResultErrorImpl<unknown>(redisError, duration);
    }
  }

  discard(): void {
    logger.debug("Redis transaction discarded", { command: "DISCARD" });
    this.#discarded = true;
    this.#pipeline.discard();
  }
}
