import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
import type {
  RedisArrayResult,
  RedisClient,
  RedisClientConfig,
  RedisCommonResult,
  RedisCountResult,
  RedisGetResult,
  RedisHashResult,
  RedisSetResult,
} from "./types.ts";
import { RedisCommandError, RedisConnectionError } from "./errors.ts";

/**
 * Mock Redis client for unit testing.
 * This allows testing the client logic without requiring an actual Redis server.
 */
function createMockRedisClient(
  overrides: Partial<RedisClient> = {},
): RedisClient {
  // Helper functions for creating specific result types
  const createGetResult = (
    value: string | null,
  ): Promise<RedisGetResult> =>
    Promise.resolve({ kind: "redis:get", ok: true, value, duration: 1 });

  const createSetResult = (): Promise<RedisSetResult> =>
    Promise.resolve({ kind: "redis:set", ok: true, value: "OK", duration: 1 });

  const createCountResult = (value: number): Promise<RedisCountResult> =>
    Promise.resolve({ kind: "redis:count", ok: true, value, duration: 1 });

  const createHashResult = (
    value: Record<string, string>,
  ): Promise<RedisHashResult> =>
    Promise.resolve({ kind: "redis:hash", ok: true, value, duration: 1 });

  const createArrayResult = <T>(
    value: readonly T[],
  ): Promise<RedisArrayResult<T>> =>
    Promise.resolve({ kind: "redis:array", ok: true, value, duration: 1 });

  const createCommonResult = <T>(
    value: T,
  ): Promise<RedisCommonResult<T>> =>
    Promise.resolve({ kind: "redis:common", ok: true, value, duration: 1 });

  const client: RedisClient = {
    config: {} as RedisClientConfig,

    // Strings
    get: () => createGetResult("mock-value"),
    set: () => createSetResult(),
    del: () => createCountResult(1),
    incr: () => createCountResult(1),
    decr: () => createCountResult(0),

    // Hashes
    hget: () => createGetResult("value"),
    hset: () => createCountResult(1),
    hgetall: () => createHashResult({ field: "value" }),
    hdel: () => createCountResult(1),

    // Lists
    lpush: () => createCountResult(1),
    rpush: () => createCountResult(1),
    lpop: () => createGetResult("item"),
    rpop: () => createGetResult("item"),
    lrange: () => createArrayResult(["a", "b"]),
    llen: () => createCountResult(2),

    // Sets
    sadd: () => createCountResult(1),
    srem: () => createCountResult(1),
    smembers: () => createArrayResult(["a", "b"]),
    sismember: () => createCommonResult(true),

    // Sorted Sets
    zadd: () => createCountResult(1),
    zrange: () => createArrayResult(["a", "b"]),
    zscore: () => createCommonResult<number | null>(1.5),

    // Pub/Sub
    publish: () => createCountResult(1),
    subscribe: async function* () {
      yield { channel: "test", message: "hello" };
    },

    // Transaction
    multi: () => ({
      get: function () {
        return this;
      },
      set: function () {
        return this;
      },
      del: function () {
        return this;
      },
      incr: function () {
        return this;
      },
      decr: function () {
        return this;
      },
      hget: function () {
        return this;
      },
      hset: function () {
        return this;
      },
      hgetall: function () {
        return this;
      },
      hdel: function () {
        return this;
      },
      lpush: function () {
        return this;
      },
      rpush: function () {
        return this;
      },
      lpop: function () {
        return this;
      },
      rpop: function () {
        return this;
      },
      lrange: function () {
        return this;
      },
      llen: function () {
        return this;
      },
      sadd: function () {
        return this;
      },
      srem: function () {
        return this;
      },
      smembers: function () {
        return this;
      },
      sismember: function () {
        return this;
      },
      zadd: function () {
        return this;
      },
      zrange: function () {
        return this;
      },
      zscore: function () {
        return this;
      },
      exec: () =>
        Promise.resolve({
          kind: "redis:array",
          ok: true,
          value: ["OK", 1, "value"],
          duration: 1,
        }),
      discard: () => {},
    }),

    // Raw command
    command: <T = unknown>() => createCommonResult("PONG" as T),

    close: () => Promise.resolve(),
    [Symbol.asyncDispose]: () => Promise.resolve(),

    ...overrides,
  };

  return client;
}

