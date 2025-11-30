import { assertEquals, assertInstanceOf } from "@std/assert";
import { ClientError } from "@probitas/client";
import {
  GrpcError,
  GrpcInternalError,
  GrpcNotFoundError,
  GrpcPermissionDeniedError,
  GrpcResourceExhaustedError,
  GrpcUnauthenticatedError,
  GrpcUnavailableError,
} from "./errors.ts";

Deno.test("GrpcError", async (t) => {
  await t.step("extends ClientError", () => {
    const error = new GrpcError("test error", 2, "UNKNOWN");
    assertInstanceOf(error, ClientError);
    assertInstanceOf(error, Error);
  });

  await t.step("has correct properties", () => {
    const metadata = { "request-id": "123" };
    const error = new GrpcError("test error", 5, "NOT_FOUND", { metadata });

    assertEquals(error.name, "GrpcError");
    assertEquals(error.message, "test error");
    assertEquals(error.code, 5);
    assertEquals(error.grpcMessage, "NOT_FOUND");
    assertEquals(error.metadata, metadata);
    assertEquals(error.kind, "unknown");
    assertEquals(error.details, []);
  });

  await t.step("has details property", () => {
    const details = [
      {
        typeUrl: "type.googleapis.com/google.rpc.BadRequest",
        value: {
          fieldViolations: [{ field: "email", description: "invalid" }],
        },
      },
    ];
    const error = new GrpcError("test error", 3, "INVALID_ARGUMENT", {
      details,
    });

    assertEquals(error.details, details);
  });

  await t.step("supports error chaining", () => {
    const cause = new Error("original error");
    const error = new GrpcError("wrapped", 2, "UNKNOWN", { cause });

    assertEquals(error.cause, cause);
  });
});

Deno.test("GrpcUnauthenticatedError", async (t) => {
  await t.step("extends GrpcError with code 16", () => {
    const error = new GrpcUnauthenticatedError("not authenticated");

    assertInstanceOf(error, GrpcError);
    assertEquals(error.name, "GrpcUnauthenticatedError");
    assertEquals(error.code, 16);
    assertEquals(error.grpcMessage, "not authenticated");
  });
});

Deno.test("GrpcPermissionDeniedError", async (t) => {
  await t.step("extends GrpcError with code 7", () => {
    const error = new GrpcPermissionDeniedError("permission denied");

    assertInstanceOf(error, GrpcError);
    assertEquals(error.name, "GrpcPermissionDeniedError");
    assertEquals(error.code, 7);
    assertEquals(error.grpcMessage, "permission denied");
  });
});

Deno.test("GrpcNotFoundError", async (t) => {
  await t.step("extends GrpcError with code 5", () => {
    const error = new GrpcNotFoundError("resource not found");

    assertInstanceOf(error, GrpcError);
    assertEquals(error.name, "GrpcNotFoundError");
    assertEquals(error.code, 5);
    assertEquals(error.grpcMessage, "resource not found");
  });
});

Deno.test("GrpcResourceExhaustedError", async (t) => {
  await t.step("extends GrpcError with code 8", () => {
    const error = new GrpcResourceExhaustedError("rate limit exceeded");

    assertInstanceOf(error, GrpcError);
    assertEquals(error.name, "GrpcResourceExhaustedError");
    assertEquals(error.code, 8);
    assertEquals(error.grpcMessage, "rate limit exceeded");
  });
});

Deno.test("GrpcInternalError", async (t) => {
  await t.step("extends GrpcError with code 13", () => {
    const error = new GrpcInternalError("internal server error");

    assertInstanceOf(error, GrpcError);
    assertEquals(error.name, "GrpcInternalError");
    assertEquals(error.code, 13);
    assertEquals(error.grpcMessage, "internal server error");
  });
});

Deno.test("GrpcUnavailableError", async (t) => {
  await t.step("extends GrpcError with code 14", () => {
    const error = new GrpcUnavailableError("service unavailable");

    assertInstanceOf(error, GrpcError);
    assertEquals(error.name, "GrpcUnavailableError");
    assertEquals(error.code, 14);
    assertEquals(error.grpcMessage, "service unavailable");
  });
});
