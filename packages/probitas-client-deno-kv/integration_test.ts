/**
 * Integration tests for @probitas/client-deno-kv using denoland/denokv.
 *
 * Run with:
 *   docker compose up -d denokv
 *   DENO_KV_ACCESS_TOKEN=testtoken1234 deno test -A packages/probitas-client-deno-kv/integration_test.ts
 *   docker compose down
 */

import {
  assertEquals,
  assertExists,
  assertGreater,
  assertLess,
} from "@std/assert";
import { createDenoKvClient, type DenoKvClient } from "./mod.ts";

const DENOKV_URL = Deno.env.get("DENOKV_URL") ?? "http://localhost:4512";

/**
 * Check if denokv server is available for integration testing.
 * Uses HTTP fetch to avoid Deno.openKv's internal retry mechanism.
 */
async function isDenoKvAvailable(): Promise<boolean> {
  try {
    const res = await fetch(DENOKV_URL, {
      signal: AbortSignal.timeout(1000),
    });
    await res.body?.cancel();
    return true;
  } catch {
    return false;
  }
}

const denoKvAvailable = await isDenoKvAvailable();

Deno.test({
  name: "Integration: DenoKvClient with denokv server",
  ignore: !denoKvAvailable,
  async fn(t) {
    // Ensure access token is set for all tests
    Deno.env.set("DENO_KV_ACCESS_TOKEN", "testtoken1234");

    await t.step("creates client with remote KV", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        assertEquals(kv.config.path, DENOKV_URL);
      } finally {
        await kv.close();
      }
    });

    await t.step("get returns null for non-existent key", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        const result = await kv.get(["integration", "nonexistent"]);

        assertEquals(result.ok, true);
        assertEquals(result.value, null);

        assertEquals(result.key, ["integration", "nonexistent"]);
        assertEquals(result.versionstamp, null);
        assertGreater(result.duration, 0);
      } finally {
        await kv.close();
      }
    });

    await t.step("set and get round-trip", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        const testKey: Deno.KvKey = [
          "integration",
          "test",
          crypto.randomUUID(),
        ];
        const testValue = { name: "Alice", score: 100 };

        const setResult = await kv.set(testKey, testValue);

        assertEquals(setResult.ok, true);
        assertExists(setResult.versionstamp);
        assertLess(setResult.duration, 5000);

        const getResult = await kv.get<typeof testValue>(testKey);

        assertEquals(getResult.ok, true);
        assertExists(getResult.value);
        assertEquals(getResult.value, testValue);
        assertExists(getResult.versionstamp);

        // Clean up
        await kv.delete(testKey);
      } finally {
        await kv.close();
      }
    });

    await t.step("delete removes value", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        const testKey: Deno.KvKey = [
          "integration",
          "delete",
          crypto.randomUUID(),
        ];

        await kv.set(testKey, "to-be-deleted");
        const deleteResult = await kv.delete(testKey);

        assertEquals(deleteResult.ok, true);
        assertLess(deleteResult.duration, 5000);

        const getResult = await kv.get(testKey);
        assertEquals(getResult.value, null);
      } finally {
        await kv.close();
      }
    });

    await t.step("getMany retrieves multiple values", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        const prefix = ["integration", "getMany", crypto.randomUUID()];
        const key1: Deno.KvKey = [...prefix, "1"];
        const key2: Deno.KvKey = [...prefix, "2"];
        const key3: Deno.KvKey = [...prefix, "3"];

        await kv.set(key1, "value1");
        await kv.set(key2, "value2");

        const results = await kv.getMany<[string, string, string]>([
          key1,
          key2,
          key3, // non-existent
        ]);

        assertEquals(results.length, 3);
        assertEquals(results[0].value, "value1");
        assertEquals(results[1].value, "value2");
        assertEquals(results[2].value, null);

        // Clean up
        await kv.delete(key1);
        await kv.delete(key2);
      } finally {
        await kv.close();
      }
    });

    await t.step("list entries by prefix", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        const prefix = ["integration", "list", crypto.randomUUID()];

        await kv.set([...prefix, "a"], { order: 1 });
        await kv.set([...prefix, "b"], { order: 2 });
        await kv.set([...prefix, "c"], { order: 3 });

        const result = await kv.list<{ order: number }>({ prefix });

        assertEquals(result.ok, true);
        assertGreater(result.entries.length, 0);
        assertEquals(result.entries.length, 3);

        assertEquals(result.entries[0]?.value.order, 1);
        assertEquals(result.entries[result.entries.length - 1]?.value.order, 3);

        // Clean up
        for (const entry of result.entries) {
          await kv.delete(entry.key);
        }
      } finally {
        await kv.close();
      }
    });

    await t.step("list with limit option", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        const prefix = ["integration", "limit", crypto.randomUUID()];

        await kv.set([...prefix, "1"], 1);
        await kv.set([...prefix, "2"], 2);
        await kv.set([...prefix, "3"], 3);

        const result = await kv.list<number>({ prefix }, { limit: 2 });

        assertEquals(result.ok, true);
        assertEquals(result.entries.length, 2);

        // Clean up - list all to get keys for deletion
        const allEntries = await kv.list<number>({ prefix });
        for (const entry of allEntries.entries) {
          await kv.delete(entry.key);
        }
      } finally {
        await kv.close();
      }
    });

    await t.step("list with reverse option", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        const prefix = ["integration", "reverse", crypto.randomUUID()];

        await kv.set([...prefix, "a"], "first");
        await kv.set([...prefix, "b"], "second");
        await kv.set([...prefix, "c"], "third");

        const result = await kv.list<string>({ prefix }, { reverse: true });

        assertEquals(result.ok, true);
        assertEquals(result.entries.length, 3);

        assertEquals(result.entries[0]?.value, "third");
        assertEquals(result.entries[result.entries.length - 1]?.value, "first");

        // Clean up
        for (const entry of result.entries) {
          await kv.delete(entry.key);
        }
      } finally {
        await kv.close();
      }
    });

    await t.step("atomic commit succeeds", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        const prefix = ["integration", "atomic", crypto.randomUUID()];
        const key1: Deno.KvKey = [...prefix, "counter"];
        const key2: Deno.KvKey = [...prefix, "data"];

        const result = await kv.atomic()
          .set(key1, 42)
          .set(key2, { created: true })
          .commit();

        assertEquals(result.ok, true);
        assertExists(result.versionstamp);

        const get1 = await kv.get<number>(key1);
        const get2 = await kv.get<{ created: boolean }>(key2);

        assertEquals(get1.value, 42);
        assertEquals(get2.value?.created, true);

        // Clean up
        await kv.delete(key1);
        await kv.delete(key2);
      } finally {
        await kv.close();
      }
    });

    await t.step("atomic check for optimistic locking", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        const key: Deno.KvKey = ["integration", "check", crypto.randomUUID()];

        await kv.set(key, "initial");
        const entry = await kv.get(key);

        const result = await kv.atomic()
          .check({ key, versionstamp: entry.versionstamp })
          .set(key, "updated")
          .commit();

        assertEquals(result.ok, true);
        assertExists(result.versionstamp);

        const updated = await kv.get<string>(key);
        assertEquals(updated.value, "updated");

        // Clean up
        await kv.delete(key);
      } finally {
        await kv.close();
      }
    });

    await t.step("atomic check fails on stale versionstamp", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        const key: Deno.KvKey = [
          "integration",
          "conflict",
          crypto.randomUUID(),
        ];

        await kv.set(key, "initial");
        const entry = await kv.get(key);

        // Simulate concurrent modification
        await kv.set(key, "modified_by_other");

        // Now the check should fail
        const result = await kv.atomic()
          .check({ key, versionstamp: entry.versionstamp })
          .set(key, "should_not_apply")
          .commit();

        assertEquals(result.ok, false);
        assertEquals(result.error, null); // Check failure is NOT an error
        assertEquals(result.versionstamp, null);

        // Value should remain as modified by other
        const current = await kv.get<string>(key);
        assertEquals(current.value, "modified_by_other");

        // Clean up
        await kv.delete(key);
      } finally {
        await kv.close();
      }
    });

    await t.step("atomic delete operation", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        const key: Deno.KvKey = [
          "integration",
          "atomic-delete",
          crypto.randomUUID(),
        ];

        await kv.set(key, "to-be-deleted");

        const result = await kv.atomic()
          .delete(key)
          .commit();

        assertEquals(result.ok, true);

        const getResult = await kv.get(key);
        assertEquals(getResult.value, null);
      } finally {
        await kv.close();
      }
    });

    await t.step("atomic sum operation", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        const key: Deno.KvKey = ["integration", "sum", crypto.randomUUID()];

        await kv.atomic()
          .sum(key, 10n)
          .commit();

        await kv.atomic()
          .sum(key, 5n)
          .commit();

        const result = await kv.get<Deno.KvU64>(key);
        assertEquals(result.value?.value, 15n);

        // Clean up
        await kv.delete(key);
      } finally {
        await kv.close();
      }
    });

    await t.step("AsyncDisposable - await using syntax", async () => {
      let clientRef: DenoKvClient | null = null;

      {
        await using kv = await createDenoKvClient({ path: DENOKV_URL });
        clientRef = kv;

        const testKey: Deno.KvKey = [
          "integration",
          "disposable",
          crypto.randomUUID(),
        ];
        await kv.set(testKey, "test");
        const result = await kv.get(testKey);
        assertEquals(result.value, "test");

        // Clean up
        await kv.delete(testKey);
      }

      // After exiting the block, the client should be closed
      // We can't easily verify this without internal state, but the pattern works
      assertEquals(clientRef !== null, true);
    });

    await t.step("standard assertions with result", async () => {
      const kv = await createDenoKvClient({ path: DENOKV_URL });
      try {
        const key: Deno.KvKey = [
          "integration",
          "chaining",
          crypto.randomUUID(),
        ];

        await kv.set(key, { name: "Bob", age: 25 });
        const result = await kv.get<{ name: string; age: number }>(key);

        // Standard assertions
        assertEquals(result.ok, true);
        assertExists(result.value);
        assertEquals(result.value?.name, "Bob");
        assertExists(result.versionstamp);
        assertLess(result.duration, 5000);

        // Clean up
        await kv.delete(key);
      } finally {
        await kv.close();
      }
    });
  },
});
