import type { CommonConnectionConfig, CommonOptions } from "@probitas/client";
import type {
  RabbitMqAckResult,
  RabbitMqAckResultFailure,
  RabbitMqAckResultType,
  RabbitMqConsumeResult,
  RabbitMqConsumeResultFailure,
  RabbitMqConsumeResultType,
  RabbitMqExchangeResult,
  RabbitMqExchangeResultFailure,
  RabbitMqExchangeResultType,
  RabbitMqPublishResult,
  RabbitMqPublishResultFailure,
  RabbitMqPublishResultType,
  RabbitMqQueueResult,
  RabbitMqQueueResultFailure,
  RabbitMqQueueResultType,
  RabbitMqResult,
} from "./result.ts";

export type {
  RabbitMqAckResult,
  RabbitMqAckResultFailure,
  RabbitMqAckResultType,
  RabbitMqConsumeResult,
  RabbitMqConsumeResultFailure,
  RabbitMqConsumeResultType,
  RabbitMqExchangeResult,
  RabbitMqExchangeResultFailure,
  RabbitMqExchangeResultType,
  RabbitMqPublishResult,
  RabbitMqPublishResultFailure,
  RabbitMqPublishResultType,
  RabbitMqQueueResult,
  RabbitMqQueueResultFailure,
  RabbitMqQueueResultType,
  RabbitMqResult,
};

/**
 * RabbitMQ message properties.
 */
export interface RabbitMqMessageProperties {
  readonly contentType?: string;
  readonly contentEncoding?: string;
  readonly headers?: Record<string, unknown>;
  /** 1: non-persistent, 2: persistent */
  readonly deliveryMode?: 1 | 2;
  readonly priority?: number;
  readonly correlationId?: string;
  readonly replyTo?: string;
  readonly expiration?: string;
  readonly messageId?: string;
  readonly timestamp?: number;
  readonly type?: string;
  readonly userId?: string;
  readonly appId?: string;
}

/**
 * RabbitMQ message fields.
 */
export interface RabbitMqMessageFields {
  readonly deliveryTag: bigint;
  readonly redelivered: boolean;
  readonly exchange: string;
  readonly routingKey: string;
}

/**
 * RabbitMQ message.
 */
export interface RabbitMqMessage {
  readonly content: Uint8Array;
  readonly properties: RabbitMqMessageProperties;
  readonly fields: RabbitMqMessageFields;
}

/**
 * RabbitMQ connection configuration.
 *
 * Extends CommonConnectionConfig with RabbitMQ-specific options.
 */
export interface RabbitMqConnectionConfig extends CommonConnectionConfig {
  /**
   * Virtual host.
   * @default "/"
   */
  readonly vhost?: string;
}

/**
 * RabbitMQ client configuration.
 */
export interface RabbitMqClientConfig extends CommonOptions {
  /**
   * RabbitMQ connection URL or configuration object.
   *
   * @example String URL
   * ```ts
   * import type { RabbitMqClientConfig } from "@probitas/client-rabbitmq";
   * const config: RabbitMqClientConfig = { url: "amqp://localhost:5672" };
   * ```
   *
   * @example With credentials
   * ```ts
   * import type { RabbitMqClientConfig } from "@probitas/client-rabbitmq";
   * const config: RabbitMqClientConfig = {
   *   url: "amqp://guest:guest@localhost:5672/%2F",
   * };
   * ```
   *
   * @example Config object
   * ```ts
   * import type { RabbitMqClientConfig } from "@probitas/client-rabbitmq";
   * const config: RabbitMqClientConfig = {
   *   url: { port: 5672, username: "guest", password: "guest", vhost: "/" },
   * };
   * ```
   */
  readonly url: string | RabbitMqConnectionConfig;
  /** Heartbeat interval in seconds */
  readonly heartbeat?: number;
  /** Default prefetch count for channels */
  readonly prefetch?: number;
  /**
   * Whether to throw errors instead of returning failure results.
   * When `true`, operations throw errors on failure.
   * When `false` (default), operations return failure results with `ok: false`.
   * Note: TimeoutError and AbortError are always thrown regardless of this setting.
   * @default false
   */
  readonly throwOnError?: boolean;
}

/**
 * Exchange options.
 */
export interface RabbitMqExchangeOptions extends CommonOptions {
  readonly durable?: boolean;
  readonly autoDelete?: boolean;
  readonly internal?: boolean;
  readonly arguments?: Record<string, unknown>;
  /**
   * Whether to throw errors instead of returning failure results.
   * Overrides the client-level `throwOnError` setting.
   */
  readonly throwOnError?: boolean;
}

/**
 * Queue options.
 */
