import { Redis } from "ioredis";
import { AbortError, TimeoutError } from "@probitas/client";
import { getLogger } from "@probitas/logger";
import type { CommonOptions } from "@probitas/client";
import type {
  RedisArrayResult,
  RedisClient,
  RedisClientConfig,
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
 * Format a value for logging, truncating long strings.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") {
    return value.length > 200 ? value.slice(0, 200) + "..." : value;
  }
  try {
    const str = JSON.stringify(value);
    return str.length > 200 ? str.slice(0, 200) + "..." : str;
  } catch {
    return "<unserializable>";
  }
}

/**
 * Execute a promise with timeout and abort signal support.
 */
async function withOptions<T>(
  promise: Promise<T>,
  options: CommonOptions | undefined,
  command: string,
): Promise<T> {
  if (!options?.timeout && !options?.signal) {
    return promise;
  }

  const controllers: { cleanup: () => void }[] = [];

  try {
    const racePromises: Promise<T>[] = [promise];

    // Handle timeout
    if (options.timeout !== undefined) {
      const timeoutMs = options.timeout;
      let timeoutId: number;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new TimeoutError(`Command timed out: ${command}`, timeoutMs));
        }, timeoutMs);
      });
      controllers.push({ cleanup: () => clearTimeout(timeoutId) });
      racePromises.push(timeoutPromise);
    }

    // Handle abort signal
    if (options.signal) {
      const signal = options.signal;
      if (signal.aborted) {
        throw new AbortError(`Command aborted: ${command}`);
      }

      const abortPromise = new Promise<never>((_, reject) => {
        const onAbort = () => {
          reject(new AbortError(`Command aborted: ${command}`));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        controllers.push({
          cleanup: () => signal.removeEventListener("abort", onAbort),
        });
      });
      racePromises.push(abortPromise);
    }

    return await Promise.race(racePromises);
  } finally {
    for (const controller of controllers) {
      controller.cleanup();
    }
  }
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
 * const client = await createRedisClient({
 *   url: "redis://localhost:6379/0",
 * });
 *
 * await client.set("key", "value");
 * const result = await client.get("key");
 * console.log(result.value);  // "value"
 *
 * await client.close();
 * ```
 *
 * @example Using connection config object
 * ```ts
 * const client = await createRedisClient({
 *   url: {
 *     host: "localhost",
 *     port: 6379,
 *     password: "secret",
 *     db: 0,
 *   },
 * });
 * ```
 *
 * @example Set with expiration
 * ```ts
 * // Set key with 1 hour TTL
 * await client.set("session", sessionData, { ex: 3600 });
 *
 * // Set key with 5 second TTL in milliseconds
 * await client.set("temp", data, { px: 5000 });
 * ```
 *
 * @example Hash operations
 * ```ts
 * await client.hset("user:123", "name", "Alice");
 * await client.hset("user:123", "email", "alice@example.com");
 *
 * const user = await client.hgetall("user:123");
 * console.log(user.value);  // { name: "Alice", email: "alice@example.com" }
 * ```
 *
 * @example Pub/Sub
 * ```ts
 * // Subscribe to channel
 * for await (const message of client.subscribe("events")) {
 *   console.log("Received:", message.message);
 * }
 *
 * // In another session
 * await client.publish("events", JSON.stringify({ type: "user.created" }));
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
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

    // Log client creation attempt
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

function convertRedisError(error: unknown, command: string): never {
  if (error instanceof TimeoutError || error instanceof AbortError) {
    throw error;
  }
  if (error instanceof Error) {
    throw new RedisCommandError(error.message, {
      command,
      cause: error,
    });
  }
  throw new RedisCommandError(String(error), { command });
}

class RedisClientImpl implements RedisClient {
  readonly config: RedisClientConfig;
  readonly #redis: RedisInstance;
  #closed = false;

  constructor(config: RedisClientConfig, redis: RedisInstance) {
    this.config = config;
    this.#redis = redis;
  }

  // Strings

