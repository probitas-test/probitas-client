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
import {
  expectMongoCountResult,
  expectMongoDeleteResult,
  expectMongoFindOneResult,
  expectMongoFindResult,
  expectMongoInsertResult,
  expectMongoUpdateResult,
} from "./expect.ts";
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

Deno.test("expectMongoFindResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createFindResult([{ id: 1 }]);
    expectMongoFindResult(result).ok();
  });

  await t.step("ok() throws when ok is false", () => {
    const result = createFindResult([{ id: 1 }], false);
    assertThrows(
      () => expectMongoFindResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createFindResult([{ id: 1 }], false);
    expectMongoFindResult(result).notOk();
  });

  await t.step("notOk() throws when ok is true", () => {
    const result = createFindResult([{ id: 1 }]);
    assertThrows(
      () => expectMongoFindResult(result).notOk(),
      Error,
      "Expected not ok result",
    );
  });

  await t.step("noContent() passes when no documents", () => {
    const result = createFindResult<{ id: number }>([]);
    expectMongoFindResult(result).noContent();
  });

  await t.step("noContent() throws when documents exist", () => {
    const result = createFindResult([{ id: 1 }]);
    assertThrows(
      () => expectMongoFindResult(result).noContent(),
      Error,
      "Expected no documents",
    );
  });

  await t.step("hasContent() passes when documents exist", () => {
    const result = createFindResult([{ id: 1 }]);
    expectMongoFindResult(result).hasContent();
  });

  await t.step("hasContent() throws when no documents", () => {
    const result = createFindResult<{ id: number }>([]);
    assertThrows(
      () => expectMongoFindResult(result).hasContent(),
      Error,
      "Expected documents",
    );
  });

  await t.step("docs() passes when count matches", () => {
    const result = createFindResult([{ id: 1 }, { id: 2 }]);
    expectMongoFindResult(result).docs(2);
  });

  await t.step("docs() throws when count doesn't match", () => {
    const result = createFindResult([{ id: 1 }]);
    assertThrows(
      () => expectMongoFindResult(result).docs(2),
      Error,
      "Expected 2 documents",
    );
  });

  await t.step("docsAtLeast() passes when count is sufficient", () => {
    const result = createFindResult([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expectMongoFindResult(result).docsAtLeast(2);
  });

  await t.step("docsAtLeast() throws when count is insufficient", () => {
    const result = createFindResult([{ id: 1 }]);
    assertThrows(
      () => expectMongoFindResult(result).docsAtLeast(2),
      Error,
      "Expected at least 2 documents",
    );
  });

  await t.step("docsAtMost() passes when count is within limit", () => {
    const result = createFindResult([{ id: 1 }, { id: 2 }]);
    expectMongoFindResult(result).docsAtMost(3);
  });

  await t.step("docsAtMost() throws when count exceeds limit", () => {
    const result = createFindResult([{ id: 1 }, { id: 2 }, { id: 3 }]);
    assertThrows(
      () => expectMongoFindResult(result).docsAtMost(2),
      Error,
      "Expected at most 2 documents",
    );
  });

  await t.step("docContains() passes when subset matches", () => {
    const result = createFindResult([
      { id: 1, name: "Alice", age: 30 },
      { id: 2, name: "Bob", age: 25 },
    ]);
    expectMongoFindResult(result).docContains({ name: "Alice" });
  });

  await t.step("docContains() passes with nested object subset", () => {
    // deno-lint-ignore no-explicit-any
    const result = createFindResult<any>([
      { id: 1, user: { name: "Alice", profile: { city: "NYC" } } },
    ]);
    expectMongoFindResult(result).docContains({
      user: { name: "Alice" },
    });
  });

  await t.step("docContains() passes with deeply nested subset", () => {
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
    expectMongoFindResult(result).docContains({
      data: { user: { profile: { name: "John" } } },
    });
  });

  await t.step("docContains() passes with nested array elements", () => {
    // deno-lint-ignore no-explicit-any
    const result = createFindResult<any>([
      { id: 1, items: [1, 2, 3], nested: { values: [10, 20, 30] } },
    ]);
    expectMongoFindResult(result).docContains({ items: [1, 2, 3] });
  });

  await t.step("docContains() throws when nested object does not match", () => {
    // deno-lint-ignore no-explicit-any
    const result = createFindResult<any>([
      { id: 1, args: { name: "probitas", version: "1.0" } },
    ]);
    assertThrows(
      () =>
        expectMongoFindResult(result).docContains({
          args: { name: "different" },
        }),
      Error,
      "Expected at least one document to contain",
    );
  });

  await t.step("docContains() throws when nested property is missing", () => {
    // deno-lint-ignore no-explicit-any
    const result = createFindResult<any>([
      { id: 1, args: { version: "1.0" } },
    ]);
    assertThrows(
      () =>
        expectMongoFindResult(result).docContains({ args: { name: "test" } }),
      Error,
      "Expected at least one document to contain",
    );
  });

  await t.step(
    "docContains() passes with mixed nested and top-level properties",
    () => {
      // deno-lint-ignore no-explicit-any
      const result = createFindResult<any>([
        { id: 1, status: "ok", data: { message: "Hello", count: 42 } },
      ]);
      expectMongoFindResult(result).docContains({
        status: "ok",
        data: { message: "Hello" },
      });
    },
  );

  await t.step("docContains() throws when no document matches", () => {
    const result = createFindResult([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);
    assertThrows(
      () => expectMongoFindResult(result).docContains({ name: "Charlie" }),
      Error,
      "Expected at least one document to contain",
    );
  });

  await t.step("docMatch() calls matcher with docs", () => {
    const result = createFindResult([{ id: 1 }, { id: 2 }]);
    let called = false;
    expectMongoFindResult(result).docMatch((docs) => {
      assertEquals(docs.length, 2);
      assertEquals(docs.first(), { id: 1 });
      called = true;
    });
    assertEquals(called, true);
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    const result = createFindResult([{ id: 1 }], true, 50);
    expectMongoFindResult(result).durationLessThan(100);
  });

  await t.step("durationLessThan() throws when duration is greater", () => {
    const result = createFindResult([{ id: 1 }], true, 150);
    assertThrows(
      () => expectMongoFindResult(result).durationLessThan(100),
      Error,
      "Expected duration",
    );
  });

  await t.step("methods can be chained", () => {
    const result = createFindResult([{ id: 1, name: "Alice" }], true, 50);
    expectMongoFindResult(result)
      .ok()
      .hasContent()
      .docs(1)
      .docsAtLeast(1)
      .docContains({ name: "Alice" })
      .durationLessThan(100);
  });
});

Deno.test("expectMongoInsertResult", async (t) => {
  await t.step("ok() passes for insertOne result", () => {
    const result = createInsertOneResult("abc123");
    expectMongoInsertResult(result).ok();
  });

  await t.step("ok() passes for insertMany result", () => {
    const result = createInsertManyResult(["a", "b", "c"]);
    expectMongoInsertResult(result).ok();
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createInsertOneResult("abc123", false);
    expectMongoInsertResult(result).notOk();
  });

  await t.step("insertedCount() passes for insertOne", () => {
    const result = createInsertOneResult("abc123");
    expectMongoInsertResult(result).insertedCount(1);
  });

  await t.step("insertedCount() passes for insertMany", () => {
    const result = createInsertManyResult(["a", "b", "c"]);
    expectMongoInsertResult(result).insertedCount(3);
  });

  await t.step("insertedCount() throws when count doesn't match", () => {
    const result = createInsertManyResult(["a", "b"]);
    assertThrows(
      () => expectMongoInsertResult(result).insertedCount(3),
      Error,
      "Expected 3 inserted documents",
    );
  });

  await t.step("hasInsertedId() passes for insertOne", () => {
    const result = createInsertOneResult("abc123");
    expectMongoInsertResult(result).hasInsertedId();
  });

  await t.step("hasInsertedId() passes for insertMany", () => {
    const result = createInsertManyResult(["a", "b"]);
    expectMongoInsertResult(result).hasInsertedId();
  });

  await t.step("hasInsertedId() throws for empty insertOne", () => {
    const result = createInsertOneResult("");
    assertThrows(
      () => expectMongoInsertResult(result).hasInsertedId(),
      Error,
      "Expected insertedId",
    );
  });

  await t.step("hasInsertedId() throws for empty insertMany", () => {
    const result = createInsertManyResult([]);
    assertThrows(
      () => expectMongoInsertResult(result).hasInsertedId(),
      Error,
      "Expected insertedIds",
    );
  });

  await t.step("durationLessThan() works", () => {
    const result = createInsertOneResult("abc123", true, 50);
    expectMongoInsertResult(result).durationLessThan(100);
  });
});

Deno.test("expectMongoUpdateResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createUpdateResult(1, 1);
    expectMongoUpdateResult(result).ok();
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createUpdateResult(0, 0, false);
    expectMongoUpdateResult(result).notOk();
  });

  await t.step("matchedCount() passes when count matches", () => {
    const result = createUpdateResult(5, 3);
    expectMongoUpdateResult(result).matchedCount(5);
  });

  await t.step("matchedCount() throws when count doesn't match", () => {
    const result = createUpdateResult(2, 1);
    assertThrows(
      () => expectMongoUpdateResult(result).matchedCount(5),
      Error,
      "Expected 5 matched documents",
    );
  });

  await t.step("modifiedCount() passes when count matches", () => {
    const result = createUpdateResult(5, 3);
    expectMongoUpdateResult(result).modifiedCount(3);
  });

  await t.step("modifiedCount() throws when count doesn't match", () => {
    const result = createUpdateResult(5, 1);
    assertThrows(
      () => expectMongoUpdateResult(result).modifiedCount(5),
      Error,
      "Expected 5 modified documents",
    );
  });

  await t.step("wasUpserted() passes when upsertedId exists", () => {
    const result = createUpdateResult(0, 0, true, 10, "new123");
    expectMongoUpdateResult(result).wasUpserted();
  });

  await t.step("wasUpserted() throws when no upsert", () => {
    const result = createUpdateResult(1, 1);
    assertThrows(
      () => expectMongoUpdateResult(result).wasUpserted(),
      Error,
      "Expected upsert",
    );
  });

  await t.step("methods can be chained", () => {
    const result = createUpdateResult(3, 2, true, 50);
    expectMongoUpdateResult(result)
      .ok()
      .matchedCount(3)
      .modifiedCount(2)
      .durationLessThan(100);
  });
});

