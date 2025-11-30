import { assertEquals, assertInstanceOf } from "@std/assert";
import { ClientError } from "@probitas/client";
import {
  DenoKvAtomicCheckError,
  DenoKvError,
  DenoKvQuotaError,
} from "./errors.ts";

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

Deno.test("DenoKvAtomicCheckError", async (t) => {
  await t.step("extends DenoKvError", () => {
    const error = new DenoKvAtomicCheckError("check failed", [["key1"]]);
    assertInstanceOf(error, DenoKvError);
    assertInstanceOf(error, DenoKvAtomicCheckError);
  });

  await t.step("has correct name and kind", () => {
    const error = new DenoKvAtomicCheckError("check failed", [["key1"]]);
    assertEquals(error.name, "DenoKvAtomicCheckError");
    assertEquals(error.kind, "atomic_check");
    assertEquals(error.message, "check failed");
  });

  await t.step("stores failedChecks", () => {
    const failedKeys: Deno.KvKey[] = [["users", "1"], ["posts", "2"]];
    const error = new DenoKvAtomicCheckError("check failed", failedKeys);
    assertEquals(error.failedChecks, failedKeys);
  });

  await t.step("supports cause option", () => {
    const cause = new Error("concurrent modification");
    const error = new DenoKvAtomicCheckError("check failed", [["key"]], {
      cause,
    });
    assertEquals(error.cause, cause);
  });
});

Deno.test("DenoKvQuotaError", async (t) => {
  await t.step("extends DenoKvError", () => {
    const error = new DenoKvQuotaError("quota exceeded");
    assertInstanceOf(error, DenoKvError);
    assertInstanceOf(error, DenoKvQuotaError);
  });

  await t.step("has correct name and kind", () => {
    const error = new DenoKvQuotaError("quota exceeded");
    assertEquals(error.name, "DenoKvQuotaError");
    assertEquals(error.kind, "quota");
    assertEquals(error.message, "quota exceeded");
  });

  await t.step("supports cause option", () => {
    const cause = new Error("storage limit");
    const error = new DenoKvQuotaError("quota exceeded", { cause });
    assertEquals(error.cause, cause);
  });
});