  async get(key: string, options?: CommonOptions): Promise<RedisGetResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `GET ${key}`;
    logger.debug("Redis command starting", {
      command: "GET",
      key,
    });
    logger.trace("Redis GET arguments", {
      key,
    });
    try {
      const value = await withOptions(this.#redis.get(key), options, command);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "GET",
        key,
        duration: `${duration.toFixed(2)}ms`,
        valueType: value === null ? "null" : typeof value,
      });
      logger.trace("Redis GET result", {
        value: formatValue(value),
      });
      return {
        kind: "redis:get",
        ok: true,
        value,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "GET",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async set(
    key: string,
    value: string,
    options?: RedisSetOptions,
  ): Promise<RedisSetResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `SET ${key}`;
    logger.debug("Redis command starting", {
      command: "SET",
      key,
      options: {
        ex: options?.ex,
        px: options?.px,
        nx: options?.nx,
        xx: options?.xx,
      },
    });
    logger.trace("Redis SET arguments", {
      key,
      value: formatValue(value),
      options,
    });
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
      logger.debug("Redis command succeeded", {
        command: "SET",
        key,
        duration: `${duration.toFixed(2)}ms`,
        result: result === "OK" ? "OK" : "NULL",
      });
      logger.trace("Redis SET result", {
        result,
      });
      return {
        kind: "redis:set",
        ok: result === "OK",
        value: "OK",
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "SET",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async del(...keys: string[]): Promise<RedisCountResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `DEL ${keys.join(" ")}`;
    logger.debug("Redis command starting", {
      command: "DEL",
      keyCount: keys.length,
    });
    logger.trace("Redis DEL arguments", {
      keys,
    });
    try {
      const count = await this.#redis.del(...keys);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "DEL",
        keyCount: keys.length,
        deletedCount: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis DEL result", {
        deletedCount: count,
      });
      return {
        kind: "redis:count",
        ok: true,
        value: count,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "DEL",
        keyCount: keys.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async incr(key: string): Promise<RedisCountResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `INCR ${key}`;
    logger.debug("Redis command starting", {
      command: "INCR",
      key,
    });
    logger.trace("Redis INCR arguments", {
      key,
    });
    try {
      const value = await this.#redis.incr(key);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "INCR",
        key,
        value,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis INCR result", {
        value,
      });
      return {
        kind: "redis:count",
        ok: true,
        value,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "INCR",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async decr(key: string): Promise<RedisCountResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `DECR ${key}`;
    logger.debug("Redis command starting", {
      command: "DECR",
      key,
    });
    logger.trace("Redis DECR arguments", {
      key,
    });
    try {
      const value = await this.#redis.decr(key);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "DECR",
        key,
        value,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis DECR result", {
        value,
      });
      return {
        kind: "redis:count",
        ok: true,
        value,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "DECR",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  // Hashes

  async hget(
    key: string,
    field: string,
    options?: CommonOptions,
  ): Promise<RedisGetResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `HGET ${key} ${field}`;
    logger.debug("Redis command starting", {
      command: "HGET",
      key,
      field,
    });
    logger.trace("Redis HGET arguments", {
      key,
      field,
    });
    try {
      const value = await withOptions(
        this.#redis.hget(key, field),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "HGET",
        key,
        field,
        duration: `${duration.toFixed(2)}ms`,
        valueType: value === null ? "null" : typeof value,
      });
      logger.trace("Redis HGET result", {
        value: formatValue(value),
      });
      return {
        kind: "redis:get",
        ok: true,
        value,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "HGET",
        key,
        field,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async hset(
    key: string,
    field: string,
    value: string,
    options?: CommonOptions,
  ): Promise<RedisCountResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `HSET ${key} ${field}`;
    logger.debug("Redis command starting", {
      command: "HSET",
      key,
      field,
    });
    logger.trace("Redis HSET arguments", {
      key,
      field,
      value: formatValue(value),
    });
    try {
      const count = await withOptions(
        this.#redis.hset(key, field, value),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "HSET",
        key,
        field,
        duration: `${duration.toFixed(2)}ms`,
        count,
      });
      logger.trace("Redis HSET result", {
        count,
      });
      return {
        kind: "redis:count",
        ok: true,
        value: count,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "HSET",
        key,
        field,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async hgetall(
    key: string,
    options?: CommonOptions,
  ): Promise<RedisHashResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `HGETALL ${key}`;
    logger.debug("Redis command starting", {
      command: "HGETALL",
      key,
    });
    logger.trace("Redis HGETALL arguments", {
      key,
    });
    try {
      const value = await withOptions(
        this.#redis.hgetall(key),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "HGETALL",
        key,
        duration: `${duration.toFixed(2)}ms`,
        fieldCount: Object.keys(value).length,
      });
      logger.trace("Redis HGETALL result", {
        value: formatValue(value),
      });
      return {
        kind: "redis:hash",
        ok: true,
        value,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "HGETALL",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async hdel(key: string, ...fields: string[]): Promise<RedisCountResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `HDEL ${key} ${fields.join(" ")}`;
    logger.debug("Redis command starting", {
      command: "HDEL",
      key,
      fieldCount: fields.length,
    });
    logger.trace("Redis HDEL arguments", {
      key,
      fields,
    });
    try {
      const count = await this.#redis.hdel(key, ...fields);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "HDEL",
        key,
        fieldCount: fields.length,
        deletedCount: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis HDEL result", {
        deletedCount: count,
      });
      return {
        kind: "redis:count",
        ok: true,
        value: count,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "HDEL",
        key,
        fieldCount: fields.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  // Lists

  async lpush(key: string, ...values: string[]): Promise<RedisCountResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `LPUSH ${key}`;
    logger.debug("Redis command starting", {
      command: "LPUSH",
      key,
      valueCount: values.length,
    });
    logger.trace("Redis LPUSH arguments", {
      key,
      values: values.map((v) => formatValue(v)),
    });
    try {
      const count = await this.#redis.lpush(key, ...values);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "LPUSH",
        key,
        valueCount: values.length,
        newLength: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis LPUSH result", {
        newLength: count,
      });
      return {
        kind: "redis:count",
        ok: true,
        value: count,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "LPUSH",
        key,
        valueCount: values.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async rpush(key: string, ...values: string[]): Promise<RedisCountResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `RPUSH ${key}`;
    logger.debug("Redis command starting", {
      command: "RPUSH",
      key,
      valueCount: values.length,
    });
    logger.trace("Redis RPUSH arguments", {
      key,
      values: values.map((v) => formatValue(v)),
    });
    try {
      const count = await this.#redis.rpush(key, ...values);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "RPUSH",
        key,
        valueCount: values.length,
        newLength: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis RPUSH result", {
        newLength: count,
      });
      return {
        kind: "redis:count",
        ok: true,
        value: count,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "RPUSH",
        key,
        valueCount: values.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async lpop(key: string): Promise<RedisGetResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `LPOP ${key}`;
    logger.debug("Redis command starting", {
      command: "LPOP",
      key,
    });
    logger.trace("Redis LPOP arguments", {
      key,
    });
    try {
      const value = await this.#redis.lpop(key);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "LPOP",
        key,
        duration: `${duration.toFixed(2)}ms`,
        valueType: value === null ? "null" : typeof value,
      });
      logger.trace("Redis LPOP result", {
        value: formatValue(value),
      });
      return {
        kind: "redis:get",
        ok: true,
        value,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "LPOP",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async rpop(key: string): Promise<RedisGetResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `RPOP ${key}`;
    logger.debug("Redis command starting", {
      command: "RPOP",
      key,
    });
    logger.trace("Redis RPOP arguments", {
      key,
    });
    try {
      const value = await this.#redis.rpop(key);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "RPOP",
        key,
        duration: `${duration.toFixed(2)}ms`,
        valueType: value === null ? "null" : typeof value,
      });
      logger.trace("Redis RPOP result", {
        value: formatValue(value),
      });
      return {
        kind: "redis:get",
        ok: true,
        value,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "RPOP",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async lrange(
    key: string,
    start: number,
    stop: number,
    options?: CommonOptions,
  ): Promise<RedisArrayResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `LRANGE ${key} ${start} ${stop}`;
    logger.debug("Redis command starting", {
      command: "LRANGE",
      key,
      start,
      stop,
    });
    logger.trace("Redis LRANGE arguments", {
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
      logger.debug("Redis command succeeded", {
        command: "LRANGE",
        key,
        start,
        stop,
        duration: `${duration.toFixed(2)}ms`,
        elementCount: value.length,
      });
      logger.trace("Redis LRANGE result", {
        elements: value.map((v) => formatValue(v)),
      });
      return {
        kind: "redis:array",
        ok: true,
        value,
        duration,
      };
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
      convertRedisError(error, command);
    }
  }

  async llen(key: string): Promise<RedisCountResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `LLEN ${key}`;
    logger.debug("Redis command starting", {
      command: "LLEN",
      key,
    });
    logger.trace("Redis LLEN arguments", {
      key,
    });
    try {
      const value = await this.#redis.llen(key);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "LLEN",
        key,
        duration: `${duration.toFixed(2)}ms`,
        length: value,
      });
      logger.trace("Redis LLEN result", {
        length: value,
      });
      return {
        kind: "redis:count",
        ok: true,
        value,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "LLEN",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  // Sets

  async sadd(key: string, ...members: string[]): Promise<RedisCountResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `SADD ${key}`;
    logger.debug("Redis command starting", {
      command: "SADD",
      key,
      memberCount: members.length,
    });
    logger.trace("Redis SADD arguments", {
      key,
      members,
    });
    try {
      const count = await this.#redis.sadd(key, ...members);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "SADD",
        key,
        memberCount: members.length,
        addedCount: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis SADD result", {
        addedCount: count,
      });
      return {
        kind: "redis:count",
        ok: true,
        value: count,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "SADD",
        key,
        memberCount: members.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async srem(key: string, ...members: string[]): Promise<RedisCountResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `SREM ${key}`;
    logger.debug("Redis command starting", {
      command: "SREM",
      key,
      memberCount: members.length,
    });
    logger.trace("Redis SREM arguments", {
      key,
      members,
    });
    try {
      const count = await this.#redis.srem(key, ...members);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "SREM",
        key,
        memberCount: members.length,
        removedCount: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis SREM result", {
        removedCount: count,
      });
      return {
        kind: "redis:count",
        ok: true,
        value: count,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "SREM",
        key,
        memberCount: members.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async smembers(
    key: string,
    options?: CommonOptions,
  ): Promise<RedisArrayResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `SMEMBERS ${key}`;
    logger.debug("Redis command starting", {
      command: "SMEMBERS",
      key,
    });
    logger.trace("Redis SMEMBERS arguments", {
      key,
    });
    try {
      const value = await withOptions(
        this.#redis.smembers(key),
        options,
        command,
      );
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "SMEMBERS",
        key,
        duration: `${duration.toFixed(2)}ms`,
        memberCount: value.length,
      });
      logger.trace("Redis SMEMBERS result", {
        members: value,
      });
      return {
        kind: "redis:array",
        ok: true,
        value,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "SMEMBERS",
        key,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async sismember(
    key: string,
    member: string,
  ): Promise<RedisCommonResult<boolean>> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `SISMEMBER ${key} ${member}`;
    logger.debug("Redis command starting", {
      command: "SISMEMBER",
      key,
      member,
    });
    logger.trace("Redis SISMEMBER arguments", {
      key,
      member,
    });
    try {
      const result = await this.#redis.sismember(key, member);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "SISMEMBER",
        key,
        member,
        duration: `${duration.toFixed(2)}ms`,
        isMember: result === 1,
      });
      logger.trace("Redis SISMEMBER result", {
        isMember: result === 1,
      });
      return {
        kind: "redis:common",
        ok: true,
        value: result === 1,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "SISMEMBER",
        key,
        member,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  // Sorted Sets

  async zadd(
    key: string,
    ...entries: { score: number; member: string }[]
  ): Promise<RedisCountResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `ZADD ${key}`;
    logger.debug("Redis command starting", {
      command: "ZADD",
      key,
      entryCount: entries.length,
    });
    logger.trace("Redis ZADD arguments", {
      key,
      entries,
    });
    try {
      const args: (string | number)[] = [];
      for (const entry of entries) {
        args.push(entry.score, entry.member);
      }
      const count = await this.#redis.zadd(key, ...args);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "ZADD",
        key,
        entryCount: entries.length,
        addedCount: count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("Redis ZADD result", {
        addedCount: count,
      });
      return {
        kind: "redis:count",
        ok: true,
        value: count as number,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "ZADD",
        key,
        entryCount: entries.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async zrange(
    key: string,
    start: number,
    stop: number,
    options?: CommonOptions,
  ): Promise<RedisArrayResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `ZRANGE ${key} ${start} ${stop}`;
    logger.debug("Redis command starting", {
      command: "ZRANGE",
      key,
      start,
      stop,
    });
    logger.trace("Redis ZRANGE arguments", {
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
      logger.debug("Redis command succeeded", {
        command: "ZRANGE",
        key,
        start,
        stop,
        duration: `${duration.toFixed(2)}ms`,
        memberCount: value.length,
      });
      logger.trace("Redis ZRANGE result", {
        members: value,
      });
      return {
        kind: "redis:array",
        ok: true,
        value,
        duration,
      };
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
      convertRedisError(error, command);
    }
  }

  async zscore(
    key: string,
    member: string,
  ): Promise<RedisCommonResult<number | null>> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `ZSCORE ${key} ${member}`;
    logger.debug("Redis command starting", {
      command: "ZSCORE",
      key,
      member,
    });
    logger.trace("Redis ZSCORE arguments", {
      key,
      member,
    });
    try {
      const value = await this.#redis.zscore(key, member);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "ZSCORE",
        key,
        member,
        duration: `${duration.toFixed(2)}ms`,
        scoreType: value === null ? "null" : "number",
      });
      logger.trace("Redis ZSCORE result", {
        score: value !== null ? parseFloat(value) : null,
      });
      return {
        kind: "redis:common",
        ok: true,
        value: value !== null ? parseFloat(value) : null,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "ZSCORE",
        key,
        member,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  // Pub/Sub

  async publish(
    channel: string,
    message: string,
  ): Promise<RedisCountResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `PUBLISH ${channel}`;
    logger.debug("Redis command starting", {
      command: "PUBLISH",
      channel,
    });
    logger.trace("Redis PUBLISH arguments", {
      channel,
      message: formatValue(message),
    });
    try {
      const count = await this.#redis.publish(channel, message);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: "PUBLISH",
        channel,
        duration: `${duration.toFixed(2)}ms`,
        subscriberCount: count,
      });
      logger.trace("Redis PUBLISH result", {
        subscriberCount: count,
      });
      return {
        kind: "redis:count",
        ok: true,
        value: count,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: "PUBLISH",
        channel,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
    }
  }

  async *subscribe(channel: string): AsyncIterable<RedisMessage> {
    this.#ensureOpen();
    logger.debug("Redis subscribe starting", {
      command: "SUBSCRIBE",
      channel,
    });
    logger.trace("Redis SUBSCRIBE arguments", {
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
        message: formatValue(msg),
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
      logger.debug("Redis subscribe connected", {
        channel,
      });

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
      logger.trace("Redis SUBSCRIBE result", {
        messageCount,
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
    this.#ensureOpen();
    logger.debug("Redis transaction starting", {
      command: "MULTI",
    });
    return new RedisTransactionImpl(this.#redis);
  }

  // Raw command

  async command<T = unknown>(
    cmd: string,
    ...args: unknown[]
  ): Promise<RedisCommonResult<T>> {
    this.#ensureOpen();
    const startTime = performance.now();
    const command = `${cmd} ${args.join(" ")}`;
    logger.debug("Redis command starting", {
      command: cmd,
      argCount: args.length,
    });
    logger.trace("Redis command arguments", {
      command: cmd,
      args: args.map((arg) => formatValue(arg)),
    });
    try {
      // deno-lint-ignore no-explicit-any
      const value = await (this.#redis as any).call(cmd, ...args);
      const duration = performance.now() - startTime;
      logger.debug("Redis command succeeded", {
        command: cmd,
        argCount: args.length,
        duration: `${duration.toFixed(2)}ms`,
        resultType: typeof value,
      });
      logger.trace("Redis command result", {
        value: formatValue(value),
      });
      return {
        kind: "redis:common",
        ok: true,
        value: value as T,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis command failed", {
        command: cmd,
        argCount: args.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, command);
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

  #ensureOpen(): void {
    if (this.#closed) {
      throw new RedisCommandError("Client is closed", { command: "" });
    }
  }
}

class RedisTransactionImpl implements RedisTransaction {
  // deno-lint-ignore no-explicit-any
  readonly #pipeline: any;
  #discarded = false;

  constructor(redis: RedisInstance) {
    this.#pipeline = redis.multi();
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

  async exec(): Promise<RedisArrayResult<unknown>> {
    if (this.#discarded) {
      logger.error("Redis transaction exec on discarded transaction", {
        command: "EXEC",
      });
      throw new RedisCommandError("Transaction was discarded", {
        command: "EXEC",
      });
    }

    logger.debug("Redis transaction executing", {
      command: "EXEC",
    });
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
      return {
        kind: "redis:array",
        ok: true,
        value: values,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Redis transaction failed", {
        command: "EXEC",
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertRedisError(error, "EXEC");
    }
  }

  discard(): void {
    logger.debug("Redis transaction discarded", {
      command: "DISCARD",
    });
    this.#discarded = true;
    this.#pipeline.discard();
  }
}