Deno.test("expectMongoDeleteResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createDeleteResult(5);
    expectMongoDeleteResult(result).ok();
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createDeleteResult(0, false);
    expectMongoDeleteResult(result).notOk();
  });

  await t.step("deletedCount() passes when count matches", () => {
    const result = createDeleteResult(5);
    expectMongoDeleteResult(result).deletedCount(5);
  });

  await t.step("deletedCount() throws when count doesn't match", () => {
    const result = createDeleteResult(2);
    assertThrows(
      () => expectMongoDeleteResult(result).deletedCount(5),
      Error,
      "Expected 5 deleted documents",
    );
  });

  await t.step("deletedAtLeast() passes when count is sufficient", () => {
    const result = createDeleteResult(5);
    expectMongoDeleteResult(result).deletedAtLeast(3);
  });

  await t.step("deletedAtLeast() throws when count is insufficient", () => {
    const result = createDeleteResult(2);
    assertThrows(
      () => expectMongoDeleteResult(result).deletedAtLeast(5),
      Error,
      "Expected at least 5 deleted documents",
    );
  });

  await t.step("methods can be chained", () => {
    const result = createDeleteResult(10, true, 50);
    expectMongoDeleteResult(result)
      .ok()
      .deletedCount(10)
      .deletedAtLeast(5)
      .durationLessThan(100);
  });
});

