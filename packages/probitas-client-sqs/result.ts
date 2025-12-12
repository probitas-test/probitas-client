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
  readonly kind: "sqs:send";
  readonly messageId: string;
  readonly md5OfBody: string;
  readonly sequenceNumber?: string;
}

/**
 * Result of batch sending messages.
 */
export interface SqsSendBatchResult extends ClientResult {
  readonly kind: "sqs:send-batch";
  readonly successful: readonly SqsBatchSuccessEntry[];
  readonly failed: readonly SqsBatchFailedEntry[];
}

/**
 * Result of receiving messages.
 */
export interface SqsReceiveResult extends ClientResult {
  readonly kind: "sqs:receive";
  readonly messages: SqsMessages;
}

/**
 * Result of deleting a message.
 */
export interface SqsDeleteResult extends ClientResult {
  readonly kind: "sqs:delete";
}

/**
 * Result of batch deleting messages.
 */
export interface SqsDeleteBatchResult extends ClientResult {
  readonly kind: "sqs:delete-batch";
  readonly successful: readonly string[];
  readonly failed: readonly SqsBatchFailedEntry[];
}

/**
 * Result of ensuring a queue exists.
 */
export interface SqsEnsureQueueResult extends ClientResult {
  readonly kind: "sqs:ensure-queue";
  readonly queueUrl: string;
}

/**
 * Result of deleting a queue.
 */
export interface SqsDeleteQueueResult extends ClientResult {
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
