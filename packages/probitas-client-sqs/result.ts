import type {
  SqsBatchFailedEntry,
  SqsBatchSuccessEntry,
  SqsMessages,
} from "./types.ts";

/**
 * Result of sending a message.
 */
export interface SqsSendResult {
  readonly type: "sqs:send";
  readonly ok: boolean;
  readonly messageId: string;
  readonly md5OfBody: string;
  readonly sequenceNumber?: string;
  readonly duration: number;
}

/**
 * Result of batch sending messages.
 */
export interface SqsSendBatchResult {
  readonly type: "sqs:send-batch";
  readonly ok: boolean;
  readonly successful: readonly SqsBatchSuccessEntry[];
  readonly failed: readonly SqsBatchFailedEntry[];
  readonly duration: number;
}

/**
 * Result of receiving messages.
 */
export interface SqsReceiveResult {
  readonly type: "sqs:receive";
  readonly ok: boolean;
  readonly messages: SqsMessages;
  readonly duration: number;
}

/**
 * Result of deleting a message.
 */
export interface SqsDeleteResult {
  readonly type: "sqs:delete";
  readonly ok: boolean;
  readonly duration: number;
}

/**
 * Result of batch deleting messages.
 */
export interface SqsDeleteBatchResult {
  readonly type: "sqs:delete-batch";
  readonly ok: boolean;
  readonly successful: readonly string[];
  readonly failed: readonly SqsBatchFailedEntry[];
  readonly duration: number;
}

/**
 * Result of ensuring a queue exists.
 */
export interface SqsEnsureQueueResult {
  readonly type: "sqs:ensure-queue";
  readonly ok: boolean;
  readonly queueUrl: string;
  readonly duration: number;
}

/**
 * Result of deleting a queue.
 */
export interface SqsDeleteQueueResult {
  readonly type: "sqs:delete-queue";
  readonly ok: boolean;
  readonly duration: number;
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
