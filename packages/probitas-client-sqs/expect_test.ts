import { assertEquals, assertThrows } from "@std/assert";
import type {
  SqsDeleteBatchResult,
  SqsDeleteQueueResult,
  SqsDeleteResult,
  SqsEnsureQueueResult,
  SqsMessage,
  SqsReceiveResult,
  SqsSendBatchResult,
  SqsSendResult,
} from "./types.ts";
import { createSqsMessages } from "./messages.ts";
import {
  expectSqsDeleteBatchResult,
  expectSqsDeleteQueueResult,
  expectSqsDeleteResult,
  expectSqsEnsureQueueResult,
  expectSqsMessage,
  expectSqsReceiveResult,
  expectSqsSendBatchResult,
  expectSqsSendResult,
} from "./expect.ts";

Deno.test("expectSqsSendResult", async (t) => {
  const successResult: SqsSendResult = {
    type: "sqs:send",
    ok: true,
    messageId: "msg-123",
    md5OfBody: "abc123",
    duration: 50,
  };

  const failedResult: SqsSendResult = {
    type: "sqs:send",
    ok: false,
    messageId: "",
    md5OfBody: "",
    duration: 100,
  };

  await t.step("ok() passes for successful result", () => {
    expectSqsSendResult(successResult).ok();
  });

  await t.step("ok() throws for failed result", () => {
    assertThrows(
      () => expectSqsSendResult(failedResult).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("notOk() passes for failed result", () => {
    expectSqsSendResult(failedResult).notOk();
  });

  await t.step("notOk() throws for successful result", () => {
    assertThrows(
      () => expectSqsSendResult(successResult).notOk(),
      Error,
      "Expected not ok result",
    );
  });

  await t.step("hasMessageId() passes when messageId exists", () => {
    expectSqsSendResult(successResult).hasMessageId();
  });

  await t.step("hasMessageId() throws when messageId is empty", () => {
    assertThrows(
      () => expectSqsSendResult(failedResult).hasMessageId(),
      Error,
      "Expected messageId",
    );
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    expectSqsSendResult(successResult).durationLessThan(100);
  });

  await t.step("durationLessThan() throws when duration is greater", () => {
    assertThrows(
      () => expectSqsSendResult(successResult).durationLessThan(30),
      Error,
      "Expected duration",
    );
  });

  await t.step("chaining works", () => {
    expectSqsSendResult(successResult)
      .ok()
      .hasMessageId()
      .durationLessThan(100);
  });
});

Deno.test("expectSqsSendBatchResult", async (t) => {
  const allSuccess: SqsSendBatchResult = {
    type: "sqs:send-batch",
    ok: true,
    successful: [
      { messageId: "msg-1", id: "0" },
      { messageId: "msg-2", id: "1" },
    ],
    failed: [],
    duration: 50,
  };

  const partialFailure: SqsSendBatchResult = {
    type: "sqs:send-batch",
    ok: false,
    successful: [{ messageId: "msg-1", id: "0" }],
    failed: [{ id: "1", code: "InvalidParameterValue", message: "Invalid" }],
    duration: 60,
  };

  await t.step("ok() passes for all successful", () => {
    expectSqsSendBatchResult(allSuccess).ok();
  });

  await t.step("notOk() passes for partial failure", () => {
    expectSqsSendBatchResult(partialFailure).notOk();
  });

  await t.step("allSuccessful() passes when no failures", () => {
    expectSqsSendBatchResult(allSuccess).allSuccessful();
  });

  await t.step("allSuccessful() throws when there are failures", () => {
    assertThrows(
      () => expectSqsSendBatchResult(partialFailure).allSuccessful(),
      Error,
      "Expected all messages successful",
    );
  });

  await t.step("successfulCount() passes with correct count", () => {
    expectSqsSendBatchResult(allSuccess).successfulCount(2);
  });

  await t.step("successfulCount() throws with wrong count", () => {
    assertThrows(
      () => expectSqsSendBatchResult(allSuccess).successfulCount(3),
      Error,
      "Expected 3 successful",
    );
  });

  await t.step("failedCount() passes with correct count", () => {
    expectSqsSendBatchResult(partialFailure).failedCount(1);
  });

  await t.step("noFailures() passes when no failures", () => {
    expectSqsSendBatchResult(allSuccess).noFailures();
  });

  await t.step("noFailures() throws when there are failures", () => {
    assertThrows(
      () => expectSqsSendBatchResult(partialFailure).noFailures(),
      Error,
      "Expected no failures",
    );
  });

  await t.step("chaining works", () => {
    expectSqsSendBatchResult(allSuccess)
      .ok()
      .allSuccessful()
      .successfulCount(2)
      .noFailures();
  });
});

Deno.test("expectSqsReceiveResult", async (t) => {
  const messages: SqsMessage[] = [
    {
      messageId: "1",
      receiptHandle: "r1",
      body: "body1",
      attributes: { SenderId: "123" },
      md5OfBody: "abc",
    },
    {
      messageId: "2",
      receiptHandle: "r2",
      body: "body2",
      attributes: {},
      md5OfBody: "def",
    },
  ];

  const withMessages: SqsReceiveResult = {
    type: "sqs:receive",
    ok: true,
    messages: createSqsMessages(messages),
    duration: 50,
  };

  const emptyResult: SqsReceiveResult = {
    type: "sqs:receive",
    ok: true,
    messages: createSqsMessages([]),
    duration: 30,
  };

  await t.step("ok() passes for successful result", () => {
    expectSqsReceiveResult(withMessages).ok();
  });

  await t.step("noContent() passes for empty messages", () => {
    expectSqsReceiveResult(emptyResult).noContent();
  });

  await t.step("noContent() throws when messages exist", () => {
    assertThrows(
      () => expectSqsReceiveResult(withMessages).noContent(),
      Error,
      "Expected no messages",
    );
  });

  await t.step("hasContent() passes when messages exist", () => {
    expectSqsReceiveResult(withMessages).hasContent();
  });

  await t.step("hasContent() throws when no messages", () => {
    assertThrows(
      () => expectSqsReceiveResult(emptyResult).hasContent(),
      Error,
      "Expected messages",
    );
  });

  await t.step("count() passes with correct count", () => {
    expectSqsReceiveResult(withMessages).count(2);
  });

  await t.step("count() throws with wrong count", () => {
    assertThrows(
      () => expectSqsReceiveResult(withMessages).count(3),
      Error,
      "Expected 3 messages",
    );
  });

  await t.step("countAtLeast() passes when count is sufficient", () => {
    expectSqsReceiveResult(withMessages).countAtLeast(1);
  });

  await t.step("countAtLeast() throws when count is insufficient", () => {
    assertThrows(
      () => expectSqsReceiveResult(withMessages).countAtLeast(5),
      Error,
      "Expected at least 5 messages",
    );
  });

  await t.step("countAtMost() passes when count is within limit", () => {
    expectSqsReceiveResult(withMessages).countAtMost(5);
  });

  await t.step("countAtMost() throws when count exceeds limit", () => {
    assertThrows(
      () => expectSqsReceiveResult(withMessages).countAtMost(1),
      Error,
      "Expected at most 1 messages",
    );
  });

  await t.step("messageContains() passes when body matches", () => {
    expectSqsReceiveResult(withMessages).messageContains({ body: "body1" });
  });

  await t.step("messageContains() passes when attributes match", () => {
    expectSqsReceiveResult(withMessages).messageContains({
      attributes: { SenderId: "123" },
    });
  });

  await t.step("messageContains() throws when no message matches", () => {
    assertThrows(
      () =>
        expectSqsReceiveResult(withMessages).messageContains({
          body: "notfound",
        }),
      Error,
      "Expected at least one message to contain",
    );
  });

  await t.step("messagesMatch() calls matcher with messages", () => {
    let called = false;
    expectSqsReceiveResult(withMessages).messagesMatch((msgs) => {
      called = true;
      assertEquals(msgs.length, 2);
      assertEquals(msgs.first()?.body, "body1");
    });
    assertEquals(called, true);
  });

  await t.step("chaining works", () => {
    expectSqsReceiveResult(withMessages)
      .ok()
      .hasContent()
      .count(2)
      .countAtLeast(1)
      .countAtMost(5);
  });
});

Deno.test("expectSqsDeleteResult", async (t) => {
  const successResult: SqsDeleteResult = {
    type: "sqs:delete",
    ok: true,
    duration: 30,
  };

  const failedResult: SqsDeleteResult = {
    type: "sqs:delete",
    ok: false,
    duration: 50,
  };

  await t.step("ok() passes for successful result", () => {
    expectSqsDeleteResult(successResult).ok();
  });

  await t.step("notOk() passes for failed result", () => {
    expectSqsDeleteResult(failedResult).notOk();
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    expectSqsDeleteResult(successResult).durationLessThan(50);
  });

  await t.step("durationLessThan() throws when duration is greater", () => {
    assertThrows(
      () => expectSqsDeleteResult(successResult).durationLessThan(20),
      Error,
      "Expected duration",
    );
  });
});

Deno.test("expectSqsDeleteBatchResult", async (t) => {
  const allSuccess: SqsDeleteBatchResult = {
    type: "sqs:delete-batch",
    ok: true,
    successful: ["0", "1", "2"],
    failed: [],
    duration: 40,
  };

  const partialFailure: SqsDeleteBatchResult = {
    type: "sqs:delete-batch",
    ok: false,
    successful: ["0"],
    failed: [{ id: "1", code: "ReceiptHandleIsInvalid", message: "Invalid" }],
    duration: 50,
  };

  await t.step("ok() passes for all successful", () => {
    expectSqsDeleteBatchResult(allSuccess).ok();
  });

  await t.step("notOk() passes for partial failure", () => {
    expectSqsDeleteBatchResult(partialFailure).notOk();
  });

  await t.step("allSuccessful() passes when no failures", () => {
    expectSqsDeleteBatchResult(allSuccess).allSuccessful();
  });

  await t.step("allSuccessful() throws when there are failures", () => {
    assertThrows(
      () => expectSqsDeleteBatchResult(partialFailure).allSuccessful(),
      Error,
      "Expected all deletions successful",
    );
  });

  await t.step("successfulCount() passes with correct count", () => {
    expectSqsDeleteBatchResult(allSuccess).successfulCount(3);
  });

  await t.step("failedCount() passes with correct count", () => {
    expectSqsDeleteBatchResult(partialFailure).failedCount(1);
  });

  await t.step("noFailures() passes when no failures", () => {
    expectSqsDeleteBatchResult(allSuccess).noFailures();
  });

  await t.step("chaining works", () => {
    expectSqsDeleteBatchResult(allSuccess)
      .ok()
      .allSuccessful()
      .successfulCount(3)
      .noFailures();
  });
});

Deno.test("expectSqsMessage", async (t) => {
  const message: SqsMessage = {
    messageId: "msg-123",
    receiptHandle: "receipt-123",
    body: JSON.stringify({ type: "ORDER", id: 42 }),
    attributes: {},
    messageAttributes: {
      priority: { dataType: "String", stringValue: "high" },
    },
    md5OfBody: "abc123",
  };

  await t.step("bodyContains() passes when body contains substring", () => {
    expectSqsMessage(message).bodyContains("ORDER");
  });

  await t.step(
    "bodyContains() throws when body does not contain substring",
    () => {
      assertThrows(
        () => expectSqsMessage(message).bodyContains("NOTFOUND"),
        Error,
        'Expected body to contain "NOTFOUND"',
      );
    },
  );

  await t.step("bodyMatch() calls matcher with body", () => {
    let called = false;
    expectSqsMessage(message).bodyMatch((body) => {
      called = true;
      assertEquals(typeof body, "string");
    });
    assertEquals(called, true);
  });

  await t.step("bodyJsonEquals() passes with equal JSON", () => {
    expectSqsMessage(message).bodyJsonEquals({ type: "ORDER", id: 42 });
  });

  await t.step("bodyJsonEquals() throws with different JSON", () => {
    assertThrows(
      () => expectSqsMessage(message).bodyJsonEquals({ type: "DIFFERENT" }),
      Error,
      "Expected body JSON to equal",
    );
  });

  await t.step("bodyJsonContains() passes when body contains subset", () => {
    expectSqsMessage(message).bodyJsonContains({ type: "ORDER" });
  });

  await t.step("bodyJsonContains() passes with nested object subset", () => {
    const nestedMessage: SqsMessage = {
      messageId: "msg-nested",
      receiptHandle: "receipt-nested",
      body: JSON.stringify({
        data: { user: { name: "John", profile: { city: "NYC" } } },
      }),
      attributes: {},
      md5OfBody: "def456",
    };
    expectSqsMessage(nestedMessage).bodyJsonContains({
      data: { user: { name: "John" } },
    });
  });

  await t.step("bodyJsonContains() passes with deeply nested subset", () => {
    const deeplyNestedMessage: SqsMessage = {
      messageId: "msg-deep",
      receiptHandle: "receipt-deep",
      body: JSON.stringify({
        event: {
          payload: {
            user: { profile: { name: "Alice", age: 30 } },
          },
        },
      }),
      attributes: {},
      md5OfBody: "ghi789",
    };
    expectSqsMessage(deeplyNestedMessage).bodyJsonContains({
      event: { payload: { user: { profile: { name: "Alice" } } } },
    });
  });

  await t.step("bodyJsonContains() passes with nested array elements", () => {
    const arrayMessage: SqsMessage = {
      messageId: "msg-array",
      receiptHandle: "receipt-array",
      body: JSON.stringify({
        items: [1, 2, 3],
        nested: { values: [10, 20, 30] },
      }),
      attributes: {},
      md5OfBody: "jkl012",
    };
    expectSqsMessage(arrayMessage).bodyJsonContains({ items: [1, 2, 3] });
  });

  await t.step(
    "bodyJsonContains() throws when nested object does not match",
    () => {
      const nestedMessage: SqsMessage = {
        messageId: "msg-fail",
        receiptHandle: "receipt-fail",
        body: JSON.stringify({
          args: { name: "probitas", version: "1.0" },
        }),
        attributes: {},
        md5OfBody: "mno345",
      };
      assertThrows(
        () =>
          expectSqsMessage(nestedMessage).bodyJsonContains({
            args: { name: "different" },
          }),
        Error,
        "Expected body JSON to contain",
      );
    },
  );

  await t.step(
    "bodyJsonContains() passes with mixed nested and top-level properties",
    () => {
      const mixedMessage: SqsMessage = {
        messageId: "msg-mixed",
        receiptHandle: "receipt-mixed",
        body: JSON.stringify({
          status: "ok",
          data: { message: "Hello", count: 42 },
        }),
        attributes: {},
        md5OfBody: "pqr678",
      };
      expectSqsMessage(mixedMessage).bodyJsonContains({
        status: "ok",
        data: { message: "Hello" },
      });
    },
  );

  await t.step(
    "bodyJsonContains() throws when body does not contain subset",
    () => {
      assertThrows(
        () => expectSqsMessage(message).bodyJsonContains({ type: "DIFFERENT" }),
        Error,
        "Expected body JSON to contain",
      );
    },
  );

  await t.step("hasAttribute() passes when attribute exists", () => {
    expectSqsMessage(message).hasAttribute("priority");
  });

  await t.step("hasAttribute() throws when attribute does not exist", () => {
    assertThrows(
      () => expectSqsMessage(message).hasAttribute("nonexistent"),
      Error,
      'Expected message to have attribute "nonexistent"',
    );
  });

  await t.step("attributesContain() passes with matching attributes", () => {
    expectSqsMessage(message).attributesContain({
      priority: { dataType: "String", stringValue: "high" },
    });
  });

  await t.step(
    "attributesContain() throws with non-matching attributes",
    () => {
      assertThrows(
        () =>
          expectSqsMessage(message).attributesContain({
            priority: { dataType: "String", stringValue: "low" },
          }),
        Error,
        'Expected attribute "priority" to contain',
      );
    },
  );

  await t.step("messageId() passes with matching id", () => {
    expectSqsMessage(message).messageId("msg-123");
  });

  await t.step("messageId() throws with non-matching id", () => {
    assertThrows(
      () => expectSqsMessage(message).messageId("wrong-id"),
      Error,
      'Expected messageId "wrong-id"',
    );
  });

  await t.step("chaining works", () => {
    expectSqsMessage(message)
      .bodyContains("ORDER")
      .bodyJsonContains({ id: 42 })
      .hasAttribute("priority");
  });
});

Deno.test("expectSqsEnsureQueueResult", async (t) => {
  const successResult: SqsEnsureQueueResult = {
    type: "sqs:ensure-queue",
    ok: true,
    queueUrl: "https://sqs.us-east-1.amazonaws.com/123456789/test-queue",
    duration: 50,
  };

  const failedResult: SqsEnsureQueueResult = {
    type: "sqs:ensure-queue",
    ok: false,
    queueUrl: "",
    duration: 100,
  };

  await t.step("ok() passes for successful result", () => {
    expectSqsEnsureQueueResult(successResult).ok();
  });

  await t.step("ok() throws for failed result", () => {
    assertThrows(
      () => expectSqsEnsureQueueResult(failedResult).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("notOk() passes for failed result", () => {
    expectSqsEnsureQueueResult(failedResult).notOk();
  });

  await t.step("hasQueueUrl() passes when queueUrl exists", () => {
    expectSqsEnsureQueueResult(successResult).hasQueueUrl();
  });

  await t.step("hasQueueUrl() throws when queueUrl is empty", () => {
    assertThrows(
      () => expectSqsEnsureQueueResult(failedResult).hasQueueUrl(),
      Error,
      "Expected queueUrl",
    );
  });

  await t.step("queueUrl() passes with matching url", () => {
    expectSqsEnsureQueueResult(successResult).queueUrl(
      "https://sqs.us-east-1.amazonaws.com/123456789/test-queue",
    );
  });

  await t.step("queueUrl() throws with non-matching url", () => {
    assertThrows(
      () => expectSqsEnsureQueueResult(successResult).queueUrl("other-url"),
      Error,
      "Expected queueUrl",
    );
  });

  await t.step("queueUrlContains() passes when url contains substring", () => {
    expectSqsEnsureQueueResult(successResult).queueUrlContains("test-queue");
  });

  await t.step(
    "queueUrlContains() throws when url does not contain substring",
    () => {
      assertThrows(
        () =>
          expectSqsEnsureQueueResult(successResult).queueUrlContains(
            "other-queue",
          ),
        Error,
        "Expected queueUrl to contain",
      );
    },
  );

  await t.step("durationLessThan() passes when duration is less", () => {
    expectSqsEnsureQueueResult(successResult).durationLessThan(100);
  });

  await t.step("chaining works", () => {
    expectSqsEnsureQueueResult(successResult)
      .ok()
      .hasQueueUrl()
      .queueUrlContains("test-queue")
      .durationLessThan(100);
  });
});

Deno.test("expectSqsDeleteQueueResult", async (t) => {
  const successResult: SqsDeleteQueueResult = {
    type: "sqs:delete-queue",
    ok: true,
    duration: 30,
  };

  const failedResult: SqsDeleteQueueResult = {
    type: "sqs:delete-queue",
    ok: false,
    duration: 50,
  };

  await t.step("ok() passes for successful result", () => {
    expectSqsDeleteQueueResult(successResult).ok();
  });

  await t.step("notOk() passes for failed result", () => {
    expectSqsDeleteQueueResult(failedResult).notOk();
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    expectSqsDeleteQueueResult(successResult).durationLessThan(50);
  });

  await t.step("durationLessThan() throws when duration is greater", () => {
    assertThrows(
      () => expectSqsDeleteQueueResult(successResult).durationLessThan(20),
      Error,
      "Expected duration",
    );
  });
});
