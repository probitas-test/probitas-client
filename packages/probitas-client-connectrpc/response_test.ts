/**
 * Tests for ConnectRPC response.
 */

import {
  assert,
  assertEquals,
  assertFalse,
  assertInstanceOf,
} from "@std/assert";
import { ConnectError } from "@connectrpc/connect";
import {
  ConnectRpcResponseErrorImpl,
  ConnectRpcResponseFailureImpl,
  ConnectRpcResponseSuccessImpl,
} from "./response.ts";
import { ConnectRpcNetworkError, fromConnectError } from "./errors.ts";

Deno.test("ConnectRpcResponseSuccessImpl", async (t) => {
  await t.step("creates success response with data", () => {
    const response = new ConnectRpcResponseSuccessImpl({
      response: { user: { id: 1, name: "John" } },
      headers: new Headers(),
      trailers: new Headers(),
      duration: 100,
    });

    assertEquals(response.kind, "connectrpc");
    assertEquals(response.processed, true);
    assert(response.ok);
    assertEquals(response.error, null);
    assertEquals(response.statusCode, 0);
    assertEquals(response.statusMessage, null);
    assertEquals(response.data(), { user: { id: 1, name: "John" } });
    assertEquals(response.duration, 100);
  });

  await t.step("includes headers and trailers", () => {
    const headers = new Headers({ "content-type": "application/grpc" });
    const trailers = new Headers({ "grpc-status": "0" });
    const response = new ConnectRpcResponseSuccessImpl({
      response: { test: true },
      headers,
      trailers,
      duration: 50,
    });

    assertInstanceOf(response.headers, Headers);
    assertInstanceOf(response.trailers, Headers);
    assertEquals(response.headers.get("content-type"), "application/grpc");
    assertEquals(response.trailers.get("grpc-status"), "0");
  });

  await t.step("raw() returns response data", () => {
    const rawResponse = { nested: { value: 123 } };
    const response = new ConnectRpcResponseSuccessImpl({
      response: rawResponse,
      headers: new Headers(),
      trailers: new Headers(),
      duration: 10,
    });

    assertEquals(response.raw(), rawResponse);
  });

  await t.step("data() method returns typed data", () => {
    interface User {
      id: number;
      name: string;
    }
    const response = new ConnectRpcResponseSuccessImpl({
      response: { user: { id: 1, name: "John" } },
      headers: new Headers(),
      trailers: new Headers(),
      duration: 100,
    });

    const result = response.data<{ user: User }>();
    assertEquals(result?.user.id, 1);
    assertEquals(result?.user.name, "John");
  });

  await t.step("handles null response", () => {
    const response = new ConnectRpcResponseSuccessImpl({
      response: null,
      headers: new Headers(),
      trailers: new Headers(),
      duration: 100,
    });

    assertEquals(response.data(), null);
    assertEquals(response.raw(), null);
  });
});

Deno.test("ConnectRpcResponseErrorImpl", async (t) => {
  await t.step("creates error response", () => {
    const connectError = new ConnectError("Not found", 5);
    const rpcError = fromConnectError(connectError);
    const response = new ConnectRpcResponseErrorImpl({
      error: connectError,
      rpcError,
      headers: new Headers(),
      trailers: new Headers(),
      duration: 50,
    });

    assertEquals(response.kind, "connectrpc");
    assertEquals(response.processed, true);
    assertFalse(response.ok);
    assertEquals(response.error, rpcError);
    assertEquals(response.statusCode, 5);
    assertEquals(response.statusMessage, "Not found");
    assertEquals(response.data(), null);
  });

  await t.step("raw() returns ConnectError", () => {
    const connectError = new ConnectError("Internal error", 13);
    const rpcError = fromConnectError(connectError);
    const response = new ConnectRpcResponseErrorImpl({
      error: connectError,
      rpcError,
      headers: new Headers(),
      trailers: new Headers(),
      duration: 10,
    });

    assertEquals(response.raw(), connectError);
  });

  await t.step("includes headers and trailers", () => {
    const headers = new Headers({ "x-request-id": "abc123" });
    const trailers = new Headers({ "grpc-status": "5" });
    const connectError = new ConnectError("Not found", 5);
    const rpcError = fromConnectError(connectError);
    const response = new ConnectRpcResponseErrorImpl({
      error: connectError,
      rpcError,
      headers,
      trailers,
      duration: 50,
    });

    assertInstanceOf(response.headers, Headers);
    assertInstanceOf(response.trailers, Headers);
    assertEquals(response.headers.get("x-request-id"), "abc123");
    assertEquals(response.trailers.get("grpc-status"), "5");
  });
});

Deno.test("ConnectRpcResponseFailureImpl", async (t) => {
  await t.step("creates failure response", () => {
    const error = new ConnectRpcNetworkError("Connection refused");
    const response = new ConnectRpcResponseFailureImpl({
      error,
      duration: 10,
    });

    assertEquals(response.kind, "connectrpc");
    assertEquals(response.processed, false);
    assertFalse(response.ok);
    assertEquals(response.error, error);
    assertEquals(response.duration, 10);
  });

  await t.step("statusCode is null", () => {
    const error = new ConnectRpcNetworkError("Network error");
    const response = new ConnectRpcResponseFailureImpl({
      error,
      duration: 5,
    });

    assertEquals(response.statusCode, null);
  });

  await t.step("statusMessage is null", () => {
    const error = new ConnectRpcNetworkError("Network error");
    const response = new ConnectRpcResponseFailureImpl({
      error,
      duration: 5,
    });

    assertEquals(response.statusMessage, null);
  });

  await t.step("headers is null", () => {
    const error = new ConnectRpcNetworkError("Network error");
    const response = new ConnectRpcResponseFailureImpl({
      error,
      duration: 5,
    });

    assertEquals(response.headers, null);
  });

  await t.step("trailers is null", () => {
    const error = new ConnectRpcNetworkError("Network error");
    const response = new ConnectRpcResponseFailureImpl({
      error,
      duration: 5,
    });

    assertEquals(response.trailers, null);
  });

  await t.step("data() returns null", () => {
    const error = new ConnectRpcNetworkError("Network error");
    const response = new ConnectRpcResponseFailureImpl({
      error,
      duration: 5,
    });

    assertEquals(response.data(), null);
  });

  await t.step("raw() returns null", () => {
    const error = new ConnectRpcNetworkError("Network error");
    const response = new ConnectRpcResponseFailureImpl({
      error,
      duration: 5,
    });

    assertEquals(response.raw(), null);
  });
});
