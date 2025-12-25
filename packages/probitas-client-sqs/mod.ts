/**
 * AWS SQS client for [Probitas](https://github.com/probitas-test/probitas) scenario testing framework.
 *
 * This package provides an AWS SQS client designed for integration testing of message-driven applications using Amazon Simple Queue Service.
 *
 * ## Features
 *
 * - **Queue Management**: Create, delete, and purge queues
 * - **Message Operations**: Send, receive, and delete messages (single and batch)
 * - **Message Attributes**: Support for custom message attributes
 * - **LocalStack Compatible**: Works with LocalStack for local development
 * - **Resource Management**: Implements `AsyncDisposable` for proper cleanup
 *
 * ## Installation
 *
 * ```bash
 * deno add jsr:@probitas/client-sqs
 * ```
 *
 * ## Quick Start
 *
 * ```ts
 * import { createSqsClient } from "@probitas/client-sqs";
 *
 * const client = await createSqsClient({
 *   region: "us-east-1",
 *   url: "http://localhost:4566", // LocalStack
 *   credentials: {
 *     accessKeyId: "test",
 *     secretAccessKey: "test",
 *   },
 * });
 *
 * // Ensure queue exists
 * const queueResult = await client.ensureQueue("test-queue");
 * if (!queueResult.ok) throw new Error("Failed to ensure queue");
 *
 * // Send a message
 * const sendResult = await client.send("Hello, World!", {
 *   messageAttributes: {
 *     type: { dataType: "String", stringValue: "greeting" },
 *   },
 * });
 * if (!sendResult.ok) throw new Error("Failed to send message");
 * console.log("Message ID:", sendResult.messageId);
 *
 * // Receive messages
 * const receiveResult = await client.receive({
 *   maxMessages: 10,
 *   waitTimeSeconds: 5,
 * });
 * if (!receiveResult.ok) throw new Error("Failed to receive messages");
 * console.log("Received:", receiveResult.messages.length);
 *
 * // Delete message after processing
 * for (const msg of receiveResult.messages) {
 *   await client.delete(msg.receiptHandle);
 * }
 *
 * await client.close();
 * ```
 *
 * ## Batch Operations
 *
 * ```ts
 * import { createSqsClient } from "@probitas/client-sqs";
 *
 * const client = await createSqsClient({
 *   region: "us-east-1",
 *   url: "http://localhost:4566",
 *   credentials: { accessKeyId: "test", secretAccessKey: "test" },
 * });
 *
 * const queueResult = await client.ensureQueue("test-queue");
 * if (!queueResult.ok) throw new Error("Failed to ensure queue");
 *
 * // Send batch messages
 * await client.sendBatch([
 *   { body: "Message 1", id: "msg-1" },
 *   { body: "Message 2", id: "msg-2" },
 *   { body: "Message 3", id: "msg-3" },
 * ]);
 *
 * // Delete batch messages
 * const receiveResult = await client.receive({ maxMessages: 10 });
 * if (!receiveResult.ok) throw new Error("Failed to receive messages");
 * const handles = receiveResult.messages.map((m) => m.receiptHandle);
 * await client.deleteBatch(handles);
 *
 * await client.close();
 * ```
 *
 * ## Using with `using` Statement
 *
 * ```ts
 * import { createSqsClient } from "@probitas/client-sqs";
 *
 * await using client = await createSqsClient({
 *   region: "us-east-1",
 *   url: "http://localhost:4566",
 *   credentials: { accessKeyId: "test", secretAccessKey: "test" },
 * });
 *
 * const queue = await client.ensureQueue("test");
 * console.log("Queue URL:", queue.queueUrl);
 * // Client automatically closed when block exits
 * ```
 *
 * ## Related Packages
 *
 * | Package | Description |
 * |---------|-------------|
 * | [`@probitas/client`](https://jsr.io/@probitas/client) | Core utilities and types |
 * | [`@probitas/client-rabbitmq`](https://jsr.io/@probitas/client-rabbitmq) | RabbitMQ client |
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/probitas-test/probitas-client)
 * - [Probitas Framework](https://github.com/probitas-test/probitas)
 * - [AWS SQS](https://aws.amazon.com/sqs/)
 * - [LocalStack](https://localstack.cloud/)
 *
 * @module
 */

export type * from "./types.ts";
export * from "./errors.ts";
export type * from "./result.ts";
export * from "./client.ts";
