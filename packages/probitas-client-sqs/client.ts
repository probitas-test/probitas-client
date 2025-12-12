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
import type { CommonOptions } from "@probitas/client";
import type {
  SqsBatchMessage,
  SqsClient,
  SqsClientConfig,
  SqsConnectionConfig,
  SqsDeleteBatchResult,
  SqsDeleteQueueResult,
  SqsDeleteResult,
  SqsEnsureQueueOptions,
  SqsEnsureQueueResult,
  SqsMessage,
  SqsMessageAttribute,
  SqsReceiveOptions,
  SqsReceiveResult,
  SqsSendBatchResult,
  SqsSendOptions,
  SqsSendResult,
} from "./types.ts";
import {
  SqsCommandError,
  SqsConnectionError,
  SqsMessageNotFoundError,
  SqsMessageTooLargeError,
  SqsQueueNotFoundError,
} from "./errors.ts";
import { createSqsMessages } from "./messages.ts";

const MAX_MESSAGE_SIZE = 256 * 1024; // 256 KB

const logger = getLogger("probitas", "client", "sqs");

/**
 * Format a value for logging, truncating long strings.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") {
    return value.length > 200 ? value.slice(0, 200) + "..." : value;
  }
  try {
    const str = JSON.stringify(value);
    return str.length > 200 ? str.slice(0, 200) + "..." : str;
  } catch {
    return "<unserializable>";
  }
}

/**
 * Execute a promise with timeout and abort signal support.
 */
async function withOptions<T>(
  promise: Promise<T>,
  options: CommonOptions | undefined,
  operation: string,
): Promise<T> {
  if (!options?.timeout && !options?.signal) {
    return promise;
  }

  const controllers: { cleanup: () => void }[] = [];

  try {
    const racePromises: Promise<T>[] = [promise];

    if (options.timeout !== undefined) {
      const timeoutMs = options.timeout;
      let timeoutId: number;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new TimeoutError(`Operation timed out: ${operation}`, timeoutMs),
          );
        }, timeoutMs);
      });
      controllers.push({ cleanup: () => clearTimeout(timeoutId) });
      racePromises.push(timeoutPromise);
    }

    if (options.signal) {
      const signal = options.signal;
      if (signal.aborted) {
        throw new AbortError(`Operation aborted: ${operation}`);
      }

      const abortPromise = new Promise<never>((_, reject) => {
        const onAbort = () => {
          reject(new AbortError(`Operation aborted: ${operation}`));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        controllers.push({
          cleanup: () => signal.removeEventListener("abort", onAbort),
        });
      });
      racePromises.push(abortPromise);
    }

    return await Promise.race(racePromises);
  } finally {
    for (const controller of controllers) {
      controller.cleanup();
    }
  }
}

/**
 * Convert AWS SDK errors to SQS-specific errors.
 */
