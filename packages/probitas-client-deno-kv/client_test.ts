import { assert, assertEquals, assertFalse, assertGreater } from "@std/assert";
import { createDenoKvClient } from "./client.ts";

Deno.test("createDenoKvClient", async (t) => {
  await t.step("creates client with in-memory KV", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      assertEquals(kv.config.path, ":memory:");
    } finally {
      await kv.close();
    }
  });

  await t.step("creates client with default config", async () => {
    const kv = await createDenoKvClient();
    try {
      assertEquals(kv.config, {});
    } finally {
      await kv.close();
    }
  });
});

Deno.test("DenoKvClient.get", async (t) => {
  await t.step("returns null for non-existent key", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      const result = await kv.get(["nonexistent"]);
      assert(result.ok);
      assertEquals(result.key, ["nonexistent"]);
      assertEquals(result.value, null);
      assertEquals(result.versionstamp, null);
      assertGreater(result.duration, 0);
    } finally {
      await kv.close();
    }
  });

  await t.step("returns value for existing key", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      await kv.set(["test"], { name: "Alice" });
      const result = await kv.get<{ name: string }>(["test"]);
      assert(result.ok);
      assertEquals(result.value, { name: "Alice" });
      assertEquals(typeof result.versionstamp, "string");
    } finally {
      await kv.close();
    }
  });
});

Deno.test("DenoKvClient.getMany", async (t) => {
  await t.step("returns multiple results", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      await kv.set(["a"], 1);
      await kv.set(["b"], 2);

      const results = await kv.getMany<[number, number, number]>([
        ["a"],
        ["b"],
        ["c"],
      ]);

      assertEquals(results.length, 3);
      assertEquals(results[0].value, 1);
      assertEquals(results[1].value, 2);
      assertEquals(results[2].value, null);
    } finally {
      await kv.close();
    }
  });
});

Deno.test("DenoKvClient.set", async (t) => {
  await t.step("sets value and returns result", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      const result = await kv.set(["test"], { name: "Bob" });
      assert(result.ok);
      assertEquals(typeof result.versionstamp, "string");
      assertGreater(result.duration, 0);

      const getResult = await kv.get<{ name: string }>(["test"]);
      assertEquals(getResult.value, { name: "Bob" });
    } finally {
      await kv.close();
    }
  });

  await t.step("supports expireIn option", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      const result = await kv.set(["expiring"], "value", { expireIn: 1000 });
      assert(result.ok);
    } finally {
      await kv.close();
    }
  });
});

Deno.test("DenoKvClient.delete", async (t) => {
  await t.step("deletes existing key", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      await kv.set(["test"], "value");
      const result = await kv.delete(["test"]);
      assert(result.ok);
      assertGreater(result.duration, 0);

      const getResult = await kv.get(["test"]);
      assertEquals(getResult.value, null);
    } finally {
      await kv.close();
    }
  });

  await t.step("succeeds for non-existent key", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      const result = await kv.delete(["nonexistent"]);
      assert(result.ok);
    } finally {
      await kv.close();
    }
  });
});

Deno.test("DenoKvClient.list", async (t) => {
  await t.step("lists entries by prefix", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      await kv.set(["users", "1"], { name: "Alice" });
      await kv.set(["users", "2"], { name: "Bob" });
      await kv.set(["posts", "1"], { title: "Hello" });

      const result = await kv.list<{ name: string }>({ prefix: ["users"] });
      assert(result.ok);
      assertEquals(result.entries.length, 2);
      assertEquals(result.entries[0]?.value.name, "Alice");
      assertEquals(result.entries[1]?.value.name, "Bob");
    } finally {
      await kv.close();
    }
  });

  await t.step("supports limit option", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      await kv.set(["items", "1"], 1);
      await kv.set(["items", "2"], 2);
      await kv.set(["items", "3"], 3);

      const result = await kv.list<number>({ prefix: ["items"] }, { limit: 2 });
      assertEquals(result.entries.length, 2);
    } finally {
      await kv.close();
    }
  });

  await t.step("supports reverse option", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      await kv.set(["items", "a"], "a");
      await kv.set(["items", "b"], "b");
      await kv.set(["items", "c"], "c");

      const result = await kv.list<string>(
        { prefix: ["items"] },
        { reverse: true },
      );
      assertEquals(result.entries[0]?.value, "c");
      assertEquals(result.entries[result.entries.length - 1]?.value, "a");
    } finally {
      await kv.close();
    }
  });

  await t.step("returns empty entries for no matches", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      const result = await kv.list({ prefix: ["nonexistent"] });
      assert(result.ok);
      assertEquals(result.entries.length, 0);
    } finally {
      await kv.close();
    }
  });
});

Deno.test("DenoKvClient.atomic", async (t) => {
  await t.step("commits atomic operation", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      const result = await kv.atomic()
        .set(["counter"], 1)
        .commit();

      assert(result.ok);
      assertEquals(typeof result.versionstamp, "string");

      const getResult = await kv.get<number>(["counter"]);
      assertEquals(getResult.value, 1);
    } finally {
      await kv.close();
    }
  });

  await t.step("supports check for optimistic locking", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      await kv.set(["key"], "initial");
      const entry = await kv.get(["key"]);

      const result = await kv.atomic()
        .check({ key: ["key"], versionstamp: entry.versionstamp })
        .set(["key"], "updated")
        .commit();

      assert(result.ok);
    } finally {
      await kv.close();
    }
  });

  await t.step(
    "fails when check fails due to concurrent modification",
    async () => {
      const kv = await createDenoKvClient({ path: ":memory:" });
      try {
        await kv.set(["key"], "initial");
        const entry = await kv.get(["key"]);

        // Simulate concurrent modification
        await kv.set(["key"], "modified_by_other");

        // Now the check should fail because versionstamp is stale
        const result = await kv.atomic()
          .check({ key: ["key"], versionstamp: entry.versionstamp })
          .set(["key"], "updated")
          .commit();

        assertFalse(result.ok);
        assertEquals(result.error, null); // Check failure is NOT an error
        assertEquals(result.versionstamp, null);
      } finally {
        await kv.close();
      }
    },
  );

  await t.step("supports delete in atomic", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      await kv.set(["to-delete"], "value");

      const result = await kv.atomic()
        .delete(["to-delete"])
        .commit();

      assert(result.ok);

      const getResult = await kv.get(["to-delete"]);
      assertEquals(getResult.value, null);
    } finally {
      await kv.close();
    }
  });

  await t.step("supports sum operation", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    try {
      await kv.atomic()
        .sum(["counter"], 10n)
        .commit();

      await kv.atomic()
        .sum(["counter"], 5n)
        .commit();

      const result = await kv.get<Deno.KvU64>(["counter"]);
      assertEquals(result.value?.value, 15n);
    } finally {
      await kv.close();
    }
  });
});

Deno.test("DenoKvClient.close", async (t) => {
  await t.step("closes connection", async () => {
    const kv = await createDenoKvClient({ path: ":memory:" });
    await kv.close();
  });
});

Deno.test("DenoKvClient[Symbol.asyncDispose]", async (t) => {
  await t.step("supports using statement", async () => {
    await using _kv = await createDenoKvClient({ path: ":memory:" });
  });
});
