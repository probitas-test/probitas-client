import {
  assert,
  assertEquals,
  assertFalse,
  assertInstanceOf,
} from "@std/assert";
import {
  createGraphqlResponseError,
  createGraphqlResponseFailure,
  createGraphqlResponseSuccess,
} from "./response.ts";
import { GraphqlExecutionError, GraphqlNetworkError } from "./errors.ts";

Deno.test("createGraphqlResponseSuccess", async (t) => {
  await t.step("creates success response with data", () => {
    const response = createGraphqlResponseSuccess({
      url: "http://localhost:4000/graphql",
      data: { user: { id: 1, name: "John" } },
      extensions: undefined,
      duration: 100,
      status: 200,
      raw: new Response(),
    });

    assertEquals(response.kind, "graphql");
    assertEquals(response.processed, true);
    assert(response.ok);
    assertEquals(response.error, null);
    assertEquals(response.data(), { user: { id: 1, name: "John" } });
    assertEquals(response.duration, 100);
    assertEquals(response.status, 200);
    assertEquals(response.url, "http://localhost:4000/graphql");
  });

  await t.step("includes extensions", () => {
    const response = createGraphqlResponseSuccess({
      url: "http://localhost:4000/graphql",
      data: { test: true },
      extensions: { tracing: { duration: 123 } },
      duration: 50,
      status: 200,
      raw: new Response(),
    });

    assertEquals(response.extensions, { tracing: { duration: 123 } });
  });

  await t.step("includes raw response", () => {
    const rawResponse = new Response();
    const response = createGraphqlResponseSuccess({
      url: "http://localhost:4000/graphql",
      data: null,
      extensions: undefined,
      duration: 10,
      status: 200,
      raw: rawResponse,
    });

    assertEquals(response.raw(), rawResponse);
  });

  await t.step("includes headers from raw response", () => {
    const rawResponse = new Response(null, {
      headers: { "X-Custom-Header": "test-value" },
    });
    const response = createGraphqlResponseSuccess({
      url: "http://localhost:4000/graphql",
      data: null,
      extensions: undefined,
      duration: 10,
      status: 200,
      raw: rawResponse,
    });

    assertInstanceOf(response.headers, Headers);
    assertEquals(response.headers.get("X-Custom-Header"), "test-value");
  });

  await t.step("data() method returns typed data", () => {
    interface User {
      id: number;
      name: string;
    }
    const response = createGraphqlResponseSuccess({
      url: "http://localhost:4000/graphql",
      data: { user: { id: 1, name: "John" } },
      extensions: undefined,
      duration: 100,
      status: 200,
      raw: new Response(),
    });

    const result = response.data<{ user: User }>();
    assertEquals(result?.user.id, 1);
    assertEquals(result?.user.name, "John");
  });
});

Deno.test("createGraphqlResponseError", async (t) => {
  await t.step("creates error response", () => {
    const error = new GraphqlExecutionError([{ message: "Not found" }]);
    const response = createGraphqlResponseError({
      url: "http://localhost:4000/graphql",
      data: null,
      error,
      extensions: undefined,
      duration: 50,
      status: 200,
      raw: new Response(),
    });

    assertEquals(response.kind, "graphql");
    assertEquals(response.processed, true);
    assertFalse(response.ok);
    assertEquals(response.error, error);
    assertEquals(response.data(), null);
    assertEquals(response.status, 200);
  });

  await t.step("allows partial data with errors", () => {
    const error = new GraphqlExecutionError([{ message: "Field error" }]);
    const response = createGraphqlResponseError({
      url: "http://localhost:4000/graphql",
      data: { user: { id: 1 }, posts: null },
      error,
      extensions: undefined,
      duration: 50,
      status: 200,
      raw: new Response(),
    });

    assertFalse(response.ok);
    assertEquals(response.data(), { user: { id: 1 }, posts: null });
  });

  await t.step("includes raw response", () => {
    const rawResponse = new Response();
    const error = new GraphqlExecutionError([{ message: "Error" }]);
    const response = createGraphqlResponseError({
      url: "http://localhost:4000/graphql",
      data: null,
      error,
      extensions: undefined,
      duration: 10,
      status: 200,
      raw: rawResponse,
    });

    assertEquals(response.raw(), rawResponse);
  });
});

Deno.test("createGraphqlResponseFailure", async (t) => {
  await t.step("creates failure response", () => {
    const error = new GraphqlNetworkError("Connection refused");
    const response = createGraphqlResponseFailure({
      url: "http://localhost:4000/graphql",
      error,
      duration: 10,
    });

    assertEquals(response.kind, "graphql");
    assertEquals(response.processed, false);
    assertFalse(response.ok);
    assertEquals(response.error, error);
    assertEquals(response.url, "http://localhost:4000/graphql");
    assertEquals(response.duration, 10);
  });

  await t.step("status is null", () => {
    const error = new GraphqlNetworkError("Network error");
    const response = createGraphqlResponseFailure({
      url: "http://localhost:4000/graphql",
      error,
      duration: 5,
    });

    assertEquals(response.status, null);
  });

  await t.step("headers is null", () => {
    const error = new GraphqlNetworkError("Network error");
    const response = createGraphqlResponseFailure({
      url: "http://localhost:4000/graphql",
      error,
      duration: 5,
    });

    assertEquals(response.headers, null);
  });

  await t.step("data() returns null", () => {
    const error = new GraphqlNetworkError("Network error");
    const response = createGraphqlResponseFailure({
      url: "http://localhost:4000/graphql",
      error,
      duration: 5,
    });

    assertEquals(response.data(), null);
  });

  await t.step("raw() returns null", () => {
    const error = new GraphqlNetworkError("Network error");
    const response = createGraphqlResponseFailure({
      url: "http://localhost:4000/graphql",
      error,
      duration: 5,
    });

    assertEquals(response.raw(), null);
  });
});
