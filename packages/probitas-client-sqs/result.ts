import type { ClientResult } from "@probitas/client";
import type { SqsError } from "./errors.ts";
import type {
  SqsBatchFailedEntry,
  SqsBatchSuccessEntry,
  SqsMessages,
} from "./types.ts";

// ============================================================================
// Success Result Types
// ============================================================================

/**
 * Result of sending a message (success).
 */
export interface SqsSendResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:send"` for single message send operations.
   */
  readonly kind: "sqs:send";

  /**
   * Whether the operation succeeded.
   */
  readonly ok: true;

  /**
   * Unique identifier for the sent message.
   */
  readonly messageId: string;

  /**
   * MD5 hash of the message body (for integrity verification).
   */
  readonly md5OfBody: string;

  /**
   * Sequence number for FIFO queues (present only for FIFO queues).
   */
  readonly sequenceNumber?: string;
}

/**
 * Result of batch sending messages (success or partial success).
 */
export interface SqsSendBatchResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:send-batch"` for batch message send operations.
   */
  readonly kind: "sqs:send-batch";

  /**
   * Array of successfully sent messages.
   */
  readonly successful: readonly SqsBatchSuccessEntry[];

  /**
   * Array of messages that failed to send.
   */
  readonly failed: readonly SqsBatchFailedEntry[];
}

/**
 * Result of receiving messages (success).
 */
export interface SqsReceiveResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:receive"` for message receive operations.
   */
  readonly kind: "sqs:receive";

  /**
   * Whether the operation succeeded.
   */
  readonly ok: true;

  /**
   * Array of received messages (may be empty).
   *
   * Includes helper methods like first(), last(), etc.
   */
  readonly messages: SqsMessages;
}

/**
 * Result of deleting a message (success).
 */
export interface SqsDeleteResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:delete"` for single message delete operations.
   */
  readonly kind: "sqs:delete";

  /**
   * Whether the operation succeeded.
   */
  readonly ok: true;
}

/**
 * Result of batch deleting messages (success or partial success).
 */
export interface SqsDeleteBatchResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:delete-batch"` for batch message delete operations.
   */
  readonly kind: "sqs:delete-batch";

  /**
   * Array of message IDs that were successfully deleted.
   */
  readonly successful: readonly string[];

  /**
   * Array of messages that failed to delete.
   */
  readonly failed: readonly SqsBatchFailedEntry[];
}

/**
 * Result of ensuring a queue exists (success).
 */
export interface SqsEnsureQueueResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:ensure-queue"` for queue creation/verification operations.
   */
  readonly kind: "sqs:ensure-queue";

  /**
   * Whether the operation succeeded.
   */
  readonly ok: true;

  /**
   * URL of the queue (existing or newly created).
   */
  readonly queueUrl: string;
}

/**
 * Result of deleting a queue (success).
 */
export interface SqsDeleteQueueResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:delete-queue"` for queue deletion operations.
   */
  readonly kind: "sqs:delete-queue";

  /**
   * Whether the operation succeeded.
   */
  readonly ok: true;
}

// ============================================================================
// Failure Result Types
// ============================================================================

/**
 * Result of sending a message (failure).
 */
export interface SqsSendResultFailure extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:send"` for single message send operations.
   */
  readonly kind: "sqs:send";

  /**
   * Whether the operation succeeded.
   */
  readonly ok: false;

  /**
   * The error that caused the failure.
   */
  readonly error: SqsError;
}

/**
 * Result of batch sending messages (full failure).
 */
export interface SqsSendBatchResultFailure extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:send-batch"` for batch message send operations.
   */
  readonly kind: "sqs:send-batch";

  /**
   * Whether the operation succeeded.
   */
  readonly ok: false;

  /**
   * The error that caused the failure.
   */
  readonly error: SqsError;
}

/**
 * Result of receiving messages (failure).
 */
export interface SqsReceiveResultFailure extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:receive"` for message receive operations.
   */
  readonly kind: "sqs:receive";

  /**
   * Whether the operation succeeded.
   */
  readonly ok: false;

  /**
   * The error that caused the failure.
   */
  readonly error: SqsError;
}

/**
 * Result of deleting a message (failure).
 */
export interface SqsDeleteResultFailure extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:delete"` for single message delete operations.
   */
  readonly kind: "sqs:delete";

  /**
   * Whether the operation succeeded.
   */
  readonly ok: false;

  /**
   * The error that caused the failure.
   */
  readonly error: SqsError;
}

/**
 * Result of batch deleting messages (full failure).
 */
export interface SqsDeleteBatchResultFailure extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:delete-batch"` for batch message delete operations.
   */
  readonly kind: "sqs:delete-batch";

  /**
   * Whether the operation succeeded.
   */
  readonly ok: false;

  /**
   * The error that caused the failure.
   */
  readonly error: SqsError;
}

