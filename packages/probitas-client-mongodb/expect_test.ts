import { assertEquals, assertThrows } from "@std/assert";
import type {
  MongoCountResult,
  MongoDeleteResult,
  MongoFindOneResult,
  MongoFindResult,
  MongoInsertManyResult,
  MongoInsertOneResult,
  MongoUpdateResult,
} from "./types.ts";
import { expectMongoResult } from "./expect.ts";
import { createMongoDocs } from "./results.ts";

function createFindResult<T>(
  docs: T[],
  ok = true,
  duration = 10,
): MongoFindResult<T> {
  return { type: "mongo:find", ok, docs: createMongoDocs(docs), duration };
}

function createInsertOneResult(
  insertedId: string,
  ok = true,
  duration = 10,
): MongoInsertOneResult {
  return { type: "mongo:insert", ok, insertedId, duration };
}

function createInsertManyResult(
  insertedIds: string[],
  ok = true,
  duration = 10,
): MongoInsertManyResult {
  return {
    type: "mongo:insert",
    ok,
    insertedIds,
    insertedCount: insertedIds.length,
    duration,
  };
}

function createUpdateResult(
  matchedCount: number,
  modifiedCount: number,
  ok = true,
  duration = 10,
  upsertedId?: string,
): MongoUpdateResult {
  return {
    type: "mongo:update",
    ok,
    matchedCount,
    modifiedCount,
    upsertedId,
    duration,
  };
}

function createDeleteResult(
  deletedCount: number,
  ok = true,
  duration = 10,
): MongoDeleteResult {
  return { type: "mongo:delete", ok, deletedCount, duration };
}

function createFindOneResult<T>(
  doc: T | undefined,
  ok = true,
  duration = 10,
): MongoFindOneResult<T> {
  return { type: "mongo:find-one", ok, doc, duration };
}

function createCountResult(
  count: number,
  ok = true,
  duration = 10,
): MongoCountResult {
  return { type: "mongo:count", ok, count, duration };
}

