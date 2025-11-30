import { assertEquals, assertThrows } from "@std/assert";
import { createDenoKvEntries } from "./results.ts";
import type { DenoKvEntry } from "./results.ts";

function createEntry<T>(
  key: Deno.KvKey,
  value: T,
  versionstamp: string,
): DenoKvEntry<T> {
  return { key, value, versionstamp };
}

Deno.test("DenoKvEntries", async (t) => {
  await t.step("first() returns first entry", () => {
    const entries = createDenoKvEntries([
      createEntry(["a"], 1, "v1"),
      createEntry(["b"], 2, "v2"),
    ]);
    assertEquals(entries.first(), { key: ["a"], value: 1, versionstamp: "v1" });
  });

  await t.step("first() returns undefined for empty array", () => {
    const entries = createDenoKvEntries<number>([]);
    assertEquals(entries.first(), undefined);
  });

  await t.step("firstOrThrow() returns first entry", () => {
    const entries = createDenoKvEntries([
      createEntry(["a"], 1, "v1"),
    ]);
    assertEquals(entries.firstOrThrow(), {
      key: ["a"],
      value: 1,
      versionstamp: "v1",
    });
  });

  await t.step("firstOrThrow() throws for empty array", () => {
    const entries = createDenoKvEntries<number>([]);
    assertThrows(
      () => entries.firstOrThrow(),
      Error,
      "No entries found",
    );
  });

  await t.step("last() returns last entry", () => {
    const entries = createDenoKvEntries([
      createEntry(["a"], 1, "v1"),
      createEntry(["b"], 2, "v2"),
    ]);
    assertEquals(entries.last(), { key: ["b"], value: 2, versionstamp: "v2" });
  });

  await t.step("last() returns undefined for empty array", () => {
    const entries = createDenoKvEntries<number>([]);
    assertEquals(entries.last(), undefined);
  });

  await t.step("lastOrThrow() returns last entry", () => {
    const entries = createDenoKvEntries([
      createEntry(["a"], 1, "v1"),
      createEntry(["b"], 2, "v2"),
    ]);
    assertEquals(entries.lastOrThrow(), {
      key: ["b"],
      value: 2,
      versionstamp: "v2",
    });
  });

  await t.step("lastOrThrow() throws for empty array", () => {
    const entries = createDenoKvEntries<number>([]);
    assertThrows(
      () => entries.lastOrThrow(),
      Error,
      "No entries found",
    );
  });

  await t.step("behaves like array", () => {
    const entries = createDenoKvEntries([
      createEntry(["a"], 1, "v1"),
      createEntry(["b"], 2, "v2"),
      createEntry(["c"], 3, "v3"),
    ]);
    assertEquals(entries.length, 3);
    assertEquals(entries[1], { key: ["b"], value: 2, versionstamp: "v2" });
    assertEquals(
      Array.from(entries.map((e) => e.value)),
      [1, 2, 3],
    );
    assertEquals(
      entries.filter((e) => e.value > 1).length,
      2,
    );
  });
});
