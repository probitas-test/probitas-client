import { assertEquals, assertThrows } from "@std/assert";
import { createMongoDocs } from "./results.ts";
import { MongoNotFoundError } from "./errors.ts";

Deno.test("createMongoDocs", async (t) => {
  await t.step("creates array with first/last methods", () => {
    const docs = createMongoDocs([{ id: 1 }, { id: 2 }, { id: 3 }]);
    assertEquals(docs.length, 3);
    assertEquals(docs[0], { id: 1 });
    assertEquals(docs[1], { id: 2 });
    assertEquals(docs[2], { id: 3 });
  });

  await t.step("first() returns first element", () => {
    const docs = createMongoDocs([{ id: 1 }, { id: 2 }]);
    assertEquals(docs.first(), { id: 1 });
  });

  await t.step("first() returns undefined for empty array", () => {
    const docs = createMongoDocs<{ id: number }>([]);
    assertEquals(docs.first(), undefined);
  });

  await t.step("firstOrThrow() returns first element", () => {
    const docs = createMongoDocs([{ id: 1 }, { id: 2 }]);
    assertEquals(docs.firstOrThrow(), { id: 1 });
  });

  await t.step("firstOrThrow() throws for empty array", () => {
    const docs = createMongoDocs<{ id: number }>([]);
    assertThrows(
      () => docs.firstOrThrow(),
      MongoNotFoundError,
      "No documents found",
    );
  });

  await t.step("last() returns last element", () => {
    const docs = createMongoDocs([{ id: 1 }, { id: 2 }, { id: 3 }]);
    assertEquals(docs.last(), { id: 3 });
  });

  await t.step("last() returns undefined for empty array", () => {
    const docs = createMongoDocs<{ id: number }>([]);
    assertEquals(docs.last(), undefined);
  });

  await t.step("lastOrThrow() returns last element", () => {
    const docs = createMongoDocs([{ id: 1 }, { id: 2 }]);
    assertEquals(docs.lastOrThrow(), { id: 2 });
  });

  await t.step("lastOrThrow() throws for empty array", () => {
    const docs = createMongoDocs<{ id: number }>([]);
    assertThrows(
      () => docs.lastOrThrow(),
      MongoNotFoundError,
      "No documents found",
    );
  });

  await t.step("supports iteration", () => {
    const docs = createMongoDocs([{ id: 1 }, { id: 2 }]);
    const result: { id: number }[] = [];
    for (const doc of docs) {
      result.push(doc);
    }
    assertEquals(result, [{ id: 1 }, { id: 2 }]);
  });

  await t.step("supports array methods", () => {
    const docs = createMongoDocs([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const mapped = docs.map((d) => d.id);
    assertEquals(mapped, [1, 2, 3]);

    const filtered = docs.filter((d) => d.id > 1);
    assertEquals(filtered, [{ id: 2 }, { id: 3 }]);

    const found = docs.find((d) => d.id === 2);
    assertEquals(found, { id: 2 });
  });
});