Deno.test("expectMongoResult with MongoFindResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createFindResult([{ id: 1 }]);
    expectMongoResult(result).ok();
  });

  await t.step("ok() throws when ok is false", () => {
    const result = createFindResult([{ id: 1 }], false);
    assertThrows(
      () => expectMongoResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createFindResult([{ id: 1 }], false);
    expectMongoResult(result).notOk();
  });

  await t.step("notOk() throws when ok is true", () => {
    const result = createFindResult([{ id: 1 }]);
    assertThrows(
      () => expectMongoResult(result).notOk(),
      Error,
      "Expected not ok result",
    );
  });

  await t.step("noContent() passes when no documents", () => {
    const result = createFindResult<{ id: number }>([]);
    expectMongoResult(result).noContent();
  });

  await t.step("noContent() throws when documents exist", () => {
    const result = createFindResult([{ id: 1 }]);
    assertThrows(
      () => expectMongoResult(result).noContent(),
      Error,
      "Expected no documents",
    );
  });

  await t.step("hasContent() passes when documents exist", () => {
    const result = createFindResult([{ id: 1 }]);
    expectMongoResult(result).hasContent();
  });

  await t.step("hasContent() throws when no documents", () => {
    const result = createFindResult<{ id: number }>([]);
    assertThrows(
      () => expectMongoResult(result).hasContent(),
      Error,
      "Expected documents",
    );
  });

  await t.step("count() passes when count matches", () => {
    const result = createFindResult([{ id: 1 }, { id: 2 }]);
    expectMongoResult(result).count(2);
  });

  await t.step("count() throws when count doesn't match", () => {
    const result = createFindResult([{ id: 1 }]);
    assertThrows(
      () => expectMongoResult(result).count(2),
      Error,
      "Expected 2 documents",
    );
  });

  await t.step("countAtLeast() passes when count is sufficient", () => {
    const result = createFindResult([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expectMongoResult(result).countAtLeast(2);
  });

  await t.step("countAtLeast() throws when count is insufficient", () => {
    const result = createFindResult([{ id: 1 }]);
    assertThrows(
      () => expectMongoResult(result).countAtLeast(2),
      Error,
      "Expected at least 2 documents",
    );
  });

  await t.step("countAtMost() passes when count is within limit", () => {
    const result = createFindResult([{ id: 1 }, { id: 2 }]);
    expectMongoResult(result).countAtMost(3);
  });

  await t.step("countAtMost() throws when count exceeds limit", () => {
    const result = createFindResult([{ id: 1 }, { id: 2 }, { id: 3 }]);
    assertThrows(
      () => expectMongoResult(result).countAtMost(2),
      Error,
      "Expected at most 2 documents",
    );
  });

  await t.step("dataContains() passes when subset matches", () => {
    const result = createFindResult([
      { id: 1, name: "Alice", age: 30 },
      { id: 2, name: "Bob", age: 25 },
    ]);
    expectMongoResult(result).dataContains({ name: "Alice" });
  });

  await t.step("dataContains() passes with nested object subset", () => {
    // deno-lint-ignore no-explicit-any
    const result = createFindResult<any>([
      { id: 1, user: { name: "Alice", profile: { city: "NYC" } } },
    ]);
    expectMongoResult(result).dataContains({
      user: { name: "Alice" },
    });
  });

  await t.step("dataContains() passes with deeply nested subset", () => {
    // deno-lint-ignore no-explicit-any
    const result = createFindResult<any>([
      {
        id: 1,
        data: {
          user: {
            profile: { name: "John", age: 30 },
            settings: { theme: "dark" },
          },
        },
      },
    ]);
    expectMongoResult(result).dataContains({
      data: { user: { profile: { name: "John" } } },
    });
  });

  await t.step("dataContains() passes with nested array elements", () => {
    // deno-lint-ignore no-explicit-any
    const result = createFindResult<any>([
      { id: 1, items: [1, 2, 3], nested: { values: [10, 20, 30] } },
    ]);
    expectMongoResult(result).dataContains({ items: [1, 2, 3] });
  });

  await t.step(
    "dataContains() throws when nested object does not match",
    () => {
      // deno-lint-ignore no-explicit-any
      const result = createFindResult<any>([
        { id: 1, args: { name: "probitas", version: "1.0" } },
      ]);
      assertThrows(
        () =>
          expectMongoResult(result).dataContains({
            args: { name: "different" },
          }),
        Error,
        "Expected at least one document to contain",
      );
    },
  );

  await t.step("dataContains() throws when nested property is missing", () => {
    // deno-lint-ignore no-explicit-any
    const result = createFindResult<any>([
      { id: 1, args: { version: "1.0" } },
    ]);
    assertThrows(
      () => expectMongoResult(result).dataContains({ args: { name: "test" } }),
      Error,
      "Expected at least one document to contain",
    );
  });

  await t.step(
    "dataContains() passes with mixed nested and top-level properties",
    () => {
      // deno-lint-ignore no-explicit-any
      const result = createFindResult<any>([
        { id: 1, status: "ok", data: { message: "Hello", count: 42 } },
      ]);
      expectMongoResult(result).dataContains({
        status: "ok",
        data: { message: "Hello" },
      });
    },
  );

  await t.step("dataContains() throws when no document matches", () => {
    const result = createFindResult([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);
    assertThrows(
      () => expectMongoResult(result).dataContains({ name: "Charlie" }),
      Error,
      "Expected at least one document to contain",
    );
  });

  await t.step("dataMatch() calls matcher with docs", () => {
    const result = createFindResult([{ id: 1 }, { id: 2 }]);
    let called = false;
    expectMongoResult(result).dataMatch((docs) => {
      assertEquals(docs.length, 2);
      assertEquals(docs.first(), { id: 1 });
      called = true;
    });
    assertEquals(called, true);
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    const result = createFindResult([{ id: 1 }], true, 50);
    expectMongoResult(result).durationLessThan(100);
  });

  await t.step("durationLessThan() throws when duration is greater", () => {
    const result = createFindResult([{ id: 1 }], true, 150);
    assertThrows(
      () => expectMongoResult(result).durationLessThan(100),
      Error,
      "Expected duration",
    );
  });

  await t.step("methods can be chained", () => {
    const result = createFindResult([{ id: 1, name: "Alice" }], true, 50);
    expectMongoResult(result)
      .ok()
      .hasContent()
      .count(1)
      .countAtLeast(1)
      .dataContains({ name: "Alice" })
      .durationLessThan(100);
  });
});

Deno.test("expectMongoResult with MongoInsertResult", async (t) => {
  await t.step("ok() passes for insertOne result", () => {
    const result = createInsertOneResult("abc123");
    expectMongoResult(result).ok();
  });

  await t.step("ok() passes for insertMany result", () => {
    const result = createInsertManyResult(["a", "b", "c"]);
    expectMongoResult(result).ok();
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createInsertOneResult("abc123", false);
    expectMongoResult(result).notOk();
  });

  await t.step("insertedCount() passes for insertOne", () => {
    const result = createInsertOneResult("abc123");
    expectMongoResult(result).insertedCount(1);
  });

  await t.step("insertedCount() passes for insertMany", () => {
    const result = createInsertManyResult(["a", "b", "c"]);
    expectMongoResult(result).insertedCount(3);
  });

  await t.step("insertedCount() throws when count doesn't match", () => {
    const result = createInsertManyResult(["a", "b"]);
    assertThrows(
      () => expectMongoResult(result).insertedCount(3),
      Error,
      "Expected 3 inserted documents",
    );
  });

  await t.step("hasInsertedId() passes for insertOne", () => {
    const result = createInsertOneResult("abc123");
    expectMongoResult(result).hasInsertedId();
  });

  await t.step("hasInsertedId() passes for insertMany", () => {
    const result = createInsertManyResult(["a", "b"]);
    expectMongoResult(result).hasInsertedId();
  });

  await t.step("hasInsertedId() throws for empty insertOne", () => {
    const result = createInsertOneResult("");
    assertThrows(
      () => expectMongoResult(result).hasInsertedId(),
      Error,
      "Expected insertedId",
    );
  });

  await t.step("hasInsertedId() throws for empty insertMany", () => {
    const result = createInsertManyResult([]);
    assertThrows(
      () => expectMongoResult(result).hasInsertedId(),
      Error,
      "Expected insertedIds",
    );
  });

  await t.step("durationLessThan() works", () => {
    const result = createInsertOneResult("abc123", true, 50);
    expectMongoResult(result).durationLessThan(100);
  });
});

Deno.test("expectMongoResult with MongoUpdateResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createUpdateResult(1, 1);
    expectMongoResult(result).ok();
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createUpdateResult(0, 0, false);
    expectMongoResult(result).notOk();
  });

  await t.step("matchedCount() passes when count matches", () => {
    const result = createUpdateResult(5, 3);
    expectMongoResult(result).matchedCount(5);
  });

  await t.step("matchedCount() throws when count doesn't match", () => {
    const result = createUpdateResult(2, 1);
    assertThrows(
      () => expectMongoResult(result).matchedCount(5),
      Error,
      "Expected 5 matched documents",
    );
  });

  await t.step("modifiedCount() passes when count matches", () => {
    const result = createUpdateResult(5, 3);
    expectMongoResult(result).modifiedCount(3);
  });

  await t.step("modifiedCount() throws when count doesn't match", () => {
    const result = createUpdateResult(5, 1);
    assertThrows(
      () => expectMongoResult(result).modifiedCount(5),
      Error,
      "Expected 5 modified documents",
    );
  });

  await t.step("hasUpsertedId() passes when upsertedId exists", () => {
    const result = createUpdateResult(0, 0, true, 10, "new123");
    expectMongoResult(result).hasUpsertedId();
  });

  await t.step("hasUpsertedId() throws when no upsert", () => {
    const result = createUpdateResult(1, 1);
    assertThrows(
      () => expectMongoResult(result).hasUpsertedId(),
      Error,
      "Expected upsertedId",
    );
  });

  await t.step("methods can be chained", () => {
    const result = createUpdateResult(3, 2, true, 50);
    expectMongoResult(result)
      .ok()
      .matchedCount(3)
      .modifiedCount(2)
      .durationLessThan(100);
  });
});