/**
 * Result of ensuring a queue exists (failure).
 */
export interface SqsEnsureQueueResultFailure extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:ensure-queue"` for queue creation/verification operations.
   */
  readonly kind: "sqs:ensure-queue";

  /**
   * Whether the operation succeeded.
   */
  readonly ok: false;

  /**
   * The error that caused the failure.
   */
  readonly error: SqsError;
}

/**
 * Result of deleting a queue (failure).
 */
export interface SqsDeleteQueueResultFailure extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:delete-queue"` for queue deletion operations.
   */
  readonly kind: "sqs:delete-queue";

  /**
   * Whether the operation succeeded.
   */
  readonly ok: false;

  /**
   * The error that caused the failure.
   */
  readonly error: SqsError;
}

// ============================================================================
// Union Types (Success | Failure)
// ============================================================================

/**
 * Result type for send operations (success or failure).
 */
export type SqsSendResultType = SqsSendResult | SqsSendResultFailure;

/**
 * Result type for batch send operations (success, partial success, or failure).
 */
export type SqsSendBatchResultType =
  | SqsSendBatchResult
  | SqsSendBatchResultFailure;

/**
 * Result type for receive operations (success or failure).
 */
export type SqsReceiveResultType = SqsReceiveResult | SqsReceiveResultFailure;

/**
 * Result type for delete operations (success or failure).
 */
export type SqsDeleteResultType = SqsDeleteResult | SqsDeleteResultFailure;

/**
 * Result type for batch delete operations (success, partial success, or failure).
 */
export type SqsDeleteBatchResultType =
  | SqsDeleteBatchResult
  | SqsDeleteBatchResultFailure;

/**
 * Result type for ensure queue operations (success or failure).
 */
export type SqsEnsureQueueResultType =
  | SqsEnsureQueueResult
  | SqsEnsureQueueResultFailure;

/**
 * Result type for delete queue operations (success or failure).
 */
export type SqsDeleteQueueResultType =
  | SqsDeleteQueueResult
  | SqsDeleteQueueResultFailure;

/**
 * Union type of all SQS result types (success only, for backwards compatibility).
 */
export type SqsResult =
  | SqsSendResult
  | SqsSendBatchResult
  | SqsReceiveResult
  | SqsDeleteResult
  | SqsDeleteBatchResult
  | SqsEnsureQueueResult
  | SqsDeleteQueueResult;

/**
 * Union type of all SQS result types including failures.
 */
export type SqsResultType =
  | SqsSendResultType
  | SqsSendBatchResultType
  | SqsReceiveResultType
  | SqsDeleteResultType
  | SqsDeleteBatchResultType
  | SqsEnsureQueueResultType
  | SqsDeleteQueueResultType;

// ============================================================================
// Factory Functions for Failure Results
// ============================================================================

/**
 * Create a failure result for send operations.
 */
export function createSqsSendFailure(
  error: SqsError,
  duration: number,
): SqsSendResultFailure {
  return {
    kind: "sqs:send",
    ok: false,
    error,
    duration,
  };
}

/**
 * Create a failure result for batch send operations.
 */
export function createSqsSendBatchFailure(
  error: SqsError,
  duration: number,
): SqsSendBatchResultFailure {
  return {
    kind: "sqs:send-batch",
    ok: false,
    error,
    duration,
  };
}

/**
 * Create a failure result for receive operations.
 */
export function createSqsReceiveFailure(
  error: SqsError,
  duration: number,
): SqsReceiveResultFailure {
  return {
    kind: "sqs:receive",
    ok: false,
    error,
    duration,
  };
}

/**
 * Create a failure result for delete operations.
 */
export function createSqsDeleteFailure(
  error: SqsError,
  duration: number,
): SqsDeleteResultFailure {
  return {
    kind: "sqs:delete",
    ok: false,
    error,
    duration,
  };
}

/**
 * Create a failure result for batch delete operations.
 */
export function createSqsDeleteBatchFailure(
  error: SqsError,
  duration: number,
): SqsDeleteBatchResultFailure {
  return {
    kind: "sqs:delete-batch",
    ok: false,
    error,
    duration,
  };
}

/**
 * Create a failure result for ensure queue operations.
 */
export function createSqsEnsureQueueFailure(
  error: SqsError,
  duration: number,
): SqsEnsureQueueResultFailure {
  return {
    kind: "sqs:ensure-queue",
    ok: false,
    error,
    duration,
  };
}

/**
 * Create a failure result for delete queue operations.
 */
export function createSqsDeleteQueueFailure(
  error: SqsError,
  duration: number,
): SqsDeleteQueueResultFailure {
  return {
    kind: "sqs:delete-queue",
    ok: false,
    error,
    duration,
  };
}
