import { assertEquals, assertThrows } from "@std/assert";
import {
  expectDenoKvAtomicResult,
  expectDenoKvDeleteResult,
  expectDenoKvGetResult,
  expectDenoKvListResult,
  expectDenoKvSetResult,
} from "./expect.ts";
import { createDenoKvEntries } from "./results.ts";
import type {
  DenoKvAtomicResult,
  DenoKvDeleteResult,
  DenoKvGetResult,
  DenoKvListResult,
  DenoKvSetResult,
} from "./results.ts";

function createGetResult<T>(
  overrides: Partial<DenoKvGetResult<T>> = {},
): DenoKvGetResult<T> {
  return {
    ok: overrides.ok ?? true,
    key: overrides.key ?? ["test"],
    value: ("value" in overrides ? overrides.value : { name: "test" }) as
      | T
      | null,
    versionstamp: "versionstamp" in overrides
      ? overrides.versionstamp!
      : "00000001",
    duration: overrides.duration ?? 10,
  };
}

function createListResult<T>(
  overrides: Partial<DenoKvListResult<T>> = {},
): DenoKvListResult<T> {
  return {
    ok: overrides.ok ?? true,
    entries: overrides.entries ?? createDenoKvEntries([]),
    duration: overrides.duration ?? 10,
  };
}

function createSetResult(
  overrides: Partial<DenoKvSetResult> = {},
): DenoKvSetResult {
  return {
    ok: overrides.ok ?? true,
    versionstamp: overrides.versionstamp ?? "00000001",
    duration: overrides.duration ?? 10,
  };
}

function createDeleteResult(
  overrides: Partial<DenoKvDeleteResult> = {},
): DenoKvDeleteResult {
  return {
    ok: overrides.ok ?? true,
    duration: overrides.duration ?? 10,
  };
}

function createAtomicResult(
  overrides: Partial<DenoKvAtomicResult> = {},
): DenoKvAtomicResult {
  return {
    ok: overrides.ok ?? true,
    versionstamp: overrides.versionstamp ?? "00000001",
    duration: overrides.duration ?? 10,
  };
}