Deno.test("RedisConnectionError", async (t) => {
  await t.step("is thrown when connection fails", () => {
    const error = new RedisConnectionError("Failed to connect to Redis");
    assertInstanceOf(error, RedisConnectionError);
    assertEquals(error.name, "RedisConnectionError");
    assertEquals(error.kind, "connection");
  });

  await t.step("includes cause when provided", () => {
    const cause = new Error("Network error");
    const error = new RedisConnectionError("Failed to connect", { cause });
    assertEquals(error.cause, cause);
  });

  await t.step("includes code when provided", () => {
    const error = new RedisConnectionError("Connection refused", {
      code: "ECONNREFUSED",
    });
    assertEquals(error.code, "ECONNREFUSED");
  });
});

Deno.test("RedisCommandError", async (t) => {
  await t.step("includes command information", () => {
    const error = new RedisCommandError("Command failed", {
      command: "GET key",
    });
    assertInstanceOf(error, RedisCommandError);
    assertEquals(error.name, "RedisCommandError");
    assertEquals(error.kind, "command");
    assertEquals(error.command, "GET key");
  });

  await t.step("is thrown when client is closed", () => {
    const error = new RedisCommandError("Client is closed", { command: "" });
    assertInstanceOf(error, RedisCommandError);
    assertEquals(error.message, "Client is closed");
  });

  await t.step("includes cause when provided", () => {
    const cause = new Error("Redis error");
    const error = new RedisCommandError("Command failed", {
      command: "SET key value",
      cause,
    });
    assertEquals(error.cause, cause);
  });
});

Deno.test({
  name: "createRedisClient",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn(t) {
    await t.step("throws RedisConnectionError for invalid host", async () => {
      const { createRedisClient } = await import("./client.ts");

      await assertRejects(
        async () => {
          await createRedisClient({
            url: { host: "invalid-host-that-does-not-exist", port: 6379 },
            timeout: 100,
          });
        },
        RedisConnectionError,
        "Failed to connect",
      );
    });
  },
});

Deno.test("RedisClient interface", async (t) => {
  await t.step("implements AsyncDisposable", () => {
    const client = createMockRedisClient();
    assertEquals(typeof client[Symbol.asyncDispose], "function");
  });

  await t.step("has config property", () => {
    const config: RedisClientConfig = {
      url: { host: "localhost", port: 6379 },
    };
    const client = createMockRedisClient({ config });
    assertEquals(client.config, config);
  });
});

Deno.test("RedisClient.get", async (t) => {
  await t.step("returns RedisGetResult with value", async () => {
    const client = createMockRedisClient({
      get: () =>
        Promise.resolve({
          kind: "redis:get",
          ok: true,
          value: "test-value",
          duration: 5,
        }),
    });

    const result = await client.get("key");

    assertEquals(result.ok, true);
    assertEquals(result.value, "test-value");
    assertEquals(typeof result.duration, "number");
  });

  await t.step("returns null for non-existent key", async () => {
    const client = createMockRedisClient({
      get: () =>
        Promise.resolve({
          kind: "redis:get",
          ok: true,
          value: null,
          duration: 1,
        }),
    });

    const result = await client.get("non-existent");

    assertEquals(result.ok, true);
    assertEquals(result.value, null);
  });

  await t.step("supports timeout option", async () => {
    const client = createMockRedisClient({
      get: (_key, options) => {
        assertEquals(options?.timeout, 5000);
        return Promise.resolve({
          kind: "redis:get",
          ok: true,
          value: "value",
          duration: 1,
        });
      },
    });

    await client.get("key", { timeout: 5000 });
  });

  await t.step("supports signal option", async () => {
    const controller = new AbortController();
    const client = createMockRedisClient({
      get: (_key, options) => {
        assertEquals(options?.signal, controller.signal);
        return Promise.resolve({
          kind: "redis:get",
          ok: true,
          value: "value",
          duration: 1,
        });
      },
    });

    await client.get("key", { signal: controller.signal });
  });
});

