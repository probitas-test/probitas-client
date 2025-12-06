import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
import { AbortError } from "@probitas/client";
import { createRedisClient } from "./client.ts";
import {
  expectRedisArrayResult,
  expectRedisCommonResult,
  expectRedisCountResult,
  expectRedisGetResult,
  expectRedisHashResult,
  expectRedisSetResult,
} from "./expect.ts";

const REDIS_URL = Deno.env.get("REDIS_URL") ?? "redis://localhost:16379";

async function isRedisAvailable(): Promise<boolean> {
  try {
    const client = await createRedisClient({
      url: REDIS_URL,
      timeout: 1000,
    });
    await client.close();
    return true;
  } catch {
    return false;
  }
}

Deno.test({
  name: "Integration: Redis Client",
  ignore: !(await isRedisAvailable()),
  async fn(t) {
    const client = await createRedisClient({
      url: REDIS_URL,
    });

    try {
      await t.step("implements AsyncDisposable", () => {
        assertEquals(typeof client[Symbol.asyncDispose], "function");
      });

      await t.step("String commands", async (t) => {
        const testKey = `test:string:${Date.now()}`;

        await t.step("SET and GET", async () => {
          const setResult = await client.set(testKey, "hello");
          expectRedisSetResult(setResult).ok().value("OK");

          const getResult = await client.get(testKey);
          expectRedisGetResult(getResult).ok().value("hello");
        });

        await t.step("SET with expiration", async () => {
          const key = `${testKey}:ex`;
          await client.set(key, "expires", { ex: 60 });
          const result = await client.get(key);
          expectRedisGetResult(result).ok().value("expires");
        });

        await t.step("INCR and DECR", async () => {
          const key = `${testKey}:counter`;
          await client.set(key, "10");

          const incrResult = await client.incr(key);
          expectRedisCountResult(incrResult).ok().count(11);

          const decrResult = await client.decr(key);
          expectRedisCountResult(decrResult).ok().count(10);
        });

        await t.step("DEL", async () => {
          const delResult = await client.del(
            testKey,
            `${testKey}:ex`,
            `${testKey}:counter`,
          );
          expectRedisCountResult(delResult).ok().countAtLeast(1);
        });
      });

      await t.step("Hash commands", async (t) => {
        const testKey = `test:hash:${Date.now()}`;

        await t.step("HSET and HGET", async () => {
          const hsetResult = await client.hset(testKey, "field1", "value1");
          expectRedisCountResult(hsetResult).ok();

          const hgetResult = await client.hget(testKey, "field1");
          expectRedisGetResult(hgetResult).ok().value("value1");
        });

        await t.step("HGETALL", async () => {
          await client.hset(testKey, "field2", "value2");
          const result = await client.hgetall(testKey);
          expectRedisHashResult(result).ok();
          assertEquals(result.value.field1, "value1");
          assertEquals(result.value.field2, "value2");
        });

        await t.step("HDEL", async () => {
          const result = await client.hdel(testKey, "field1", "field2");
          expectRedisCountResult(result).ok().count(2);
        });

        await client.del(testKey);
      });

      await t.step("List commands", async (t) => {
        const testKey = `test:list:${Date.now()}`;

        await t.step("LPUSH and RPUSH", async () => {
          const lpushResult = await client.lpush(testKey, "a", "b");
          expectRedisCountResult(lpushResult).ok().count(2);

          const rpushResult = await client.rpush(testKey, "c");
          expectRedisCountResult(rpushResult).ok().count(3);
        });

        await t.step("LRANGE", async () => {
          const result = await client.lrange(testKey, 0, -1);
          expectRedisArrayResult(result).ok().length(3);
        });

        await t.step("LPOP and RPOP", async () => {
          const lpopResult = await client.lpop(testKey);
          expectRedisGetResult(lpopResult).ok();

          const rpopResult = await client.rpop(testKey);
          expectRedisGetResult(rpopResult).ok().value("c");
        });

        await t.step("LLEN", async () => {
          const result = await client.llen(testKey);
          expectRedisCountResult(result).ok().count(1);
        });

        await client.del(testKey);
      });

      await t.step("Set commands", async (t) => {
        const testKey = `test:set:${Date.now()}`;

        await t.step("SADD", async () => {
          const result = await client.sadd(testKey, "a", "b", "c");
          expectRedisCountResult(result).ok().count(3);
        });

        await t.step("SMEMBERS", async () => {
          const result = await client.smembers(testKey);
          expectRedisArrayResult(result).ok().length(3);
        });

        await t.step("SISMEMBER", async () => {
          const existsResult = await client.sismember(testKey, "a");
          expectRedisCommonResult(existsResult).ok().value(true);

          const notExistsResult = await client.sismember(testKey, "x");
          expectRedisCommonResult(notExistsResult).ok().value(false);
        });

        await t.step("SREM", async () => {
          const result = await client.srem(testKey, "a");
          expectRedisCountResult(result).ok().count(1);
        });

        await client.del(testKey);
      });

      await t.step("Sorted Set commands", async (t) => {
        const testKey = `test:zset:${Date.now()}`;

        await t.step("ZADD", async () => {
          const result = await client.zadd(
            testKey,
            { score: 1, member: "a" },
            { score: 2, member: "b" },
            { score: 3, member: "c" },
          );
          expectRedisCountResult(result).ok().count(3);
        });

        await t.step("ZRANGE", async () => {
          const result = await client.zrange(testKey, 0, -1);
          expectRedisArrayResult(result).ok().length(3);
        });

        await t.step("ZSCORE", async () => {
          const result = await client.zscore(testKey, "b");
          expectRedisCommonResult(result).ok().value(2);

          const notExistsResult = await client.zscore(testKey, "x");
          expectRedisCommonResult(notExistsResult).ok().value(null);
        });

        await client.del(testKey);
      });

      await t.step("Transaction", async (t) => {
        const testKey = `test:tx:${Date.now()}`;

        await t.step("MULTI/EXEC", async () => {
          const tx = client.multi();
          tx.set(testKey, "1");
          tx.incr(testKey);
          tx.get(testKey);

          const result = await tx.exec();
          expectRedisArrayResult(result).ok().length(3);
          assertEquals(result.value[0], "OK");
          assertEquals(result.value[1], 2);
          assertEquals(result.value[2], "2");
        });

        await client.del(testKey);
      });

      await t.step("Raw command", async () => {
        const result = await client.command("PING");
        expectRedisCommonResult(result).ok().value("PONG");
      });

      await t.step("CommonOptions support", async (t) => {
        const testKey = `test:options:${Date.now()}`;

        await t.step("GET with timeout option succeeds", async () => {
          await client.set(testKey, "value");
          const result = await client.get(testKey, { timeout: 5000 });
          expectRedisGetResult(result).ok().value("value");
        });

        await t.step("GET with signal option succeeds", async () => {
          const controller = new AbortController();
          const result = await client.get(testKey, {
            signal: controller.signal,
          });
          expectRedisGetResult(result).ok().value("value");
        });

        await t.step(
          "GET throws AbortError when signal is aborted",
          async () => {
            const controller = new AbortController();
            controller.abort();

            const error = await assertRejects(
              () => client.get(testKey, { signal: controller.signal }),
              AbortError,
            );
            assertInstanceOf(error, AbortError);
          },
        );

        await t.step("HGETALL with timeout option succeeds", async () => {
          const hashKey = `${testKey}:hash`;
          await client.hset(hashKey, "field", "value");
          const result = await client.hgetall(hashKey, { timeout: 5000 });
          expectRedisHashResult(result).ok();
          assertEquals(result.value.field, "value");
          await client.del(hashKey);
        });

        await t.step("LRANGE with timeout option succeeds", async () => {
          const listKey = `${testKey}:list`;
          await client.lpush(listKey, "a", "b");
          const result = await client.lrange(listKey, 0, -1, { timeout: 5000 });
          expectRedisArrayResult(result).ok().length(2);
          await client.del(listKey);
        });

        await t.step("SMEMBERS with timeout option succeeds", async () => {
          const setKey = `${testKey}:set`;
          await client.sadd(setKey, "a", "b");
          const result = await client.smembers(setKey, { timeout: 5000 });
          expectRedisArrayResult(result).ok().length(2);
          await client.del(setKey);
        });

        await t.step("ZRANGE with timeout option succeeds", async () => {
          const zsetKey = `${testKey}:zset`;
          await client.zadd(zsetKey, { score: 1, member: "a" });
          const result = await client.zrange(zsetKey, 0, -1, { timeout: 5000 });
          expectRedisArrayResult(result).ok().length(1);
          await client.del(zsetKey);
        });

        await client.del(testKey);
      });
    } finally {
      await client.close();
    }
  },
});
