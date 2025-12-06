import { assertEquals, assertThrows } from "@std/assert";
import type {
  RabbitMqAckResult,
  RabbitMqConsumeResult,
  RabbitMqExchangeResult,
  RabbitMqMessage,
  RabbitMqPublishResult,
  RabbitMqQueueResult,
} from "./types.ts";
import {
  expectRabbitMqAckResult,
  expectRabbitMqConsumeResult,
  expectRabbitMqExchangeResult,
  expectRabbitMqPublishResult,
  expectRabbitMqQueueResult,
} from "./expect.ts";

function createPublishResult(
  ok = true,
  duration = 10,
): RabbitMqPublishResult {
  return { ok, duration };
}

function createMessage(
  content: string,
  routingKey = "test.key",
  exchange = "",
  properties: Partial<RabbitMqMessage["properties"]> = {},
): RabbitMqMessage {
  return {
    content: new TextEncoder().encode(content),
    properties: {
      contentType: undefined,
      contentEncoding: undefined,
      headers: undefined,
      deliveryMode: undefined,
      priority: undefined,
      correlationId: undefined,
      replyTo: undefined,
      expiration: undefined,
      messageId: undefined,
      timestamp: undefined,
      type: undefined,
      userId: undefined,
      appId: undefined,
      ...properties,
    },
    fields: {
      deliveryTag: 1n,
      redelivered: false,
      exchange,
      routingKey,
    },
  };
}

function createConsumeResult(
  message: RabbitMqMessage | null,
  ok = true,
  duration = 10,
): RabbitMqConsumeResult {
  return { ok, message, duration };
}

function createQueueResult(
  queue = "test-queue",
  messageCount = 0,
  consumerCount = 0,
  ok = true,
  duration = 10,
): RabbitMqQueueResult {
  return { ok, queue, messageCount, consumerCount, duration };
}

Deno.test("expectRabbitMqPublishResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createPublishResult();
    expectRabbitMqPublishResult(result).ok();
  });

  await t.step("ok() throws when ok is false", () => {
    const result = createPublishResult(false);
    assertThrows(
      () => expectRabbitMqPublishResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createPublishResult(false);
    expectRabbitMqPublishResult(result).notOk();
  });

  await t.step("notOk() throws when ok is true", () => {
    const result = createPublishResult();
    assertThrows(
      () => expectRabbitMqPublishResult(result).notOk(),
      Error,
      "Expected not ok result",
    );
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    const result = createPublishResult(true, 50);
    expectRabbitMqPublishResult(result).durationLessThan(100);
  });

  await t.step("durationLessThan() throws when duration is greater", () => {
    const result = createPublishResult(true, 150);
    assertThrows(
      () => expectRabbitMqPublishResult(result).durationLessThan(100),
      Error,
      "Expected duration",
    );
  });

  await t.step("methods can be chained", () => {
    const result = createPublishResult(true, 50);
    expectRabbitMqPublishResult(result)
      .ok()
      .durationLessThan(100);
  });
});

Deno.test("expectRabbitMqConsumeResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createConsumeResult(null);
    expectRabbitMqConsumeResult(result).ok();
  });

  await t.step("ok() throws when ok is false", () => {
    const result = createConsumeResult(null, false);
    assertThrows(
      () => expectRabbitMqConsumeResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("noContent() passes when message is null", () => {
    const result = createConsumeResult(null);
    expectRabbitMqConsumeResult(result).noContent();
  });

  await t.step("noContent() throws when message exists", () => {
    const message = createMessage("test");
    const result = createConsumeResult(message);
    assertThrows(
      () => expectRabbitMqConsumeResult(result).noContent(),
      Error,
      "Expected no message",
    );
  });

  await t.step("hasContent() passes when message exists", () => {
    const message = createMessage("test");
    const result = createConsumeResult(message);
    expectRabbitMqConsumeResult(result).hasContent();
  });

  await t.step("hasContent() throws when message is null", () => {
    const result = createConsumeResult(null);
    assertThrows(
      () => expectRabbitMqConsumeResult(result).hasContent(),
      Error,
      "Expected message",
    );
  });

  await t.step("contentContains() passes when content contains subbody", () => {
    const message = createMessage("hello world");
    const result = createConsumeResult(message);
    expectRabbitMqConsumeResult(result).contentContains(
      new TextEncoder().encode("world"),
    );
  });

  await t.step(
    "contentContains() throws when content doesn't contain subbody",
    () => {
      const message = createMessage("hello world");
      const result = createConsumeResult(message);
      assertThrows(
        () =>
          expectRabbitMqConsumeResult(result).contentContains(
            new TextEncoder().encode("foo"),
          ),
        Error,
        "Expected content to contain",
      );
    },
  );

  await t.step("contentMatch() calls matcher with content", () => {
    const message = createMessage("test content");
    const result = createConsumeResult(message);
    let called = false;
    expectRabbitMqConsumeResult(result).contentMatch((content) => {
      assertEquals(new TextDecoder().decode(content), "test content");
      called = true;
    });
    assertEquals(called, true);
  });

  await t.step("propertyContains() passes when properties match", () => {
    const message = createMessage("test", "key", "", {
      contentType: "application/json",
      correlationId: "123",
    });
    const result = createConsumeResult(message);
    expectRabbitMqConsumeResult(result).propertyContains({
      contentType: "application/json",
    });
  });

  await t.step("propertyContains() throws when properties don't match", () => {
    const message = createMessage("test", "key", "", {
      contentType: "text/plain",
    });
    const result = createConsumeResult(message);
    assertThrows(
      () =>
        expectRabbitMqConsumeResult(result).propertyContains({
          contentType: "application/json",
        }),
      Error,
      "Expected properties to contain",
    );
  });

  await t.step("routingKey() passes when routing key matches", () => {
    const message = createMessage("test", "my.routing.key");
    const result = createConsumeResult(message);
    expectRabbitMqConsumeResult(result).routingKey("my.routing.key");
  });

  await t.step("routingKey() throws when routing key doesn't match", () => {
    const message = createMessage("test", "actual.key");
    const result = createConsumeResult(message);
    assertThrows(
      () => expectRabbitMqConsumeResult(result).routingKey("expected.key"),
      Error,
      "Expected routing key",
    );
  });

  await t.step("exchange() passes when exchange matches", () => {
    const message = createMessage("test", "key", "my-exchange");
    const result = createConsumeResult(message);
    expectRabbitMqConsumeResult(result).exchange("my-exchange");
  });

  await t.step("exchange() throws when exchange doesn't match", () => {
    const message = createMessage("test", "key", "actual-exchange");
    const result = createConsumeResult(message);
    assertThrows(
      () => expectRabbitMqConsumeResult(result).exchange("expected-exchange"),
      Error,
      "Expected exchange",
    );
  });

  await t.step("methods can be chained", () => {
    const message = createMessage("hello world", "my.key", "", {
      contentType: "text/plain",
    });
    const result = createConsumeResult(message, true, 50);
    expectRabbitMqConsumeResult(result)
      .ok()
      .hasContent()
      .routingKey("my.key")
      .propertyContains({ contentType: "text/plain" })
      .durationLessThan(100);
  });
});

Deno.test("expectRabbitMqQueueResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createQueueResult();
    expectRabbitMqQueueResult(result).ok();
  });

  await t.step("ok() throws when ok is false", () => {
    const result = createQueueResult("q", 0, 0, false);
    assertThrows(
      () => expectRabbitMqQueueResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("messageCount() passes when counts match", () => {
    const result = createQueueResult("q", 5);
    expectRabbitMqQueueResult(result).messageCount(5);
  });

  await t.step("messageCount() throws when counts don't match", () => {
    const result = createQueueResult("q", 3);
    assertThrows(
      () => expectRabbitMqQueueResult(result).messageCount(5),
      Error,
      "Expected message count 5",
    );
  });

  await t.step(
    "messageCountAtLeast() passes when count is at least min",
    () => {
      const result = createQueueResult("q", 5);
      expectRabbitMqQueueResult(result).messageCountAtLeast(3);
    },
  );

  await t.step(
    "messageCountAtLeast() throws when count is less than min",
    () => {
      const result = createQueueResult("q", 2);
      assertThrows(
        () => expectRabbitMqQueueResult(result).messageCountAtLeast(3),
        Error,
        "Expected message count >= 3",
      );
    },
  );

  await t.step("consumerCount() passes when counts match", () => {
    const result = createQueueResult("q", 0, 2);
    expectRabbitMqQueueResult(result).consumerCount(2);
  });

  await t.step("consumerCount() throws when counts don't match", () => {
    const result = createQueueResult("q", 0, 1);
    assertThrows(
      () => expectRabbitMqQueueResult(result).consumerCount(2),
      Error,
      "Expected consumer count 2",
    );
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    const result = createQueueResult("q", 0, 0, true, 50);
    expectRabbitMqQueueResult(result).durationLessThan(100);
  });

  await t.step("durationLessThan() throws when duration is greater", () => {
    const result = createQueueResult("q", 0, 0, true, 150);
    assertThrows(
      () => expectRabbitMqQueueResult(result).durationLessThan(100),
      Error,
      "Expected duration",
    );
  });

  await t.step("methods can be chained", () => {
    const result = createQueueResult("my-queue", 10, 2, true, 50);
    expectRabbitMqQueueResult(result)
      .ok()
      .messageCount(10)
      .messageCountAtLeast(5)
      .consumerCount(2)
      .durationLessThan(100);
  });
});

Deno.test("expectRabbitMqExchangeResult", async (t) => {
  const successResult: RabbitMqExchangeResult = { ok: true, duration: 10 };
  const failedResult: RabbitMqExchangeResult = { ok: false, duration: 10 };

  await t.step("ok() passes when ok is true", () => {
    expectRabbitMqExchangeResult(successResult).ok();
  });

  await t.step("ok() throws when ok is false", () => {
    assertThrows(
      () => expectRabbitMqExchangeResult(failedResult).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    expectRabbitMqExchangeResult(successResult).durationLessThan(100);
  });
});

Deno.test("expectRabbitMqAckResult", async (t) => {
  const successResult: RabbitMqAckResult = { ok: true, duration: 10 };
  const failedResult: RabbitMqAckResult = { ok: false, duration: 10 };

  await t.step("ok() passes when ok is true", () => {
    expectRabbitMqAckResult(successResult).ok();
  });

  await t.step("ok() throws when ok is false", () => {
    assertThrows(
      () => expectRabbitMqAckResult(failedResult).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    expectRabbitMqAckResult(successResult).durationLessThan(100);
  });
});
