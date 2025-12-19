import { assertEquals, assertInstanceOf } from "@std/assert";
import { ClientError } from "@probitas/client";
import { GraphqlExecutionError, GraphqlNetworkError } from "./errors.ts";
import type { GraphqlErrorItem } from "./types.ts";

Deno.test("GraphqlNetworkError", async (t) => {
  await t.step("extends ClientError", () => {
    const error = new GraphqlNetworkError("connection refused");
    assertInstanceOf(error, ClientError);
    assertInstanceOf(error, GraphqlNetworkError);
  });

  await t.step("has correct properties", () => {
    const error = new GraphqlNetworkError("connection refused");
    assertEquals(error.name, "GraphqlNetworkError");
    assertEquals(error.kind, "network");
    assertEquals(error.message, "connection refused");
  });

  await t.step("supports cause option", () => {
    const cause = new TypeError("fetch failed");
    const error = new GraphqlNetworkError("network error", { cause });
    assertEquals(error.cause, cause);
  });
});

Deno.test("GraphqlExecutionError", async (t) => {
  await t.step("extends ClientError", () => {
    const errors: GraphqlErrorItem[] = [
      {
        message: "Resolver failed",
        locations: null,
        path: null,
        extensions: null,
      },
    ];
    const error = new GraphqlExecutionError(errors);
    assertInstanceOf(error, ClientError);
    assertInstanceOf(error, GraphqlExecutionError);
  });

  await t.step("has correct properties", () => {
    const errors: GraphqlErrorItem[] = [
      {
        message: "User not found",
        locations: null,
        path: null,
        extensions: null,
      },
    ];
    const error = new GraphqlExecutionError(errors);
    assertEquals(error.name, "GraphqlExecutionError");
    assertEquals(error.kind, "graphql");
    assertEquals(error.errors, errors);
    assertEquals(
      error.message.startsWith("GraphQL execution failed:\n\n"),
      true,
    );
    assertEquals(error.message.includes("User not found"), true);
  });

  await t.step("formats multiple errors", () => {
    const errors: GraphqlErrorItem[] = [
      {
        message: "Field not found",
        locations: null,
        path: null,
        extensions: null,
      },
      {
        message: "Access denied",
        locations: null,
        path: null,
        extensions: null,
      },
    ];
    const error = new GraphqlExecutionError(errors);
    assertEquals(error.message.includes("Field not found"), true);
    assertEquals(error.message.includes("Access denied"), true);
  });

  await t.step("supports cause option", () => {
    const cause = new Error("underlying error");
    const errors: GraphqlErrorItem[] = [
      { message: "error", locations: null, path: null, extensions: null },
    ];
    const error = new GraphqlExecutionError(errors, { cause });
    assertEquals(error.cause, cause);
  });
});