Deno.test("expectMongoResult with MongoDeleteResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createDeleteResult(5);
    expectMongoResult(result).ok();
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createDeleteResult(0, false);
    expectMongoResult(result).notOk();
  });

  await t.step("deletedCount() passes when count matches", () => {
    const result = createDeleteResult(5);
    expectMongoResult(result).deletedCount(5);
  });

  await t.step("deletedCount() throws when count doesn't match", () => {
    const result = createDeleteResult(2);
    assertThrows(
      () => expectMongoResult(result).deletedCount(5),
      Error,
      "Expected 5 deleted documents",
    );
  });

  await t.step("deletedAtLeast() passes when count is sufficient", () => {
    const result = createDeleteResult(5);
    expectMongoResult(result).deletedAtLeast(3);
  });

  await t.step("deletedAtLeast() throws when count is insufficient", () => {
    const result = createDeleteResult(2);
    assertThrows(
      () => expectMongoResult(result).deletedAtLeast(5),
      Error,
      "Expected at least 5 deleted documents",
    );
  });

  await t.step("methods can be chained", () => {
    const result = createDeleteResult(10, true, 50);
    expectMongoResult(result)
      .ok()
      .deletedCount(10)
      .deletedAtLeast(5)
      .durationLessThan(100);
  });
});

