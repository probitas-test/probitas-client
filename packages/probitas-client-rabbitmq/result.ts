import type { ClientResult } from "@probitas/client";
import type { RabbitMqError } from "./errors.ts";
import type { RabbitMqMessage } from "./types.ts";

// ============================================================================
// Success Result Types
// ============================================================================

/**
 * Publish result (success).
 */
export interface RabbitMqPublishResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:publish"` for message publish operations.
   */
  readonly kind: "rabbitmq:publish";

  /**
   * Indicates successful operation.
   */
  readonly ok: true;
}

/**
 * Consume result (single message retrieval, success).
 */
export interface RabbitMqConsumeResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:consume"` for message consumption operations.
   */
  readonly kind: "rabbitmq:consume";

  /**
   * Indicates successful operation.
   */
  readonly ok: true;

  /**
   * The consumed message (null if no message available).
   */
  readonly message: RabbitMqMessage | null;
}

/**
 * Ack/Nack result (success).
 */
export interface RabbitMqAckResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:ack"` for acknowledgement operations.
   */
  readonly kind: "rabbitmq:ack";

  /**
   * Indicates successful operation.
   */
  readonly ok: true;
}

/**
 * Queue declaration result (success).
 */
export interface RabbitMqQueueResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:queue"` for queue operations.
   */
  readonly kind: "rabbitmq:queue";

  /**
   * Indicates successful operation.
   */
  readonly ok: true;

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
 * Exchange declaration result (success).
 */
export interface RabbitMqExchangeResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:exchange"` for exchange operations.
   */
  readonly kind: "rabbitmq:exchange";

  /**
   * Indicates successful operation.
   */
  readonly ok: true;
}

// ============================================================================
// Failure Result Types
// ============================================================================

/**
 * Publish result (failure).
 */
export interface RabbitMqPublishResultFailure {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:publish"` for message publish operations.
   */
  readonly kind: "rabbitmq:publish";

  /**
   * Indicates failed operation.
   */
  readonly ok: false;

  /**
   * The error that caused the failure.
   */
  readonly error: RabbitMqError;

  /**
   * Operation duration in milliseconds.
   */
  readonly duration: number;
}

/**
 * Consume result (failure).
 */
export interface RabbitMqConsumeResultFailure {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:consume"` for message consumption operations.
   */
  readonly kind: "rabbitmq:consume";

  /**
   * Indicates failed operation.
   */
  readonly ok: false;

  /**
   * The error that caused the failure.
   */
  readonly error: RabbitMqError;

  /**
   * Operation duration in milliseconds.
   */
  readonly duration: number;
}

/**
 * Ack/Nack result (failure).
 */
export interface RabbitMqAckResultFailure {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:ack"` for acknowledgement operations.
   */
  readonly kind: "rabbitmq:ack";

  /**
   * Indicates failed operation.
   */
  readonly ok: false;

  /**
   * The error that caused the failure.
   */
  readonly error: RabbitMqError;

  /**
   * Operation duration in milliseconds.
   */
  readonly duration: number;
}

/**
 * Queue declaration result (failure).
 */
export interface RabbitMqQueueResultFailure {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:queue"` for queue operations.
   */
  readonly kind: "rabbitmq:queue";

  /**
   * Indicates failed operation.
   */
  readonly ok: false;

  /**
   * The error that caused the failure.
   */
  readonly error: RabbitMqError;

  /**
   * Operation duration in milliseconds.
   */
  readonly duration: number;
}

/**
 * Exchange declaration result (failure).
 */
export interface RabbitMqExchangeResultFailure {
  /**
   * Result kind discriminator.
   *
   * Always `"rabbitmq:exchange"` for exchange operations.
   */
  readonly kind: "rabbitmq:exchange";

  /**
   * Indicates failed operation.
   */
  readonly ok: false;

  /**
   * The error that caused the failure.
   */
  readonly error: RabbitMqError;

  /**
   * Operation duration in milliseconds.
   */
  readonly duration: number;
}

// ============================================================================
// Union Types (Success | Failure)
// ============================================================================

/**
 * Union type for publish operations.
 */
export type RabbitMqPublishResultType =
  | RabbitMqPublishResult
  | RabbitMqPublishResultFailure;

/**
 * Union type for consume operations.
 */
export type RabbitMqConsumeResultType =
  | RabbitMqConsumeResult
  | RabbitMqConsumeResultFailure;

/**
 * Union type for ack/nack operations.
 */
export type RabbitMqAckResultType =
  | RabbitMqAckResult
  | RabbitMqAckResultFailure;

/**
 * Union type for queue operations.
 */
export type RabbitMqQueueResultType =
  | RabbitMqQueueResult
  | RabbitMqQueueResultFailure;

/**
 * Union type for exchange operations.
 */
export type RabbitMqExchangeResultType =
  | RabbitMqExchangeResult
  | RabbitMqExchangeResultFailure;

/**
 * Union of all RabbitMQ result types (success and failure).
 */
export type RabbitMqResult =
  | RabbitMqPublishResult
  | RabbitMqPublishResultFailure
  | RabbitMqConsumeResult
  | RabbitMqConsumeResultFailure
  | RabbitMqAckResult
  | RabbitMqAckResultFailure
  | RabbitMqQueueResult
  | RabbitMqQueueResultFailure
  | RabbitMqExchangeResult
  | RabbitMqExchangeResultFailure;

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a publish failure result.
 */
export function createRabbitMqPublishFailure(
  error: RabbitMqError,
  duration: number,
): RabbitMqPublishResultFailure {
  return {
    kind: "rabbitmq:publish",
    ok: false as const,
    error,
    duration,
  };
}

/**
 * Create a consume failure result.
 */
export function createRabbitMqConsumeFailure(
  error: RabbitMqError,
  duration: number,
): RabbitMqConsumeResultFailure {
  return {
    kind: "rabbitmq:consume",
    ok: false as const,
    error,
    duration,
  };
}

/**
 * Create an ack/nack failure result.
 */
export function createRabbitMqAckFailure(
  error: RabbitMqError,
  duration: number,
): RabbitMqAckResultFailure {
  return {
    kind: "rabbitmq:ack",
    ok: false as const,
    error,
    duration,
  };
}

/**
 * Create a queue failure result.
 */
export function createRabbitMqQueueFailure(
  error: RabbitMqError,
  duration: number,
): RabbitMqQueueResultFailure {
  return {
    kind: "rabbitmq:queue",
    ok: false as const,
    error,
    duration,
  };
}

/**
 * Create an exchange failure result.
 */
export function createRabbitMqExchangeFailure(
  error: RabbitMqError,
  duration: number,
): RabbitMqExchangeResultFailure {
  return {
    kind: "rabbitmq:exchange",
    ok: false as const,
    error,
    duration,
  };
}