function convertSqsError(
  error: unknown,
  operation: string,
  context?: { queueUrl?: string },
): never {
  if (error instanceof TimeoutError || error instanceof AbortError) {
    throw error;
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
      throw new SqsQueueNotFoundError(
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
      throw new SqsMessageNotFoundError(message, { cause: error });
    }

    throw new SqsCommandError(message, {
      operation,
      cause: error,
    });
  }

  throw new SqsCommandError(String(error), { operation });
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
 * Validate message size.
 */
function validateMessageSize(body: string): void {
  const size = new TextEncoder().encode(body).length;
  if (size > MAX_MESSAGE_SIZE) {
    throw new SqsMessageTooLargeError(
      `Message size ${size} exceeds maximum allowed size ${MAX_MESSAGE_SIZE}`,
      size,
      MAX_MESSAGE_SIZE,
    );
  }
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
 * const sqs = await createSqsClient({
 *   region: "ap-northeast-1",
 *   queueUrl: "https://sqs.ap-northeast-1.amazonaws.com/123456789/my-queue",
 * });
 *
 * // Send a message
 * const sendResult = await sqs.send(JSON.stringify({
 *   type: "ORDER",
 *   orderId: "123",
 * }));
 * console.log("Message ID:", sendResult.messageId);
 *
 * await sqs.close();
 * ```
 *
 * @example Using LocalStack for local development
 * ```ts
 * const sqs = await createSqsClient({
 *   region: "us-east-1",
 *   url: "http://localhost:4566",
 *   credentials: {
 *     accessKeyId: "test",
 *     secretAccessKey: "test",
 *   },
 * });
 *
 * // Create queue dynamically (also sets queueUrl)
 * const result = await sqs.ensureQueue("test-queue");
 * console.log(result.queueUrl);  // http://localhost:4566/000000000000/test-queue
 * ```
 *
 * @example Receiving messages with long polling
 * ```ts
 * // Long polling waits up to 20 seconds for messages
 * const receiveResult = await sqs.receive({
 *   maxMessages: 10,
 *   waitTimeSeconds: 20,
 *   visibilityTimeout: 30,
 * });
 *
 * console.log("Received:", receiveResult.messages.length);
 *
 * // Process and acknowledge messages
 * for (const msg of receiveResult.messages) {
 *   const data = JSON.parse(msg.body);
 *   console.log("Processing:", data);
 *
 *   // Delete after successful processing
 *   await sqs.delete(msg.receiptHandle);
 * }
 * ```
 *
 * @example Batch operations for high throughput
 * ```ts
 * // Send multiple messages in a single API call
 * const batchResult = await sqs.sendBatch([
 *   { id: "1", body: JSON.stringify({ event: "user.created", userId: "a1" }) },
 *   { id: "2", body: JSON.stringify({ event: "user.created", userId: "a2" }) },
 *   { id: "3", body: JSON.stringify({ event: "user.updated", userId: "a3" }) },
 * ]);
 *
 * console.log(`Sent: ${batchResult.successful.length}`);
 * console.log(`Failed: ${batchResult.failed.length}`);
 *
 * // Batch delete processed messages
 * const handles = receiveResult.messages.map(m => m.receiptHandle);
 * await sqs.deleteBatch(handles);
 * ```
 *
 * @example FIFO queue with deduplication
 * ```ts
 * const sqs = await createSqsClient({
 *   region: "ap-northeast-1",
 *   queueUrl: "https://sqs.ap-northeast-1.amazonaws.com/123456789/orders.fifo",
 * });
 *
 * // FIFO queues require MessageGroupId and optionally MessageDeduplicationId
 * await sqs.send(JSON.stringify({ orderId: "order-123" }), {
 *   messageGroupId: "orders",
 *   messageDeduplicationId: "order-123-v1",
 * });
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * await using sqs = await createSqsClient({
 *   region: "us-east-1",
 *   url: "http://localhost:4566",
 * });
 *
 * await sqs.ensureQueue("test-queue");
 * await sqs.send("Hello, SQS!");
 * // Client automatically closed when scope exits
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

  async send(
    body: string,
    options?: SqsSendOptions,
  ): Promise<SqsSendResult> {
    this.#ensureOpen();
    const queueUrl = this.#requireQueueUrl();
    validateMessageSize(body);

    const startTime = performance.now();
    const operation = "send";

    // Log request start
    logger.debug("SQS send message starting", {
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
      logger.debug("SQS send message completed", {
        messageId: response.MessageId!,
        md5OfBody: response.MD5OfMessageBody!,
        sequenceNumber: response.SequenceNumber,
        duration: `${duration.toFixed(2)}ms`,
      });

      // Log detailed content
      logger.trace("SQS send message details", {
        body: formatValue(body),
      });

      return {
        kind: "sqs:send",
        ok: true,
        messageId: response.MessageId!,
        md5OfBody: response.MD5OfMessageBody!,
        sequenceNumber: response.SequenceNumber,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("SQS send message failed", {
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertSqsError(error, operation, { queueUrl });
    }
  }

  async sendBatch(
    messages: SqsBatchMessage[],
  ): Promise<SqsSendBatchResult> {
    this.#ensureOpen();
    const queueUrl = this.#requireQueueUrl();

    for (const msg of messages) {
      validateMessageSize(msg.body);
    }

    const startTime = performance.now();
    const operation = "sendBatch";

    // Log batch send start
    logger.debug("SQS send batch messages starting", {
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
        undefined,
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
      logger.debug("SQS send batch messages completed", {
        successful: successful.length,
        failed: failed.length,
        duration: `${duration.toFixed(2)}ms`,
      });

      // Log detailed content
      logger.trace("SQS send batch messages details", {
        messages: messages.map((m) => ({
          id: m.id,
          body: formatValue(m.body),
        })),
      });

      return {
        kind: "sqs:send-batch",
        ok: failed.length === 0,
        successful,
        failed,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("SQS send batch messages failed", {
        queueUrl,
        count: messages.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertSqsError(error, operation, { queueUrl });
    }
  }

  async receive(
    options?: SqsReceiveOptions,
  ): Promise<SqsReceiveResult> {
    this.#ensureOpen();
    const queueUrl = this.#requireQueueUrl();
    const startTime = performance.now();
    const operation = "receive";

    // Log receive start
    logger.debug("SQS receive messages starting", {
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
      logger.debug("SQS receive messages completed", {
        count: messages.length,
        visibilityTimeout: options?.visibilityTimeout,
        duration: `${duration.toFixed(2)}ms`,
      });

      // Log detailed content
      logger.trace("SQS receive messages details", {
        messages: messages.map((m) => ({
          messageId: m.messageId,
          body: formatValue(m.body),
        })),
      });

      return {
        kind: "sqs:receive",
        ok: true,
        messages: createSqsMessages(messages),
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("SQS receive messages failed", {
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertSqsError(error, operation, { queueUrl });
    }
  }

  async delete(
    receiptHandle: string,
    options?: CommonOptions,
  ): Promise<SqsDeleteResult> {
    this.#ensureOpen();
    const queueUrl = this.#requireQueueUrl();
    const startTime = performance.now();
    const operation = "delete";

    // Log delete start
    logger.debug("SQS delete message starting", {
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
      logger.debug("SQS delete message completed", {
        duration: `${duration.toFixed(2)}ms`,
      });

      return {
        kind: "sqs:delete",
        ok: true,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("SQS delete message failed", {
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertSqsError(error, operation, { queueUrl });
    }
  }

  async deleteBatch(
    receiptHandles: string[],
    options?: CommonOptions,
  ): Promise<SqsDeleteBatchResult> {
    this.#ensureOpen();
    const queueUrl = this.#requireQueueUrl();
    const startTime = performance.now();
    const operation = "deleteBatch";

    // Log batch delete start
    logger.debug("SQS delete batch messages starting", {
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
      logger.debug("SQS delete batch messages completed", {
        successful: successful.length,
        failed: failed.length,
        duration: `${duration.toFixed(2)}ms`,
      });

      return {
        kind: "sqs:delete-batch",
        ok: failed.length === 0,
        successful,
        failed,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("SQS delete batch messages failed", {
        queueUrl,
        count: receiptHandles.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertSqsError(error, operation, { queueUrl });
    }
  }

  async purge(options?: CommonOptions): Promise<SqsDeleteResult> {
    this.#ensureOpen();
    const queueUrl = this.#requireQueueUrl();
    const startTime = performance.now();
    const operation = "purge";

    // Log purge start
    logger.debug("SQS purge queue starting", {
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
      logger.debug("SQS purge queue completed", {
        duration: `${duration.toFixed(2)}ms`,
      });

      return {
        kind: "sqs:delete",
        ok: true,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("SQS purge queue failed", {
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertSqsError(error, operation, { queueUrl });
    }
  }

  async ensureQueue(
    queueName: string,
    options?: SqsEnsureQueueOptions,
  ): Promise<SqsEnsureQueueResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const operation = "ensureQueue";

    // Log ensureQueue start
    logger.debug("SQS ensure queue starting", {
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
      logger.debug("SQS ensure queue completed", {
        queueName,
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
      });

      return {
        kind: "sqs:ensure-queue",
        ok: true,
        queueUrl,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("SQS ensure queue failed", {
        queueName,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertSqsError(error, operation, {});
    }
  }

  async deleteQueue(
    queueUrl: string,
    options?: CommonOptions,
  ): Promise<SqsDeleteQueueResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const operation = "deleteQueue";

    // Log deleteQueue start
    logger.debug("SQS delete queue starting", {
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
      logger.debug("SQS delete queue completed", {
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
      });

      return {
        kind: "sqs:delete-queue",
        ok: true,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("SQS delete queue failed", {
        queueUrl,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertSqsError(error, operation, { queueUrl });
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

  #ensureOpen(): void {
    if (this.#closed) {
      throw new SqsCommandError("Client is closed", { operation: "" });
    }
  }

  #requireQueueUrl(): string {
    if (!this.#queueUrl) {
      throw new SqsCommandError(
        "Queue URL is required for this operation. Use setQueueUrl() or ensureQueue() first.",
        { operation: "" },
      );
    }
    return this.#queueUrl;
  }
}
