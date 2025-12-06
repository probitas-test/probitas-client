import { assertEquals, assertThrows } from "@std/assert";
import type {
  RedisArrayResult,
  RedisCommonResult,
  RedisCountResult,
} from "./types.ts";
import {
  expectRedisArrayResult,
  expectRedisCommonResult,
  expectRedisCountResult,
} from "./expect.ts";

function createResult<T>(
  value: T,
  ok = true,
  duration = 10,
): RedisCommonResult<T> {
  return { type: "redis:common", ok, value, duration };
}

function createCountResult(
  value: number,
  ok = true,
  duration = 10,
): RedisCountResult {
  return { type: "redis:count", ok, value, duration };
}

function createArrayResult<T>(
  value: readonly T[],
  ok = true,
  duration = 10,
): RedisArrayResult<T> {
  return { type: "redis:array", ok, value, duration };
}

Deno.test("expectRedisCommonResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createResult("value");
    expectRedisCommonResult(result).ok();
  });

  await t.step("ok() throws when ok is false", () => {
    const result = createResult("value", false);
    assertThrows(
      () => expectRedisCommonResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createResult("value", false);
    expectRedisCommonResult(result).notOk();
  });

  await t.step("notOk() throws when ok is true", () => {
    const result = createResult("value");
    assertThrows(
      () => expectRedisCommonResult(result).notOk(),
      Error,
      "Expected not ok result",
    );
  });

  await t.step("value() passes when values match", () => {
    const result = createResult("expected");
    expectRedisCommonResult(result).value("expected");
  });

  await t.step("value() throws when values don't match", () => {
    const result = createResult("actual");
    assertThrows(
      () => expectRedisCommonResult(result).value("expected"),
      Error,
      "Expected value",
    );
  });

  await t.step("valueMatch() calls matcher with value", () => {
    const result = createResult("test");
    let called = false;
    expectRedisCommonResult(result).valueMatch((v) => {
      assertEquals(v, "test");
      called = true;
    });
    assertEquals(called, true);
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    const result = createResult("value", true, 50);
    expectRedisCommonResult(result).durationLessThan(100);
  });

  await t.step("durationLessThan() throws when duration is greater", () => {
    const result = createResult("value", true, 150);
    assertThrows(
      () => expectRedisCommonResult(result).durationLessThan(100),
      Error,
      "Expected duration",
    );
  });

  await t.step("methods can be chained", () => {
    const result = createResult("test", true, 50);
    expectRedisCommonResult(result)
      .ok()
      .value("test")
      .durationLessThan(100);
  });
});

Deno.test("expectRedisCountResult", async (t) => {
  await t.step("count() passes when counts match", () => {
    const result = createCountResult(5);
    expectRedisCountResult(result).count(5);
  });

  await t.step("count() throws when counts don't match", () => {
    const result = createCountResult(3);
    assertThrows(
      () => expectRedisCountResult(result).count(5),
      Error,
      "Expected count 5",
    );
  });

  await t.step("countAtLeast() passes when count is at least min", () => {
    const result = createCountResult(5);
    expectRedisCountResult(result).countAtLeast(3);
  });

  await t.step("countAtLeast() throws when count is less than min", () => {
    const result = createCountResult(2);
    assertThrows(
      () => expectRedisCountResult(result).countAtLeast(3),
      Error,
      "Expected count >= 3",
    );
  });

  await t.step("countAtMost() passes when count is at most max", () => {
    const result = createCountResult(3);
    expectRedisCountResult(result).countAtMost(5);
  });

  await t.step("countAtMost() throws when count is greater than max", () => {
    const result = createCountResult(6);
    assertThrows(
      () => expectRedisCountResult(result).countAtMost(5),
      Error,
      "Expected count <= 5",
    );
  });

  await t.step("inherits base expectations", () => {
    const result = createCountResult(10, true, 50);
    expectRedisCountResult(result)
      .ok()
      .count(10)
      .countAtLeast(5)
      .countAtMost(15)
      .durationLessThan(100);
  });
});

Deno.test("expectRedisArrayResult", async (t) => {
  await t.step("noContent() passes when array is empty", () => {
    const result = createArrayResult<string>([]);
    expectRedisArrayResult(result).noContent();
  });

  await t.step("noContent() throws when array is not empty", () => {
    const result = createArrayResult(["a", "b"]);
    assertThrows(
      () => expectRedisArrayResult(result).noContent(),
      Error,
      "Expected empty array",
    );
  });

  await t.step("hasContent() passes when array is not empty", () => {
    const result = createArrayResult(["a"]);
    expectRedisArrayResult(result).hasContent();
  });

  await t.step("hasContent() throws when array is empty", () => {
    const result = createArrayResult<string>([]);
    assertThrows(
      () => expectRedisArrayResult(result).hasContent(),
      Error,
      "Expected non-empty array",
    );
  });

  await t.step("length() passes when lengths match", () => {
    const result = createArrayResult(["a", "b", "c"]);
    expectRedisArrayResult(result).length(3);
  });

  await t.step("length() throws when lengths don't match", () => {
    const result = createArrayResult(["a", "b"]);
    assertThrows(
      () => expectRedisArrayResult(result).length(3),
      Error,
      "Expected array length 3",
    );
  });

  await t.step("lengthAtLeast() passes when length is sufficient", () => {
    const result = createArrayResult(["a", "b", "c"]);
    expectRedisArrayResult(result).lengthAtLeast(2);
  });

  await t.step("lengthAtLeast() throws when length is insufficient", () => {
    const result = createArrayResult(["a"]);
    assertThrows(
      () => expectRedisArrayResult(result).lengthAtLeast(2),
      Error,
      "Expected array length >= 2",
    );
  });

  await t.step("contains() passes when item exists", () => {
    const result = createArrayResult(["a", "b", "c"]);
    expectRedisArrayResult(result).contains("b");
  });

  await t.step("contains() throws when item doesn't exist", () => {
    const result = createArrayResult(["a", "b"]);
    assertThrows(
      () => expectRedisArrayResult(result).contains("c"),
      Error,
      "Expected array to contain",
    );
  });

  await t.step("inherits base expectations", () => {
    const result = createArrayResult(["a", "b", "c"], true, 50);
    expectRedisArrayResult(result)
      .ok()
      .hasContent()
      .length(3)
      .lengthAtLeast(2)
      .contains("b")
      .durationLessThan(100);
  });
});