Deno.test("RedisClient.set", async (t) => {
  await t.step("returns RedisSetResult with OK", async () => {
    const client = createMockRedisClient({
      set: () =>
        Promise.resolve({
          kind: "redis:set",
          ok: true,
          value: "OK",
          duration: 2,
        }),
    });

    const result = await client.set("key", "value");

    assertEquals(result.ok, true);
    assertEquals(result.value, "OK");
  });

  await t.step("supports ex option for seconds expiration", async () => {
    const client = createMockRedisClient({
      set: (_key, _value, options) => {
        assertEquals(options?.ex, 3600);
        return Promise.resolve({
          kind: "redis:set",
          ok: true,
          value: "OK",
          duration: 1,
        });
      },
    });

    await client.set("key", "value", { ex: 3600 });
  });

  await t.step("supports px option for milliseconds expiration", async () => {
    const client = createMockRedisClient({
      set: (_key, _value, options) => {
        assertEquals(options?.px, 5000);
        return Promise.resolve({
          kind: "redis:set",
          ok: true,
          value: "OK",
          duration: 1,
        });
      },
    });

    await client.set("key", "value", { px: 5000 });
  });

  await t.step("supports nx option (set only if not exists)", async () => {
    const client = createMockRedisClient({
      set: (_key, _value, options) => {
        assertEquals(options?.nx, true);
        return Promise.resolve({
          kind: "redis:set",
          ok: true,
          value: "OK",
          duration: 1,
        });
      },
    });

    await client.set("key", "value", { nx: true });
  });

  await t.step("supports xx option (set only if exists)", async () => {
    const client = createMockRedisClient({
      set: (_key, _value, options) => {
        assertEquals(options?.xx, true);
        return Promise.resolve({
          kind: "redis:set",
          ok: true,
          value: "OK",
          duration: 1,
        });
      },
    });

    await client.set("key", "value", { xx: true });
  });
});

Deno.test("RedisClient.del", async (t) => {
  await t.step("returns count of deleted keys", async () => {
    const client = createMockRedisClient({
      del: () =>
        Promise.resolve({
          kind: "redis:count",
          ok: true,
          value: 3,
          duration: 1,
        }),
    });

    const result = await client.del("key1", "key2", "key3");

    assertEquals(result.ok, true);
    assertEquals(result.value, 3);
  });

  await t.step("returns 0 for non-existent keys", async () => {
    const client = createMockRedisClient({
      del: () =>
        Promise.resolve({
          kind: "redis:count",
          ok: true,
          value: 0,
          duration: 1,
        }),
    });

    const result = await client.del("non-existent");

    assertEquals(result.value, 0);
  });
});

Deno.test("RedisClient.incr and decr", async (t) => {
  await t.step("incr increments value by 1", async () => {
    const client = createMockRedisClient({
      incr: () =>
        Promise.resolve({
          kind: "redis:count",
          ok: true,
          value: 11,
          duration: 1,
        }),
    });

    const result = await client.incr("counter");

    assertEquals(result.value, 11);
  });

  await t.step("decr decrements value by 1", async () => {
    const client = createMockRedisClient({
      decr: () =>
        Promise.resolve({
          kind: "redis:count",
          ok: true,
          value: 9,
          duration: 1,
        }),
    });

    const result = await client.decr("counter");

    assertEquals(result.value, 9);
  });
});

