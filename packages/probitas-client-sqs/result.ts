import type { AbortError, ClientResult, TimeoutError } from "@probitas/client";
import type {
  SqsBatchFailedEntry,
  SqsBatchSuccessEntry,
  SqsConnectionError,
  SqsError,
  SqsMessage,
} from "./types.ts";

/**
 * Error types that indicate the operation was not processed.
 * These are errors that occur before the operation reaches the SQS service.
 */
type SqsFailureError = SqsConnectionError | AbortError | TimeoutError;

// ============================================================================
// SqsSendResult
// ============================================================================

/**
 * Base interface for send result with common fields.
 */
interface SqsSendResultBase extends ClientResult {
  readonly kind: "sqs:send";
}

/**
 * Successful send result.
 */
export interface SqsSendResultSuccess extends SqsSendResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  /** Unique identifier for the sent message. */
  readonly messageId: string;
  /** MD5 hash of the message body (for integrity verification). */
  readonly md5OfBody: string;
  /** Sequence number for FIFO queues (present only for FIFO queues). */
  readonly sequenceNumber: string | null;
}

/**
 * Send result with SQS error.
 */
export interface SqsSendResultError extends SqsSendResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: SqsError;
  readonly messageId: null;
  readonly md5OfBody: null;
  readonly sequenceNumber: null;
}

/**
 * Send result with connection failure.
 */
export interface SqsSendResultFailure extends SqsSendResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: SqsFailureError;
  readonly messageId: null;
  readonly md5OfBody: null;
  readonly sequenceNumber: null;
}

/**
 * Result of sending a message.
 */
export type SqsSendResult =
  | SqsSendResultSuccess
  | SqsSendResultError
  | SqsSendResultFailure;

/**
 * Implementation class for SqsSendResultSuccess.
 * @internal
 */
export class SqsSendResultSuccessImpl implements SqsSendResultSuccess {
  readonly kind = "sqs:send" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly messageId: string;
  readonly md5OfBody: string;
  readonly sequenceNumber: string | null;
  readonly duration: number;

