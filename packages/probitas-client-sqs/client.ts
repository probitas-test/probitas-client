import {
  CreateQueueCommand,
  DeleteMessageBatchCommand,
  DeleteMessageCommand,
  DeleteQueueCommand,
  type MessageAttributeValue,
  PurgeQueueCommand,
  type QueueAttributeName,
  ReceiveMessageCommand,
  SendMessageBatchCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { AbortError, TimeoutError } from "@probitas/client";
import { getLogger } from "@probitas/logger";
import { deadline } from "@std/async/deadline";
import type {
  SqsBatchMessage,
  SqsBatchOptions,
  SqsClient,
  SqsClientConfig,
  SqsConnectionConfig,
  SqsDeleteBatchResult,
  SqsDeleteOptions,
  SqsDeleteQueueOptions,
  SqsDeleteQueueResult,
  SqsDeleteResult,
  SqsEnsureQueueOptions,
  SqsEnsureQueueResult,
  SqsMessage,
  SqsMessageAttribute,
  SqsOptions,
  SqsReceiveOptions,
  SqsReceiveResult,
  SqsSendBatchResult,
  SqsSendOptions,
  SqsSendResult,
} from "./types.ts";
import {
  SqsCommandError,
  SqsConnectionError,
  SqsError,
  SqsMessageNotFoundError,
  SqsMessageTooLargeError,
  SqsQueueNotFoundError,
} from "./errors.ts";
import {
  SqsDeleteBatchResultErrorImpl,
  SqsDeleteBatchResultFailureImpl,
  SqsDeleteBatchResultSuccessImpl,
  SqsDeleteQueueResultErrorImpl,
  SqsDeleteQueueResultFailureImpl,
  SqsDeleteQueueResultSuccessImpl,
  SqsDeleteResultErrorImpl,
  SqsDeleteResultFailureImpl,
  SqsDeleteResultSuccessImpl,
  SqsEnsureQueueResultErrorImpl,
  SqsEnsureQueueResultFailureImpl,
  SqsEnsureQueueResultSuccessImpl,
  SqsReceiveResultErrorImpl,
  SqsReceiveResultFailureImpl,
  SqsReceiveResultSuccessImpl,
  SqsSendBatchResultErrorImpl,
  SqsSendBatchResultFailureImpl,
  SqsSendBatchResultSuccessImpl,
  SqsSendResultErrorImpl,
  SqsSendResultFailureImpl,
  SqsSendResultSuccessImpl,
} from "./result.ts";

const MAX_MESSAGE_SIZE = 256 * 1024; // 256 KB

const logger = getLogger("probitas", "client", "sqs");

/**
 * Convert DOMException to TimeoutError or AbortError.
 * Uses name-based checking instead of instanceof for cross-realm compatibility.
 */
function convertDeadlineError(
  err: unknown,
  operation: string,
  timeoutMs: number,
): unknown {
  if (err instanceof Error) {
    if (err.name === "TimeoutError") {
      return new TimeoutError(`Operation timed out: ${operation}`, timeoutMs);
    }
    if (err.name === "AbortError") {
      return new AbortError(`Operation aborted: ${operation}`);
    }
  }
  return err;
}

/**
 * Execute a promise with abort signal support only.
 *
 * This function exists as a workaround for @std/async@1.0.15's `deadline` limitation.
 * In v1.0.15, `deadline(promise, Infinity, { signal })` throws:
 *   "TypeError: Failed to execute 'AbortSignal.timeout': Argument 1 is not a finite number"
 *
 * This is because v1.0.15 unconditionally calls `AbortSignal.timeout(ms)`:
 *   const signals = [AbortSignal.timeout(ms)];  // Always called, even when ms=Infinity
 *
 * The fix has been merged to main branch (adding `ms < Number.MAX_SAFE_INTEGER` check)
 * and is expected to be released in @std/async@1.0.16 or later.
 *
 * Once the fix is released, this function can be removed and `withOptions` can
 * simply use `deadline(promise, Infinity, { signal })` for signal-only cases.
 *
 * @see https://github.com/denoland/std/blob/main/async/deadline.ts
 */
function withSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  operation: string,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new AbortError(`Operation aborted: ${operation}`));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new AbortError(`Operation aborted: ${operation}`));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise
      .then((value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      })
      .catch((err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      });
  });
}

