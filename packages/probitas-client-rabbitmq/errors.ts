import { AbortError, ClientError, TimeoutError } from "@probitas/client";

/**
 * Options for RabbitMQ errors.
 */
export interface RabbitMqErrorOptions extends ErrorOptions {
  readonly code?: number;
}

/**
 * Base error class for RabbitMQ client errors.
 */
export class RabbitMqError extends ClientError {
  override readonly name: string = "RabbitMqError";
  readonly code?: number;

  constructor(
    message: string,
    kind: string = "rabbitmq",
    options?: RabbitMqErrorOptions,
  ) {
    super(message, kind, options);
    this.code = options?.code;
  }
}

/**
 * Error thrown when a RabbitMQ connection cannot be established.
 */
export class RabbitMqConnectionError extends RabbitMqError {
  override readonly name = "RabbitMqConnectionError";
  override readonly kind = "connection" as const;

  constructor(message: string, options?: RabbitMqErrorOptions) {
    super(message, "connection", options);
  }
}

/**
 * Options for RabbitMQ channel errors.
 */
export interface RabbitMqChannelErrorOptions extends RabbitMqErrorOptions {
  readonly channelId?: number;
}

/**
 * Error thrown when a RabbitMQ channel operation fails.
 */
export class RabbitMqChannelError extends RabbitMqError {
  override readonly name = "RabbitMqChannelError";
  override readonly kind = "channel" as const;
  readonly channelId?: number;

  constructor(message: string, options?: RabbitMqChannelErrorOptions) {
    super(message, "channel", options);
    this.channelId = options?.channelId;
  }
}

/**
 * Options for RabbitMQ not found errors.
 */
export interface RabbitMqNotFoundErrorOptions extends RabbitMqErrorOptions {
  readonly resource: string;
}

/**
 * Error thrown when a RabbitMQ resource (queue or exchange) is not found.
 */
export class RabbitMqNotFoundError extends RabbitMqError {
  override readonly name = "RabbitMqNotFoundError";
  override readonly kind = "not_found" as const;
  readonly resource: string;

  constructor(message: string, options: RabbitMqNotFoundErrorOptions) {
    super(message, "not_found", options);
    this.resource = options.resource;
  }
}

/**
 * Options for RabbitMQ precondition failed errors.
 */
export interface RabbitMqPreconditionFailedErrorOptions
  extends RabbitMqErrorOptions {
  readonly reason: string;
}

/**
 * Error thrown when a RabbitMQ precondition check fails.
 */
export class RabbitMqPreconditionFailedError extends RabbitMqError {
  override readonly name = "RabbitMqPreconditionFailedError";
  override readonly kind = "precondition_failed" as const;
  readonly reason: string;

  constructor(
    message: string,
    options: RabbitMqPreconditionFailedErrorOptions,
  ) {
    super(message, "precondition_failed", options);
    this.reason = options.reason;
  }
}

/**
 * Error types that indicate a RabbitMQ operation error.
 * These are errors where the operation reached the server but failed.
 */
export type RabbitMqOperationError =
  | RabbitMqChannelError
  | RabbitMqNotFoundError
  | RabbitMqPreconditionFailedError
  | RabbitMqError;

/**
 * Error types that indicate the operation was not processed.
 * These are errors that occur before the operation reaches the RabbitMQ server.
 */
export type RabbitMqFailureError =
  | RabbitMqConnectionError
  | AbortError
  | TimeoutError;