Deno.test("expectDenoKvGetResult.ok", async (t) => {
  await t.step("passes for ok result", () => {
    const result = createGetResult({ ok: true });
    expectDenoKvGetResult(result).ok();
  });

  await t.step("throws for not ok result", () => {
    const result = createGetResult({ ok: false });
    assertThrows(
      () => expectDenoKvGetResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });
});

Deno.test("expectDenoKvGetResult.notOk", async (t) => {
  await t.step("passes for not ok result", () => {
    const result = createGetResult({ ok: false });
    expectDenoKvGetResult(result).notOk();
  });

  await t.step("throws for ok result", () => {
    const result = createGetResult({ ok: true });
    assertThrows(
      () => expectDenoKvGetResult(result).notOk(),
      Error,
      "Expected not ok result",
    );
  });
});

Deno.test("expectDenoKvGetResult.noContent", async (t) => {
  await t.step("passes when value is null", () => {
    const result = createGetResult({ value: null });
    expectDenoKvGetResult(result).noContent();
  });

  await t.step("throws when value exists", () => {
    const result = createGetResult({ value: { name: "test" } });
    assertThrows(
      () => expectDenoKvGetResult(result).noContent(),
      Error,
      "Expected no content",
    );
  });
});

Deno.test("expectDenoKvGetResult.hasContent", async (t) => {
  await t.step("passes when value exists", () => {
    const result = createGetResult({ value: { name: "test" } });
    expectDenoKvGetResult(result).hasContent();
  });

  await t.step("throws when value is null", () => {
    const result = createGetResult({ value: null });
    assertThrows(
      () => expectDenoKvGetResult(result).hasContent(),
      Error,
      "Expected content",
    );
  });
});

Deno.test("expectDenoKvGetResult.value", async (t) => {
  await t.step("passes when value matches", () => {
    const result = createGetResult({ value: { name: "Alice", age: 30 } });
    expectDenoKvGetResult(result).value({ name: "Alice", age: 30 });
  });

  await t.step("throws when value does not match", () => {
    const result = createGetResult({ value: { name: "Alice" } });
    assertThrows(
      () => expectDenoKvGetResult(result).value({ name: "Bob" }),
      Error,
      "Expected value",
    );
  });

  await t.step("throws when value is null", () => {
    const result = createGetResult<{ name: string }>({ value: null });
    assertThrows(
      () => expectDenoKvGetResult(result).value({ name: "Alice" }),
      Error,
      "Expected value, but value is null",
    );
  });
});

Deno.test("expectDenoKvGetResult.valueContains", async (t) => {
  await t.step("passes when value contains subset", () => {
    const result = createGetResult({ value: { name: "Alice", age: 30 } });
    expectDenoKvGetResult(result).valueContains({ name: "Alice" });
  });

  await t.step("throws when value does not contain subset", () => {
    const result = createGetResult({ value: { name: "Alice" } });
    assertThrows(
      () => expectDenoKvGetResult(result).valueContains({ name: "Bob" }),
      Error,
      "Value does not contain expected properties",
    );
  });
});

Deno.test("expectDenoKvGetResult.valueMatch", async (t) => {
  await t.step("calls matcher with value", () => {
    const result = createGetResult({ value: { name: "Alice" } });
    let captured = null;
    expectDenoKvGetResult(result).valueMatch((v) => {
      captured = v;
    });
    assertEquals(captured, { name: "Alice" });
  });

  await t.step("throws if matcher throws", () => {
    const result = createGetResult({ value: { name: "Alice" } });
    assertThrows(
      () =>
        expectDenoKvGetResult(result).valueMatch(() => {
          throw new Error("custom error");
        }),
      Error,
      "custom error",
    );
  });
});

Deno.test("expectDenoKvGetResult.hasVersionstamp", async (t) => {
  await t.step("passes when versionstamp exists", () => {
    const result = createGetResult({ versionstamp: "00000001" });
    expectDenoKvGetResult(result).hasVersionstamp();
  });

  await t.step("throws when versionstamp is null", () => {
    const result = createGetResult({ versionstamp: null });
    assertThrows(
      () => expectDenoKvGetResult(result).hasVersionstamp(),
      Error,
      "Expected versionstamp",
    );
  });
});

Deno.test("expectDenoKvGetResult.durationLessThan", async (t) => {
  await t.step("passes when duration is less than threshold", () => {
    const result = createGetResult({ duration: 50 });
    expectDenoKvGetResult(result).durationLessThan(100);
  });

  await t.step("throws when duration exceeds threshold", () => {
    const result = createGetResult({ duration: 150 });
    assertThrows(
      () => expectDenoKvGetResult(result).durationLessThan(100),
      Error,
      "Expected duration < 100ms, got 150ms",
    );
  });
});

Deno.test("expectDenoKvGetResult chaining", async (t) => {
  await t.step("allows chaining multiple assertions", () => {
    const result = createGetResult({
      ok: true,
      value: { name: "Alice", age: 30 },
      versionstamp: "00000001",
      duration: 50,
    });

    expectDenoKvGetResult(result)
      .ok()
      .hasContent()
      .valueContains({ name: "Alice" })
      .hasVersionstamp()
      .durationLessThan(100);
  });
});

Deno.test("expectDenoKvListResult.ok", async (t) => {
  await t.step("passes for ok result", () => {
    const result = createListResult({ ok: true });
    expectDenoKvListResult(result).ok();
  });

  await t.step("throws for not ok result", () => {
    const result = createListResult({ ok: false });
    assertThrows(
      () => expectDenoKvListResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });
});

Deno.test("expectDenoKvListResult.noContent", async (t) => {
  await t.step("passes when entries is empty", () => {
    const result = createListResult({ entries: createDenoKvEntries([]) });
    expectDenoKvListResult(result).noContent();
  });

  await t.step("throws when entries exist", () => {
    const result = createListResult({
      entries: createDenoKvEntries([
        { key: ["a"], value: 1, versionstamp: "v1" },
      ]),
    });
    assertThrows(
      () => expectDenoKvListResult(result).noContent(),
      Error,
      "Expected no entries",
    );
  });
});

Deno.test("expectDenoKvListResult.hasContent", async (t) => {
  await t.step("passes when entries exist", () => {
    const result = createListResult({
      entries: createDenoKvEntries([
        { key: ["a"], value: 1, versionstamp: "v1" },
      ]),
    });
    expectDenoKvListResult(result).hasContent();
  });

  await t.step("throws when entries is empty", () => {
    const result = createListResult({ entries: createDenoKvEntries([]) });
    assertThrows(
      () => expectDenoKvListResult(result).hasContent(),
      Error,
      "Expected entries",
    );
  });
});

Deno.test("expectDenoKvListResult.count", async (t) => {
  await t.step("passes when count matches", () => {
    const result = createListResult({
      entries: createDenoKvEntries([
        { key: ["a"], value: 1, versionstamp: "v1" },
        { key: ["b"], value: 2, versionstamp: "v2" },
      ]),
    });
    expectDenoKvListResult(result).count(2);
  });

  await t.step("throws when count does not match", () => {
    const result = createListResult({
      entries: createDenoKvEntries([
        { key: ["a"], value: 1, versionstamp: "v1" },
      ]),
    });
    assertThrows(
      () => expectDenoKvListResult(result).count(2),
      Error,
      "Expected 2 entries, got 1",
    );
  });
});

Deno.test("expectDenoKvListResult.countAtLeast", async (t) => {
  await t.step("passes when count is at least min", () => {
    const result = createListResult({
      entries: createDenoKvEntries([
        { key: ["a"], value: 1, versionstamp: "v1" },
        { key: ["b"], value: 2, versionstamp: "v2" },
      ]),
    });
    expectDenoKvListResult(result).countAtLeast(2);
  });

  await t.step("throws when count is less than min", () => {
    const result = createListResult({
      entries: createDenoKvEntries([
        { key: ["a"], value: 1, versionstamp: "v1" },
      ]),
    });
    assertThrows(
      () => expectDenoKvListResult(result).countAtLeast(2),
      Error,
      "Expected at least 2 entries, got 1",
    );
  });
});

Deno.test("expectDenoKvListResult.countAtMost", async (t) => {
  await t.step("passes when count is at most max", () => {
    const result = createListResult({
      entries: createDenoKvEntries([
        { key: ["a"], value: 1, versionstamp: "v1" },
      ]),
    });
    expectDenoKvListResult(result).countAtMost(2);
  });

  await t.step("throws when count exceeds max", () => {
    const result = createListResult({
      entries: createDenoKvEntries([
        { key: ["a"], value: 1, versionstamp: "v1" },
        { key: ["b"], value: 2, versionstamp: "v2" },
        { key: ["c"], value: 3, versionstamp: "v3" },
      ]),
    });
    assertThrows(
      () => expectDenoKvListResult(result).countAtMost(2),
      Error,
      "Expected at most 2 entries, got 3",
    );
  });
});

Deno.test("expectDenoKvListResult.entryContains", async (t) => {
  await t.step("passes when entry matches key", () => {
    const result = createListResult({
      entries: createDenoKvEntries([
        { key: ["users", "1"], value: { name: "Alice" }, versionstamp: "v1" },
      ]),
    });
    expectDenoKvListResult(result).entryContains({ key: ["users", "1"] });
  });

  await t.step("passes when entry matches value", () => {
    const result = createListResult({
      entries: createDenoKvEntries([
        { key: ["users", "1"], value: { name: "Alice" }, versionstamp: "v1" },
      ]),
    });
    expectDenoKvListResult(result).entryContains({ value: { name: "Alice" } });
  });

  await t.step("passes when entry matches both key and value", () => {
    const result = createListResult({
      entries: createDenoKvEntries([
        { key: ["users", "1"], value: { name: "Alice" }, versionstamp: "v1" },
      ]),
    });
    expectDenoKvListResult(result).entryContains({
      key: ["users", "1"],
      value: { name: "Alice" },
    });
  });

  await t.step("throws when no entry matches", () => {
    const result = createListResult({
      entries: createDenoKvEntries([
        { key: ["users", "1"], value: { name: "Alice" }, versionstamp: "v1" },
      ]),
    });
    assertThrows(
      () =>
        expectDenoKvListResult(result).entryContains({ key: ["users", "2"] }),
      Error,
      "No entry matches the expected criteria",
    );
  });
});

Deno.test("expectDenoKvListResult.entriesMatch", async (t) => {
  await t.step("calls matcher with entries", () => {
    const entries = createDenoKvEntries([
      { key: ["a"], value: 1, versionstamp: "v1" },
    ]);
    const result = createListResult({ entries });
    let captured = null;
    expectDenoKvListResult(result).entriesMatch((e) => {
      captured = e;
    });
    assertEquals(captured, entries);
  });
});

Deno.test("expectDenoKvSetResult.ok", async (t) => {
  await t.step("passes for ok result", () => {
    const result = createSetResult({ ok: true });
    expectDenoKvSetResult(result).ok();
  });

  await t.step("throws for not ok result", () => {
    const result = createSetResult({ ok: false });
    assertThrows(
      () => expectDenoKvSetResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });
});

Deno.test("expectDenoKvSetResult.hasVersionstamp", async (t) => {
  await t.step("passes when versionstamp exists", () => {
    const result = createSetResult({ versionstamp: "00000001" });
    expectDenoKvSetResult(result).hasVersionstamp();
  });
});

Deno.test("expectDenoKvDeleteResult.ok", async (t) => {
  await t.step("passes for ok result", () => {
    const result = createDeleteResult({ ok: true });
    expectDenoKvDeleteResult(result).ok();
  });
});

Deno.test("expectDenoKvAtomicResult.ok", async (t) => {
  await t.step("passes for ok result", () => {
    const result = createAtomicResult({ ok: true });
    expectDenoKvAtomicResult(result).ok();
  });

  await t.step("throws for not ok result", () => {
    const result = createAtomicResult({ ok: false });
    assertThrows(
      () => expectDenoKvAtomicResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });
});

Deno.test("expectDenoKvAtomicResult.hasVersionstamp", async (t) => {
  await t.step("passes when versionstamp exists", () => {
    const result = createAtomicResult({ versionstamp: "00000001" });
    expectDenoKvAtomicResult(result).hasVersionstamp();
  });

  await t.step("throws when versionstamp is missing", () => {
    const result: DenoKvAtomicResult = {
      ok: false,
      duration: 10,
    };
    assertThrows(
      () => expectDenoKvAtomicResult(result).hasVersionstamp(),
      Error,
      "Expected versionstamp",
    );
  });
});
