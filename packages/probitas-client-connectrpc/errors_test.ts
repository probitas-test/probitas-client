/**
 * Tests for error classes.
 */

import { assertEquals, assertInstanceOf } from "@std/assert";
import { ConnectRpcError, ConnectRpcNetworkError } from "./errors.ts";
import { ClientError } from "@probitas/client";

Deno.test("ConnectRpcError", async (t) => {
  await t.step("extends ClientError", () => {
    const error = new ConnectRpcError("test", 2, "test message");
    assertInstanceOf(error, ClientError);
    assertInstanceOf(error, Error);
  });

  await t.step("has correct properties", () => {
    const metadata = new Headers({ "key": "value" });
    const error = new ConnectRpcError("Test error", 13, "raw message", {
      metadata,
      details: [{ typeUrl: "type.googleapis.com/test", value: {} }],
    });

    assertEquals(error.name, "ConnectRpcError");
    assertEquals(error.kind, "connectrpc");
    assertEquals(error.statusCode, 13);
    assertEquals(error.statusMessage, "raw message");
    assertEquals(error.metadata?.get("key"), "value");
    assertEquals(error.details.length, 1);
  });

  await t.step("kind property for switch-based type guards", () => {
    const error = new ConnectRpcError("test", 2, "test");

    switch (error.kind) {
      case "connectrpc":
        assertEquals(error.kind, "connectrpc");
        break;
      default:
        throw new Error("Unexpected kind");
    }
  });

  await t.step("statusCode for gRPC error discrimination", () => {
    const unauthenticated = new ConnectRpcError("Unauthenticated", 16, "msg");
    const notFound = new ConnectRpcError("Not found", 5, "msg");
    const internal = new ConnectRpcError("Internal", 13, "msg");

    assertEquals(unauthenticated.statusCode, 16);
    assertEquals(notFound.statusCode, 5);
    assertEquals(internal.statusCode, 13);
  });

  await t.step("metadata defaults to null", () => {
    const error = new ConnectRpcError("test", 2, "test");
    assertEquals(error.metadata, null);
  });

  await t.step("details defaults to empty array", () => {
    const error = new ConnectRpcError("test", 2, "test");
    assertEquals(error.details, []);
  });
});

Deno.test("ConnectRpcNetworkError", async (t) => {
  await t.step("extends ClientError", () => {
    const error = new ConnectRpcNetworkError("Connection refused");
    assertInstanceOf(error, ClientError);
    assertInstanceOf(error, Error);
  });

  await t.step("has correct properties", () => {
    const error = new ConnectRpcNetworkError("Connection refused");
    assertEquals(error.name, "ConnectRpcNetworkError");
    assertEquals(error.kind, "connectrpc");
    assertEquals(error.message, "Connection refused");
  });

  await t.step("supports cause option", () => {
    const cause = new Error("Original error");
    const error = new ConnectRpcNetworkError("Connection refused", { cause });
    assertEquals(error.cause, cause);
  });
});