Deno.test("RedisClient hash commands", async (t) => {
  await t.step("hget returns field value", async () => {
    const client = createMockRedisClient({
      hget: () =>
        Promise.resolve({
          kind: "redis:get",
          ok: true,
          value: "field-value",
          duration: 1,
        }),
    });

    const result = await client.hget("hash", "field");

    assertEquals(result.value, "field-value");
  });

  await t.step("hget returns null for non-existent field", async () => {
    const client = createMockRedisClient({
      hget: () =>
        Promise.resolve({
          kind: "redis:get",
          ok: true,
          value: null,
          duration: 1,
        }),
    });

    const result = await client.hget("hash", "non-existent");

    assertEquals(result.value, null);
  });

  await t.step("hset returns count of new fields", async () => {
    const client = createMockRedisClient({
      hset: () =>
        Promise.resolve({
          kind: "redis:count",
          ok: true,
          value: 1,
          duration: 1,
        }),
    });

    const result = await client.hset("hash", "field", "value");

    assertEquals(result.value, 1);
  });

  await t.step("hgetall returns all fields as object", async () => {
    const client = createMockRedisClient({
      hgetall: () =>
        Promise.resolve({
          kind: "redis:hash",
          ok: true,
          value: { field1: "value1", field2: "value2" },
          duration: 1,
        }),
    });

    const result = await client.hgetall("hash");

    assertEquals(result.value, { field1: "value1", field2: "value2" });
  });

  await t.step("hdel returns count of deleted fields", async () => {
    const client = createMockRedisClient({
      hdel: () =>
        Promise.resolve({
          kind: "redis:count",
          ok: true,
          value: 2,
          duration: 1,
        }),
    });

    const result = await client.hdel("hash", "field1", "field2");

    assertEquals(result.value, 2);
  });
});

Deno.test("RedisClient list commands", async (t) => {
  await t.step("lpush returns new list length", async () => {
    const client = createMockRedisClient({
      lpush: () =>
        Promise.resolve({
          kind: "redis:count",
          ok: true,
          value: 3,
          duration: 1,
        }),
    });

    const result = await client.lpush("list", "a", "b", "c");

    assertEquals(result.value, 3);
  });

  await t.step("rpush returns new list length", async () => {
    const client = createMockRedisClient({
      rpush: () =>
        Promise.resolve({
          kind: "redis:count",
          ok: true,
          value: 5,
          duration: 1,
        }),
    });

    const result = await client.rpush("list", "d", "e");

    assertEquals(result.value, 5);
  });

  await t.step("lpop returns and removes first element", async () => {
    const client = createMockRedisClient({
      lpop: () =>
        Promise.resolve({
          kind: "redis:get",
          ok: true,
          value: "first",
          duration: 1,
        }),
    });

    const result = await client.lpop("list");

    assertEquals(result.value, "first");
  });

  await t.step("rpop returns and removes last element", async () => {
    const client = createMockRedisClient({
      rpop: () =>
        Promise.resolve({
          kind: "redis:get",
          ok: true,
          value: "last",
          duration: 1,
        }),
    });

    const result = await client.rpop("list");

    assertEquals(result.value, "last");
  });

  await t.step("lrange returns elements in range", async () => {
    const client = createMockRedisClient({
      lrange: () =>
        Promise.resolve({
          kind: "redis:array",
          ok: true,
          value: ["a", "b", "c"],
          duration: 1,
        }),
    });

    const result = await client.lrange("list", 0, -1);

    assertEquals(result.value, ["a", "b", "c"]);
  });

  await t.step("llen returns list length", async () => {
    const client = createMockRedisClient({
      llen: () =>
        Promise.resolve({
          kind: "redis:count",
          ok: true,
          value: 5,
          duration: 1,
        }),
    });

    const result = await client.llen("list");

    assertEquals(result.value, 5);
  });
});