Deno.test("expectMongoFindOneResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createFindOneResult({ id: 1, name: "Alice" });
    expectMongoFindOneResult(result).ok();
  });

  await t.step("ok() throws when ok is false", () => {
    const result = createFindOneResult({ id: 1 }, false);
    assertThrows(
      () => expectMongoFindOneResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createFindOneResult({ id: 1 }, false);
    expectMongoFindOneResult(result).notOk();
  });

  await t.step("notOk() throws when ok is true", () => {
    const result = createFindOneResult({ id: 1 });
    assertThrows(
      () => expectMongoFindOneResult(result).notOk(),
      Error,
      "Expected not ok result",
    );
  });

  await t.step("found() passes when document exists", () => {
    const result = createFindOneResult({ id: 1, name: "Alice" });
    expectMongoFindOneResult(result).found();
  });

  await t.step("found() throws when document is undefined", () => {
    const result = createFindOneResult<{ id: number }>(undefined);
    assertThrows(
      () => expectMongoFindOneResult(result).found(),
      Error,
      "Expected document to be found",
    );
  });

  await t.step("notFound() passes when document is undefined", () => {
    const result = createFindOneResult<{ id: number }>(undefined);
    expectMongoFindOneResult(result).notFound();
  });

  await t.step("notFound() throws when document exists", () => {
    const result = createFindOneResult({ id: 1 });
    assertThrows(
      () => expectMongoFindOneResult(result).notFound(),
      Error,
      "Expected document not to be found",
    );
  });

  await t.step("docContains() passes when subset matches", () => {
    const result = createFindOneResult({ id: 1, name: "Alice", age: 30 });
    expectMongoFindOneResult(result).docContains({ name: "Alice" });
  });

  await t.step("docContains() passes with nested object", () => {
    // deno-lint-ignore no-explicit-any
    const result = createFindOneResult<any>({
      id: 1,
      user: { name: "Alice", profile: { city: "NYC" } },
    });
    expectMongoFindOneResult(result).docContains({
      user: { name: "Alice" },
    });
  });

  await t.step("docContains() throws when doc is undefined", () => {
    const result = createFindOneResult<{ name: string }>(undefined);
    assertThrows(
      () => expectMongoFindOneResult(result).docContains({ name: "Alice" }),
      Error,
      "doc is undefined",
    );
  });

  await t.step("docContains() throws when subset doesn't match", () => {
    const result = createFindOneResult({ id: 1, name: "Alice" });
    assertThrows(
      () => expectMongoFindOneResult(result).docContains({ name: "Bob" }),
      Error,
      "Expected document to contain",
    );
  });

  await t.step("docMatch() calls matcher with document", () => {
    const result = createFindOneResult({ id: 1, name: "Alice" });
    let called = false;
    expectMongoFindOneResult(result).docMatch((doc) => {
      assertEquals(doc.id, 1);
      assertEquals(doc.name, "Alice");
      called = true;
    });
    assertEquals(called, true);
  });

  await t.step("docMatch() throws when doc is undefined", () => {
    const result = createFindOneResult<{ id: number }>(undefined);
    assertThrows(
      () => expectMongoFindOneResult(result).docMatch(() => {}),
      Error,
      "doc is undefined",
    );
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    const result = createFindOneResult({ id: 1 }, true, 50);
    expectMongoFindOneResult(result).durationLessThan(100);
  });

  await t.step("durationLessThan() throws when duration is greater", () => {
    const result = createFindOneResult({ id: 1 }, true, 150);
    assertThrows(
      () => expectMongoFindOneResult(result).durationLessThan(100),
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
    expectMongoFindOneResult(result)
      .ok()
      .found()
      .docContains({ name: "Alice" })
      .durationLessThan(100);
  });
});

