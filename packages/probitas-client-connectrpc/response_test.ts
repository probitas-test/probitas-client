/**
 * Tests for ConnectRPC response.
 */

import { assertEquals } from "@std/assert";
import { ConnectError } from "@connectrpc/connect";
import { ConnectRpcResponseImpl } from "./response.ts";

Deno.test("ConnectRpcResponse - ok status", () => {
  const response = new ConnectRpcResponseImpl({
    response: { test: "data" },
    headers: new Headers(),
    trailers: new Headers(),
    duration: 100,
  });

  assertEquals(response.ok, true);
  assertEquals(response.statusCode, 0);
  assertEquals(response.statusMessage, null);
  assertEquals(response.duration, 100);
});

Deno.test("ConnectRpcResponse - error status", () => {
  const error = new ConnectError("Not found", 5);
  const response = new ConnectRpcResponseImpl({
    error,
    headers: new Headers(),
    trailers: new Headers(),
    duration: 50,
  });

  assertEquals(response.ok, false);
  assertEquals(response.statusCode, 5);
  assertEquals(response.statusMessage, "Not found");
});

Deno.test("ConnectRpcResponse - data() method", () => {
  const response = new ConnectRpcResponseImpl({
    response: { test: "value" },
    headers: new Headers(),
    trailers: new Headers(),
    duration: 100,
  });

  const data = response.data();
  assertEquals(data, { test: "value" });
});

Deno.test("ConnectRpcResponse - data() with type parameter", () => {
  const response = new ConnectRpcResponseImpl({
    response: { message: "hello" },
    headers: new Headers(),
    trailers: new Headers(),
    duration: 100,
  });

  const data = response.data<{ message: string }>();
  assertEquals(data, { message: "hello" });
});

Deno.test("ConnectRpcResponse - undefined response", () => {
  const response = new ConnectRpcResponseImpl({
    headers: new Headers(),
    trailers: new Headers(),
    duration: 100,
  });

  assertEquals(response.data(), null);
  assertEquals(response.raw(), undefined);
});

Deno.test("ConnectRpcResponse - headers and trailers", () => {
  const headers = new Headers({ "content-type": "application/json" });
  const trailers = new Headers({ "x-custom": "value" });
  const response = new ConnectRpcResponseImpl({
    response: {},
    headers,
    trailers,
    duration: 100,
  });

  assertEquals(response.headers.get("content-type"), "application/json");
  assertEquals(response.trailers.get("x-custom"), "value");
});

Deno.test("ConnectRpcResponse - raw() returns original message", () => {
  const originalMessage = { nested: { value: 123 } };
  const response = new ConnectRpcResponseImpl({
    response: originalMessage,
    headers: new Headers(),
    trailers: new Headers(),
    duration: 100,
  });

  assertEquals(response.raw(), originalMessage);
});

Deno.test("ConnectRpcResponse - raw() returns error when error exists", () => {
  const error = new ConnectError("Something went wrong", 13);
  const response = new ConnectRpcResponseImpl({
    error,
    headers: new Headers(),
    trailers: new Headers(),
    duration: 100,
  });

  assertEquals(response.raw(), error);
});
