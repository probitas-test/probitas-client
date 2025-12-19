import {
  assert,
  assertEquals,
  assertFalse,
  assertInstanceOf,
} from "@std/assert";
import {
  GraphqlResponseErrorImpl,
  GraphqlResponseFailureImpl,
  GraphqlResponseSuccessImpl,
} from "./response.ts";
import { GraphqlExecutionError, GraphqlNetworkError } from "./errors.ts";

Deno.test("GraphqlResponseSuccessImpl", async (t) => {
  await t.step("creates success response with data", () => {
    const response = new GraphqlResponseSuccessImpl({
      url: "http://localhost:4000/graphql",
      data: { user: { id: 1, name: "John" } },
      extensions: null,
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
    const response = new GraphqlResponseSuccessImpl({
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
    const response = new GraphqlResponseSuccessImpl({
      url: "http://localhost:4000/graphql",
      data: null,
      extensions: null,
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
    const response = new GraphqlResponseSuccessImpl({
      url: "http://localhost:4000/graphql",
      data: null,
      extensions: null,
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
    const response = new GraphqlResponseSuccessImpl({
      url: "http://localhost:4000/graphql",
      data: { user: { id: 1, name: "John" } },
      extensions: null,
      duration: 100,
      status: 200,
      raw: new Response(),
    });

    const result = response.data<{ user: User }>();
    assertEquals(result?.user.id, 1);
    assertEquals(result?.user.name, "John");
  });
});

Deno.test("GraphqlResponseErrorImpl", async (t) => {
  await t.step("creates error response", () => {
    const error = new GraphqlExecutionError([
      { message: "Not found", locations: null, path: null, extensions: null },
    ]);
    const response = new GraphqlResponseErrorImpl({
      url: "http://localhost:4000/graphql",
      data: null,
      error,
      extensions: null,
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
    const error = new GraphqlExecutionError([
      { message: "Field error", locations: null, path: null, extensions: null },
    ]);
    const response = new GraphqlResponseErrorImpl({
      url: "http://localhost:4000/graphql",
      data: { user: { id: 1 }, posts: null },
      error,
      extensions: null,
      duration: 50,
      status: 200,
      raw: new Response(),
    });

    assertFalse(response.ok);
    assertEquals(response.data(), { user: { id: 1 }, posts: null });
  });

  await t.step("includes raw response", () => {
    const rawResponse = new Response();
    const error = new GraphqlExecutionError([
      { message: "Error", locations: null, path: null, extensions: null },
    ]);
    const response = new GraphqlResponseErrorImpl({
      url: "http://localhost:4000/graphql",
      data: null,
      error,
      extensions: null,
      duration: 10,
      status: 200,
      raw: rawResponse,
    });

    assertEquals(response.raw(), rawResponse);
  });
});

Deno.test("GraphqlResponseFailureImpl", async (t) => {
  await t.step("creates failure response", () => {
    const error = new GraphqlNetworkError("Connection refused");
    const response = new GraphqlResponseFailureImpl({
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
    const response = new GraphqlResponseFailureImpl({
      url: "http://localhost:4000/graphql",
      error,
      duration: 5,
    });

    assertEquals(response.status, null);
  });

  await t.step("headers is null", () => {
    const error = new GraphqlNetworkError("Network error");
    const response = new GraphqlResponseFailureImpl({
      url: "http://localhost:4000/graphql",
      error,
      duration: 5,
    });

    assertEquals(response.headers, null);
  });

  await t.step("data() returns null", () => {
    const error = new GraphqlNetworkError("Network error");
    const response = new GraphqlResponseFailureImpl({
      url: "http://localhost:4000/graphql",
      error,
      duration: 5,
    });

    assertEquals(response.data(), null);
  });

  await t.step("raw() returns null", () => {
    const error = new GraphqlNetworkError("Network error");
    const response = new GraphqlResponseFailureImpl({
      url: "http://localhost:4000/graphql",
      error,
      duration: 5,
    });

    assertEquals(response.raw(), null);
  });
});
