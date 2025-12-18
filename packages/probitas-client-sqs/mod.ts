/**
 * AWS SQS client for [Probitas](https://github.com/jsr-probitas/probitas) scenario testing framework.
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
 * - **Error Handling**: Configurable `throwOnError` for traditional or result-based error handling
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
 * if (!queueResult.ok) {
 *   throw queueResult.error;
 * }
 * const queueUrl = queueResult.queueUrl;
 *
 * // Send a message
 * const sendResult = await client.send("Hello, World!", {
 *   messageAttributes: {
 *     type: { dataType: "String", stringValue: "greeting" },
 *   },
 * });
 * if (!sendResult.ok) {
 *   console.error("Send failed:", sendResult.error);
 * } else {
 *   console.log("Message ID:", sendResult.messageId);
 * }
 *
 * // Receive messages
 * const receiveResult = await client.receive({
 *   maxMessages: 10,
 *   waitTimeSeconds: 5,
 * });
 * if (!receiveResult.ok) {
 *   console.error("Receive failed:", receiveResult.error);
 * } else {
 *   console.log("Received:", receiveResult.messages.length);
 *
 *   // Delete message after processing
 *   for (const msg of receiveResult.messages) {
 *     await client.delete(msg.receiptHandle);
 *   }
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
 * if (!queueResult.ok) throw queueResult.error;
 * const queueUrl = queueResult.queueUrl;
 *
 * // Send batch messages
 * await client.sendBatch([
 *   { body: "Message 1", id: "msg-1" },
 *   { body: "Message 2", id: "msg-2" },
 *   { body: "Message 3", id: "msg-3" },
 * ]);
 *
 * // Delete batch messages
 * const messages = await client.receive({ maxMessages: 10 });
 * if (messages.ok) {
 *   const handles = messages.messages.map((m: { receiptHandle: string }) => m.receiptHandle);
 *   await client.deleteBatch(handles);
 * }
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
 * if (!queue.ok) throw queue.error;
 * console.log("Queue URL:", queue.queueUrl);
 * // Client automatically closed when block exits
 * ```
 *
 * ## Using throwOnError
 *
 * ```ts
 * import { createSqsClient } from "@probitas/client-sqs";
 *
 * // Configure client to throw errors instead of returning failure results
 * const client = await createSqsClient({
 *   region: "us-east-1",
 *   url: "http://localhost:4566",
 *   credentials: { accessKeyId: "test", secretAccessKey: "test" },
 *   throwOnError: true,
 * });
 *
 * try {
 *   const queue = await client.ensureQueue("test");
 *   // When throwOnError is true, queue.ok is always true (errors are thrown)
 *   if (queue.ok) {
 *     console.log("Queue URL:", queue.queueUrl);
 *   }
 * } catch (error) {
 *   console.error("Operation failed:", error);
 * }
 *
 * await client.close();
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
 * - [GitHub Repository](https://github.com/jsr-probitas/probitas-client)
 * - [Probitas Framework](https://github.com/jsr-probitas/probitas)
 * - [AWS SQS](https://aws.amazon.com/sqs/)
 * - [LocalStack](https://localstack.cloud/)
 *
 * @module
 */

export type * from "./types.ts";
export type * from "./result.ts";
export * from "./errors.ts";
export * from "./client.ts";
export * from "./messages.ts";
