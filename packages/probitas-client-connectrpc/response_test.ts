/**
 * Tests for ConnectRPC response.
 */

import { assertEquals } from "@std/assert";
import { ConnectRpcResponseImpl } from "./response.ts";

Deno.test("ConnectRpcResponse - ok status", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: {},
    trailers: {},
    duration: 100,
    responseMessage: { test: "data" },
  });

  assertEquals(response.ok, true);
  assertEquals(response.code, 0);
  assertEquals(response.message, "");
  assertEquals(response.duration, 100);
});

Deno.test("ConnectRpcResponse - error status", () => {
  const response = new ConnectRpcResponseImpl({
    code: 5,
    message: "Not found",
    headers: {},
    trailers: {},
    duration: 50,
    responseMessage: null,
  });

  assertEquals(response.ok, false);
  assertEquals(response.code, 5);
  assertEquals(response.message, "Not found");
});

Deno.test("ConnectRpcResponse - data() method", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: {},
    trailers: {},
    duration: 100,
    responseMessage: { test: "value" },
  });

  const data = response.data();
  assertEquals(data, { test: "value" });
});

Deno.test("ConnectRpcResponse - data() with type parameter", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: {},
    trailers: {},
    duration: 100,
    responseMessage: { message: "hello" },
  });

  const data = response.data<{ message: string }>();
  assertEquals(data, { message: "hello" });
});

Deno.test("ConnectRpcResponse - null response", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: {},
    trailers: {},
    duration: 100,
    responseMessage: null,
  });

  assertEquals(response.data(), null);
  assertEquals(response.raw(), null);
});

Deno.test("ConnectRpcResponse - headers and trailers", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: { "content-type": "application/json" },
    trailers: { "x-custom": "value" },
    duration: 100,
    responseMessage: {},
  });

  assertEquals(response.headers, { "content-type": "application/json" });
  assertEquals(response.trailers, { "x-custom": "value" });
});

Deno.test("ConnectRpcResponse - raw() returns original message", () => {
  const originalMessage = { nested: { value: 123 } };
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: {},
    trailers: {},
    duration: 100,
    responseMessage: originalMessage,
  });

  assertEquals(response.raw(), originalMessage);
});
