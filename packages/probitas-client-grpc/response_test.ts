import { assertEquals, assertThrows } from "@std/assert";
import { GrpcResponseImpl } from "./response.ts";
import { GrpcStatus } from "./status.ts";

Deno.test("GrpcResponse", async (t) => {
  await t.step("ok is true when code is 0", () => {
    const response = new GrpcResponseImpl({
      code: GrpcStatus.OK,
      message: "",
      body: null,
      trailers: {},
      duration: 100,
    });

    assertEquals(response.ok, true);
  });

  await t.step("ok is false when code is not 0", () => {
    const response = new GrpcResponseImpl({
      code: GrpcStatus.NOT_FOUND,
      message: "resource not found",
      body: null,
      trailers: {},
      duration: 100,
    });

    assertEquals(response.ok, false);
  });

  await t.step("exposes all properties", () => {
    const body = new TextEncoder().encode('{"id": 1}');
    const trailers = { "request-id": "abc123" };
    const response = new GrpcResponseImpl({
      code: GrpcStatus.OK,
      message: "success",
      body,
      trailers,
      duration: 50,
    });

    assertEquals(response.code, 0);
    assertEquals(response.message, "success");
    assertEquals(response.body, body);
    assertEquals(response.trailers, trailers);
    assertEquals(response.duration, 50);
  });

  await t.step("json() parses body as JSON", () => {
    const body = new TextEncoder().encode('{"name": "test", "value": 42}');
    const response = new GrpcResponseImpl({
      code: GrpcStatus.OK,
      message: "",
      body,
      trailers: {},
      duration: 10,
    });

    const data = response.json<{ name: string; value: number }>();
    assertEquals(data, { name: "test", value: 42 });
  });

  await t.step("json() returns null when body is null", () => {
    const response = new GrpcResponseImpl({
      code: GrpcStatus.OK,
      message: "",
      body: null,
      trailers: {},
      duration: 10,
    });

    assertEquals(response.json(), null);
  });

  await t.step("data() throws when no deserializer is set", () => {
    const body = new Uint8Array([0x08, 0x01]);
    const response = new GrpcResponseImpl({
      code: GrpcStatus.OK,
      message: "",
      body,
      trailers: {},
      duration: 10,
    });

    assertThrows(
      () => response.data(),
      Error,
      "Cannot deserialize gRPC response: no schema available",
    );
  });

  await t.step("data() returns null when body is null", () => {
    const response = new GrpcResponseImpl({
      code: GrpcStatus.OK,
      message: "",
      body: null,
      trailers: {},
      duration: 10,
    });

    assertEquals(response.data(), null);
  });

  await t.step("data() uses custom deserializer when provided", () => {
    const body = new Uint8Array([0x08, 0x01]);
    const response = new GrpcResponseImpl({
      code: GrpcStatus.OK,
      message: "",
      body,
      trailers: {},
      duration: 10,
      deserializer: (_bytes) => ({ decoded: true }),
    });

    assertEquals(response.data(), { decoded: true });
  });
});