Deno.test("expectMongoCountResult", async (t) => {
  await t.step("ok() passes when ok is true", () => {
    const result = createCountResult(10);
    expectMongoCountResult(result).ok();
  });

  await t.step("ok() throws when ok is false", () => {
    const result = createCountResult(10, false);
    assertThrows(
      () => expectMongoCountResult(result).ok(),
      Error,
      "Expected ok result",
    );
  });

  await t.step("notOk() passes when ok is false", () => {
    const result = createCountResult(0, false);
    expectMongoCountResult(result).notOk();
  });

  await t.step("notOk() throws when ok is true", () => {
    const result = createCountResult(10);
    assertThrows(
      () => expectMongoCountResult(result).notOk(),
      Error,
      "Expected not ok result",
    );
  });

  await t.step("count() passes when count matches", () => {
    const result = createCountResult(42);
    expectMongoCountResult(result).count(42);
  });

  await t.step("count() throws when count doesn't match", () => {
    const result = createCountResult(42);
    assertThrows(
      () => expectMongoCountResult(result).count(10),
      Error,
      "Expected count 10, got 42",
    );
  });

  await t.step("countAtLeast() passes when count is sufficient", () => {
    const result = createCountResult(10);
    expectMongoCountResult(result).countAtLeast(5);
  });

  await t.step("countAtLeast() throws when count is insufficient", () => {
    const result = createCountResult(3);
    assertThrows(
      () => expectMongoCountResult(result).countAtLeast(5),
      Error,
      "Expected count at least 5, got 3",
    );
  });

  await t.step("countAtMost() passes when count is within limit", () => {
    const result = createCountResult(5);
    expectMongoCountResult(result).countAtMost(10);
  });

  await t.step("countAtMost() throws when count exceeds limit", () => {
    const result = createCountResult(15);
    assertThrows(
      () => expectMongoCountResult(result).countAtMost(10),
      Error,
      "Expected count at most 10, got 15",
    );
  });

  await t.step("countBetween() passes when count is within range", () => {
    const result = createCountResult(7);
    expectMongoCountResult(result).countBetween(5, 10);
  });

  await t.step("countBetween() throws when count is below range", () => {
    const result = createCountResult(2);
    assertThrows(
      () => expectMongoCountResult(result).countBetween(5, 10),
      Error,
      "Expected count between 5 and 10, got 2",
    );
  });

  await t.step("countBetween() throws when count exceeds range", () => {
    const result = createCountResult(15);
    assertThrows(
      () => expectMongoCountResult(result).countBetween(5, 10),
      Error,
      "Expected count between 5 and 10, got 15",
    );
  });

  await t.step("isEmpty() passes when count is 0", () => {
    const result = createCountResult(0);
    expectMongoCountResult(result).isEmpty();
  });

  await t.step("isEmpty() throws when count is not 0", () => {
    const result = createCountResult(5);
    assertThrows(
      () => expectMongoCountResult(result).isEmpty(),
      Error,
      "Expected count to be 0, got 5",
    );
  });

  await t.step("isNotEmpty() passes when count is not 0", () => {
    const result = createCountResult(5);
    expectMongoCountResult(result).isNotEmpty();
  });

  await t.step("isNotEmpty() throws when count is 0", () => {
    const result = createCountResult(0);
    assertThrows(
      () => expectMongoCountResult(result).isNotEmpty(),
      Error,
      "Expected count to be non-zero",
    );
  });

  await t.step("durationLessThan() passes when duration is less", () => {
    const result = createCountResult(10, true, 50);
    expectMongoCountResult(result).durationLessThan(100);
  });

  await t.step("durationLessThan() throws when duration is greater", () => {
    const result = createCountResult(10, true, 150);
    assertThrows(
      () => expectMongoCountResult(result).durationLessThan(100),
      Error,
      "Expected duration",
    );
  });

  await t.step("methods can be chained", () => {
    const result = createCountResult(25, true, 50);
    expectMongoCountResult(result)
      .ok()
      .count(25)
      .countAtLeast(10)
      .countAtMost(50)
      .countBetween(20, 30)
      .isNotEmpty()
      .durationLessThan(100);
  });
});
