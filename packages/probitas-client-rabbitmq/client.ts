import { Buffer } from "node:buffer";
import * as amqp from "amqplib";
import { AbortError, TimeoutError } from "@probitas/client";
import { getLogger } from "@probitas/logger";
import type {
  RabbitMqChannel,
  RabbitMqClient,
  RabbitMqClientConfig,
  RabbitMqConnectionConfig,
  RabbitMqConsumeOptions,
  RabbitMqExchangeOptions,
  RabbitMqExchangeType,
  RabbitMqMessage,
  RabbitMqMessageFields,
  RabbitMqMessageProperties,
  RabbitMqNackOptions,
  RabbitMqOptions,
  RabbitMqPublishOptions,
  RabbitMqQueueOptions,
  RabbitMqRejectOptions,
} from "./types.ts";
import type {
  RabbitMqAckResult,
  RabbitMqConsumeResult,
  RabbitMqExchangeResult,
  RabbitMqPublishResult,
  RabbitMqQueueResult,
} from "./result.ts";
import {
  RabbitMqChannelError,
  RabbitMqConnectionError,
  RabbitMqError,
  type RabbitMqFailureError,
  RabbitMqNotFoundError,
  type RabbitMqOperationError,
  RabbitMqPreconditionFailedError,
} from "./errors.ts";

/**
 * Check if an error is a failure error (operation not processed).
 */
function isFailureError(error: unknown): error is RabbitMqFailureError {
  return (
    error instanceof AbortError ||
    error instanceof TimeoutError ||
    error instanceof RabbitMqConnectionError
  );
}
import {
  createRabbitMqAckResultError,
  createRabbitMqAckResultFailure,
  createRabbitMqAckResultSuccess,
  createRabbitMqConsumeResultError,
  createRabbitMqConsumeResultFailure,
  createRabbitMqConsumeResultSuccess,
  createRabbitMqExchangeResultError,
  createRabbitMqExchangeResultFailure,
  createRabbitMqExchangeResultSuccess,
  createRabbitMqPublishResultError,
  createRabbitMqPublishResultFailure,
  createRabbitMqPublishResultSuccess,
  createRabbitMqQueueResultError,
  createRabbitMqQueueResultFailure,
  createRabbitMqQueueResultSuccess,
} from "./result.ts";

const logger = getLogger("probitas", "client", "rabbitmq");

/**
 * Format a value for logging, truncating long values.
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "string") {
    return value.length > 200 ? value.slice(0, 200) + "..." : value;
  }
  if (value instanceof Uint8Array) {
    return `<binary ${value.length} bytes>`;
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
  options: RabbitMqOptions | undefined,
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
 * Convert amqplib errors to RabbitMQ-specific errors.
 * Returns the error instead of throwing it.
 */
function convertAmqpError(
  error: unknown,
  operation: string,
): RabbitMqOperationError | RabbitMqFailureError {
  if (error instanceof RabbitMqError) {
    return error;
  }

  if (error instanceof TimeoutError || error instanceof AbortError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message;

    // Check for connection errors first
    if (
      message.includes("Connection closed") ||
      message.includes("connection error") ||
      message.includes("Client is closed")
    ) {
      return new RabbitMqConnectionError(message, { cause: error });
    }

    // Check for specific AMQP error codes
    if (message.includes("NOT_FOUND") || message.includes("404")) {
      return new RabbitMqNotFoundError(message, {
        resource: operation,
        cause: error,
      });
    }

    if (
      message.includes("PRECONDITION_FAILED") || message.includes("406")
    ) {
      return new RabbitMqPreconditionFailedError(message, {
        reason: operation,
        cause: error,
      });
    }

    if (
      message.includes("Channel closed") ||
      message.includes("channel error") ||
      message.includes("Channel is closed")
    ) {
      return new RabbitMqChannelError(message, { cause: error });
    }

    return new RabbitMqChannelError(message, { cause: error });
  }

  return new RabbitMqChannelError(String(error));
}

/**
 * Convert amqplib message to RabbitMqMessage.
 */
