import type { ClientResult } from "@probitas/client";
import type { RabbitMqMessage } from "./types.ts";

/**
 * Publish result.
 */
export interface RabbitMqPublishResult extends ClientResult {
  readonly kind: "rabbitmq:publish";
}

/**
 * Consume result (single message retrieval).
 */
export interface RabbitMqConsumeResult extends ClientResult {
  readonly kind: "rabbitmq:consume";
  readonly message: RabbitMqMessage | null;
}

/**
 * Ack/Nack result.
 */
export interface RabbitMqAckResult extends ClientResult {
  readonly kind: "rabbitmq:ack";
}

/**
 * Queue declaration result.
 */
export interface RabbitMqQueueResult extends ClientResult {
  readonly kind: "rabbitmq:queue";
  readonly queue: string;
  readonly messageCount: number;
  readonly consumerCount: number;
}

/**
 * Exchange declaration result.
 */
export interface RabbitMqExchangeResult extends ClientResult {
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
