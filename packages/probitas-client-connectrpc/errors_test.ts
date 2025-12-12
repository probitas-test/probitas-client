/**
 * Tests for error classes.
 */

import { assertEquals, assertInstanceOf } from "@std/assert";
import {
  ConnectRpcError,
  ConnectRpcInternalError,
  ConnectRpcNotFoundError,
  ConnectRpcPermissionDeniedError,
  ConnectRpcResourceExhaustedError,
  ConnectRpcUnauthenticatedError,
  ConnectRpcUnavailableError,
} from "./errors.ts";
import { ClientError } from "@probitas/client";

Deno.test("ConnectRpcError extends ClientError", () => {
  const error = new ConnectRpcError("test", 2, "test message");
  assertInstanceOf(error, ClientError);
  assertInstanceOf(error, Error);
});

Deno.test("ConnectRpcError properties", () => {
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

Deno.test("ConnectRpcError kind property for switch-based type guards", () => {
  const error = new ConnectRpcError("test", 2, "test");

  // Kind should be usable in switch statements
  switch (error.kind) {
    case "connectrpc":
      assertEquals(error.kind, "connectrpc");
      break;
    default:
      throw new Error("Unexpected kind");
  }
});

Deno.test("ConnectRpcUnauthenticatedError", () => {
  const error = new ConnectRpcUnauthenticatedError("not authenticated");

  assertEquals(error.name, "ConnectRpcUnauthenticatedError");
  assertEquals(error.statusCode, 16);
  assertEquals(error.message.includes("Unauthenticated"), true);
});

Deno.test("ConnectRpcPermissionDeniedError", () => {
  const error = new ConnectRpcPermissionDeniedError("permission denied");

  assertEquals(error.name, "ConnectRpcPermissionDeniedError");
  assertEquals(error.statusCode, 7);
  assertEquals(error.message.includes("Permission denied"), true);
});

Deno.test("ConnectRpcNotFoundError", () => {
  const error = new ConnectRpcNotFoundError("not found");

  assertEquals(error.name, "ConnectRpcNotFoundError");
  assertEquals(error.statusCode, 5);
  assertEquals(error.message.includes("Not found"), true);
});

Deno.test("ConnectRpcResourceExhaustedError", () => {
  const error = new ConnectRpcResourceExhaustedError("exhausted");

  assertEquals(error.name, "ConnectRpcResourceExhaustedError");
  assertEquals(error.statusCode, 8);
  assertEquals(error.message.includes("Resource exhausted"), true);
});

Deno.test("ConnectRpcInternalError", () => {
  const error = new ConnectRpcInternalError("internal");

  assertEquals(error.name, "ConnectRpcInternalError");
  assertEquals(error.statusCode, 13);
  assertEquals(error.message.includes("Internal error"), true);
});

Deno.test("ConnectRpcUnavailableError", () => {
  const error = new ConnectRpcUnavailableError("unavailable");

  assertEquals(error.name, "ConnectRpcUnavailableError");
  assertEquals(error.statusCode, 14);
  assertEquals(error.message.includes("Unavailable"), true);
});