/**
 * Execute a promise with timeout and abort signal support.
 *
 * Routes to appropriate implementation based on options:
 * - No options: return promise as-is
 * - Signal only: use withSignal (workaround for @std/async@1.0.15)
 * - Timeout (±signal): use deadline from @std/async
 */
function withOptions<T>(
  promise: Promise<T>,
  options: SqsOptions | undefined,
  operation: string,
): Promise<T> {
  if (!options?.timeout && !options?.signal) {
    return promise;
  }
  // Signal-only: use withSignal workaround (see withSignal JSDoc for details)
  // TODO: Replace with `deadline(promise, Infinity, { signal })` after @std/async@1.0.16
  if (!options.timeout && options.signal) {
    return withSignal(promise, options.signal, operation);
  }
  // Timeout (with optional signal): use deadline
  const timeoutMs = options.timeout!;
  return deadline(promise, timeoutMs, { signal: options.signal })
    .catch((err: unknown) => {
      throw convertDeadlineError(err, operation, timeoutMs);
    });
}

/**
 * Check if an error is a connection error.
 */
function isConnectionError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return (
      message.includes("network") ||
      message.includes("connection") ||
      message.includes("fetch") ||
      message.includes("dns") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("enotfound")
    );
  }
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    if (
      name.includes("network") ||
      name.includes("connection")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an error should be treated as a failure (unprocessed).
 * AbortError, TimeoutError, and SqsConnectionError are failures.
 */
function isFailureError(
  error: unknown,
): error is AbortError | TimeoutError | SqsConnectionError {
  return (
    error instanceof AbortError ||
    error instanceof TimeoutError ||
    error instanceof SqsConnectionError
  );
}

/**
 * Convert AWS SDK errors to SQS-specific errors.
 * Note: AbortError and TimeoutError are not converted - they are returned as-is.
 */
function convertSqsError(
  error: unknown,
  operation: string,
  context?: { queueUrl?: string },
): SqsError | AbortError | TimeoutError {
  if (error instanceof SqsError) {
    return error;
  }

  // AbortError and TimeoutError should not be converted
  if (error instanceof AbortError || error instanceof TimeoutError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message;
    const errorName = error.name;

    if (
      errorName === "QueueDoesNotExist" ||
      errorName === "AWS.SimpleQueueService.NonExistentQueue" ||
      message.includes("does not exist") ||
      message.includes("NonExistentQueue")
    ) {
      return new SqsQueueNotFoundError(
        message,
        context?.queueUrl ?? "unknown",
        { cause: error },
      );
    }

    if (
      errorName === "ReceiptHandleIsInvalid" ||
      message.includes("ReceiptHandleIsInvalid") ||
      message.includes("receipt handle")
    ) {
      return new SqsMessageNotFoundError(message, { cause: error });
    }

    if (isConnectionError(error)) {
      return new SqsConnectionError(message, { cause: error });
    }

    return new SqsCommandError(message, {
      operation,
      cause: error,
    });
  }

  return new SqsCommandError(String(error), { operation });
}

/**
 * Convert SDK message attributes to our format.
 */
function convertMessageAttributes(
  attrs: Record<string, MessageAttributeValue> | undefined,
): Record<string, SqsMessageAttribute> | undefined {
  if (!attrs) return undefined;

  const result: Record<string, SqsMessageAttribute> = {};
  for (const [key, value] of Object.entries(attrs)) {
    result[key] = {
      dataType: value.DataType as "String" | "Number" | "Binary",
      stringValue: value.StringValue,
      binaryValue: value.BinaryValue,
    };
  }
  return result;
}

/**
 * Convert our message attributes to SDK format.
 */
function toSdkMessageAttributes(
  attrs: Record<string, SqsMessageAttribute> | undefined,
): Record<string, MessageAttributeValue> | undefined {
  if (!attrs) return undefined;

  const result: Record<string, MessageAttributeValue> = {};
  for (const [key, value] of Object.entries(attrs)) {
    result[key] = {
      DataType: value.dataType,
      StringValue: value.stringValue,
      BinaryValue: value.binaryValue,
    };
  }
  return result;
}

/**
 * Validate message size and return error if too large.
 */
function validateMessageSize(body: string): SqsMessageTooLargeError | null {
  const size = new TextEncoder().encode(body).length;
  if (size > MAX_MESSAGE_SIZE) {
    return new SqsMessageTooLargeError(
      `Message size ${size} exceeds maximum allowed size ${MAX_MESSAGE_SIZE}`,
      size,
      MAX_MESSAGE_SIZE,
    );
  }
  return null;
}

/**
 * Resolve the endpoint URL from string or connection config.
 */
function resolveEndpointUrl(
  url: string | SqsConnectionConfig | undefined,
): string | undefined {
  if (url === undefined) {
    return undefined; // Let AWS SDK use default endpoint
  }
  if (typeof url === "string") {
    return url;
  }
  const protocol = url.protocol ?? "https";
  const host = url.host ?? "localhost";
  const port = url.port ?? 4566; // LocalStack default
  const path = url.path ?? "";
  return `${protocol}://${host}:${port}${path}`;
}

/**
 * Create a new Amazon SQS client instance.
 *
 * The client provides queue management, message publishing and consumption,
 * batch operations, and supports both standard and FIFO queues via AWS SDK.
 *
 * @param config - SQS client configuration
 * @returns A promise resolving to a new SQS client instance
 *
 * @example Basic usage with existing queue
 * ```ts
 * import { createSqsClient } from "@probitas/client-sqs";
 *
 * async function example() {
 *   const sqs = await createSqsClient({
 *     region: "ap-northeast-1",
 *     queueUrl: "https://sqs.ap-northeast-1.amazonaws.com/123456789/my-queue",
 *     credentials: { accessKeyId: "test", secretAccessKey: "test" },
 *   });
 *
 *   // Send a message
 *   const sendResult = await sqs.send(JSON.stringify({
 *     type: "ORDER",
 *     orderId: "123",
 *   }));
 *
 *   if (sendResult.ok) {
 *     console.log("Message ID:", sendResult.messageId);
 *   } else {
 *     console.error("Error:", sendResult.error.message);
 *   }
 *
 *   await sqs.close();
 * }
 * ```
 *
 * @example Using LocalStack for local development
 * ```ts
 * import { createSqsClient } from "@probitas/client-sqs";
 *
 * async function example() {
 *   const sqs = await createSqsClient({
 *     region: "us-east-1",
 *     url: "http://localhost:4566",
 *     credentials: {
 *       accessKeyId: "test",
 *       secretAccessKey: "test",
 *     },
 *   });
 *
 *   // Create queue dynamically (also sets queueUrl)
 *   const result = await sqs.ensureQueue("test-queue");
 *   if (result.ok) {
 *     console.log(result.queueUrl);  // http://localhost:4566/000000000000/test-queue
 *   }
 *
 *   await sqs.close();
 * }
 * ```
 *
 * @example Receiving messages with long polling
 * ```ts
 * import { createSqsClient } from "@probitas/client-sqs";
 *
 * async function example() {
 *   const sqs = await createSqsClient({
 *     region: "us-east-1",
 *     url: "http://localhost:4566",
 *     credentials: { accessKeyId: "test", secretAccessKey: "test" },
 *   });
 *   await sqs.ensureQueue("test-queue");
 *
 *   // Long polling waits up to 20 seconds for messages
 *   const receiveResult = await sqs.receive({
 *     maxMessages: 10,
 *     waitTimeSeconds: 20,
 *     visibilityTimeout: 30,
 *   });
 *
 *   if (receiveResult.ok) {
 *     console.log("Received:", receiveResult.messages.length);
 *
 *     // Process and acknowledge messages
 *     for (const msg of receiveResult.messages) {
 *       const data = JSON.parse(msg.body);
 *       console.log("Processing:", data);
 *
 *       // Delete after successful processing
 *       await sqs.delete(msg.receiptHandle);
 *     }
 *   }
 *
 *   await sqs.close();
 * }
 * ```
 *
 * @example Batch operations for high throughput
 * ```ts
 * import { createSqsClient } from "@probitas/client-sqs";
 *
 * async function example() {
 *   const sqs = await createSqsClient({
 *     region: "us-east-1",
 *     url: "http://localhost:4566",
 *     credentials: { accessKeyId: "test", secretAccessKey: "test" },
 *   });
 *   await sqs.ensureQueue("test-queue");
 *
 *   // Send multiple messages in a single API call
 *   const batchResult = await sqs.sendBatch([
 *     { id: "1", body: JSON.stringify({ event: "user.created", userId: "a1" }) },
 *     { id: "2", body: JSON.stringify({ event: "user.created", userId: "a2" }) },
 *     { id: "3", body: JSON.stringify({ event: "user.updated", userId: "a3" }) },
 *   ]);
 *
 *   if (batchResult.ok) {
 *     console.log(`Sent: ${batchResult.successful.length}`);
 *     console.log(`Failed: ${batchResult.failed.length}`);
 *   }
 *
 *   // Batch delete processed messages
 *   const receiveResult = await sqs.receive({ maxMessages: 10 });
 *   if (receiveResult.ok) {
 *     const handles = receiveResult.messages.map((m) => m.receiptHandle);
 *     await sqs.deleteBatch(handles);
 *   }
 *
 *   await sqs.close();
 * }
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * import { createSqsClient } from "@probitas/client-sqs";
 *
 * async function example() {
 *   await using sqs = await createSqsClient({
 *     region: "us-east-1",
 *     url: "http://localhost:4566",
 *     credentials: { accessKeyId: "test", secretAccessKey: "test" },
 *   });
 *
 *   await sqs.ensureQueue("test-queue");
 *   await sqs.send("Hello, SQS!");
 *   // Client automatically closed when scope exits
 * }
 * ```
 */
export function createSqsClient(
  config: SqsClientConfig,
): Promise<SqsClient> {
  let sqsClient: SQSClient;

  try {
    sqsClient = new SQSClient({
      endpoint: resolveEndpointUrl(config.url),
      region: config.region,
      credentials: config.credentials,
    });
  } catch (error) {
    throw new SqsConnectionError(
      `Failed to create SQS client: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error instanceof Error ? error : undefined },
    );
  }

  return Promise.resolve(new SqsClientImpl(config, sqsClient));
}

class SqsClientImpl implements SqsClient {
  readonly config: SqsClientConfig;
  readonly #client: SQSClient;
  #closed = false;
  #queueUrl: string | undefined;

  constructor(config: SqsClientConfig, client: SQSClient) {
    this.config = config;
    this.#client = client;
    this.#queueUrl = config.queueUrl;

    // Log client creation
    logger.debug("SQS client created", {
      queueUrl: this.#queueUrl,
      region: config.region,
      hasUrl: !!config.url,
    });
  }

  get queueUrl(): string | undefined {
    return this.#queueUrl;
  }

  setQueueUrl(queueUrl: string): void {
    this.#queueUrl = queueUrl;
    logger.debug("SQS queue URL set", { queueUrl });
  }

  #shouldThrow(options?: SqsOptions): boolean {
    return options?.throwOnError ?? this.config.throwOnError ?? false;
  }

  #checkClosed(
    operation: string,
  ): SqsCommandError | null {
    if (this.#closed) {
      return new SqsCommandError("Client is closed", { operation });
    }
    return null;
  }

  #checkQueueUrl(operation: string): SqsCommandError | null {
    if (!this.#queueUrl) {
      return new SqsCommandError(
        "Queue URL is required for this operation. Use setQueueUrl() or ensureQueue() first.",
        { operation },
      );
    }
    return null;
  }

  async send(
    body: string,
    options?: SqsSendOptions,
  ): Promise<SqsSendResult> {
    const startTime = performance.now();
    const operation = "send";

    // Check preconditions
    const closedError = this.#checkClosed(operation);
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw closedError;
      return new SqsSendResultErrorImpl({ error: closedError, duration });
    }

    const queueUrlError = this.#checkQueueUrl(operation);
    if (queueUrlError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw queueUrlError;
      return new SqsSendResultErrorImpl({ error: queueUrlError, duration });
    }

    const sizeError = validateMessageSize(body);
    if (sizeError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw sizeError;
      return new SqsSendResultErrorImpl({ error: sizeError, duration });
    }

    const queueUrl = this.#queueUrl!;

    // Log request start
    logger.info("SQS send message starting", {
      queueUrl,
      bodySize: new TextEncoder().encode(body).length,
      delaySeconds: options?.delaySeconds,
      attributeKeys: options?.messageAttributes
        ? Object.keys(options.messageAttributes)
        : [],
      hasMessageGroupId: !!options?.messageGroupId,
      hasMessageDeduplicationId: !!options?.messageDeduplicationId,
    });

    try {
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: body,
        DelaySeconds: options?.delaySeconds,
        MessageAttributes: toSdkMessageAttributes(options?.messageAttributes),
        MessageGroupId: options?.messageGroupId,
        MessageDeduplicationId: options?.messageDeduplicationId,
      });

      const response = await withOptions(
        this.#client.send(command),
        options,
        operation,
      );

      const duration = performance.now() - startTime;

      // Log success
      logger.info("SQS send message completed", {
        messageId: response.MessageId!,
        md5OfBody: response.MD5OfMessageBody!,
        sequenceNumber: response.SequenceNumber,
        duration: `${duration.toFixed(2)}ms`,
      });

      return new SqsSendResultSuccessImpl({
        messageId: response.MessageId!,
        md5OfBody: response.MD5OfMessageBody!,
        sequenceNumber: response.SequenceNumber ?? null,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("SQS send message failed", {
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const sqsError = convertSqsError(error, operation, { queueUrl });
      if (this.#shouldThrow(options)) throw sqsError;

      if (isFailureError(sqsError)) {
        return new SqsSendResultFailureImpl({ error: sqsError, duration });
      }
      return new SqsSendResultErrorImpl({ error: sqsError, duration });
    }
  }

  async sendBatch(
    messages: SqsBatchMessage[],
    options?: SqsBatchOptions,
  ): Promise<SqsSendBatchResult> {
    const startTime = performance.now();
    const operation = "sendBatch";

    // Check preconditions
    const closedError = this.#checkClosed(operation);
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw closedError;
      return new SqsSendBatchResultErrorImpl({ error: closedError, duration });
    }

    const queueUrlError = this.#checkQueueUrl(operation);
    if (queueUrlError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw queueUrlError;
      return new SqsSendBatchResultErrorImpl({
        error: queueUrlError,
        duration,
      });
    }

    // Validate message sizes
    for (const msg of messages) {
      const sizeError = validateMessageSize(msg.body);
      if (sizeError) {
        const duration = performance.now() - startTime;
        if (this.#shouldThrow(options)) throw sizeError;
        return new SqsSendBatchResultErrorImpl({ error: sizeError, duration });
      }
    }

    const queueUrl = this.#queueUrl!;

    // Log batch send start
    logger.info("SQS send batch messages starting", {
      queueUrl,
      count: messages.length,
      totalSize: messages.reduce(
        (sum, m) => sum + new TextEncoder().encode(m.body).length,
        0,
      ),
    });

    try {
      const command = new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: messages.map((msg) => ({
          Id: msg.id,
          MessageBody: msg.body,
          DelaySeconds: msg.delaySeconds,
          MessageAttributes: toSdkMessageAttributes(msg.messageAttributes),
        })),
      });

      const response = await withOptions(
        this.#client.send(command),
        options,
        operation,
      );

      const successful = (response.Successful ?? []).map((entry) => ({
        messageId: entry.MessageId!,
        id: entry.Id!,
      }));

      const failed = (response.Failed ?? []).map((entry) => ({
        id: entry.Id!,
        code: entry.Code!,
        message: entry.Message ?? "",
      }));

      const duration = performance.now() - startTime;

      // Log batch send result
      logger.info("SQS send batch messages completed", {
        successful: successful.length,
        failed: failed.length,
        duration: `${duration.toFixed(2)}ms`,
      });

      return new SqsSendBatchResultSuccessImpl({
        successful,
        failed,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("SQS send batch messages failed", {
        queueUrl,
        count: messages.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const sqsError = convertSqsError(error, operation, { queueUrl });
      if (this.#shouldThrow(options)) throw sqsError;

      if (isFailureError(sqsError)) {
        return new SqsSendBatchResultFailureImpl({ error: sqsError, duration });
      }
      return new SqsSendBatchResultErrorImpl({ error: sqsError, duration });
    }
  }

  async receive(
    options?: SqsReceiveOptions,
  ): Promise<SqsReceiveResult> {
    const startTime = performance.now();
    const operation = "receive";

    // Check preconditions
    const closedError = this.#checkClosed(operation);
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw closedError;
      return new SqsReceiveResultErrorImpl({ error: closedError, duration });
    }

    const queueUrlError = this.#checkQueueUrl(operation);
    if (queueUrlError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw queueUrlError;
      return new SqsReceiveResultErrorImpl({ error: queueUrlError, duration });
    }

    const queueUrl = this.#queueUrl!;

    // Log receive start
    logger.info("SQS receive messages starting", {
      queueUrl,
      maxMessages: options?.maxMessages,
      visibilityTimeout: options?.visibilityTimeout,
      waitTimeSeconds: options?.waitTimeSeconds,
      messageAttributeNames: options?.messageAttributeNames
        ? options.messageAttributeNames.length
        : 0,
    });

    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: options?.maxMessages,
        VisibilityTimeout: options?.visibilityTimeout,
        WaitTimeSeconds: options?.waitTimeSeconds,
        MessageAttributeNames: options?.messageAttributeNames as
          | string[]
          | undefined,
        AttributeNames: options?.attributeNames as
          | QueueAttributeName[]
          | undefined,
      });

      const response = await withOptions(
        this.#client.send(command),
        options,
        operation,
      );

      const messages: SqsMessage[] = (response.Messages ?? []).map((msg) => ({
        messageId: msg.MessageId!,
        body: msg.Body!,
        receiptHandle: msg.ReceiptHandle!,
        attributes: (msg.Attributes as Record<string, string>) ?? {},
        messageAttributes: convertMessageAttributes(msg.MessageAttributes),
        md5OfBody: msg.MD5OfBody!,
      }));

      const duration = performance.now() - startTime;

      // Log receive result
      logger.info("SQS receive messages completed", {
        count: messages.length,
        visibilityTimeout: options?.visibilityTimeout,
        duration: `${duration.toFixed(2)}ms`,
      });

      return new SqsReceiveResultSuccessImpl({
        messages,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("SQS receive messages failed", {
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const sqsError = convertSqsError(error, operation, { queueUrl });
      if (this.#shouldThrow(options)) throw sqsError;

      if (isFailureError(sqsError)) {
        return new SqsReceiveResultFailureImpl({ error: sqsError, duration });
      }
      return new SqsReceiveResultErrorImpl({ error: sqsError, duration });
    }
  }

  async delete(
    receiptHandle: string,
    options?: SqsDeleteOptions,
  ): Promise<SqsDeleteResult> {
    const startTime = performance.now();
    const operation = "delete";

    // Check preconditions
    const closedError = this.#checkClosed(operation);
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw closedError;
      return new SqsDeleteResultErrorImpl({ error: closedError, duration });
    }

    const queueUrlError = this.#checkQueueUrl(operation);
    if (queueUrlError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw queueUrlError;
      return new SqsDeleteResultErrorImpl({ error: queueUrlError, duration });
    }

    const queueUrl = this.#queueUrl!;

    // Log delete start
    logger.info("SQS delete message starting", {
      queueUrl,
    });

    try {
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await withOptions(
        this.#client.send(command),
        options,
        operation,
      );

      const duration = performance.now() - startTime;

      // Log delete result
      logger.info("SQS delete message completed", {
        duration: `${duration.toFixed(2)}ms`,
      });

      return new SqsDeleteResultSuccessImpl({ duration });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("SQS delete message failed", {
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const sqsError = convertSqsError(error, operation, { queueUrl });
      if (this.#shouldThrow(options)) throw sqsError;

      if (isFailureError(sqsError)) {
        return new SqsDeleteResultFailureImpl({ error: sqsError, duration });
      }
      return new SqsDeleteResultErrorImpl({ error: sqsError, duration });
    }
  }

  async deleteBatch(
    receiptHandles: string[],
    options?: SqsBatchOptions,
  ): Promise<SqsDeleteBatchResult> {
    const startTime = performance.now();
    const operation = "deleteBatch";

    // Check preconditions
    const closedError = this.#checkClosed(operation);
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw closedError;
      return new SqsDeleteBatchResultErrorImpl({
        error: closedError,
        duration,
      });
    }

    const queueUrlError = this.#checkQueueUrl(operation);
    if (queueUrlError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw queueUrlError;
      return new SqsDeleteBatchResultErrorImpl({
        error: queueUrlError,
        duration,
      });
    }

    const queueUrl = this.#queueUrl!;

    // Log batch delete start
    logger.info("SQS delete batch messages starting", {
      queueUrl,
      count: receiptHandles.length,
    });

    try {
      const command = new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: receiptHandles.map((handle, index) => ({
          Id: String(index),
          ReceiptHandle: handle,
        })),
      });

      const response = await withOptions(
        this.#client.send(command),
        options,
        operation,
      );

      const successful = (response.Successful ?? []).map((entry) => entry.Id!);

      const failed = (response.Failed ?? []).map((entry) => ({
        id: entry.Id!,
        code: entry.Code!,
        message: entry.Message ?? "",
      }));

      const duration = performance.now() - startTime;

      // Log batch delete result
      logger.info("SQS delete batch messages completed", {
        successful: successful.length,
        failed: failed.length,
        duration: `${duration.toFixed(2)}ms`,
      });

      return new SqsDeleteBatchResultSuccessImpl({
        successful,
        failed,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("SQS delete batch messages failed", {
        queueUrl,
        count: receiptHandles.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const sqsError = convertSqsError(error, operation, { queueUrl });
      if (this.#shouldThrow(options)) throw sqsError;

      if (isFailureError(sqsError)) {
        return new SqsDeleteBatchResultFailureImpl({
          error: sqsError,
          duration,
        });
      }
      return new SqsDeleteBatchResultErrorImpl({ error: sqsError, duration });
    }
  }

  async purge(options?: SqsOptions): Promise<SqsDeleteResult> {
    const startTime = performance.now();
    const operation = "purge";

    // Check preconditions
    const closedError = this.#checkClosed(operation);
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw closedError;
      return new SqsDeleteResultErrorImpl({ error: closedError, duration });
    }

    const queueUrlError = this.#checkQueueUrl(operation);
    if (queueUrlError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw queueUrlError;
      return new SqsDeleteResultErrorImpl({ error: queueUrlError, duration });
    }

    const queueUrl = this.#queueUrl!;

    // Log purge start
    logger.info("SQS purge queue starting", {
      queueUrl,
    });

    try {
      const command = new PurgeQueueCommand({
        QueueUrl: queueUrl,
      });

      await withOptions(
        this.#client.send(command),
        options,
        operation,
      );

      const duration = performance.now() - startTime;

      // Log purge result
      logger.info("SQS purge queue completed", {
        duration: `${duration.toFixed(2)}ms`,
      });

      return new SqsDeleteResultSuccessImpl({ duration });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("SQS purge queue failed", {
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const sqsError = convertSqsError(error, operation, { queueUrl });
      if (this.#shouldThrow(options)) throw sqsError;

      if (isFailureError(sqsError)) {
        return new SqsDeleteResultFailureImpl({ error: sqsError, duration });
      }
      return new SqsDeleteResultErrorImpl({ error: sqsError, duration });
    }
  }

  async ensureQueue(
    queueName: string,
    options?: SqsEnsureQueueOptions,
  ): Promise<SqsEnsureQueueResult> {
    const startTime = performance.now();
    const operation = "ensureQueue";

    // Check preconditions
    const closedError = this.#checkClosed(operation);
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw closedError;
      return new SqsEnsureQueueResultErrorImpl({
        error: closedError,
        duration,
      });
    }

    // Log ensureQueue start
    logger.info("SQS ensure queue starting", {
      queueName,
      hasAttributes: !!options?.attributes,
      hasTags: !!options?.tags,
    });

    try {
      const command = new CreateQueueCommand({
        QueueName: queueName,
        Attributes: options?.attributes,
        tags: options?.tags,
      });

      const response = await withOptions(
        this.#client.send(command),
        options,
        operation,
      );

      const duration = performance.now() - startTime;
      const queueUrl = response.QueueUrl!;

      // Set the queue URL for subsequent operations
      this.#queueUrl = queueUrl;

      // Log ensureQueue result
      logger.info("SQS ensure queue completed", {
        queueName,
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
      });

      return new SqsEnsureQueueResultSuccessImpl({
        queueUrl,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("SQS ensure queue failed", {
        queueName,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const sqsError = convertSqsError(error, operation, {});
      if (this.#shouldThrow(options)) throw sqsError;

      if (isFailureError(sqsError)) {
        return new SqsEnsureQueueResultFailureImpl({
          error: sqsError,
          duration,
        });
      }
      return new SqsEnsureQueueResultErrorImpl({ error: sqsError, duration });
    }
  }

  async deleteQueue(
    queueUrl: string,
    options?: SqsDeleteQueueOptions,
  ): Promise<SqsDeleteQueueResult> {
    const startTime = performance.now();
    const operation = "deleteQueue";

    // Check preconditions
    const closedError = this.#checkClosed(operation);
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) throw closedError;
      return new SqsDeleteQueueResultErrorImpl({
        error: closedError,
        duration,
      });
    }

    // Log deleteQueue start
    logger.info("SQS delete queue starting", {
      queueUrl,
    });

    try {
      const command = new DeleteQueueCommand({
        QueueUrl: queueUrl,
      });

      await withOptions(
        this.#client.send(command),
        options,
        operation,
      );

      const duration = performance.now() - startTime;

      // Log deleteQueue result
      logger.info("SQS delete queue completed", {
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
      });

      return new SqsDeleteQueueResultSuccessImpl({ duration });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("SQS delete queue failed", {
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const sqsError = convertSqsError(error, operation, { queueUrl });
      if (this.#shouldThrow(options)) throw sqsError;

      if (isFailureError(sqsError)) {
        return new SqsDeleteQueueResultFailureImpl({
          error: sqsError,
          duration,
        });
      }
      return new SqsDeleteQueueResultErrorImpl({ error: sqsError, duration });
    }
  }

  close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;

    try {
      this.#client.destroy();
    } catch {
      // Ignore close errors
    }
    return Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
