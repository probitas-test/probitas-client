/**
 * Tests for expect API.
 */

import { assertThrows } from "@std/assert";
import { ConnectRpcResponseImpl } from "./response.ts";
import { expectConnectRpcResponse } from "./expect.ts";

Deno.test("expect - ok() passes for code 0", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: {},
    trailers: {},
    duration: 100,
    responseMessage: {},
  });

  expectConnectRpcResponse(response).ok();
});

Deno.test("expect - ok() throws for non-zero code", () => {
  const response = new ConnectRpcResponseImpl({
    code: 5,
    message: "Not found",
    headers: {},
    trailers: {},
    duration: 100,
    responseMessage: null,
  });

  assertThrows(
    () => expectConnectRpcResponse(response).ok(),
    Error,
    "Expected ok response",
  );
});

Deno.test("expect - notOk() passes for non-zero code", () => {
  const response = new ConnectRpcResponseImpl({
    code: 5,
    message: "Not found",
    headers: {},
    trailers: {},
    duration: 100,
    responseMessage: null,
  });

  expectConnectRpcResponse(response).notOk();
});

Deno.test("expect - notOk() throws for code 0", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: {},
    trailers: {},
    duration: 100,
    responseMessage: {},
  });

  assertThrows(
    () => expectConnectRpcResponse(response).notOk(),
    Error,
    "Expected non-ok response",
  );
});

Deno.test("expect - dataContains() matches subset", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: {},
    trailers: {},
    duration: 100,
    responseMessage: { message: "hello", extra: "data" },
  });

  expectConnectRpcResponse(response).dataContains({ message: "hello" });
});

Deno.test("expect - dataContains() throws on mismatch", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: {},
    trailers: {},
    duration: 100,
    responseMessage: { message: "hello" },
  });

  assertThrows(
    () =>
      expectConnectRpcResponse(response).dataContains({ message: "goodbye" }),
    Error,
    "Expected data to contain",
  );
});

Deno.test("expect - dataContains() matches nested objects", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: {},
    trailers: {},
    duration: 100,
    responseMessage: {
      user: { name: "Alice", age: 30 },
      status: "active",
    },
  });

  expectConnectRpcResponse(response).dataContains({
    user: { name: "Alice" },
  });
});

Deno.test("expect - headers() matches value", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: { "content-type": "application/grpc" },
    trailers: {},
    duration: 100,
    responseMessage: {},
  });

  expectConnectRpcResponse(response).headers(
    "content-type",
    "application/grpc",
  );
});

Deno.test("expect - headers() matches regex", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: { "content-type": "application/grpc+proto" },
    trailers: {},
    duration: 100,
    responseMessage: {},
  });

  expectConnectRpcResponse(response).headers("content-type", /^application\//);
});

Deno.test("expect - headers() throws on mismatch", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: { "content-type": "text/plain" },
    trailers: {},
    duration: 100,
    responseMessage: {},
  });

  assertThrows(
    () =>
      expectConnectRpcResponse(response).headers(
        "content-type",
        "application/grpc",
      ),
    Error,
    'Expected header "content-type"',
  );
});

Deno.test("expect - headersExist() passes", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: { "x-custom": "value" },
    trailers: {},
    duration: 100,
    responseMessage: {},
  });

  expectConnectRpcResponse(response).headersExist("x-custom");
});

Deno.test("expect - headersExist() throws when missing", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: {},
    trailers: {},
    duration: 100,
    responseMessage: {},
  });

  assertThrows(
    () => expectConnectRpcResponse(response).headersExist("x-custom"),
    Error,
    'Expected header "x-custom" to exist',
  );
});

Deno.test("expect - durationLessThan() passes", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: {},
    trailers: {},
    duration: 50,
    responseMessage: {},
  });

  expectConnectRpcResponse(response).durationLessThan(100);
});

Deno.test("expect - durationLessThan() throws when exceeded", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: {},
    trailers: {},
    duration: 150,
    responseMessage: {},
  });

  assertThrows(
    () => expectConnectRpcResponse(response).durationLessThan(100),
    Error,
    "Expected duration <",
  );
});

Deno.test("expect - method chaining", () => {
  const response = new ConnectRpcResponseImpl({
    code: 0,
    message: "",
    headers: { "content-type": "application/grpc" },
    trailers: {},
    duration: 50,
    responseMessage: { status: "success", value: 42 },
  });

  expectConnectRpcResponse(response)
    .ok()
    .code(0)
    .headersExist("content-type")
    .dataContains({ status: "success" })
    .durationLessThan(1000);
});

Deno.test("expect - error response validation", () => {
  const response = new ConnectRpcResponseImpl({
    code: 16, // UNAUTHENTICATED
    message: "invalid token",
    headers: {},
    trailers: {},
    duration: 10,
    responseMessage: null,
  });

  expectConnectRpcResponse(response)
    .notOk()
    .code(16)
    .messageContains("invalid")
    .noContent();
});
