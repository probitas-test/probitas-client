import { AbortError, ClientError, TimeoutError } from "@probitas/client";

/**
 * Options for Redis errors.
 */
export interface RedisErrorOptions extends ErrorOptions {
  readonly code?: string;
}

/**
 * Base error class for Redis client errors.
 */
export class RedisError extends ClientError {
  override readonly name: string = "RedisError";
  readonly code?: string;

  constructor(
    message: string,
    kind: string = "redis",
    options?: RedisErrorOptions,
  ) {
    super(message, kind, options);
    this.code = options?.code;
  }
}

/**
 * Error thrown when a Redis connection cannot be established.
 */
export class RedisConnectionError extends RedisError {
  override readonly name = "RedisConnectionError";
  override readonly kind = "connection" as const;

  constructor(message: string, options?: RedisErrorOptions) {
    super(message, "connection", options);
  }
}

/**
 * Options for Redis command errors.
 */
export interface RedisCommandErrorOptions extends RedisErrorOptions {
  readonly command: string;
}

/**
 * Error thrown when a Redis command fails.
 */
export class RedisCommandError extends RedisError {
  override readonly name = "RedisCommandError";
  override readonly kind = "command" as const;
  readonly command: string;

  constructor(message: string, options: RedisCommandErrorOptions) {
    super(message, "command", options);
    this.command = options.command;
  }
}

/**
 * Options for Redis script errors.
 */
export interface RedisScriptErrorOptions extends RedisErrorOptions {
  readonly script: string;
}

/**
 * Error thrown when a Redis Lua script fails.
 */
export class RedisScriptError extends RedisError {
  override readonly name = "RedisScriptError";
  override readonly kind = "script" as const;
  readonly script: string;

  constructor(message: string, options: RedisScriptErrorOptions) {
    super(message, "script", options);
    this.script = options.script;
  }
}

/**
 * Error types that indicate the operation was not processed.
 * These are errors that occur before the operation reaches the Redis server.
 */
export type RedisFailureError =
  | RedisConnectionError
  | AbortError
  | TimeoutError;

/**
 * Error types that indicate the operation was processed but failed.
 * These are errors returned by the Redis server.
 */
export type RedisOperationError =
  | RedisCommandError
  | RedisScriptError
  | RedisError;
