import type { ClientResult } from "@probitas/client";
import type { RabbitMqMessage } from "./types.ts";
import type { RabbitMqFailureError, RabbitMqOperationError } from "./errors.ts";

// ============================================================================
// RabbitMqPublishResult
// ============================================================================

/**
 * Base interface for publish result with common fields.
 */
interface RabbitMqPublishResultBase extends ClientResult {
  readonly kind: "rabbitmq:publish";
}

/**
 * Successful publish result.
 */
export interface RabbitMqPublishResultSuccess
  extends RabbitMqPublishResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
}

/**
 * Publish result with RabbitMQ error.
 */
export interface RabbitMqPublishResultError extends RabbitMqPublishResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RabbitMqOperationError;
}

/**
 * Publish result with connection failure.
 */
export interface RabbitMqPublishResultFailure
  extends RabbitMqPublishResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RabbitMqFailureError;
}

/**
 * Publish result.
 */
export type RabbitMqPublishResult =
  | RabbitMqPublishResultSuccess
  | RabbitMqPublishResultError
  | RabbitMqPublishResultFailure;

// ============================================================================
// RabbitMqConsumeResult
// ============================================================================

/**
 * Base interface for consume result with common fields.
 */
interface RabbitMqConsumeResultBase extends ClientResult {
  readonly kind: "rabbitmq:consume";
  readonly message: RabbitMqMessage | null;
}

/**
 * Successful consume result.
 */
export interface RabbitMqConsumeResultSuccess
  extends RabbitMqConsumeResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly message: RabbitMqMessage | null;
}

/**
 * Consume result with RabbitMQ error.
 */
export interface RabbitMqConsumeResultError extends RabbitMqConsumeResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RabbitMqOperationError;
  readonly message: null;
}

/**
 * Consume result with connection failure.
 */
export interface RabbitMqConsumeResultFailure
  extends RabbitMqConsumeResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RabbitMqFailureError;
  readonly message: null;
}

/**
 * Consume result (single message retrieval).
 */
export type RabbitMqConsumeResult =
  | RabbitMqConsumeResultSuccess
  | RabbitMqConsumeResultError
  | RabbitMqConsumeResultFailure;

// ============================================================================
// RabbitMqAckResult
// ============================================================================

/**
 * Base interface for ack result with common fields.
 */
interface RabbitMqAckResultBase extends ClientResult {
  readonly kind: "rabbitmq:ack";
}

/**
 * Successful ack result.
 */
export interface RabbitMqAckResultSuccess extends RabbitMqAckResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
}

/**
 * Ack result with RabbitMQ error.
 */
export interface RabbitMqAckResultError extends RabbitMqAckResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RabbitMqOperationError;
}

/**
 * Ack result with connection failure.
 */
export interface RabbitMqAckResultFailure extends RabbitMqAckResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RabbitMqFailureError;
}

/**
 * Ack/Nack result.
 */
export type RabbitMqAckResult =
  | RabbitMqAckResultSuccess
  | RabbitMqAckResultError
  | RabbitMqAckResultFailure;

// ============================================================================
// RabbitMqQueueResult
// ============================================================================

/**
 * Base interface for queue result with common fields.
 */
interface RabbitMqQueueResultBase extends ClientResult {
  readonly kind: "rabbitmq:queue";
  readonly queue: string | null;
  readonly messageCount: number | null;
  readonly consumerCount: number | null;
}

/**
 * Successful queue result.
 */
export interface RabbitMqQueueResultSuccess extends RabbitMqQueueResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly queue: string;
  readonly messageCount: number;
  readonly consumerCount: number;
}

/**
 * Queue result with RabbitMQ error.
 */
export interface RabbitMqQueueResultError extends RabbitMqQueueResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RabbitMqOperationError;
  readonly queue: null;
  readonly messageCount: null;
  readonly consumerCount: null;
}

/**
 * Queue result with connection failure.
 */
export interface RabbitMqQueueResultFailure extends RabbitMqQueueResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RabbitMqFailureError;
  readonly queue: null;
  readonly messageCount: null;
  readonly consumerCount: null;
}

/**
 * Queue declaration result.
 */
export type RabbitMqQueueResult =
  | RabbitMqQueueResultSuccess
  | RabbitMqQueueResultError
  | RabbitMqQueueResultFailure;

// ============================================================================
// RabbitMqExchangeResult
// ============================================================================

/**
 * Base interface for exchange result with common fields.
 */
interface RabbitMqExchangeResultBase extends ClientResult {
  readonly kind: "rabbitmq:exchange";
}

/**
 * Successful exchange result.
 */
export interface RabbitMqExchangeResultSuccess
  extends RabbitMqExchangeResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
}

/**
 * Exchange result with RabbitMQ error.
 */
export interface RabbitMqExchangeResultError
  extends RabbitMqExchangeResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RabbitMqOperationError;
}

/**
 * Exchange result with connection failure.
 */
export interface RabbitMqExchangeResultFailure
  extends RabbitMqExchangeResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RabbitMqFailureError;
}

/**
 * Exchange declaration result.
 */
export type RabbitMqExchangeResult =
  | RabbitMqExchangeResultSuccess
  | RabbitMqExchangeResultError
  | RabbitMqExchangeResultFailure;

// ============================================================================
// Union Type
// ============================================================================

