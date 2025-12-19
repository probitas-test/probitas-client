import { assertEquals, assertInstanceOf } from "@std/assert";
import { ClientError } from "@probitas/client";
import { DenoKvConnectionError, DenoKvError } from "./errors.ts";

Deno.test("DenoKvError", async (t) => {
  await t.step("extends ClientError", () => {
    const error = new DenoKvError("test error");
    assertInstanceOf(error, ClientError);
    assertInstanceOf(error, DenoKvError);
  });

  await t.step("has correct name and kind", () => {
    const error = new DenoKvError("test message");
    assertEquals(error.name, "DenoKvError");
    assertEquals(error.kind, "kv");
    assertEquals(error.message, "test message");
  });

  await t.step("allows custom kind", () => {
    const error = new DenoKvError("test message", "custom_kind");
    assertEquals(error.kind, "custom_kind");
  });

  await t.step("supports cause option", () => {
    const cause = new Error("original");
    const error = new DenoKvError("wrapped", "kv", { cause });
    assertEquals(error.cause, cause);
  });
});

Deno.test("DenoKvConnectionError", async (t) => {
  await t.step("extends DenoKvError", () => {
    const error = new DenoKvConnectionError("connection failed");
    assertInstanceOf(error, DenoKvError);
    assertInstanceOf(error, DenoKvConnectionError);
  });

  await t.step("has correct name and kind", () => {
    const error = new DenoKvConnectionError("connection failed");
    assertEquals(error.name, "DenoKvConnectionError");
    assertEquals(error.kind, "connection");
    assertEquals(error.message, "connection failed");
  });

  await t.step("supports cause option", () => {
    const cause = new Error("network timeout");
    const error = new DenoKvConnectionError("connection failed", { cause });
    assertEquals(error.cause, cause);
  });
});
