import type { CommonConnectionConfig, CommonOptions } from "@probitas/client";
import type {
  SqsDeleteBatchResult,
  SqsDeleteQueueResult,
  SqsDeleteResult,
  SqsEnsureQueueResult,
  SqsReceiveResult,
  SqsResult,
  SqsSendBatchResult,
  SqsSendResult,
} from "./result.ts";

export type {
  SqsDeleteBatchResult,
  SqsDeleteQueueResult,
  SqsDeleteResult,
  SqsEnsureQueueResult,
  SqsReceiveResult,
  SqsResult,
  SqsSendBatchResult,
  SqsSendResult,
};

/**
 * SQS connection configuration.
 *
 * Extends CommonConnectionConfig with SQS-specific options.
 */
export interface SqsConnectionConfig extends CommonConnectionConfig {
  /**
   * Protocol to use.
   * @default "https"
   */
  readonly protocol?: "http" | "https";

  /**
   * Custom path (for LocalStack or custom endpoints).
   * @default ""
   */
  readonly path?: string;

  /**
   * AWS region (required for AWS, optional for LocalStack).
   */
  readonly region?: string;
}

/**
 * SQS client configuration.
 */
export interface SqsClientConfig extends CommonOptions {
  /** AWS region */
  readonly region: string;
  /** AWS credentials */
  readonly credentials?: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
  };
  /** SQS queue URL (optional - can be set later or used with ensureQueue) */
  readonly queueUrl?: string;
  /**
   * SQS endpoint URL (e.g., "http://localhost:4566" for LocalStack).
   * Can be a string URL or a connection config object.
   * Optional for real AWS (uses default endpoint), required for LocalStack.
   */
  readonly url?: string | SqsConnectionConfig;
}

/**
 * SQS message attributes.
 */
export interface SqsMessageAttribute {
  readonly dataType: "String" | "Number" | "Binary";
  readonly stringValue?: string;
  readonly binaryValue?: Uint8Array;
}

/**
 * SQS message received from a queue.
 */
export interface SqsMessage {
  readonly messageId: string;
  readonly body: string;
  readonly receiptHandle: string;
  readonly attributes: Record<string, string>;
  readonly messageAttributes?: Record<string, SqsMessageAttribute>;
  readonly md5OfBody: string;
}

/**
 * Message array with helper methods.
 */
export interface SqsMessages extends ReadonlyArray<SqsMessage> {
  /** Get the first message or undefined if empty */
  first(): SqsMessage | undefined;
  /** Get the first message or throw if empty */
  firstOrThrow(): SqsMessage;
  /** Get the last message or undefined if empty */
  last(): SqsMessage | undefined;
  /** Get the last message or throw if empty */
  lastOrThrow(): SqsMessage;
}

/**
 * Options for sending a message.
 */
export interface SqsSendOptions extends CommonOptions {
  /** Delay in seconds before the message becomes visible (0-900) */
  readonly delaySeconds?: number;
  /** Message attributes */
  readonly messageAttributes?: Record<string, SqsMessageAttribute>;
  /** Message group ID (required for FIFO queues) */
  readonly messageGroupId?: string;
  /** Message deduplication ID (required for FIFO queues without content-based deduplication) */
  readonly messageDeduplicationId?: string;
}

/**
 * Batch message for sendBatch.
 */
export interface SqsBatchMessage {
  readonly id: string;
  readonly body: string;
  readonly delaySeconds?: number;
  readonly messageAttributes?: Record<string, SqsMessageAttribute>;
}

/**
 * Options for receiving messages.
 */
export interface SqsReceiveOptions extends CommonOptions {
  /** Maximum number of messages to receive (1-10, default: 1) */
  readonly maxMessages?: number;
  /** Wait time in seconds for long polling (0-20) */
  readonly waitTimeSeconds?: number;
  /** Visibility timeout in seconds (0-43200) */
  readonly visibilityTimeout?: number;
  /** System attribute names to retrieve */
  readonly attributeNames?: readonly string[];
  /** Message attribute names to retrieve */
  readonly messageAttributeNames?: readonly string[];
}

/**
 * Successful batch send entry.
 */
export interface SqsBatchSuccessEntry {
  readonly messageId: string;
  readonly id: string;
}

/**
 * Failed batch entry.
 */
export interface SqsBatchFailedEntry {
  readonly id: string;
  readonly code: string;
  readonly message: string;
}

/**
 * Options for ensuring a queue exists.
 */
export interface SqsEnsureQueueOptions extends CommonOptions {
  /** Queue attributes (e.g., DelaySeconds, MessageRetentionPeriod) */
  readonly attributes?: Record<string, string>;
  /** Queue tags */
  readonly tags?: Record<string, string>;
}

/**
 * SQS client interface.
 */
export interface SqsClient extends AsyncDisposable {
  readonly config: SqsClientConfig;

  /**
   * The current queue URL. Can be set via config, ensureQueue(), or setQueueUrl().
   */
  readonly queueUrl: string | undefined;

  /**
   * Set the queue URL for subsequent operations.
   */
  setQueueUrl(queueUrl: string): void;

  /**
   * Ensure a queue exists. Creates the queue if it doesn't exist.
   * If the queue already exists with the same attributes, returns the existing queue URL.
   * Also sets the queue URL for subsequent operations.
   */
  ensureQueue(
    queueName: string,
    options?: SqsEnsureQueueOptions,
  ): Promise<SqsEnsureQueueResult>;

  /**
   * Delete a queue by URL.
   */
  deleteQueue(
    queueUrl: string,
    options?: CommonOptions,
  ): Promise<SqsDeleteQueueResult>;

  /**
   * Send a message to the queue.
   */
  send(body: string, options?: SqsSendOptions): Promise<SqsSendResult>;

  /**
   * Send multiple messages to the queue in a single request.
   */
  sendBatch(messages: SqsBatchMessage[]): Promise<SqsSendBatchResult>;

  /**
   * Receive messages from the queue.
   */
  receive(options?: SqsReceiveOptions): Promise<SqsReceiveResult>;

  /**
   * Delete a message from the queue.
   */
  delete(
    receiptHandle: string,
    options?: CommonOptions,
  ): Promise<SqsDeleteResult>;

  /**
   * Delete multiple messages from the queue in a single request.
   */
  deleteBatch(
    receiptHandles: string[],
    options?: CommonOptions,
  ): Promise<SqsDeleteBatchResult>;

  /**
   * Purge all messages from the queue.
   */
  purge(options?: CommonOptions): Promise<SqsDeleteResult>;

  /**
   * Close the client and release resources.
   */
  close(): Promise<void>;
}
