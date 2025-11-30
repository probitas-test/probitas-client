import { assertEquals, assertInstanceOf } from "@std/assert";
import { ClientError } from "@probitas/client";
import {
  GraphqlError,
  GraphqlExecutionError,
  GraphqlNetworkError,
  GraphqlValidationError,
} from "./errors.ts";

Deno.test("GraphqlError", async (t) => {
  await t.step("extends ClientError", () => {
    const error = new GraphqlError("request failed", []);
    assertInstanceOf(error, ClientError);
    assertInstanceOf(error, GraphqlError);
  });

  await t.step("has correct properties", () => {
    const errors = [{ message: "Field not found" }];
    const error = new GraphqlError("GraphQL errors occurred", errors);
    assertEquals(error.name, "GraphqlError");
    assertEquals(error.kind, "graphql");
    assertEquals(error.message, "GraphQL errors occurred");
    assertEquals(error.errors, errors);
    assertEquals(error.response, undefined);
  });

  await t.step("supports response property", () => {
    const mockResponse = { ok: false } as never;
    const error = new GraphqlError("request failed", [], {
      response: mockResponse,
    });
    assertEquals(error.response, mockResponse);
  });

  await t.step("supports cause option", () => {
    const cause = new Error("network error");
    const error = new GraphqlError("request failed", [], { cause });
    assertEquals(error.cause, cause);
  });
});

Deno.test("GraphqlNetworkError", async (t) => {
  await t.step("extends GraphqlError", () => {
    const error = new GraphqlNetworkError("connection refused");
    assertInstanceOf(error, GraphqlError);
    assertInstanceOf(error, GraphqlNetworkError);
  });

  await t.step("has correct properties", () => {
    const error = new GraphqlNetworkError("connection refused");
    assertEquals(error.name, "GraphqlNetworkError");
    assertEquals(error.kind, "graphql");
    assertEquals(error.message, "connection refused");
    assertEquals(error.errors, []);
  });

  await t.step("supports cause option", () => {
    const cause = new TypeError("fetch failed");
    const error = new GraphqlNetworkError("network error", { cause });
    assertEquals(error.cause, cause);
  });
});

Deno.test("GraphqlValidationError", async (t) => {
  await t.step("extends GraphqlError", () => {
    const errors = [{ message: "Unknown field" }];
    const error = new GraphqlValidationError(errors);
    assertInstanceOf(error, GraphqlError);
    assertInstanceOf(error, GraphqlValidationError);
  });

  await t.step("has correct properties", () => {
    const errors = [
      { message: "Unknown field 'foo'" },
      { message: "Cannot query field 'bar'" },
    ];
    const error = new GraphqlValidationError(errors);
    assertEquals(error.name, "GraphqlValidationError");
    assertEquals(error.kind, "graphql");
    assertEquals(error.errors, errors);
    assertEquals(
      error.message,
      "GraphQL validation failed: Unknown field 'foo'; Cannot query field 'bar'",
    );
  });
});

Deno.test("GraphqlExecutionError", async (t) => {
  await t.step("extends GraphqlError", () => {
    const errors = [{ message: "Resolver failed" }];
    const error = new GraphqlExecutionError(errors);
    assertInstanceOf(error, GraphqlError);
    assertInstanceOf(error, GraphqlExecutionError);
  });

  await t.step("has correct properties", () => {
    const errors = [{ message: "User not found" }];
    const error = new GraphqlExecutionError(errors);
    assertEquals(error.name, "GraphqlExecutionError");
    assertEquals(error.kind, "graphql");
    assertEquals(error.errors, errors);
    assertEquals(error.message, "GraphQL execution failed: User not found");
  });

  await t.step("supports response property", () => {
    const mockResponse = { ok: false, data: null } as never;
    const error = new GraphqlExecutionError([{ message: "error" }], {
      response: mockResponse,
    });
    assertEquals(error.response, mockResponse);
  });
});