Deno.test("RedisClient set commands", async (t) => {
  await t.step("sadd returns count of added members", async () => {
    const client = createMockRedisClient({
      sadd: () =>
        Promise.resolve({
          kind: "redis:count",
          ok: true,
          value: 3,
          duration: 1,
        }),
    });

    const result = await client.sadd("set", "a", "b", "c");

    assertEquals(result.value, 3);
  });

  await t.step("srem returns count of removed members", async () => {
    const client = createMockRedisClient({
      srem: () =>
        Promise.resolve({
          kind: "redis:count",
          ok: true,
          value: 2,
          duration: 1,
        }),
    });

    const result = await client.srem("set", "a", "b");

    assertEquals(result.value, 2);
  });

  await t.step("smembers returns all members", async () => {
    const client = createMockRedisClient({
      smembers: () =>
        Promise.resolve({
          kind: "redis:array",
          ok: true,
          value: ["a", "b", "c"],
          duration: 1,
        }),
    });

    const result = await client.smembers("set");

    assertEquals(result.value, ["a", "b", "c"]);
  });

  await t.step("sismember returns true for existing member", async () => {
    const client = createMockRedisClient({
      sismember: () =>
        Promise.resolve({
          kind: "redis:common",
          ok: true,
          value: true,
          duration: 1,
        }),
    });

    const result = await client.sismember("set", "a");

    assertEquals(result.value, true);
  });

  await t.step("sismember returns false for non-existing member", async () => {
    const client = createMockRedisClient({
      sismember: () =>
        Promise.resolve({
          kind: "redis:common",
          ok: true,
          value: false,
          duration: 1,
        }),
    });

    const result = await client.sismember("set", "x");

    assertEquals(result.value, false);
  });
});

Deno.test("RedisClient sorted set commands", async (t) => {
  await t.step("zadd returns count of added members", async () => {
    const client = createMockRedisClient({
      zadd: () =>
        Promise.resolve({
          kind: "redis:count",
          ok: true,
          value: 2,
          duration: 1,
        }),
    });

    const result = await client.zadd(
      "zset",
      { score: 1, member: "a" },
      { score: 2, member: "b" },
    );

    assertEquals(result.value, 2);
  });

  await t.step("zrange returns members in range", async () => {
    const client = createMockRedisClient({
      zrange: () =>
        Promise.resolve({
          kind: "redis:array",
          ok: true,
          value: ["a", "b", "c"],
          duration: 1,
        }),
    });

    const result = await client.zrange("zset", 0, -1);

    assertEquals(result.value, ["a", "b", "c"]);
  });

  await t.step("zscore returns score of member", async () => {
    const client = createMockRedisClient({
      zscore: () =>
        Promise.resolve({
          kind: "redis:common",
          ok: true,
          value: 2.5,
          duration: 1,
        }),
    });

    const result = await client.zscore("zset", "b");

    assertEquals(result.value, 2.5);
  });

  await t.step("zscore returns null for non-existing member", async () => {
    const client = createMockRedisClient({
      zscore: () =>
        Promise.resolve({
          kind: "redis:common",
          ok: true,
          value: null,
          duration: 1,
        }),
    });

    const result = await client.zscore("zset", "x");

    assertEquals(result.value, null);
  });
});

Deno.test("RedisClient pub/sub", async (t) => {
  await t.step("publish returns count of receivers", async () => {
    const client = createMockRedisClient({
      publish: () =>
        Promise.resolve({
          kind: "redis:count",
          ok: true,
          value: 3,
          duration: 1,
        }),
    });

    const result = await client.publish("channel", "message");

    assertEquals(result.value, 3);
  });

  await t.step("subscribe yields messages", async () => {
    const messages = [
      { channel: "ch1", message: "msg1" },
      { channel: "ch1", message: "msg2" },
    ];
    let index = 0;

    const client = createMockRedisClient({
      subscribe: async function* () {
        for (const msg of messages) {
          yield msg;
        }
      },
    });

    for await (const msg of client.subscribe("ch1")) {
      assertEquals(msg, messages[index]);
      index++;
      if (index >= messages.length) break;
    }

    assertEquals(index, 2);
  });
});

