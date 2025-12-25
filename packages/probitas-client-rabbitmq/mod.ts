/**
 * RabbitMQ client for [Probitas](https://github.com/probitas-test/probitas) scenario testing framework.
 *
 * This package provides a RabbitMQ client designed for integration testing of message-driven applications.
 *
 * ## Features
 *
 * - **Queue Operations**: Declare, bind, purge, and delete queues
 * - **Exchange Operations**: Declare and delete exchanges (direct, topic, fanout, headers)
 * - **Publishing**: Publish messages with routing keys and headers
 * - **Consuming**: Consume messages with acknowledgment support
 * - **Resource Management**: Implements `AsyncDisposable` for proper cleanup
 *
 * ## Installation
 *
 * ```bash
 * deno add jsr:@probitas/client-rabbitmq
 * ```
 *
 * ## Quick Start
 *
 * ```ts
 * import { createRabbitMqClient } from "@probitas/client-rabbitmq";
 *
 * // Using string URL
 * const client = await createRabbitMqClient({
 *   url: "amqp://localhost:5672",
 * });
 *
 * // Or using connection config object
 * const client2 = await createRabbitMqClient({
 *   url: {
 *     host: "localhost",
 *     port: 5672,
 *     username: "guest",
 *     password: "guest",
 *     vhost: "/",
 *   },
 * });
 *
 * // Create a channel
 * const channel = await client.channel();
 *
 * // Declare a queue
 * await channel.assertQueue("test-queue", { durable: true });
 *
 * // Publish a message
 * const content = new TextEncoder().encode("Hello, World!");
 * await channel.sendToQueue("test-queue", content, {
 *   contentType: "text/plain",
 * });
 *
 * // Consume messages
 * for await (const msg of channel.consume("test-queue")) {
 *   console.log("Received:", new TextDecoder().decode(msg.content));
 *   await channel.ack(msg);
 *   break;
 * }
 *
 * await client.close();
 * await client2.close();
 * ```
 *
 * ## Exchange and Binding
 *
 * ```ts
 * import { createRabbitMqClient } from "@probitas/client-rabbitmq";
 *
 * const client = await createRabbitMqClient({ url: "amqp://localhost:5672" });
 * const channel = await client.channel();
 *
 * // Declare an exchange
 * await channel.assertExchange("events", "topic", { durable: true });
 *
 * // Declare a queue and bind to exchange
 * await channel.assertQueue("user-events");
 * await channel.bindQueue("user-events", "events", "user.*");
 *
 * // Publish to exchange with routing key
 * const content = new TextEncoder().encode(JSON.stringify({ id: 1, name: "Alice" }));
 * await channel.publish("events", "user.created", content, {
 *   contentType: "application/json",
 * });
 *
 * await client.close();
 * ```
 *
 * ## Using with `using` Statement
 *
 * ```ts
 * import { createRabbitMqClient } from "@probitas/client-rabbitmq";
 *
 * await using client = await createRabbitMqClient({ url: "amqp://localhost:5672" });
 * const channel = await client.channel();
 *
 * await channel.assertQueue("test");
 * // Client automatically closed when scope exits
 * ```
 *
 * ## Related Packages
 *
 * | Package | Description |
 * |---------|-------------|
 * | [`@probitas/client`](https://jsr.io/@probitas/client) | Core utilities and types |
 * | [`@probitas/client-sqs`](https://jsr.io/@probitas/client-sqs) | AWS SQS client |
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/probitas-test/probitas-client)
 * - [Probitas Framework](https://github.com/probitas-test/probitas)
 * - [RabbitMQ](https://www.rabbitmq.com/)
 *
 * @module
 */

export type * from "./types.ts";
export * from "./errors.ts";
export type * from "./result.ts";
export * from "./client.ts";
