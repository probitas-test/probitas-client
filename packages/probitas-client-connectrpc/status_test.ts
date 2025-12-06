/**
 * Tests for status codes.
 */

import { assertEquals } from "@std/assert";
import {
  ConnectRpcStatus,
  type ConnectRpcStatusCode,
  getStatusName,
  isConnectRpcStatusCode,
} from "./status.ts";

Deno.test("ConnectRpcStatus constants", () => {
  assertEquals(ConnectRpcStatus.OK, 0);
  assertEquals(ConnectRpcStatus.CANCELLED, 1);
  assertEquals(ConnectRpcStatus.UNKNOWN, 2);
  assertEquals(ConnectRpcStatus.INVALID_ARGUMENT, 3);
  assertEquals(ConnectRpcStatus.DEADLINE_EXCEEDED, 4);
  assertEquals(ConnectRpcStatus.NOT_FOUND, 5);
  assertEquals(ConnectRpcStatus.ALREADY_EXISTS, 6);
  assertEquals(ConnectRpcStatus.PERMISSION_DENIED, 7);
  assertEquals(ConnectRpcStatus.RESOURCE_EXHAUSTED, 8);
  assertEquals(ConnectRpcStatus.FAILED_PRECONDITION, 9);
  assertEquals(ConnectRpcStatus.ABORTED, 10);
  assertEquals(ConnectRpcStatus.OUT_OF_RANGE, 11);
  assertEquals(ConnectRpcStatus.UNIMPLEMENTED, 12);
  assertEquals(ConnectRpcStatus.INTERNAL, 13);
  assertEquals(ConnectRpcStatus.UNAVAILABLE, 14);
  assertEquals(ConnectRpcStatus.DATA_LOSS, 15);
  assertEquals(ConnectRpcStatus.UNAUTHENTICATED, 16);
});

Deno.test("getStatusName returns correct names", () => {
  assertEquals(getStatusName(0), "OK");
  assertEquals(getStatusName(5), "NOT_FOUND");
  assertEquals(getStatusName(16), "UNAUTHENTICATED");
});

Deno.test("getStatusName handles all codes", () => {
  for (let code = 0; code <= 16; code++) {
    const name = getStatusName(code as ConnectRpcStatusCode);
    assertEquals(typeof name, "string");
    assertEquals(name.length > 0, true);
  }
});

Deno.test("isConnectRpcStatusCode validates codes", () => {
  assertEquals(isConnectRpcStatusCode(0), true);
  assertEquals(isConnectRpcStatusCode(16), true);
  assertEquals(isConnectRpcStatusCode(17), false);
  assertEquals(isConnectRpcStatusCode(-1), false);
  assertEquals(isConnectRpcStatusCode(1.5), false);
});
