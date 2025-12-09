import {
  assertEquals,
  assertExists,
  assertInstanceOf,
  assertRejects,
} from "@std/assert";
import { AbortError } from "@probitas/client";
import { createRabbitMqClient } from "./client.ts";
import { RabbitMqChannelError } from "./errors.ts";

const RABBITMQ_URL = Deno.env.get("RABBITMQ_URL") ??
  "amqp://guest:guest@localhost:5672";

async function isRabbitMqAvailable(): Promise<boolean> {
  try {
    const client = await createRabbitMqClient({
      url: RABBITMQ_URL,
      timeout: 5000,
    });
    await client.close();
    return true;
  } catch {
    return false;
  }
}

Deno.test({
  name: "Integration: RabbitMQ Client",
  ignore: !(await isRabbitMqAvailable()),
  async fn(t) {
    const client = await createRabbitMqClient({
      url: RABBITMQ_URL,
    });

    try {
      await t.step("implements AsyncDisposable", () => {
        assertEquals(typeof client[Symbol.asyncDispose], "function");
      });

      await t.step("Queue operations", async (t) => {
        const channel = await client.channel();
        const testQueue = `test-queue-${Date.now()}`;

        try {
          await t.step("assertQueue creates a new queue", async () => {
            const result = await channel.assertQueue(testQueue, {
              durable: false,
              autoDelete: true,
            });
            assertEquals(result.ok, true);
            assertEquals(result.messageCount, 0);
            assertEquals(result.queue, testQueue);
          });

          await t.step("purgeQueue clears the queue", async () => {
            const result = await channel.purgeQueue(testQueue);
            assertEquals(result.ok, true);
          });

          await t.step("deleteQueue removes the queue", async () => {
            const result = await channel.deleteQueue(testQueue);
            assertEquals(result.ok, true);
          });
        } finally {
          await channel.close();
        }
      });

      await t.step("Exchange operations", async (t) => {
        const channel = await client.channel();
        const testExchange = `test-exchange-${Date.now()}`;

        try {
          await t.step("assertExchange creates a new exchange", async () => {
            const result = await channel.assertExchange(
              testExchange,
              "direct",
              {
                durable: false,
                autoDelete: true,
              },
            );
            assertEquals(result.ok, true);
          });

          await t.step("deleteExchange removes the exchange", async () => {
            const result = await channel.deleteExchange(testExchange);
            assertEquals(result.ok, true);
          });
        } finally {
          await channel.close();
        }
      });

      await t.step("Publish and Consume", async (t) => {
        const channel = await client.channel();
        const testQueue = `test-pubsub-${Date.now()}`;

        try {
          await channel.assertQueue(testQueue, {
            durable: false,
            autoDelete: true,
          });

          await t.step("sendToQueue publishes a message", async () => {
            const content = new TextEncoder().encode(
              JSON.stringify({ type: "TEST", value: 42 }),
            );
            const result = await channel.sendToQueue(testQueue, content, {
              contentType: "application/json",
              persistent: false,
            });
            assertEquals(result.ok, true);
          });

          await t.step("get retrieves a message", async () => {
            const result = await channel.get(testQueue);
            assertEquals(result.ok, true);
            assertExists(result.message);
            assertEquals(result.message.fields.routingKey, testQueue);
            assertEquals(
              result.message.properties.contentType,
              "application/json",
            );

            if (result.message) {
              const body = JSON.parse(
                new TextDecoder().decode(result.message.content),
              );
              assertEquals(body.type, "TEST");
              assertEquals(body.value, 42);

              await channel.ack(result.message);
            }
          });

          await t.step("get returns null for empty queue", async () => {
            const result = await channel.get(testQueue);
            assertEquals(result.ok, true);
            assertEquals(result.message, null);
          });

          await channel.deleteQueue(testQueue);
        } finally {
          await channel.close();
        }
      });

      await t.step("Exchange binding", async (t) => {
        const channel = await client.channel();
        const testExchange = `test-binding-exchange-${Date.now()}`;
        const testQueue = `test-binding-queue-${Date.now()}`;
        const routingKey = "test.routing.key";

        try {
          await channel.assertExchange(testExchange, "direct", {
            durable: false,
            autoDelete: true,
          });
          await channel.assertQueue(testQueue, {
            durable: false,
            autoDelete: true,
          });

          await t.step("bindQueue binds queue to exchange", async () => {
            const result = await channel.bindQueue(
              testQueue,
              testExchange,
              routingKey,
            );
            assertEquals(result.ok, true);
          });

          await t.step(
            "publish to exchange delivers to bound queue",
            async () => {
              const content = new TextEncoder().encode("via exchange");
              await channel.publish(testExchange, routingKey, content);

              const result = await channel.get(testQueue);
              assertEquals(result.ok, true);
              assertExists(result.message);
              assertEquals(result.message.fields.exchange, testExchange);
              assertEquals(result.message.fields.routingKey, routingKey);

              if (result.message) {
                await channel.ack(result.message);
              }
            },
          );

          await t.step("unbindQueue removes binding", async () => {
            const result = await channel.unbindQueue(
              testQueue,
              testExchange,
              routingKey,
            );
            assertEquals(result.ok, true);
          });

          await channel.deleteQueue(testQueue);
          await channel.deleteExchange(testExchange);
        } finally {
          await channel.close();
        }
      });

      await t.step("Ack and Nack", async (t) => {
        const channel = await client.channel();
        const testQueue = `test-ack-${Date.now()}`;

        try {
          await channel.assertQueue(testQueue, {
            durable: false,
            autoDelete: true,
          });

          await t.step(
            "nack with requeue returns message to queue",
            async () => {
              const content = new TextEncoder().encode("requeue test");
              await channel.sendToQueue(testQueue, content);

              const result1 = await channel.get(testQueue);
              assertEquals(result1.ok, true);
              assertExists(result1.message);

              if (result1.message) {
                await channel.nack(result1.message, { requeue: true });
              }

              const result2 = await channel.get(testQueue);
              assertEquals(result2.ok, true);
              assertExists(result2.message);

              if (result2.message) {
                assertEquals(result2.message.fields.redelivered, true);
                await channel.ack(result2.message);
              }
            },
          );

          await t.step("reject removes message from queue", async () => {
            const content = new TextEncoder().encode("reject test");
            await channel.sendToQueue(testQueue, content);

            const result = await channel.get(testQueue);
            assertEquals(result.ok, true);
            assertExists(result.message);

            if (result.message) {
              await channel.reject(result.message, false);
            }

            const result2 = await channel.get(testQueue);
            assertEquals(result2.ok, true);
            assertEquals(result2.message, null);
          });

          await channel.deleteQueue(testQueue);
        } finally {
          await channel.close();
        }
      });

      await t.step("Prefetch", async () => {
        const channel = await client.channel();
        try {
          await channel.prefetch(10);
        } finally {
          await channel.close();
        }
      });

      await t.step("Channel implements AsyncDisposable", async () => {
        const channel = await client.channel();
        assertEquals(typeof channel[Symbol.asyncDispose], "function");
        await channel.close();
      });

      await t.step("Closed channel throws error", async () => {
        const channel = await client.channel();
        await channel.close();

        await assertRejects(
          () => channel.assertQueue("test"),
          RabbitMqChannelError,
        );
      });

      await t.step("CommonOptions support", async (t) => {
        const channel = await client.channel();
        const testQueue = `test-options-${Date.now()}`;

        try {
          await channel.assertQueue(testQueue, {
            durable: false,
            autoDelete: true,
          });

          await t.step("get with signal option succeeds", async () => {
            const controller = new AbortController();
            const result = await channel.get(testQueue, {
              signal: controller.signal,
            });
            assertEquals(result.ok, true);
          });

          await t.step(
            "get throws AbortError when signal is aborted",
            async () => {
              const controller = new AbortController();
              controller.abort();

              const error = await assertRejects(
                () => channel.get(testQueue, { signal: controller.signal }),
                AbortError,
              );
              assertInstanceOf(error, AbortError);
            },
          );

          await channel.deleteQueue(testQueue);
        } finally {
          await channel.close();
        }
      });
    } finally {
      await client.close();
    }
  },
});

Deno.test({
  name: "Integration: RabbitMQ consume (streaming)",
  ignore: !(await isRabbitMqAvailable()),
  async fn() {
    const client = await createRabbitMqClient({
      url: RABBITMQ_URL,
    });

    const channel = await client.channel();
    const testQueue = `test-consume-${Date.now()}`;

    try {
      await channel.assertQueue(testQueue, {
        durable: false,
        autoDelete: true,
      });

      const messages = ["msg1", "msg2", "msg3"];
      for (const msg of messages) {
        await channel.sendToQueue(
          testQueue,
          new TextEncoder().encode(msg),
        );
      }

      const received: string[] = [];
      let count = 0;

      for await (const msg of channel.consume(testQueue)) {
        received.push(new TextDecoder().decode(msg.content));
        await channel.ack(msg);
        count++;
        if (count >= 3) break;
      }

      assertEquals(received.length, 3);
      assertEquals(received.sort(), messages.sort());

      await channel.deleteQueue(testQueue);
    } finally {
      await channel.close();
      await client.close();
    }
  },
});
