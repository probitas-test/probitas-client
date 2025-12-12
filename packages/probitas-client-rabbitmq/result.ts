import type { RabbitMqMessage } from "./types.ts";

/**
 * Publish result.
 */
export interface RabbitMqPublishResult {
  readonly type: "rabbitmq:publish";
  readonly ok: boolean;
  readonly duration: number;
}

/**
 * Consume result (single message retrieval).
 */
export interface RabbitMqConsumeResult {
  readonly type: "rabbitmq:consume";
  readonly ok: boolean;
  readonly message: RabbitMqMessage | null;
  readonly duration: number;
}

/**
 * Ack/Nack result.
 */
export interface RabbitMqAckResult {
  readonly type: "rabbitmq:ack";
  readonly ok: boolean;
  readonly duration: number;
}

/**
 * Queue declaration result.
 */
export interface RabbitMqQueueResult {
  readonly type: "rabbitmq:queue";
  readonly ok: boolean;
  readonly queue: string;
  readonly messageCount: number;
  readonly consumerCount: number;
  readonly duration: number;
}

/**
 * Exchange declaration result.
 */
export interface RabbitMqExchangeResult {
  readonly type: "rabbitmq:exchange";
  readonly ok: boolean;
  readonly duration: number;
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
