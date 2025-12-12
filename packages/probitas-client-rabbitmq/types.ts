import type { CommonConnectionConfig, CommonOptions } from "@probitas/client";
import type {
  RabbitMqAckResult,
  RabbitMqConsumeResult,
  RabbitMqExchangeResult,
  RabbitMqPublishResult,
  RabbitMqQueueResult,
  RabbitMqResult,
} from "./result.ts";

export type {
  RabbitMqAckResult,
  RabbitMqConsumeResult,
  RabbitMqExchangeResult,
  RabbitMqPublishResult,
  RabbitMqQueueResult,
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
   * @example
   * ```ts
   * // String URL
   * { url: "amqp://localhost:5672" }
   *
   * // With credentials
   * { url: "amqp://guest:guest@localhost:5672/%2F" }
   *
   * // Config object
   * { url: { port: 5672, username: "guest", password: "guest", vhost: "/" } }
   * ```
   */
  readonly url: string | RabbitMqConnectionConfig;
  /** Heartbeat interval in seconds */
  readonly heartbeat?: number;
  /** Default prefetch count for channels */
  readonly prefetch?: number;
}

/**
 * Exchange options.
 */
export interface RabbitMqExchangeOptions extends CommonOptions {
  readonly durable?: boolean;
  readonly autoDelete?: boolean;
  readonly internal?: boolean;
  readonly arguments?: Record<string, unknown>;
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
}

/**
 * Consume options.
 */
export interface RabbitMqConsumeOptions extends CommonOptions {
  readonly noAck?: boolean;
  readonly exclusive?: boolean;
  readonly priority?: number;
}

/**
 * Nack options.
 */
export interface RabbitMqNackOptions extends CommonOptions {
  readonly requeue?: boolean;
  readonly allUpTo?: boolean;
}

/**
 * Exchange type.
 */
export type RabbitMqExchangeType = "direct" | "topic" | "fanout" | "headers";

/**
 * RabbitMQ channel interface.
 */
export interface RabbitMqChannel extends AsyncDisposable {
  // Exchange
  assertExchange(
    name: string,
    type: RabbitMqExchangeType,
    options?: RabbitMqExchangeOptions,
  ): Promise<RabbitMqExchangeResult>;
  deleteExchange(
    name: string,
    options?: CommonOptions,
  ): Promise<RabbitMqExchangeResult>;

  // Queue
  assertQueue(
    name: string,
    options?: RabbitMqQueueOptions,
  ): Promise<RabbitMqQueueResult>;
  deleteQueue(
    name: string,
    options?: CommonOptions,
  ): Promise<RabbitMqQueueResult>;
  purgeQueue(
    name: string,
    options?: CommonOptions,
  ): Promise<RabbitMqQueueResult>;
  bindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
    options?: CommonOptions,
  ): Promise<RabbitMqExchangeResult>;
  unbindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
    options?: CommonOptions,
  ): Promise<RabbitMqExchangeResult>;

  // Publish
  publish(
    exchange: string,
    routingKey: string,
    content: Uint8Array,
    options?: RabbitMqPublishOptions,
  ): Promise<RabbitMqPublishResult>;
  sendToQueue(
    queue: string,
    content: Uint8Array,
    options?: RabbitMqPublishOptions,
  ): Promise<RabbitMqPublishResult>;

  // Consume
  get(queue: string, options?: CommonOptions): Promise<RabbitMqConsumeResult>;
  consume(
    queue: string,
    options?: RabbitMqConsumeOptions,
  ): AsyncIterable<RabbitMqMessage>;

  // Ack
  ack(
    message: RabbitMqMessage,
    options?: CommonOptions,
  ): Promise<RabbitMqAckResult>;
  nack(
    message: RabbitMqMessage,
    options?: RabbitMqNackOptions,
  ): Promise<RabbitMqAckResult>;
  reject(
    message: RabbitMqMessage,
    requeue?: boolean,
  ): Promise<RabbitMqAckResult>;

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
