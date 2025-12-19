import type { ClientResult } from "@probitas/client";
import type { RabbitMqMessage } from "./types.ts";

/**
 * Publish result.
 */
export interface RabbitMqPublishResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:publish"` for message publish operations.
   */
  readonly kind: "rabbitmq:publish";
}

/**
 * Consume result (single message retrieval).
 */
export interface RabbitMqConsumeResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:consume"` for message consumption operations.
   */
  readonly kind: "rabbitmq:consume";

  /**
   * The consumed message (null if no message available).
   */
  readonly message: RabbitMqMessage | null;
}

/**
 * Ack/Nack result.
 */
export interface RabbitMqAckResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:ack"` for acknowledgement operations.
   */
  readonly kind: "rabbitmq:ack";
}

/**
 * Queue declaration result.
 */
export interface RabbitMqQueueResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:queue"` for queue operations.
   */
  readonly kind: "rabbitmq:queue";

  /**
   * Name of the queue (server-generated for unnamed exclusive queues).
   */
  readonly queue: string;

  /**
   * Number of messages currently in the queue.
   */
  readonly messageCount: number;

  /**
   * Number of active consumers for this queue.
   */
  readonly consumerCount: number;
}

/**
 * Exchange declaration result.
 */
export interface RabbitMqExchangeResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:exchange"` for exchange operations.
   */
  readonly kind: "rabbitmq:exchange";
}

/**
 * Union of all RabbitMQ result types.
 */
export type RabbitMqResult =
  | RabbitMqPublishResult
  | RabbitMqConsumeResult
  | RabbitMqAckResult
  | RabbitMqQueueResult
  | RabbitMqExchangeResult;
