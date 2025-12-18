import type { ClientResult } from "@probitas/client";
import type {
  SqsBatchFailedEntry,
  SqsBatchSuccessEntry,
  SqsMessages,
} from "./types.ts";

/**
 * Result of sending a message.
 */
export interface SqsSendResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:send"` for single message send operations.
   */
  readonly kind: "sqs:send";

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
 * Result of batch sending messages.
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
 * Result of receiving messages.
 */
export interface SqsReceiveResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:receive"` for message receive operations.
   */
  readonly kind: "sqs:receive";

  /**
   * Array of received messages (may be empty).
   *
   * Includes helper methods like first(), last(), etc.
   */
  readonly messages: SqsMessages;
}

/**
 * Result of deleting a message.
 */
export interface SqsDeleteResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:delete"` for single message delete operations.
   */
  readonly kind: "sqs:delete";
}

/**
 * Result of batch deleting messages.
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
 * Result of ensuring a queue exists.
 */
export interface SqsEnsureQueueResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:ensure-queue"` for queue creation/verification operations.
   */
  readonly kind: "sqs:ensure-queue";

  /**
   * URL of the queue (existing or newly created).
   */
  readonly queueUrl: string;
}

/**
 * Result of deleting a queue.
 */
export interface SqsDeleteQueueResult extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"sqs:delete-queue"` for queue deletion operations.
   */
  readonly kind: "sqs:delete-queue";
}

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
