import { Buffer } from "node:buffer";
import * as amqp from "amqplib";
import { AbortError, TimeoutError } from "@probitas/client";
import { getLogger } from "@probitas/logger";
import type { CommonOptions } from "@probitas/client";
import type {
  RabbitMqAckResult,
  RabbitMqChannel,
  RabbitMqClient,
  RabbitMqClientConfig,
  RabbitMqConnectionConfig,
  RabbitMqConsumeOptions,
  RabbitMqConsumeResult,
  RabbitMqExchangeOptions,
  RabbitMqExchangeResult,
  RabbitMqExchangeType,
  RabbitMqMessage,
  RabbitMqMessageFields,
  RabbitMqMessageProperties,
  RabbitMqNackOptions,
  RabbitMqPublishOptions,
  RabbitMqPublishResult,
  RabbitMqQueueOptions,
  RabbitMqQueueResult,
} from "./types.ts";
import {
  RabbitMqChannelError,
  RabbitMqConnectionError,
  RabbitMqNotFoundError,
  RabbitMqPreconditionFailedError,
} from "./errors.ts";

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
 * Convert amqplib errors to RabbitMQ-specific errors.
 */
function convertAmqpError(error: unknown, operation: string): never {
  if (error instanceof TimeoutError || error instanceof AbortError) {
    throw error;
  }

  if (error instanceof Error) {
    const message = error.message;

    // Check for specific AMQP error codes
    if (message.includes("NOT_FOUND") || message.includes("404")) {
      throw new RabbitMqNotFoundError(message, {
        resource: operation,
        cause: error,
      });
    }

    if (
      message.includes("PRECONDITION_FAILED") || message.includes("406")
    ) {
      throw new RabbitMqPreconditionFailedError(message, {
        reason: operation,
        cause: error,
      });
    }

    if (
      message.includes("Channel closed") ||
      message.includes("channel error")
    ) {
      throw new RabbitMqChannelError(message, { cause: error });
    }

    if (
      message.includes("Connection closed") ||
      message.includes("connection error")
    ) {
      throw new RabbitMqConnectionError(message, { cause: error });
    }

    throw new RabbitMqChannelError(message, { cause: error });
  }

  throw new RabbitMqChannelError(String(error));
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
 * const rabbit = await createRabbitMqClient({
 *   url: {
 *     host: "localhost",
 *     port: 5672,
 *     username: "guest",
 *     password: "guest",
 *     vhost: "/",
 *   },
 * });
 * ```
 *
 * @example Exchange and binding
 * ```ts
 * // Create exchange and queue
 * await channel.assertExchange("events", "topic", { durable: true });
 * await channel.assertQueue("user-events");
 * await channel.bindQueue("user-events", "events", "user.*");
 *
 * // Publish to exchange
 * await channel.publish("events", "user.created", content);
 * ```
 *
 * @example Consuming messages
 * ```ts
 * for await (const message of channel.consume("my-queue")) {
 *   console.log("Received:", new TextDecoder().decode(message.content));
 *   await channel.ack(message);
 * }
 * ```
 *
 * @example Get single message (polling)
 * ```ts
 * const result = await channel.get("my-queue");
 * if (result.message) {
 *   await channel.ack(result.message);
 * }
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * await using rabbit = await createRabbitMqClient({
 *   url: "amqp://localhost:5672",
 * });
 *
 * const channel = await rabbit.channel();
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

      return new RabbitMqChannelImpl(ch);
    } catch (error) {
      convertAmqpError(error, "createChannel");
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
  #closed = false;
  readonly #deliveryTagMap = new WeakMap<RabbitMqMessage, number>();

  constructor(channel: amqp.Channel) {
    this.#channel = channel;
  }

  // Exchange

  async assertExchange(
    name: string,
    type: RabbitMqExchangeType,
    options?: RabbitMqExchangeOptions,
  ): Promise<RabbitMqExchangeResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const operation = `assertExchange(${name})`;

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

      return {
        kind: "rabbitmq:exchange",
        ok: true,
        duration,
      };
    } catch (error) {
      convertAmqpError(error, operation);
    }
  }

  async deleteExchange(
    name: string,
    options?: CommonOptions,
  ): Promise<RabbitMqExchangeResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const operation = `deleteExchange(${name})`;

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

      return {
        kind: "rabbitmq:exchange",
        ok: true,
        duration,
      };
    } catch (error) {
      convertAmqpError(error, operation);
    }
  }

  // Queue

  async assertQueue(
    name: string,
    options?: RabbitMqQueueOptions,
  ): Promise<RabbitMqQueueResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const operation = `assertQueue(${name})`;

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

      return {
        kind: "rabbitmq:queue",
        ok: true,
        queue: result.queue,
        messageCount: result.messageCount,
        consumerCount: result.consumerCount,
        duration,
      };
    } catch (error) {
      convertAmqpError(error, operation);
    }
  }

  async deleteQueue(
    name: string,
    options?: CommonOptions,
  ): Promise<RabbitMqQueueResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const operation = `deleteQueue(${name})`;

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

      return {
        kind: "rabbitmq:queue",
        ok: true,
        queue: name,
        messageCount: result.messageCount,
        consumerCount: 0,
        duration,
      };
    } catch (error) {
      convertAmqpError(error, operation);
    }
  }

  async purgeQueue(
    name: string,
    options?: CommonOptions,
  ): Promise<RabbitMqQueueResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const operation = `purgeQueue(${name})`;

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

      return {
        kind: "rabbitmq:queue",
        ok: true,
        queue: name,
        messageCount: result.messageCount,
        consumerCount: 0,
        duration,
      };
    } catch (error) {
      convertAmqpError(error, operation);
    }
  }

  async bindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
    options?: CommonOptions,
  ): Promise<RabbitMqExchangeResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const operation = `bindQueue(${queue}, ${exchange}, ${routingKey})`;

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

      return {
        kind: "rabbitmq:exchange",
        ok: true,
        duration,
      };
    } catch (error) {
      convertAmqpError(error, operation);
    }
  }

  async unbindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
    options?: CommonOptions,
  ): Promise<RabbitMqExchangeResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const operation = `unbindQueue(${queue}, ${exchange}, ${routingKey})`;

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

      return {
        kind: "rabbitmq:exchange",
        ok: true,
        duration,
      };
    } catch (error) {
      convertAmqpError(error, operation);
    }
  }

  // Publish

  async publish(
    exchange: string,
    routingKey: string,
    content: Uint8Array,
    options?: RabbitMqPublishOptions,
  ): Promise<RabbitMqPublishResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const operation = `publish(${exchange}, ${routingKey})`;

    try {
      logger.debug("Publishing message", {
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
      logger.debug("Message published", {
        exchange,
        routingKey,
        messageSize: content.length,
        duration: `${duration.toFixed(2)}ms`,
      });

      // Log detailed content
      logger.trace("Message published details", {
        content: formatValue(new TextDecoder().decode(content)),
      });

      return {
        kind: "rabbitmq:publish",
        ok: true,
        duration,
      };
    } catch (error) {
      convertAmqpError(error, operation);
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
    options?: CommonOptions,
  ): Promise<RabbitMqConsumeResult> {
    this.#ensureOpen();
    const startTime = performance.now();
    const operation = `get(${queue})`;

    try {
      logger.debug("Getting message", { queue });

      const msg = await withOptions(
        this.#channel.get(queue, { noAck: false }),
        options,
        operation,
      ) as amqp.GetMessage | false;

      const duration = performance.now() - startTime;

      if (msg === false) {
        logger.debug("No message available", {
          queue,
          duration: `${duration.toFixed(2)}ms`,
        });
        return {
          kind: "rabbitmq:consume",
          ok: true,
          message: null,
          duration,
        };
      }

      const message = convertMessage(msg);
      this.#deliveryTagMap.set(message, msg.fields.deliveryTag);

      logger.debug("Message received", {
        queue,
        routingKey: message.fields.routingKey,
        size: message.content.length,
        duration: `${duration.toFixed(2)}ms`,
      });

      // Log detailed content
      logger.trace("Message received details", {
        content: formatValue(new TextDecoder().decode(message.content)),
      });

      return {
        kind: "rabbitmq:consume",
        ok: true,
        message,
        duration,
      };
    } catch (error) {
      convertAmqpError(error, operation);
    }
  }

  async *consume(
    queue: string,
    options?: RabbitMqConsumeOptions,
  ): AsyncIterable<RabbitMqMessage> {
    this.#ensureOpen();

    const messageQueue: RabbitMqMessage[] = [];
    let resolver: ((value: RabbitMqMessage | null) => void) | null = null;
    let consumerTag: string | undefined;
    let done = false;

    try {
      logger.debug("Starting consume", {
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
      logger.debug("Consumer started", {
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
    _options?: CommonOptions,
  ): Promise<RabbitMqAckResult> {
    this.#ensureOpen();
    const startTime = performance.now();

    try {
      const deliveryTag = this.#deliveryTagMap.get(message);
      if (deliveryTag === undefined) {
        throw new RabbitMqChannelError("Message delivery tag not found");
      }

      logger.debug("Acknowledging message", { deliveryTag });

      this.#channel.ack({ fields: { deliveryTag } } as amqp.Message);

      const duration = performance.now() - startTime;
      logger.debug("Message acknowledged", {
        deliveryTag,
        duration: `${duration.toFixed(2)}ms`,
      });

      return Promise.resolve({
        kind: "rabbitmq:ack",
        ok: true,
        duration,
      });
    } catch (error) {
      if (
        error instanceof RabbitMqChannelError ||
        error instanceof TimeoutError ||
        error instanceof AbortError
      ) {
        throw error;
      }
      convertAmqpError(error, "ack");
    }
  }

  nack(
    message: RabbitMqMessage,
    options?: RabbitMqNackOptions,
  ): Promise<RabbitMqAckResult> {
    this.#ensureOpen();
    const startTime = performance.now();

    try {
      const deliveryTag = this.#deliveryTagMap.get(message);
      if (deliveryTag === undefined) {
        throw new RabbitMqChannelError("Message delivery tag not found");
      }

      logger.debug("Nacking message", {
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
      logger.debug("Message nacked", {
        deliveryTag,
        duration: `${duration.toFixed(2)}ms`,
      });

      return Promise.resolve({
        kind: "rabbitmq:ack",
        ok: true,
        duration,
      });
    } catch (error) {
      if (
        error instanceof RabbitMqChannelError ||
        error instanceof TimeoutError ||
        error instanceof AbortError
      ) {
        throw error;
      }
      convertAmqpError(error, "nack");
    }
  }

  reject(
    message: RabbitMqMessage,
    requeue?: boolean,
  ): Promise<RabbitMqAckResult> {
    this.#ensureOpen();
    const startTime = performance.now();

    try {
      const deliveryTag = this.#deliveryTagMap.get(message);
      if (deliveryTag === undefined) {
        throw new RabbitMqChannelError("Message delivery tag not found");
      }

      logger.debug("Rejecting message", {
        deliveryTag,
        requeue: requeue ?? false,
      });

      this.#channel.reject(
        { fields: { deliveryTag } } as amqp.Message,
        requeue ?? false,
      );

      const duration = performance.now() - startTime;
      logger.debug("Message rejected", {
        deliveryTag,
        requeue: requeue ?? false,
        duration: `${duration.toFixed(2)}ms`,
      });

      return Promise.resolve({
        kind: "rabbitmq:ack",
        ok: true,
        duration,
      });
    } catch (error) {
      if (
        error instanceof RabbitMqChannelError ||
        error instanceof TimeoutError ||
        error instanceof AbortError
      ) {
        throw error;
      }
      convertAmqpError(error, "reject");
    }
  }

  // Prefetch

  async prefetch(count: number): Promise<void> {
    this.#ensureOpen();

    try {
      logger.debug("Setting prefetch", { count });

      await this.#channel.prefetch(count);

      logger.debug("Prefetch set", { count });
    } catch (error) {
      convertAmqpError(error, "prefetch");
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

  #ensureOpen(): void {
    if (this.#closed) {
      throw new RabbitMqChannelError("Channel is closed");
    }
  }
}