export interface RabbitMqQueueOptions extends CommonOptions {
  readonly durable?: boolean;
  readonly exclusive?: boolean;
  readonly autoDelete?: boolean;
  readonly arguments?: Record<string, unknown>;
  readonly messageTtl?: number;
  readonly maxLength?: number;
  readonly deadLetterExchange?: string;
  readonly deadLetterRoutingKey?: string;
  /**
   * Whether to throw errors instead of returning failure results.
   * Overrides the client-level `throwOnError` setting.
   */
  readonly throwOnError?: boolean;
}

/**
 * Publish options.
 */
export interface RabbitMqPublishOptions extends CommonOptions {
  readonly persistent?: boolean;
  readonly contentType?: string;
  readonly contentEncoding?: string;
  readonly headers?: Record<string, unknown>;
  readonly correlationId?: string;
  readonly replyTo?: string;
  readonly expiration?: string;
  readonly messageId?: string;
  readonly priority?: number;
  /**
   * Whether to throw errors instead of returning failure results.
   * Overrides the client-level `throwOnError` setting.
   */
  readonly throwOnError?: boolean;
}

/**
 * Consume options.
 */
export interface RabbitMqConsumeOptions extends CommonOptions {
  readonly noAck?: boolean;
  readonly exclusive?: boolean;
  readonly priority?: number;
  /**
   * Whether to throw errors instead of returning failure results.
   * Overrides the client-level `throwOnError` setting.
   */
  readonly throwOnError?: boolean;
}

/**
 * Nack options.
 */
export interface RabbitMqNackOptions extends CommonOptions {
  readonly requeue?: boolean;
  readonly allUpTo?: boolean;
  /**
   * Whether to throw errors instead of returning failure results.
   * Overrides the client-level `throwOnError` setting.
   */
  readonly throwOnError?: boolean;
}

/**
 * Exchange type.
 */
export type RabbitMqExchangeType = "direct" | "topic" | "fanout" | "headers";

/**
 * Common options with throwOnError support for RabbitMQ operations.
 */
export interface RabbitMqCommonOptions extends CommonOptions {
  /**
   * Whether to throw errors instead of returning failure results.
   * Overrides the client-level `throwOnError` setting.
   */
  readonly throwOnError?: boolean;
}

/**
 * RabbitMQ channel interface.
 */
export interface RabbitMqChannel extends AsyncDisposable {
  // Exchange
  assertExchange(
    name: string,
    type: RabbitMqExchangeType,
    options?: RabbitMqExchangeOptions,
  ): Promise<RabbitMqExchangeResultType>;
  deleteExchange(
    name: string,
    options?: RabbitMqCommonOptions,
  ): Promise<RabbitMqExchangeResultType>;

  // Queue
  assertQueue(
    name: string,
    options?: RabbitMqQueueOptions,
  ): Promise<RabbitMqQueueResultType>;
  deleteQueue(
    name: string,
    options?: RabbitMqCommonOptions,
  ): Promise<RabbitMqQueueResultType>;
  purgeQueue(
    name: string,
    options?: RabbitMqCommonOptions,
  ): Promise<RabbitMqQueueResultType>;
  bindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
    options?: RabbitMqCommonOptions,
  ): Promise<RabbitMqExchangeResultType>;
  unbindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
    options?: RabbitMqCommonOptions,
  ): Promise<RabbitMqExchangeResultType>;

  // Publish
  publish(
    exchange: string,
    routingKey: string,
    content: Uint8Array,
    options?: RabbitMqPublishOptions,
  ): Promise<RabbitMqPublishResultType>;
  sendToQueue(
    queue: string,
    content: Uint8Array,
    options?: RabbitMqPublishOptions,
  ): Promise<RabbitMqPublishResultType>;

  // Consume
  get(
    queue: string,
    options?: RabbitMqCommonOptions,
  ): Promise<RabbitMqConsumeResultType>;
  consume(
    queue: string,
    options?: RabbitMqConsumeOptions,
  ): AsyncIterable<RabbitMqMessage>;

  // Ack
  ack(
    message: RabbitMqMessage,
    options?: RabbitMqCommonOptions,
  ): Promise<RabbitMqAckResultType>;
  nack(
    message: RabbitMqMessage,
    options?: RabbitMqNackOptions,
  ): Promise<RabbitMqAckResultType>;
  reject(
    message: RabbitMqMessage,
    requeue?: boolean,
    options?: RabbitMqCommonOptions,
  ): Promise<RabbitMqAckResultType>;

  // Prefetch
  prefetch(count: number): Promise<void>;

  close(): Promise<void>;
}

/**
 * RabbitMQ client interface.
 */
export interface RabbitMqClient extends AsyncDisposable {
  readonly config: RabbitMqClientConfig;

  channel(): Promise<RabbitMqChannel>;

  close(): Promise<void>;
}