Deno.test("expectMongoResult with MongoFindOneResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createFindOneResult({ id: 1, name: "Alice" });
    expectMongoResult(result).ok();
  });

  await t.step("ok() throws when ok is false", () => {
    const result = createFindOneResult({ id: 1 }, false);
    assertThrows(
      () => expectMongoResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createFindOneResult({ id: 1 }, false);
    expectMongoResult(result).notOk();
  });

  await t.step("notOk() throws when ok is true", () => {
    const result = createFindOneResult({ id: 1 });
    assertThrows(
      () => expectMongoResult(result).notOk(),
      Error,
      "Expected not ok result",
    );
  });

  await t.step("hasContent() passes when document exists", () => {
    const result = createFindOneResult({ id: 1, name: "Alice" });
    expectMongoResult(result).hasContent();
  });

  await t.step("hasContent() throws when document is undefined", () => {
    const result = createFindOneResult<{ id: number }>(undefined);
    assertThrows(
      () => expectMongoResult(result).hasContent(),
      Error,
      "Expected document to be found",
    );
  });

  await t.step("noContent() passes when document is undefined", () => {
    const result = createFindOneResult<{ id: number }>(undefined);
    expectMongoResult(result).noContent();
  });

  await t.step("noContent() throws when document exists", () => {
    const result = createFindOneResult({ id: 1 });
    assertThrows(
      () => expectMongoResult(result).noContent(),
      Error,
      "Expected document not to be found",
    );
  });

  await t.step("dataContains() passes when subset matches", () => {
    const result = createFindOneResult({ id: 1, name: "Alice", age: 30 });
    expectMongoResult(result).dataContains({ name: "Alice" });
  });

  await t.step("dataContains() passes with nested object", () => {
    // deno-lint-ignore no-explicit-any
    const result = createFindOneResult<any>({
      id: 1,
      user: { name: "Alice", profile: { city: "NYC" } },
    });
    expectMongoResult(result).dataContains({
      user: { name: "Alice" },
    });
  });

  await t.step("dataContains() throws when doc is undefined", () => {
    const result = createFindOneResult<{ name: string }>(undefined);
    assertThrows(
      () => expectMongoResult(result).dataContains({ name: "Alice" }),
      Error,
      "doc is undefined",
    );
  });

  await t.step("dataContains() throws when subset doesn't match", () => {
    const result = createFindOneResult({ id: 1, name: "Alice" });
    assertThrows(
      () => expectMongoResult(result).dataContains({ name: "Bob" }),
      Error,
      "Expected document to contain",
    );
  });

  await t.step("dataMatch() calls matcher with document", () => {
    const result = createFindOneResult({ id: 1, name: "Alice" });
    let called = false;
    expectMongoResult(result).dataMatch((doc) => {
      assertEquals(doc.id, 1);
      assertEquals(doc.name, "Alice");
      called = true;
    });
    assertEquals(called, true);
  });

  await t.step("dataMatch() throws when doc is undefined", () => {
    const result = createFindOneResult<{ id: number }>(undefined);
    assertThrows(
      () => expectMongoResult(result).dataMatch(() => {}),
      Error,
      "doc is undefined",
    );
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    const result = createFindOneResult({ id: 1 }, true, 50);
    expectMongoResult(result).durationLessThan(100);
  });

  await t.step("durationLessThan() throws when duration is greater", () => {
    const result = createFindOneResult({ id: 1 }, true, 150);
    assertThrows(
      () => expectMongoResult(result).durationLessThan(100),
      Error,
      "Expected duration",
    );
  });

  await t.step("methods can be chained", () => {
    const result = createFindOneResult(
      { id: 1, name: "Alice", age: 30 },
      true,
      50,
    );
    expectMongoResult(result)
      .ok()
      .hasContent()
      .dataContains({ name: "Alice" })
      .durationLessThan(100);
  });
});

