import {
  assert,
  assertEquals,
  assertExists,
  assertInstanceOf,
  assertRejects,
} from "@std/assert";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { AbortError } from "@probitas/client";
import { createSqsClient } from "./client.ts";
import { SqsCommandError } from "./errors.ts";

const SQS_ENDPOINT = Deno.env.get("SQS_ENDPOINT") ?? "http://localhost:4566";
const SQS_REGION = "us-east-1";

async function isSqsAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${SQS_ENDPOINT}/_localstack/health`, {
      signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

async function createTestQueue(
  name: string,
): Promise<{ queueUrl: string; cleanup: () => Promise<void> }> {
  const sqsClient = new SQSClient({
    endpoint: SQS_ENDPOINT, // AWS SDK still uses endpoint directly
    region: SQS_REGION,
    credentials: {
      accessKeyId: "test",
      secretAccessKey: "test",
    },
  });

  const result = await sqsClient.send(
    new CreateQueueCommand({ QueueName: name }),
  );
  const queueUrl = result.QueueUrl!;

  return {
    queueUrl,
    cleanup: async () => {
      try {
        await sqsClient.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
      } finally {
        sqsClient.destroy();
      }
    },
  };
}

Deno.test({
  name: "Integration: SQS Client",
  ignore: !(await isSqsAvailable()),
  async fn(t) {
    const testQueueName = `test-queue-${crypto.randomUUID()}`;
    const { queueUrl, cleanup } = await createTestQueue(testQueueName);

    const client = await createSqsClient({
      url: SQS_ENDPOINT,
      region: SQS_REGION,
      queueUrl,
      credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
      },
    });

    try {
      await t.step("implements AsyncDisposable", () => {
        assertEquals(typeof client[Symbol.asyncDispose], "function");
      });

      await t.step("exposes config", () => {
        assertEquals(client.config.queueUrl, queueUrl);
        assertEquals(client.config.region, SQS_REGION);
      });

      await t.step("Message operations", async (t) => {
        await t.step("send sends a message", async () => {
          const result = await client.send(
            JSON.stringify({ type: "TEST", value: 42 }),
          );
          assert(result.ok);
          assertExists(result.messageId);
        });

        await t.step("receive retrieves messages", async () => {
          const result = await client.receive({
            maxMessages: 10,
            waitTimeSeconds: 1,
          });
          assert(result.ok);
          assert(result.messages.length > 0);

          const msg = result.messages[0]!;
          assert(msg.body.includes("TEST"));
          const parsedBody = JSON.parse(msg.body);
          assertEquals(parsedBody.type, "TEST");

          const body = JSON.parse(msg.body);
          assertEquals(body.type, "TEST");
          assertEquals(body.value, 42);
        });

        await t.step("delete removes a message", async () => {
          const receiveResult = await client.receive({
            maxMessages: 1,
            waitTimeSeconds: 1,
          });
          assert(receiveResult.ok);

          if (receiveResult.messages.length > 0) {
            const msg = receiveResult.messages[0]!;
            const deleteResult = await client.delete(msg.receiptHandle);
            assert(deleteResult.ok);
          }
        });

        await t.step(
          "receive returns empty array when queue is empty",
          async () => {
            await client.purge();
            await new Promise((r) => setTimeout(r, 100));

            const result = await client.receive({
              maxMessages: 1,
              waitTimeSeconds: 0,
            });
            assert(result.ok);
            assertEquals(result.messages.length, 0);
          },
        );
      });

      await t.step("Batch operations", async (t) => {
        await t.step("sendBatch sends multiple messages", async () => {
          const result = await client.sendBatch([
            { id: "0", body: "batch-msg-1" },
            { id: "1", body: "batch-msg-2" },
            { id: "2", body: "batch-msg-3" },
          ]);
          assert(result.ok);
          assertEquals(result.failed.length, 0);
          assertEquals(result.successful.length, 3);
        });

        await t.step("deleteBatch removes multiple messages", async () => {
          const receiveResult = await client.receive({
            maxMessages: 10,
            waitTimeSeconds: 1,
          });
          assert(receiveResult.ok);

          if (receiveResult.messages.length > 0) {
            const handles = receiveResult.messages.map((m) => m.receiptHandle);
            const deleteResult = await client.deleteBatch(handles);
            assert(deleteResult.ok);
            assertEquals(deleteResult.failed.length, 0);
          }
        });
      });

      await t.step("Message with attributes", async (t) => {
        await client.purge();
        await new Promise((r) => setTimeout(r, 100));

        await t.step("send with message attributes", async () => {
          const result = await client.send(
            "test message with attributes",
            {
              messageAttributes: {
                priority: { dataType: "String", stringValue: "high" },
                count: { dataType: "Number", stringValue: "100" },
              },
            },
          );
          assert(result.ok);
        });

        await t.step("receive retrieves message attributes", async () => {
          const result = await client.receive({
            maxMessages: 1,
            waitTimeSeconds: 1,
            messageAttributeNames: ["All"],
          });
          assert(result.ok);
          assert(result.messages.length > 0);

          const msg = result.messages[0]!;
          assertEquals(msg.messageAttributes?.priority?.stringValue, "high");
          assertEquals(msg.messageAttributes?.count?.stringValue, "100");

          await client.delete(msg.receiptHandle);
        });
      });

      await t.step("Delayed messages", async (t) => {
        await client.purge();
        await new Promise((r) => setTimeout(r, 100));

        await t.step("send with delay", async () => {
          const result = await client.send("delayed message", {
            delaySeconds: 1,
          });
          assert(result.ok);

          const immediateResult = await client.receive({
            maxMessages: 1,
            waitTimeSeconds: 0,
          });
          assert(immediateResult.ok);
          assertEquals(immediateResult.messages.length, 0);

          await new Promise((r) => setTimeout(r, 1500));

          const delayedResult = await client.receive({
            maxMessages: 1,
            waitTimeSeconds: 1,
          });
          assert(delayedResult.ok);
          assert(delayedResult.messages.length > 0);

          const delayedMsg = delayedResult.messages[0]!;
          assert(delayedMsg.body.includes("delayed"));

          await client.delete(delayedMsg.receiptHandle);
        });
      });

      await t.step("CommonOptions support", async (t) => {
        await t.step("receive with signal option succeeds", async () => {
          const controller = new AbortController();
          const result = await client.receive({
            signal: controller.signal,
            waitTimeSeconds: 0,
          });
          assert(result.ok);
        });

        await t.step(
          "operation returns Failure when signal is aborted",
          async () => {
            const controller = new AbortController();
            controller.abort();

            const result = await client.receive({
              signal: controller.signal,
            });
            assertEquals(result.ok, false);
            assertEquals(result.processed, false);
            assertInstanceOf(result.error, AbortError);
          },
        );

        await t.step(
          "operation throws AbortError when throwOnError is true and signal is aborted",
          async () => {
            const controller = new AbortController();
            controller.abort();

            const error = await assertRejects(
              () =>
                client.receive({
                  signal: controller.signal,
                  throwOnError: true,
                }),
              AbortError,
            );
            assertInstanceOf(error, AbortError);
          },
        );
      });

      await t.step("Closed client returns Error", async () => {
        const tempClient = await createSqsClient({
          url: SQS_ENDPOINT,
          region: SQS_REGION,
          queueUrl,
          credentials: {
            accessKeyId: "test",
            secretAccessKey: "test",
          },
        });
        await tempClient.close();

        const result = await tempClient.send("test");
        assertEquals(result.ok, false);
        assertEquals(result.processed, true);
        assertInstanceOf(result.error, SqsCommandError);
      });

      await t.step(
        "Closed client throws error when throwOnError is true",
        async () => {
          const tempClient = await createSqsClient({
            url: SQS_ENDPOINT,
            region: SQS_REGION,
            queueUrl,
            credentials: {
              accessKeyId: "test",
              secretAccessKey: "test",
            },
          });
          await tempClient.close();

          await assertRejects(
            () => tempClient.send("test", { throwOnError: true }),
            SqsCommandError,
          );
        },
      );

      await t.step("Handles multiple messages", async () => {
        const messages = ["msg1", "msg2", "msg3", "msg4", "msg5"];
        for (const msg of messages) {
          await client.send(msg);
        }

        const received: string[] = [];
        let iterations = 0;
        const maxIterations = 10;

        while (received.length < 5 && iterations < maxIterations) {
          const result = await client.receive({
            maxMessages: 10,
            waitTimeSeconds: 5,
          });
          assert(result.ok);

          for (const msg of result.messages) {
            received.push(msg.body);
            await client.delete(msg.receiptHandle);
          }
          iterations++;
        }

        assertEquals(received.length, 5);
        assertEquals(received.sort(), messages.sort());
      });

      await t.step("Queue management", async (t) => {
        await t.step("ensureQueue creates a new queue", async () => {
          const newQueueName = `test-ensure-queue-${crypto.randomUUID()}`;
          const result = await client.ensureQueue(newQueueName);

          assert(result.ok);
          assertEquals(typeof result.queueUrl, "string");
          assert(result.queueUrl.includes(newQueueName));
          assertEquals(typeof result.duration, "number");

          // Clean up the queue we created
          await client.deleteQueue(result.queueUrl);
        });

        await t.step(
          "ensureQueue is idempotent for existing queue",
          async () => {
            const existingQueueName = `test-idempotent-${crypto.randomUUID()}`;

            // Create queue first time
            const firstResult = await client.ensureQueue(existingQueueName);
            assert(firstResult.ok);

            // Create queue second time (should return same URL)
            const secondResult = await client.ensureQueue(existingQueueName);
            assert(secondResult.ok);
            assertEquals(secondResult.queueUrl, firstResult.queueUrl);

            // Clean up
            await client.deleteQueue(firstResult.queueUrl);
          },
        );

        await t.step("ensureQueue with attributes", async () => {
          const queueWithAttrs = `test-attrs-${crypto.randomUUID()}`;
          const result = await client.ensureQueue(queueWithAttrs, {
            attributes: {
              DelaySeconds: "5",
              MessageRetentionPeriod: "86400",
            },
          });

          assert(result.ok);
          assertEquals(typeof result.queueUrl, "string");

          // Clean up
          await client.deleteQueue(result.queueUrl);
        });

        await t.step("deleteQueue removes a queue", async () => {
          const queueToDelete = `test-delete-${crypto.randomUUID()}`;
          const createResult = await client.ensureQueue(queueToDelete);
          assert(createResult.ok);

          const deleteResult = await client.deleteQueue(createResult.queueUrl);
          assert(deleteResult.ok);
          assertEquals(typeof deleteResult.duration, "number");
        });
      });
    } finally {
      await client.close();
      await cleanup();
    }
  },
});

Deno.test({
  name: "Integration: SQS Client without queueUrl",
  ignore: !(await isSqsAvailable()),
  async fn(t) {
    // Create client without queueUrl
    const client = await createSqsClient({
      url: SQS_ENDPOINT,
      region: SQS_REGION,
      credentials: {
        accessKeyId: "test",
        secretAccessKey: "test",
      },
    });

    let createdQueueUrl: string | undefined;

    try {
      await t.step("queueUrl is initially undefined", () => {
        assertEquals(client.queueUrl, undefined);
      });

      await t.step(
        "send returns Error when queueUrl is not set",
        async () => {
          const result = await client.send("test");
          assertEquals(result.ok, false);
          assertEquals(result.processed, true);
          assertInstanceOf(result.error, SqsCommandError);
          assert(result.error.message.includes("Queue URL is required"));
        },
      );

      await t.step(
        "send throws when queueUrl is not set and throwOnError is true",
        async () => {
          const error = await assertRejects(
            () => client.send("test", { throwOnError: true }),
            SqsCommandError,
          );
          assertInstanceOf(error, SqsCommandError);
          assert(error.message.includes("Queue URL is required"));
        },
      );

      await t.step(
        "ensureQueue sets queueUrl automatically",
        async () => {
          const queueName = `test-auto-url-${crypto.randomUUID()}`;
          const ensureResult = await client.ensureQueue(queueName);
          assert(ensureResult.ok);
          createdQueueUrl = ensureResult.queueUrl;

          // queueUrl should be set automatically
          assertEquals(client.queueUrl, createdQueueUrl);

          // Now send and receive should work on the same client
          const sendResult = await client.send(
            "test message after ensureQueue",
          );
          assert(sendResult.ok);

          const receiveResult = await client.receive({
            maxMessages: 1,
            waitTimeSeconds: 1,
          });
          assert(receiveResult.ok);
          assertEquals(receiveResult.messages.length, 1);
          assertEquals(
            receiveResult.messages[0]?.body,
            "test message after ensureQueue",
          );
        },
      );

      await t.step(
        "setQueueUrl changes the target queue",
        async () => {
          // Create another queue
          const anotherQueueName = `test-another-${crypto.randomUUID()}`;
          const anotherResult = await client.ensureQueue(anotherQueueName);
          assert(anotherResult.ok);

          // Create a second client and set queue URL manually
          const client2 = await createSqsClient({
            url: SQS_ENDPOINT,
            region: SQS_REGION,
            credentials: {
              accessKeyId: "test",
              secretAccessKey: "test",
            },
          });

          try {
            // Initially undefined
            assertEquals(client2.queueUrl, undefined);

            // Set queue URL manually
            client2.setQueueUrl(anotherResult.queueUrl);
            assertEquals(client2.queueUrl, anotherResult.queueUrl);

            // Now send should work
            const sendResult = await client2.send("message via setQueueUrl");
            assert(sendResult.ok);

            const receiveResult = await client2.receive({
              maxMessages: 1,
              waitTimeSeconds: 1,
            });
            assert(receiveResult.ok);
            assertEquals(
              receiveResult.messages[0]?.body,
              "message via setQueueUrl",
            );
          } finally {
            await client2.close();
            // Clean up the second queue
            await client.deleteQueue(anotherResult.queueUrl);
          }
        },
      );
    } finally {
      // Clean up created queue
      if (createdQueueUrl) {
        await client.deleteQueue(createdQueueUrl);
      }
      await client.close();
    }
  },
});