  constructor(params: {
    messageId: string;
    md5OfBody: string;
    sequenceNumber: string | null;
    duration: number;
  }) {
    this.messageId = params.messageId;
    this.md5OfBody = params.md5OfBody;
    this.sequenceNumber = params.sequenceNumber;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsSendResultError.
 * @internal
 */
export class SqsSendResultErrorImpl implements SqsSendResultError {
  readonly kind = "sqs:send" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: SqsError;
  readonly messageId = null;
  readonly md5OfBody = null;
  readonly sequenceNumber = null;
  readonly duration: number;

  constructor(params: {
    error: SqsError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsSendResultFailure.
 * @internal
 */
export class SqsSendResultFailureImpl implements SqsSendResultFailure {
  readonly kind = "sqs:send" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: SqsFailureError;
  readonly messageId = null;
  readonly md5OfBody = null;
  readonly sequenceNumber = null;
  readonly duration: number;

  constructor(params: {
    error: SqsFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// SqsSendBatchResult
// ============================================================================

/**
 * Base interface for batch send result with common fields.
 */
interface SqsSendBatchResultBase extends ClientResult {
  readonly kind: "sqs:send-batch";
}

/**
 * Successful batch send result.
 *
 * Note: `ok: true` even if some messages failed (partial failure).
 * Check `failed.length > 0` to detect partial failures.
 */
export interface SqsSendBatchResultSuccess extends SqsSendBatchResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  /** Array of successfully sent messages. */
  readonly successful: readonly SqsBatchSuccessEntry[];
  /** Array of messages that failed to send (may be non-empty even with ok: true). */
  readonly failed: readonly SqsBatchFailedEntry[];
}

/**
 * Batch send result with SQS error.
 */
export interface SqsSendBatchResultError extends SqsSendBatchResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: SqsError;
  readonly successful: readonly [];
  readonly failed: readonly [];
}

/**
 * Batch send result with connection failure.
 */
export interface SqsSendBatchResultFailure extends SqsSendBatchResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: SqsFailureError;
  readonly successful: null;
  readonly failed: null;
}

/**
 * Result of batch sending messages.
 */
export type SqsSendBatchResult =
  | SqsSendBatchResultSuccess
  | SqsSendBatchResultError
  | SqsSendBatchResultFailure;

/**
 * Implementation class for SqsSendBatchResultSuccess.
 * @internal
 */
export class SqsSendBatchResultSuccessImpl
  implements SqsSendBatchResultSuccess {
  readonly kind = "sqs:send-batch" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly successful: readonly SqsBatchSuccessEntry[];
  readonly failed: readonly SqsBatchFailedEntry[];
  readonly duration: number;

  constructor(params: {
    successful: readonly SqsBatchSuccessEntry[];
    failed: readonly SqsBatchFailedEntry[];
    duration: number;
  }) {
    this.successful = params.successful;
    this.failed = params.failed;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsSendBatchResultError.
 * @internal
 */
export class SqsSendBatchResultErrorImpl implements SqsSendBatchResultError {
  readonly kind = "sqs:send-batch" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: SqsError;
  readonly successful = [] as const;
  readonly failed = [] as const;
  readonly duration: number;

  constructor(params: {
    error: SqsError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsSendBatchResultFailure.
 * @internal
 */
export class SqsSendBatchResultFailureImpl
  implements SqsSendBatchResultFailure {
  readonly kind = "sqs:send-batch" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: SqsFailureError;
  readonly successful = null;
  readonly failed = null;
  readonly duration: number;

  constructor(params: {
    error: SqsFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// SqsReceiveResult
// ============================================================================

/**
 * Base interface for receive result with common fields.
 */
interface SqsReceiveResultBase extends ClientResult {
  readonly kind: "sqs:receive";
}

/**
 * Successful receive result.
 */
export interface SqsReceiveResultSuccess extends SqsReceiveResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  /** Array of received messages (may be empty). */
  readonly messages: readonly SqsMessage[];
}

/**
 * Receive result with SQS error.
 */
export interface SqsReceiveResultError extends SqsReceiveResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: SqsError;
  readonly messages: readonly [];
}

/**
 * Receive result with connection failure.
 */
export interface SqsReceiveResultFailure extends SqsReceiveResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: SqsFailureError;
  readonly messages: null;
}

/**
 * Result of receiving messages.
 */
export type SqsReceiveResult =
  | SqsReceiveResultSuccess
  | SqsReceiveResultError
  | SqsReceiveResultFailure;

/**
 * Implementation class for SqsReceiveResultSuccess.
 * @internal
 */
export class SqsReceiveResultSuccessImpl implements SqsReceiveResultSuccess {
  readonly kind = "sqs:receive" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly messages: readonly SqsMessage[];
  readonly duration: number;

  constructor(params: {
    messages: readonly SqsMessage[];
    duration: number;
  }) {
    this.messages = params.messages;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsReceiveResultError.
 * @internal
 */
export class SqsReceiveResultErrorImpl implements SqsReceiveResultError {
  readonly kind = "sqs:receive" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: SqsError;
  readonly messages = [] as const;
  readonly duration: number;

  constructor(params: {
    error: SqsError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsReceiveResultFailure.
 * @internal
 */
export class SqsReceiveResultFailureImpl implements SqsReceiveResultFailure {
  readonly kind = "sqs:receive" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: SqsFailureError;
  readonly messages = null;
  readonly duration: number;

  constructor(params: {
    error: SqsFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// SqsDeleteResult
// ============================================================================

/**
 * Base interface for delete result with common fields.
 */
interface SqsDeleteResultBase extends ClientResult {
  readonly kind: "sqs:delete";
}

/**
 * Successful delete result.
 */
export interface SqsDeleteResultSuccess extends SqsDeleteResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
}

/**
 * Delete result with SQS error.
 */
export interface SqsDeleteResultError extends SqsDeleteResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: SqsError;
}

/**
 * Delete result with connection failure.
 */
export interface SqsDeleteResultFailure extends SqsDeleteResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: SqsFailureError;
}

/**
 * Result of deleting a message.
 */
export type SqsDeleteResult =
  | SqsDeleteResultSuccess
  | SqsDeleteResultError
  | SqsDeleteResultFailure;

/**
 * Implementation class for SqsDeleteResultSuccess.
 * @internal
 */
export class SqsDeleteResultSuccessImpl implements SqsDeleteResultSuccess {
  readonly kind = "sqs:delete" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly duration: number;

  constructor(params: {
    duration: number;
  }) {
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsDeleteResultError.
 * @internal
 */
export class SqsDeleteResultErrorImpl implements SqsDeleteResultError {
  readonly kind = "sqs:delete" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: SqsError;
  readonly duration: number;

  constructor(params: {
    error: SqsError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsDeleteResultFailure.
 * @internal
 */
export class SqsDeleteResultFailureImpl implements SqsDeleteResultFailure {
  readonly kind = "sqs:delete" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: SqsFailureError;
  readonly duration: number;

  constructor(params: {
    error: SqsFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// SqsDeleteBatchResult
// ============================================================================

/**
 * Base interface for batch delete result with common fields.
 */
interface SqsDeleteBatchResultBase extends ClientResult {
  readonly kind: "sqs:delete-batch";
}

/**
 * Successful batch delete result.
 *
 * Note: `ok: true` even if some messages failed (partial failure).
 * Check `failed.length > 0` to detect partial failures.
 */
export interface SqsDeleteBatchResultSuccess extends SqsDeleteBatchResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  /** Array of message IDs that were successfully deleted. */
  readonly successful: readonly string[];
  /** Array of messages that failed to delete (may be non-empty even with ok: true). */
  readonly failed: readonly SqsBatchFailedEntry[];
}

/**
 * Batch delete result with SQS error.
 */
export interface SqsDeleteBatchResultError extends SqsDeleteBatchResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: SqsError;
  readonly successful: readonly [];
  readonly failed: readonly [];
}

/**
 * Batch delete result with connection failure.
 */
export interface SqsDeleteBatchResultFailure extends SqsDeleteBatchResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: SqsFailureError;
  readonly successful: null;
  readonly failed: null;
}

/**
 * Result of batch deleting messages.
 */
export type SqsDeleteBatchResult =
  | SqsDeleteBatchResultSuccess
  | SqsDeleteBatchResultError
  | SqsDeleteBatchResultFailure;

/**
 * Implementation class for SqsDeleteBatchResultSuccess.
 * @internal
 */
export class SqsDeleteBatchResultSuccessImpl
  implements SqsDeleteBatchResultSuccess {
  readonly kind = "sqs:delete-batch" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly successful: readonly string[];
  readonly failed: readonly SqsBatchFailedEntry[];
  readonly duration: number;

  constructor(params: {
    successful: readonly string[];
    failed: readonly SqsBatchFailedEntry[];
    duration: number;
  }) {
    this.successful = params.successful;
    this.failed = params.failed;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsDeleteBatchResultError.
 * @internal
 */
export class SqsDeleteBatchResultErrorImpl
  implements SqsDeleteBatchResultError {
  readonly kind = "sqs:delete-batch" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: SqsError;
  readonly successful = [] as const;
  readonly failed = [] as const;
  readonly duration: number;

  constructor(params: {
    error: SqsError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsDeleteBatchResultFailure.
 * @internal
 */
export class SqsDeleteBatchResultFailureImpl
  implements SqsDeleteBatchResultFailure {
  readonly kind = "sqs:delete-batch" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: SqsFailureError;
  readonly successful = null;
  readonly failed = null;
  readonly duration: number;

  constructor(params: {
    error: SqsFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// SqsEnsureQueueResult
// ============================================================================

/**
 * Base interface for ensure queue result with common fields.
 */
interface SqsEnsureQueueResultBase extends ClientResult {
  readonly kind: "sqs:ensure-queue";
}

/**
 * Successful ensure queue result.
 */
export interface SqsEnsureQueueResultSuccess extends SqsEnsureQueueResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  /** URL of the queue (existing or newly created). */
  readonly queueUrl: string;
}

/**
 * Ensure queue result with SQS error.
 */
export interface SqsEnsureQueueResultError extends SqsEnsureQueueResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: SqsError;
  readonly queueUrl: null;
}

/**
 * Ensure queue result with connection failure.
 */
export interface SqsEnsureQueueResultFailure extends SqsEnsureQueueResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: SqsFailureError;
  readonly queueUrl: null;
}

/**
 * Result of ensuring a queue exists.
 */
export type SqsEnsureQueueResult =
  | SqsEnsureQueueResultSuccess
  | SqsEnsureQueueResultError
  | SqsEnsureQueueResultFailure;

/**
 * Implementation class for SqsEnsureQueueResultSuccess.
 * @internal
 */
export class SqsEnsureQueueResultSuccessImpl
  implements SqsEnsureQueueResultSuccess {
  readonly kind = "sqs:ensure-queue" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly queueUrl: string;
  readonly duration: number;

  constructor(params: {
    queueUrl: string;
    duration: number;
  }) {
    this.queueUrl = params.queueUrl;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsEnsureQueueResultError.
 * @internal
 */
export class SqsEnsureQueueResultErrorImpl
  implements SqsEnsureQueueResultError {
  readonly kind = "sqs:ensure-queue" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: SqsError;
  readonly queueUrl = null;
  readonly duration: number;

  constructor(params: {
    error: SqsError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsEnsureQueueResultFailure.
 * @internal
 */
export class SqsEnsureQueueResultFailureImpl
  implements SqsEnsureQueueResultFailure {
  readonly kind = "sqs:ensure-queue" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: SqsFailureError;
  readonly queueUrl = null;
  readonly duration: number;

  constructor(params: {
    error: SqsFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// SqsDeleteQueueResult
// ============================================================================

/**
 * Base interface for delete queue result with common fields.
 */
interface SqsDeleteQueueResultBase extends ClientResult {
  readonly kind: "sqs:delete-queue";
}

/**
 * Successful delete queue result.
 */
export interface SqsDeleteQueueResultSuccess extends SqsDeleteQueueResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
}

/**
 * Delete queue result with SQS error.
 */
export interface SqsDeleteQueueResultError extends SqsDeleteQueueResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: SqsError;
}

/**
 * Delete queue result with connection failure.
 */
export interface SqsDeleteQueueResultFailure extends SqsDeleteQueueResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: SqsFailureError;
}

/**
 * Result of deleting a queue.
 */
export type SqsDeleteQueueResult =
  | SqsDeleteQueueResultSuccess
  | SqsDeleteQueueResultError
  | SqsDeleteQueueResultFailure;

/**
 * Implementation class for SqsDeleteQueueResultSuccess.
 * @internal
 */
export class SqsDeleteQueueResultSuccessImpl
  implements SqsDeleteQueueResultSuccess {
  readonly kind = "sqs:delete-queue" as const;
  readonly processed = true as const;
  readonly ok = true as const;
  readonly error = null;
  readonly duration: number;

  constructor(params: {
    duration: number;
  }) {
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsDeleteQueueResultError.
 * @internal
 */
export class SqsDeleteQueueResultErrorImpl
  implements SqsDeleteQueueResultError {
  readonly kind = "sqs:delete-queue" as const;
  readonly processed = true as const;
  readonly ok = false as const;
  readonly error: SqsError;
  readonly duration: number;

  constructor(params: {
    error: SqsError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

/**
 * Implementation class for SqsDeleteQueueResultFailure.
 * @internal
 */
export class SqsDeleteQueueResultFailureImpl
  implements SqsDeleteQueueResultFailure {
  readonly kind = "sqs:delete-queue" as const;
  readonly processed = false as const;
  readonly ok = false as const;
  readonly error: SqsFailureError;
  readonly duration: number;

  constructor(params: {
    error: SqsFailureError;
    duration: number;
  }) {
    this.error = params.error;
    this.duration = params.duration;
  }
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * Union type of all SQS result types.
 */
export type SqsResult =
  | SqsSendResult
  | SqsSendBatchResult
  | SqsReceiveResult
  | SqsDeleteResult
  | SqsDeleteBatchResult
  | SqsEnsureQueueResult
  | SqsDeleteQueueResult;