function convertMessage(msg: amqp.ConsumeMessage): RabbitMqMessage {
  const properties: RabbitMqMessageProperties = {
    contentType: msg.properties.contentType,
    contentEncoding: msg.properties.contentEncoding,
    headers: msg.properties.headers as Record<string, unknown> | undefined,
    deliveryMode: msg.properties.deliveryMode as 1 | 2 | undefined,
    priority: msg.properties.priority,
    correlationId: msg.properties.correlationId,
    replyTo: msg.properties.replyTo,
    expiration: msg.properties.expiration,
    messageId: msg.properties.messageId,
    timestamp: msg.properties.timestamp,
    type: msg.properties.type,
    userId: msg.properties.userId,
    appId: msg.properties.appId,
  };

  const fields: RabbitMqMessageFields = {
    deliveryTag: BigInt(msg.fields.deliveryTag),
    redelivered: msg.fields.redelivered,
    exchange: msg.fields.exchange,
    routingKey: msg.fields.routingKey,
  };

  return {
    content: new Uint8Array(msg.content),
    properties,
    fields,
  };
}

/**
 * Sanitize URL for logging by removing credentials.
 */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password || parsed.username) {
      parsed.password = "***";
      parsed.username = "***";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Resolve RabbitMQ connection URL from string or config object.
 */
function resolveRabbitMqUrl(url: string | RabbitMqConnectionConfig): string {
  if (typeof url === "string") {
    return url;
  }
  const host = url.host ?? "localhost";
  const port = url.port ?? 5672;
  const vhost = url.vhost ?? "/";

  let connectionUrl = `amqp://`;

  if (url.username && url.password) {
    connectionUrl += `${encodeURIComponent(url.username)}:${
      encodeURIComponent(url.password)
    }@`;
  }

  connectionUrl += `${host}:${port}`;

  // Encode vhost (/ needs to be %2F)
  connectionUrl += `/${encodeURIComponent(vhost)}`;

  return connectionUrl;
}

/**
 * Create a new RabbitMQ client instance.
 *
 * The client provides queue and exchange management, message publishing
 * and consumption, and acknowledgment handling via AMQP protocol.
 *
 * @param config - RabbitMQ client configuration
 * @returns A promise resolving to a new RabbitMQ client instance
 *
 * @example Basic usage with string URL
 * ```ts
 * import { createRabbitMqClient } from "@probitas/client-rabbitmq";
 *
 * const rabbit = await createRabbitMqClient({
 *   url: "amqp://guest:guest@localhost:5672",
 * });
 *
 * const channel = await rabbit.channel();
 * await channel.assertQueue("my-queue", { durable: true });
 *
 * const content = new TextEncoder().encode(JSON.stringify({ type: "ORDER" }));
 * await channel.sendToQueue("my-queue", content, { persistent: true });
 *
 * await channel.close();
 * await rabbit.close();
 * ```
 *
 * @example With connection config object
 * ```ts
 * import { createRabbitMqClient } from "@probitas/client-rabbitmq";
 *
 * const rabbit = await createRabbitMqClient({
 *   url: {
 *     host: "localhost",
 *     port: 5672,
 *     username: "guest",
 *     password: "guest",
 *     vhost: "/",
 *   },
 * });
 *
 * await rabbit.close();
 * ```
 *
 * @example Exchange and binding
 * ```ts
 * import { createRabbitMqClient } from "@probitas/client-rabbitmq";
 *
 * const rabbit = await createRabbitMqClient({ url: "amqp://localhost:5672" });
 * const channel = await rabbit.channel();
 *
 * // Create exchange and queue
 * await channel.assertExchange("events", "topic", { durable: true });
 * await channel.assertQueue("user-events");
 * await channel.bindQueue("user-events", "events", "user.*");
 *
 * // Publish to exchange
 * const content = new TextEncoder().encode(JSON.stringify({ id: 1 }));
 * await channel.publish("events", "user.created", content);
 *
 * await rabbit.close();
 * ```
 *
 * @example Consuming messages
 * ```ts
 * import { createRabbitMqClient } from "@probitas/client-rabbitmq";
 *
 * const rabbit = await createRabbitMqClient({ url: "amqp://localhost:5672" });
 * const channel = await rabbit.channel();
 * await channel.assertQueue("my-queue");
 *
 * for await (const message of channel.consume("my-queue")) {
 *   console.log("Received:", new TextDecoder().decode(message.content));
 *   await channel.ack(message);
 *   break;
 * }
 *
 * await rabbit.close();
 * ```
 *
 * @example Get single message (polling)
 * ```ts
 * import { createRabbitMqClient } from "@probitas/client-rabbitmq";
 *
 * const rabbit = await createRabbitMqClient({ url: "amqp://localhost:5672" });
 * const channel = await rabbit.channel();
 * await channel.assertQueue("my-queue");
 *
 * const result = await channel.get("my-queue");
 * if (result.message) {
 *   await channel.ack(result.message);
 * }
 *
 * await rabbit.close();
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * import { createRabbitMqClient } from "@probitas/client-rabbitmq";
 *
 * await using rabbit = await createRabbitMqClient({
 *   url: "amqp://localhost:5672",
 * });
 *
 * const channel = await rabbit.channel();
 * await channel.assertQueue("test");
 * // Client automatically closed when scope exits
 * ```
 */
export async function createRabbitMqClient(
  config: RabbitMqClientConfig,
): Promise<RabbitMqClient> {
  let connection: amqp.ChannelModel;
  const resolvedUrl = resolveRabbitMqUrl(config.url);

  try {
    const connectOptions: amqp.Options.Connect = {};

    if (config.heartbeat !== undefined) {
      connectOptions.heartbeat = config.heartbeat;
    }

    logger.debug("RabbitMQ client connecting", {
      url: sanitizeUrl(resolvedUrl),
      heartbeat: config.heartbeat,
    });

    connection = await withOptions(
      amqp.connect(resolvedUrl, connectOptions),
      config,
      "connect",
    );

    logger.debug("RabbitMQ client connected", {
      url: sanitizeUrl(resolvedUrl),
    });
  } catch (error) {
    if (error instanceof TimeoutError || error instanceof AbortError) {
      throw error;
    }
    throw new RabbitMqConnectionError(
      `Failed to connect to RabbitMQ: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error instanceof Error ? error : undefined },
    );
  }

  return new RabbitMqClientImpl(config, connection);
}

class RabbitMqClientImpl implements RabbitMqClient {
  readonly config: RabbitMqClientConfig;
  readonly #connection: amqp.ChannelModel;
  #closed = false;

  constructor(
    config: RabbitMqClientConfig,
    connection: amqp.ChannelModel,
  ) {
    this.config = config;
    this.#connection = connection;
  }

  async channel(): Promise<RabbitMqChannel> {
    this.#ensureOpen();

    try {
      logger.debug("Creating RabbitMQ channel");

      const ch = await this.#connection.createChannel();

      if (this.config.prefetch !== undefined) {
        await ch.prefetch(this.config.prefetch);
        logger.debug("Channel prefetch set", {
          prefetch: this.config.prefetch,
        });
      }

      logger.debug("RabbitMQ channel created");

      return new RabbitMqChannelImpl(ch, this.config);
    } catch (error) {
      const converted = convertAmqpError(error, "createChannel");
      throw converted;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;

    try {
      logger.debug("Closing RabbitMQ connection");
      await this.#connection.close();
      logger.debug("RabbitMQ connection closed");
    } catch {
      // Ignore close errors
    }
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  #ensureOpen(): void {
    if (this.#closed) {
      throw new RabbitMqConnectionError("Client is closed");
    }
  }
}

class RabbitMqChannelImpl implements RabbitMqChannel {
  readonly #channel: amqp.Channel;
  readonly #config: RabbitMqClientConfig;
  #closed = false;
  readonly #deliveryTagMap = new WeakMap<RabbitMqMessage, number>();

  constructor(channel: amqp.Channel, config: RabbitMqClientConfig) {
    this.#channel = channel;
    this.#config = config;
  }

  #shouldThrow(options?: RabbitMqOptions): boolean {
    return options?.throwOnError ?? this.#config.throwOnError ?? false;
  }

  #getClosedError(): RabbitMqConnectionError | null {
    if (this.#closed) {
      return new RabbitMqConnectionError("Channel is closed");
    }
    return null;
  }

  // Exchange

  async assertExchange(
    name: string,
    type: RabbitMqExchangeType,
    options?: RabbitMqExchangeOptions,
  ): Promise<RabbitMqExchangeResult> {
    const startTime = performance.now();
    const operation = `assertExchange(${name})`;

    // Check if channel is closed
    const closedError = this.#getClosedError();
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) {
        throw closedError;
      }
      return createRabbitMqExchangeResultFailure({
        error: closedError,
        duration,
      });
    }

    try {
      logger.debug("Asserting exchange", {
        name,
        type,
        durable: options?.durable,
        autoDelete: options?.autoDelete,
        internal: options?.internal,
      });

      await withOptions(
        this.#channel.assertExchange(name, type, {
          durable: options?.durable,
          autoDelete: options?.autoDelete,
          internal: options?.internal,
          arguments: options?.arguments,
        }),
        options,
        operation,
      );

      const duration = performance.now() - startTime;
      logger.debug("Exchange asserted", {
        name,
        type,
        duration: `${duration.toFixed(2)}ms`,
      });

      return createRabbitMqExchangeResultSuccess({ duration });
    } catch (error) {
      const duration = performance.now() - startTime;
      const converted = convertAmqpError(error, operation);
      if (this.#shouldThrow(options)) {
        throw converted;
      }
      if (isFailureError(converted)) {
        return createRabbitMqExchangeResultFailure({
          error: converted,
          duration,
        });
      }
      return createRabbitMqExchangeResultError({ error: converted, duration });
    }
  }

  async deleteExchange(
    name: string,
    options?: RabbitMqOptions,
  ): Promise<RabbitMqExchangeResult> {
    const startTime = performance.now();
    const operation = `deleteExchange(${name})`;

    const closedError = this.#getClosedError();
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) {
        throw closedError;
      }
      return createRabbitMqExchangeResultFailure({
        error: closedError,
        duration,
      });
    }

    try {
      logger.debug("Deleting exchange", { name });

      await withOptions(
        this.#channel.deleteExchange(name),
        options,
        operation,
      );

      const duration = performance.now() - startTime;
      logger.debug("Exchange deleted", {
        name,
        duration: `${duration.toFixed(2)}ms`,
      });

      return createRabbitMqExchangeResultSuccess({ duration });
    } catch (error) {
      const duration = performance.now() - startTime;
      const converted = convertAmqpError(error, operation);
      if (this.#shouldThrow(options)) {
        throw converted;
      }
      if (isFailureError(converted)) {
        return createRabbitMqExchangeResultFailure({
          error: converted,
          duration,
        });
      }
      return createRabbitMqExchangeResultError({ error: converted, duration });
    }
  }

  // Queue

  async assertQueue(
    name: string,
    options?: RabbitMqQueueOptions,
  ): Promise<RabbitMqQueueResult> {
    const startTime = performance.now();
    const operation = `assertQueue(${name})`;

    const closedError = this.#getClosedError();
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) {
        throw closedError;
      }
      return createRabbitMqQueueResultFailure({ error: closedError, duration });
    }

    try {
      logger.debug("Asserting queue", {
        name,
        durable: options?.durable,
        exclusive: options?.exclusive,
        autoDelete: options?.autoDelete,
        messageTtl: options?.messageTtl,
        maxLength: options?.maxLength,
      });

      // deno-lint-ignore no-explicit-any
      const queueOptions: any = {
        durable: options?.durable,
        exclusive: options?.exclusive,
        autoDelete: options?.autoDelete,
        arguments: { ...options?.arguments },
      };

      if (options?.messageTtl !== undefined) {
        queueOptions.arguments["x-message-ttl"] = options.messageTtl;
      }
      if (options?.maxLength !== undefined) {
        queueOptions.arguments["x-max-length"] = options.maxLength;
      }
      if (options?.deadLetterExchange !== undefined) {
        queueOptions.arguments["x-dead-letter-exchange"] =
          options.deadLetterExchange;
      }
      if (options?.deadLetterRoutingKey !== undefined) {
        queueOptions.arguments["x-dead-letter-routing-key"] =
          options.deadLetterRoutingKey;
      }

      const result = await withOptions(
        this.#channel.assertQueue(name, queueOptions),
        options,
        operation,
      ) as amqp.Replies.AssertQueue;

      const duration = performance.now() - startTime;
      logger.debug("Queue asserted", {
        name,
        messageCount: result.messageCount,
        consumerCount: result.consumerCount,
        duration: `${duration.toFixed(2)}ms`,
      });

      return createRabbitMqQueueResultSuccess({
        queue: result.queue,
        messageCount: result.messageCount,
        consumerCount: result.consumerCount,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      const converted = convertAmqpError(error, operation);
      if (this.#shouldThrow(options)) {
        throw converted;
      }
      if (isFailureError(converted)) {
        return createRabbitMqQueueResultFailure({ error: converted, duration });
      }
      return createRabbitMqQueueResultError({ error: converted, duration });
    }
  }

  async deleteQueue(
    name: string,
    options?: RabbitMqOptions,
  ): Promise<RabbitMqQueueResult> {
    const startTime = performance.now();
    const operation = `deleteQueue(${name})`;

    const closedError = this.#getClosedError();
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) {
        throw closedError;
      }
      return createRabbitMqQueueResultFailure({ error: closedError, duration });
    }

    try {
      logger.debug("Deleting queue", { name });

      const result = await withOptions(
        this.#channel.deleteQueue(name),
        options,
        operation,
      ) as amqp.Replies.DeleteQueue;

      const duration = performance.now() - startTime;
      logger.debug("Queue deleted", {
        name,
        messageCount: result.messageCount,
        duration: `${duration.toFixed(2)}ms`,
      });

      return createRabbitMqQueueResultSuccess({
        queue: name,
        messageCount: result.messageCount,
        consumerCount: 0,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      const converted = convertAmqpError(error, operation);
      if (this.#shouldThrow(options)) {
        throw converted;
      }
      if (isFailureError(converted)) {
        return createRabbitMqQueueResultFailure({ error: converted, duration });
      }
      return createRabbitMqQueueResultError({ error: converted, duration });
    }
  }

  async purgeQueue(
    name: string,
    options?: RabbitMqOptions,
  ): Promise<RabbitMqQueueResult> {
    const startTime = performance.now();
    const operation = `purgeQueue(${name})`;

    const closedError = this.#getClosedError();
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) {
        throw closedError;
      }
      return createRabbitMqQueueResultFailure({ error: closedError, duration });
    }

    try {
      logger.debug("Purging queue", { name });

      const result = await withOptions(
        this.#channel.purgeQueue(name),
        options,
        operation,
      ) as amqp.Replies.PurgeQueue;

      const duration = performance.now() - startTime;
      logger.debug("Queue purged", {
        name,
        messageCount: result.messageCount,
        duration: `${duration.toFixed(2)}ms`,
      });

      return createRabbitMqQueueResultSuccess({
        queue: name,
        messageCount: result.messageCount,
        consumerCount: 0,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      const converted = convertAmqpError(error, operation);
      if (this.#shouldThrow(options)) {
        throw converted;
      }
      if (isFailureError(converted)) {
        return createRabbitMqQueueResultFailure({ error: converted, duration });
      }
      return createRabbitMqQueueResultError({ error: converted, duration });
    }
  }

  async bindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
    options?: RabbitMqOptions,
  ): Promise<RabbitMqExchangeResult> {
    const startTime = performance.now();
    const operation = `bindQueue(${queue}, ${exchange}, ${routingKey})`;

    const closedError = this.#getClosedError();
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) {
        throw closedError;
      }
      return createRabbitMqExchangeResultFailure({
        error: closedError,
        duration,
      });
    }

    try {
      logger.debug("Binding queue", {
        queue,
        exchange,
        routingKey,
      });

      await withOptions(
        this.#channel.bindQueue(queue, exchange, routingKey),
        options,
        operation,
      );

      const duration = performance.now() - startTime;
      logger.debug("Queue bound", {
        queue,
        exchange,
        routingKey,
        duration: `${duration.toFixed(2)}ms`,
      });

      return createRabbitMqExchangeResultSuccess({ duration });
    } catch (error) {
      const duration = performance.now() - startTime;
      const converted = convertAmqpError(error, operation);
      if (this.#shouldThrow(options)) {
        throw converted;
      }
      if (isFailureError(converted)) {
        return createRabbitMqExchangeResultFailure({
          error: converted,
          duration,
        });
      }
      return createRabbitMqExchangeResultError({ error: converted, duration });
    }
  }

  async unbindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
    options?: RabbitMqOptions,
  ): Promise<RabbitMqExchangeResult> {
    const startTime = performance.now();
    const operation = `unbindQueue(${queue}, ${exchange}, ${routingKey})`;

    const closedError = this.#getClosedError();
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) {
        throw closedError;
      }
      return createRabbitMqExchangeResultFailure({
        error: closedError,
        duration,
      });
    }

    try {
      logger.debug("Unbinding queue", {
        queue,
        exchange,
        routingKey,
      });

      await withOptions(
        this.#channel.unbindQueue(queue, exchange, routingKey),
        options,
        operation,
      );

      const duration = performance.now() - startTime;
      logger.debug("Queue unbound", {
        queue,
        exchange,
        routingKey,
        duration: `${duration.toFixed(2)}ms`,
      });

      return createRabbitMqExchangeResultSuccess({ duration });
    } catch (error) {
      const duration = performance.now() - startTime;
      const converted = convertAmqpError(error, operation);
      if (this.#shouldThrow(options)) {
        throw converted;
      }
      if (isFailureError(converted)) {
        return createRabbitMqExchangeResultFailure({
          error: converted,
          duration,
        });
      }
      return createRabbitMqExchangeResultError({ error: converted, duration });
    }
  }

  // Publish

  async publish(
    exchange: string,
    routingKey: string,
    content: Uint8Array,
    options?: RabbitMqPublishOptions,
  ): Promise<RabbitMqPublishResult> {
    const startTime = performance.now();
    const operation = `publish(${exchange}, ${routingKey})`;

    const closedError = this.#getClosedError();
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) {
        throw closedError;
      }
      return createRabbitMqPublishResultFailure({
        error: closedError,
        duration,
      });
    }

    try {
      logger.info("Publishing message", {
        exchange,
        routingKey,
        messageSize: content.length,
        persistent: options?.persistent,
        contentType: options?.contentType,
      });

      const publishOptions: amqp.Options.Publish = {
        persistent: options?.persistent,
        contentType: options?.contentType,
        contentEncoding: options?.contentEncoding,
        headers: options?.headers,
        correlationId: options?.correlationId,
        replyTo: options?.replyTo,
        expiration: options?.expiration,
        messageId: options?.messageId,
        priority: options?.priority,
      };

      const ok = this.#channel.publish(
        exchange,
        routingKey,
        Buffer.from(content),
        publishOptions,
      );

      if (!ok) {
        await new Promise<void>((resolve) => {
          this.#channel.once("drain", resolve);
        });
      }

      const duration = performance.now() - startTime;
      logger.info("Message published", {
        exchange,
        routingKey,
        messageSize: content.length,
        duration: `${duration.toFixed(2)}ms`,
      });

      // Log detailed content
      logger.trace("Message published details", {
        content: formatValue(new TextDecoder().decode(content)),
      });

      return createRabbitMqPublishResultSuccess({ duration });
    } catch (error) {
      const duration = performance.now() - startTime;
      const converted = convertAmqpError(error, operation);
      if (this.#shouldThrow(options)) {
        throw converted;
      }
      if (isFailureError(converted)) {
        return createRabbitMqPublishResultFailure({
          error: converted,
          duration,
        });
      }
      return createRabbitMqPublishResultError({ error: converted, duration });
    }
  }

  sendToQueue(
    queue: string,
    content: Uint8Array,
    options?: RabbitMqPublishOptions,
  ): Promise<RabbitMqPublishResult> {
    return this.publish("", queue, content, options);
  }

  // Consume

  async get(
    queue: string,
    options?: RabbitMqOptions,
  ): Promise<RabbitMqConsumeResult> {
    const startTime = performance.now();
    const operation = `get(${queue})`;

    const closedError = this.#getClosedError();
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) {
        throw closedError;
      }
      return createRabbitMqConsumeResultFailure({
        error: closedError,
        duration,
      });
    }

    try {
      logger.info("Getting message", { queue });

      const msg = await withOptions(
        this.#channel.get(queue, { noAck: false }),
        options,
        operation,
      ) as amqp.GetMessage | false;

      const duration = performance.now() - startTime;

      if (msg === false) {
        logger.info("No message available", {
          queue,
          duration: `${duration.toFixed(2)}ms`,
        });
        return createRabbitMqConsumeResultSuccess({ message: null, duration });
      }

      const message = convertMessage(msg);
      this.#deliveryTagMap.set(message, msg.fields.deliveryTag);

      logger.info("Message received", {
        queue,
        routingKey: message.fields.routingKey,
        size: message.content.length,
        duration: `${duration.toFixed(2)}ms`,
      });

      // Log detailed content
      logger.trace("Message received details", {
        content: formatValue(new TextDecoder().decode(message.content)),
      });

      return createRabbitMqConsumeResultSuccess({ message, duration });
    } catch (error) {
      const duration = performance.now() - startTime;
      const converted = convertAmqpError(error, operation);
      if (this.#shouldThrow(options)) {
        throw converted;
      }
      if (isFailureError(converted)) {
        return createRabbitMqConsumeResultFailure({
          error: converted,
          duration,
        });
      }
      return createRabbitMqConsumeResultError({ error: converted, duration });
    }
  }

  async *consume(
    queue: string,
    options?: RabbitMqConsumeOptions,
  ): AsyncIterable<RabbitMqMessage> {
    // consume() throws errors directly (not using Result pattern)
    // because it returns AsyncIterable<RabbitMqMessage>
    const closedError = this.#getClosedError();
    if (closedError) {
      throw closedError;
    }

    const messageQueue: RabbitMqMessage[] = [];
    let resolver: ((value: RabbitMqMessage | null) => void) | null = null;
    let consumerTag: string | undefined;
    let done = false;

    try {
      logger.info("Starting consume", {
        queue,
        noAck: options?.noAck,
        exclusive: options?.exclusive,
        priority: options?.priority,
      });

      const consumeResult = await this.#channel.consume(
        queue,
        (msg: amqp.ConsumeMessage | null) => {
          if (msg === null) {
            done = true;
            if (resolver) {
              resolver(null);
              resolver = null;
            }
            return;
          }

          const message = convertMessage(msg);
          this.#deliveryTagMap.set(message, msg.fields.deliveryTag);

          if (resolver) {
            resolver(message);
            resolver = null;
          } else {
            messageQueue.push(message);
          }
        },
        {
          noAck: options?.noAck,
          exclusive: options?.exclusive,
          priority: options?.priority,
        },
      );

      consumerTag = consumeResult.consumerTag;
      logger.info("Consumer started", {
        queue,
        consumerTag,
      });

      while (!done && !this.#closed) {
        if (messageQueue.length > 0) {
          yield messageQueue.shift()!;
        } else {
          const message = await new Promise<RabbitMqMessage | null>(
            (resolve) => {
              resolver = resolve;
              if (done) resolve(null);
            },
          );
          if (message) {
            yield message;
          } else {
            break;
          }
        }
      }
    } finally {
      if (consumerTag && !this.#closed) {
        try {
          logger.debug("Cancelling consumer", { queue, consumerTag });
          await this.#channel.cancel(consumerTag);
          logger.debug("Consumer cancelled", { queue, consumerTag });
        } catch {
          // Ignore cancel errors
        }
      }
    }
  }

  // Ack

  ack(
    message: RabbitMqMessage,
    options?: RabbitMqOptions,
  ): Promise<RabbitMqAckResult> {
    const startTime = performance.now();

    const closedError = this.#getClosedError();
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) {
        return Promise.reject(closedError);
      }
      return Promise.resolve(
        createRabbitMqAckResultFailure({ error: closedError, duration }),
      );
    }

    try {
      const deliveryTag = this.#deliveryTagMap.get(message);
      if (deliveryTag === undefined) {
        const error = new RabbitMqChannelError(
          "Message delivery tag not found",
        );
        const duration = performance.now() - startTime;
        if (this.#shouldThrow(options)) {
          return Promise.reject(error);
        }
        return Promise.resolve(
          createRabbitMqAckResultError({ error, duration }),
        );
      }

      logger.info("Acknowledging message", { deliveryTag });

      this.#channel.ack({ fields: { deliveryTag } } as amqp.Message);

      const duration = performance.now() - startTime;
      logger.info("Message acknowledged", {
        deliveryTag,
        duration: `${duration.toFixed(2)}ms`,
      });

      return Promise.resolve(createRabbitMqAckResultSuccess({ duration }));
    } catch (error) {
      const duration = performance.now() - startTime;
      const converted = convertAmqpError(error, "ack");
      if (this.#shouldThrow(options)) {
        return Promise.reject(converted);
      }
      if (isFailureError(converted)) {
        return Promise.resolve(
          createRabbitMqAckResultFailure({ error: converted, duration }),
        );
      }
      return Promise.resolve(
        createRabbitMqAckResultError({ error: converted, duration }),
      );
    }
  }

  nack(
    message: RabbitMqMessage,
    options?: RabbitMqNackOptions,
  ): Promise<RabbitMqAckResult> {
    const startTime = performance.now();

    const closedError = this.#getClosedError();
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) {
        return Promise.reject(closedError);
      }
      return Promise.resolve(
        createRabbitMqAckResultFailure({ error: closedError, duration }),
      );
    }

    try {
      const deliveryTag = this.#deliveryTagMap.get(message);
      if (deliveryTag === undefined) {
        const error = new RabbitMqChannelError(
          "Message delivery tag not found",
        );
        const duration = performance.now() - startTime;
        if (this.#shouldThrow(options)) {
          return Promise.reject(error);
        }
        return Promise.resolve(
          createRabbitMqAckResultError({ error, duration }),
        );
      }

      logger.info("Nacking message", {
        deliveryTag,
        allUpTo: options?.allUpTo ?? false,
        requeue: options?.requeue ?? true,
      });

      this.#channel.nack(
        { fields: { deliveryTag } } as amqp.Message,
        options?.allUpTo ?? false,
        options?.requeue ?? true,
      );

      const duration = performance.now() - startTime;
      logger.info("Message nacked", {
        deliveryTag,
        duration: `${duration.toFixed(2)}ms`,
      });

      return Promise.resolve(createRabbitMqAckResultSuccess({ duration }));
    } catch (error) {
      const duration = performance.now() - startTime;
      const converted = convertAmqpError(error, "nack");
      if (this.#shouldThrow(options)) {
        return Promise.reject(converted);
      }
      if (isFailureError(converted)) {
        return Promise.resolve(
          createRabbitMqAckResultFailure({ error: converted, duration }),
        );
      }
      return Promise.resolve(
        createRabbitMqAckResultError({ error: converted, duration }),
      );
    }
  }

  reject(
    message: RabbitMqMessage,
    options?: RabbitMqRejectOptions,
  ): Promise<RabbitMqAckResult> {
    const startTime = performance.now();
    const requeue = options?.requeue ?? false;

    const closedError = this.#getClosedError();
    if (closedError) {
      const duration = performance.now() - startTime;
      if (this.#shouldThrow(options)) {
        return Promise.reject(closedError);
      }
      return Promise.resolve(
        createRabbitMqAckResultFailure({ error: closedError, duration }),
      );
    }

    try {
      const deliveryTag = this.#deliveryTagMap.get(message);
      if (deliveryTag === undefined) {
        const error = new RabbitMqChannelError(
          "Message delivery tag not found",
        );
        const duration = performance.now() - startTime;
        if (this.#shouldThrow(options)) {
          return Promise.reject(error);
        }
        return Promise.resolve(
          createRabbitMqAckResultError({ error, duration }),
        );
      }

      logger.info("Rejecting message", {
        deliveryTag,
        requeue,
      });

      this.#channel.reject(
        { fields: { deliveryTag } } as amqp.Message,
        requeue,
      );

      const duration = performance.now() - startTime;
      logger.info("Message rejected", {
        deliveryTag,
        requeue,
        duration: `${duration.toFixed(2)}ms`,
      });

      return Promise.resolve(createRabbitMqAckResultSuccess({ duration }));
    } catch (error) {
      const duration = performance.now() - startTime;
      const converted = convertAmqpError(error, "reject");
      if (this.#shouldThrow(options)) {
        return Promise.reject(converted);
      }
      if (isFailureError(converted)) {
        return Promise.resolve(
          createRabbitMqAckResultFailure({ error: converted, duration }),
        );
      }
      return Promise.resolve(
        createRabbitMqAckResultError({ error: converted, duration }),
      );
    }
  }

  // Prefetch

  async prefetch(count: number): Promise<void> {
    const closedError = this.#getClosedError();
    if (closedError) {
      throw closedError;
    }

    try {
      logger.debug("Setting prefetch", { count });

      await this.#channel.prefetch(count);

      logger.debug("Prefetch set", { count });
    } catch (error) {
      const converted = convertAmqpError(error, "prefetch");
      throw converted;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;

    try {
      logger.debug("Closing channel");
      await this.#channel.close();
      logger.debug("Channel closed");
    } catch {
      // Ignore close errors
    }
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