/**
 * Union of all RabbitMQ result types.
 */
export type RabbitMqResult =
  | RabbitMqPublishResult
  | RabbitMqConsumeResult
  | RabbitMqAckResult
  | RabbitMqQueueResult
  | RabbitMqExchangeResult;

// ============================================================================
// Result Implementation Classes
// ============================================================================

/**
 * Implementation class for RabbitMqPublishResultSuccess.
 * @internal
 */
export class RabbitMqPublishResultSuccessImpl
  implements RabbitMqPublishResultSuccess {
  readonly kind = "rabbitmq:publish" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly duration: number;

  constructor(duration: number) {
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqPublishResultError.
 * @internal
 */
export class RabbitMqPublishResultErrorImpl
  implements RabbitMqPublishResultError {
  readonly kind = "rabbitmq:publish" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: RabbitMqOperationError;
  readonly duration: number;

  constructor(error: RabbitMqOperationError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqPublishResultFailure.
 * @internal
 */
export class RabbitMqPublishResultFailureImpl
  implements RabbitMqPublishResultFailure {
  readonly kind = "rabbitmq:publish" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: RabbitMqFailureError;
  readonly duration: number;

  constructor(error: RabbitMqFailureError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqConsumeResultSuccess.
 * @internal
 */
export class RabbitMqConsumeResultSuccessImpl
  implements RabbitMqConsumeResultSuccess {
  readonly kind = "rabbitmq:consume" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly message: RabbitMqMessage | null;
  readonly duration: number;

  constructor(message: RabbitMqMessage | null, duration: number) {
    this.message = message;
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqConsumeResultError.
 * @internal
 */
export class RabbitMqConsumeResultErrorImpl
  implements RabbitMqConsumeResultError {
  readonly kind = "rabbitmq:consume" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: RabbitMqOperationError;
  readonly message = null;
  readonly duration: number;

  constructor(error: RabbitMqOperationError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqConsumeResultFailure.
 * @internal
 */
export class RabbitMqConsumeResultFailureImpl
  implements RabbitMqConsumeResultFailure {
  readonly kind = "rabbitmq:consume" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: RabbitMqFailureError;
  readonly message = null;
  readonly duration: number;

  constructor(error: RabbitMqFailureError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqAckResultSuccess.
 * @internal
 */
export class RabbitMqAckResultSuccessImpl implements RabbitMqAckResultSuccess {
  readonly kind = "rabbitmq:ack" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly duration: number;

  constructor(duration: number) {
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqAckResultError.
 * @internal
 */
export class RabbitMqAckResultErrorImpl implements RabbitMqAckResultError {
  readonly kind = "rabbitmq:ack" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: RabbitMqOperationError;
  readonly duration: number;

  constructor(error: RabbitMqOperationError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqAckResultFailure.
 * @internal
 */
export class RabbitMqAckResultFailureImpl implements RabbitMqAckResultFailure {
  readonly kind = "rabbitmq:ack" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: RabbitMqFailureError;
  readonly duration: number;

  constructor(error: RabbitMqFailureError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqQueueResultSuccess.
 * @internal
 */
export class RabbitMqQueueResultSuccessImpl
  implements RabbitMqQueueResultSuccess {
  readonly kind = "rabbitmq:queue" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly queue: string;
  readonly messageCount: number;
  readonly consumerCount: number;
  readonly duration: number;

  constructor(
    queue: string,
    messageCount: number,
    consumerCount: number,
    duration: number,
  ) {
    this.queue = queue;
    this.messageCount = messageCount;
    this.consumerCount = consumerCount;
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqQueueResultError.
 * @internal
 */
export class RabbitMqQueueResultErrorImpl implements RabbitMqQueueResultError {
  readonly kind = "rabbitmq:queue" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: RabbitMqOperationError;
  readonly queue = null;
  readonly messageCount = null;
  readonly consumerCount = null;
  readonly duration: number;

  constructor(error: RabbitMqOperationError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqQueueResultFailure.
 * @internal
 */
export class RabbitMqQueueResultFailureImpl
  implements RabbitMqQueueResultFailure {
  readonly kind = "rabbitmq:queue" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: RabbitMqFailureError;
  readonly queue = null;
  readonly messageCount = null;
  readonly consumerCount = null;
  readonly duration: number;

  constructor(error: RabbitMqFailureError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqExchangeResultSuccess.
 * @internal
 */
export class RabbitMqExchangeResultSuccessImpl
  implements RabbitMqExchangeResultSuccess {
  readonly kind = "rabbitmq:exchange" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly duration: number;

  constructor(duration: number) {
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqExchangeResultError.
 * @internal
 */
export class RabbitMqExchangeResultErrorImpl
  implements RabbitMqExchangeResultError {
  readonly kind = "rabbitmq:exchange" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: RabbitMqOperationError;
  readonly duration: number;

  constructor(error: RabbitMqOperationError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}

/**
 * Implementation class for RabbitMqExchangeResultFailure.
 * @internal
 */
export class RabbitMqExchangeResultFailureImpl
  implements RabbitMqExchangeResultFailure {
  readonly kind = "rabbitmq:exchange" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: RabbitMqFailureError;
  readonly duration: number;

  constructor(error: RabbitMqFailureError, duration: number) {
    this.error = error;
    this.duration = duration;
  }
}