Deno.test("expectMongoResult with MongoCountResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createCountResult(10);
    expectMongoResult(result).ok();
  });

  await t.step("ok() throws when ok is false", () => {
    const result = createCountResult(10, false);
    assertThrows(
      () => expectMongoResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createCountResult(0, false);
    expectMongoResult(result).notOk();
  });

  await t.step("notOk() throws when ok is true", () => {
    const result = createCountResult(10);
    assertThrows(
      () => expectMongoResult(result).notOk(),
      Error,
      "Expected not ok result",
    );
  });

  await t.step("count() passes when count matches", () => {
    const result = createCountResult(42);
    expectMongoResult(result).count(42);
  });

  await t.step("count() throws when count doesn't match", () => {
    const result = createCountResult(42);
    assertThrows(
      () => expectMongoResult(result).count(10),
      Error,
      "Expected count 10, got 42",
    );
  });

  await t.step("countAtLeast() passes when count is sufficient", () => {
    const result = createCountResult(10);
    expectMongoResult(result).countAtLeast(5);
  });

  await t.step("countAtLeast() throws when count is insufficient", () => {
    const result = createCountResult(3);
    assertThrows(
      () => expectMongoResult(result).countAtLeast(5),
      Error,
      "Expected count at least 5, got 3",
    );
  });

  await t.step("countAtMost() passes when count is within limit", () => {
    const result = createCountResult(5);
    expectMongoResult(result).countAtMost(10);
  });

  await t.step("countAtMost() throws when count exceeds limit", () => {
    const result = createCountResult(15);
    assertThrows(
      () => expectMongoResult(result).countAtMost(10),
      Error,
      "Expected count at most 10, got 15",
    );
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    const result = createCountResult(10, true, 50);
    expectMongoResult(result).durationLessThan(100);
  });

  await t.step("durationLessThan() throws when duration is greater", () => {
    const result = createCountResult(10, true, 150);
    assertThrows(
      () => expectMongoResult(result).durationLessThan(100),
      Error,
      "Expected duration",
    );
  });

  await t.step("methods can be chained", () => {
    const result = createCountResult(25, true, 50);
    expectMongoResult(result)
      .ok()
      .count(25)
      .countAtLeast(10)
      .countAtMost(50)
      .durationLessThan(100);
  });
});

Deno.test("expectMongoResult throws for unknown type", () => {
  const unknownResult = { type: "mongo:unknown", ok: true, duration: 10 };
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => expectMongoResult(unknownResult as any),
    Error,
    "Unknown MongoDB result type: mongo:unknown",
  );
});