Deno.test("RedisClient transaction", async (t) => {
  await t.step("multi returns transaction object", () => {
    const client = createMockRedisClient();
    const tx = client.multi();

    assertEquals(typeof tx.get, "function");
    assertEquals(typeof tx.set, "function");
    assertEquals(typeof tx.exec, "function");
    assertEquals(typeof tx.discard, "function");
  });

  await t.step("transaction commands return this for chaining", () => {
    const client = createMockRedisClient();
    const tx = client.multi();

    const result = tx.set("key", "value").incr("counter").get("key");

    assertEquals(result, tx);
  });

  await t.step("exec returns array of results", async () => {
    const client = createMockRedisClient({
      multi: () => ({
        get: function () {
          return this;
        },
        set: function () {
          return this;
        },
        del: function () {
          return this;
        },
        incr: function () {
          return this;
        },
        decr: function () {
          return this;
        },
        hget: function () {
          return this;
        },
        hset: function () {
          return this;
        },
        hgetall: function () {
          return this;
        },
        hdel: function () {
          return this;
        },
        lpush: function () {
          return this;
        },
        rpush: function () {
          return this;
        },
        lpop: function () {
          return this;
        },
        rpop: function () {
          return this;
        },
        lrange: function () {
          return this;
        },
        llen: function () {
          return this;
        },
        sadd: function () {
          return this;
        },
        srem: function () {
          return this;
        },
        smembers: function () {
          return this;
        },
        sismember: function () {
          return this;
        },
        zadd: function () {
          return this;
        },
        zrange: function () {
          return this;
        },
        zscore: function () {
          return this;
        },
        exec: () =>
          Promise.resolve({
            kind: "redis:array",
            ok: true,
            value: ["OK", 2, "value"],
            duration: 5,
          }),
        discard: () => {},
      }),
    });

    const tx = client.multi();
    tx.set("key", "1");
    tx.incr("key");
    tx.get("key");
    const result = await tx.exec();

    assertEquals(result.ok, true);
    assertEquals(result.value, ["OK", 2, "value"]);
  });
});

Deno.test("RedisClient.command (raw)", async (t) => {
  await t.step("executes raw command", async () => {
    const client = createMockRedisClient({
      command: <T = unknown>() =>
        Promise.resolve({
          kind: "redis:common",
          ok: true,
          value: "PONG" as T,
          duration: 1,
        }),
    });

    const result = await client.command("PING");

    assertEquals(result.value, "PONG");
  });

  await t.step("supports command with arguments", async () => {
    const client = createMockRedisClient({
      command: <T = unknown>() =>
        Promise.resolve({
          kind: "redis:common",
          ok: true,
          value: "test-value" as T,
          duration: 1,
        }),
    });

    const result = await client.command("GET", "key");

    assertEquals(result.value, "test-value");
  });
});

Deno.test("RedisClient.close", async (t) => {
  await t.step("closes the client connection", async () => {
    let closed = false;
    const client = createMockRedisClient({
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    });

    await client.close();

    assertEquals(closed, true);
  });

  await t.step("asyncDispose calls close", async () => {
    let closed = false;
    const closeFn = () => {
      closed = true;
      return Promise.resolve();
    };
    const client = createMockRedisClient({
      close: closeFn,
      [Symbol.asyncDispose]: closeFn,
    });

    await client[Symbol.asyncDispose]();

    assertEquals(closed, true);
  });
});

Deno.test("RedisClient duration tracking", async (t) => {
  await t.step("all results include duration", async () => {
    const client = createMockRedisClient();

    const getResult = await client.get("key");
    assertEquals(typeof getResult.duration, "number");
    assertEquals(getResult.duration >= 0, true);

    const setResult = await client.set("key", "value");
    assertEquals(typeof setResult.duration, "number");

    const delResult = await client.del("key");
    assertEquals(typeof delResult.duration, "number");
  });
});

Deno.test("RedisResult ok property", async (t) => {
  await t.step("ok is true for successful operations", async () => {
    const client = createMockRedisClient();

    const result = await client.get("key");

    assertEquals(result.ok, true);
  });
});
