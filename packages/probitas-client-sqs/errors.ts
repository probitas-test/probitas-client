import { AbortError, ClientError, TimeoutError } from "@probitas/client";

/**
 * Options for SQS errors.
 */
export interface SqsErrorOptions extends ErrorOptions {
  readonly code?: string;
}

/**
 * Base error class for SQS client errors.
 */
export class SqsError extends ClientError {
  override readonly name: string = "SqsError";
  readonly code?: string;

  constructor(
    message: string,
    kind: string = "sqs",
    options?: SqsErrorOptions,
  ) {
    super(message, kind, options);
    this.code = options?.code;
  }
}

/**
 * Error thrown when an SQS connection cannot be established.
 */
export class SqsConnectionError extends SqsError {
  override readonly name = "SqsConnectionError";
  override readonly kind = "connection" as const;

  constructor(message: string, options?: SqsErrorOptions) {
    super(message, "connection", options);
  }
}

/**
 * Options for SQS command errors.
 */
export interface SqsCommandErrorOptions extends SqsErrorOptions {
  readonly operation: string;
}

/**
 * Error thrown when an SQS command fails.
 */
export class SqsCommandError extends SqsError {
  override readonly name = "SqsCommandError";
  override readonly kind = "command" as const;
  readonly operation: string;

  constructor(message: string, options: SqsCommandErrorOptions) {
    super(message, "command", options);
    this.operation = options.operation;
  }
}

/**
 * Error thrown when a queue is not found.
 */
export class SqsQueueNotFoundError extends SqsError {
  override readonly name = "SqsQueueNotFoundError";
  override readonly kind = "queue_not_found" as const;
  readonly queueUrl: string;

  constructor(message: string, queueUrl: string, options?: SqsErrorOptions) {
    super(message, "queue_not_found", options);
    this.queueUrl = queueUrl;
  }
}

/**
 * Error thrown when a message exceeds the size limit.
 */
export class SqsMessageTooLargeError extends SqsError {
  override readonly name = "SqsMessageTooLargeError";
  override readonly kind = "message_too_large" as const;
  readonly size: number;
  readonly maxSize: number;

  constructor(
    message: string,
    size: number,
    maxSize: number,
    options?: SqsErrorOptions,
  ) {
    super(message, "message_too_large", options);
    this.size = size;
    this.maxSize = maxSize;
  }
}

/**
 * Error thrown when a batch operation partially fails.
 */
export class SqsBatchError extends SqsError {
  override readonly name = "SqsBatchError";
  override readonly kind = "batch" as const;
  readonly failedCount: number;

  constructor(message: string, failedCount: number, options?: SqsErrorOptions) {
    super(message, "batch", options);
    this.failedCount = failedCount;
  }
}

/**
 * Error thrown when a message is not found or receipt handle is invalid.
 */
export class SqsMessageNotFoundError extends SqsError {
  override readonly name = "SqsMessageNotFoundError";
  override readonly kind = "message_not_found" as const;

  constructor(message: string, options?: SqsErrorOptions) {
    super(message, "message_not_found", options);
  }
}

/**
 * Error types that indicate an operation was processed by the server.
 * These errors occur after the operation reaches the SQS service.
 */
export type SqsOperationError =
  | SqsCommandError
  | SqsQueueNotFoundError
  | SqsMessageTooLargeError
  | SqsBatchError
  | SqsMessageNotFoundError
  | SqsError;

/**
 * Error types that indicate the operation was not processed.
 * These are errors that occur before the operation reaches the SQS service.
 */
export type SqsFailureError =
  | SqsConnectionError
  | AbortError
  | TimeoutError;
