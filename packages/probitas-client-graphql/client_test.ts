import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
import { createGraphqlClient } from "./client.ts";
import { GraphqlExecutionError, GraphqlNetworkError } from "./errors.ts";

function createMockFetch(
  handler: (req: Request) => Response | Promise<Response>,
): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    return Promise.resolve(handler(request));
  };
}

Deno.test("createGraphqlClient", async (t) => {
  await t.step("returns GraphqlClient with config", () => {
    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
    });
    assertEquals(client.config.url, "http://localhost:4000/graphql");
  });

  await t.step("implements AsyncDisposable", async () => {
    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
    });
    assertEquals(typeof client[Symbol.asyncDispose], "function");
    await client.close();
  });
});

Deno.test("GraphqlClient.query", async (t) => {
  await t.step("sends POST request with query", async () => {
    let capturedRequest: Request | undefined;
    const mockFetch = createMockFetch((req) => {
      capturedRequest = req;
      return new Response(JSON.stringify({ data: { user: { id: 1 } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      fetch: mockFetch,
    });

    await client.query("query { user { id } }");
    await client.close();

    assertEquals(capturedRequest?.method, "POST");
    assertEquals(capturedRequest?.url, "http://localhost:4000/graphql");
    const body = await capturedRequest?.json();
    assertEquals(body.query, "query { user { id } }");
  });

  await t.step("includes variables in request", async () => {
    let capturedRequest: Request | undefined;
    const mockFetch = createMockFetch((req) => {
      capturedRequest = req;
      return new Response(JSON.stringify({ data: { user: { id: 1 } } }));
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      fetch: mockFetch,
    });

    await client.query("query GetUser($id: ID!) { user(id: $id) { id } }", {
      id: "123",
    });
    await client.close();

    const body = await capturedRequest?.json();
    assertEquals(body.variables, { id: "123" });
  });

  await t.step("includes operationName when provided", async () => {
    let capturedRequest: Request | undefined;
    const mockFetch = createMockFetch((req) => {
      capturedRequest = req;
      return new Response(JSON.stringify({ data: null }));
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      fetch: mockFetch,
    });

    await client.query(
      "query GetUser { user { id } } query GetUsers { users { id } }",
      undefined,
      { operationName: "GetUser" },
    );
    await client.close();

    const body = await capturedRequest?.json();
    assertEquals(body.operationName, "GetUser");
  });

  await t.step("returns GraphqlResponse with data", async () => {
    const mockFetch = createMockFetch(() => {
      return new Response(
        JSON.stringify({ data: { user: { id: 1, name: "John" } } }),
      );
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      fetch: mockFetch,
    });

    const response = await client.query("query { user { id name } }");
    await client.close();

    assertEquals(response.ok, true);
    assertEquals(response.data(), { user: { id: 1, name: "John" } });
    assertEquals(response.errors, null);
  });

  await t.step(
    "throws GraphqlExecutionError on errors by default",
    async () => {
      const mockFetch = createMockFetch(() => {
        return new Response(
          JSON.stringify({
            data: null,
            errors: [{ message: "User not found" }],
          }),
        );
      });

      const client = createGraphqlClient({
        url: "http://localhost:4000/graphql",
        fetch: mockFetch,
      });

      const error = await assertRejects(
        () => client.query("query { user { id } }"),
        GraphqlExecutionError,
      );
      assertInstanceOf(error, GraphqlExecutionError);
      assertEquals(error.errors[0].message, "User not found");
      await client.close();
    },
  );

  await t.step(
    "returns response with errors when throwOnError: false in config",
    async () => {
      const mockFetch = createMockFetch(() => {
        return new Response(
          JSON.stringify({
            data: null,
            errors: [{ message: "User not found" }],
          }),
        );
      });

      const client = createGraphqlClient({
        url: "http://localhost:4000/graphql",
        fetch: mockFetch,
        throwOnError: false,
      });

      const response = await client.query("query { user { id } }");
      await client.close();

      assertEquals(response.ok, false);
      assertEquals(response.errors?.length, 1);
      assertEquals(response.errors?.[0].message, "User not found");
    },
  );

  await t.step(
    "returns response with errors when throwOnError: false in options",
    async () => {
      const mockFetch = createMockFetch(() => {
        return new Response(
          JSON.stringify({
            data: null,
            errors: [{ message: "Error" }],
          }),
        );
      });

      const client = createGraphqlClient({
        url: "http://localhost:4000/graphql",
        fetch: mockFetch,
      });

      const response = await client.query("query { test }", undefined, {
        throwOnError: false,
      });
      await client.close();

      assertEquals(response.ok, false);
    },
  );

  await t.step(
    "options throwOnError overrides config (true overrides false)",
    async () => {
      const mockFetch = createMockFetch(() => {
        return new Response(
          JSON.stringify({
            data: null,
            errors: [{ message: "Error" }],
          }),
        );
      });

      const client = createGraphqlClient({
        url: "http://localhost:4000/graphql",
        fetch: mockFetch,
        throwOnError: false,
      });

      await assertRejects(
        () => client.query("query { test }", undefined, { throwOnError: true }),
        GraphqlExecutionError,
      );
      await client.close();
    },
  );
});

Deno.test("GraphqlClient.mutation", async (t) => {
  await t.step("sends mutation request", async () => {
    let capturedRequest: Request | undefined;
    const mockFetch = createMockFetch((req) => {
      capturedRequest = req;
      return new Response(JSON.stringify({ data: { createUser: { id: 1 } } }));
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      fetch: mockFetch,
    });

    await client.mutation(
      "mutation CreateUser($name: String!) { createUser(name: $name) { id } }",
      { name: "John" },
    );
    await client.close();

    const body = await capturedRequest?.json();
    assertEquals(body.query.includes("mutation"), true);
    assertEquals(body.variables, { name: "John" });
  });
});

Deno.test("GraphqlClient.execute", async (t) => {
  await t.step("works for queries", async () => {
    const mockFetch = createMockFetch(() => {
      return new Response(JSON.stringify({ data: { test: true } }));
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      fetch: mockFetch,
    });

    const response = await client.execute("query { test }");
    await client.close();

    assertEquals(response.data(), { test: true });
  });

  await t.step("works for mutations", async () => {
    const mockFetch = createMockFetch(() => {
      return new Response(JSON.stringify({ data: { updated: true } }));
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      fetch: mockFetch,
    });

    const response = await client.execute("mutation { updateSomething }");
    await client.close();

    assertEquals(response.data(), { updated: true });
  });
});

Deno.test("GraphqlClient headers", async (t) => {
  await t.step("sends Content-Type header", async () => {
    let capturedRequest: Request | undefined;
    const mockFetch = createMockFetch((req) => {
      capturedRequest = req;
      return new Response(JSON.stringify({ data: null }));
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      fetch: mockFetch,
    });

    await client.query("query { test }");
    await client.close();

    assertEquals(
      capturedRequest?.headers.get("Content-Type"),
      "application/json",
    );
  });

  await t.step("merges headers from config and options", async () => {
    let capturedRequest: Request | undefined;
    const mockFetch = createMockFetch((req) => {
      capturedRequest = req;
      return new Response(JSON.stringify({ data: null }));
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      headers: { Authorization: "Bearer token" },
      fetch: mockFetch,
    });

    await client.query("query { test }", undefined, {
      headers: { "X-Request-Id": "abc" },
    });
    await client.close();

    assertEquals(capturedRequest?.headers.get("Authorization"), "Bearer token");
    assertEquals(capturedRequest?.headers.get("X-Request-Id"), "abc");
    assertEquals(
      capturedRequest?.headers.get("Content-Type"),
      "application/json",
    );
  });

  await t.step("option headers override config headers", async () => {
    let capturedRequest: Request | undefined;
    const mockFetch = createMockFetch((req) => {
      capturedRequest = req;
      return new Response(JSON.stringify({ data: null }));
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      headers: { Authorization: "Bearer old-token" },
      fetch: mockFetch,
    });

    await client.query("query { test }", undefined, {
      headers: { Authorization: "Bearer new-token" },
    });
    await client.close();

    assertEquals(
      capturedRequest?.headers.get("Authorization"),
      "Bearer new-token",
    );
  });
});

Deno.test("GraphqlClient response", async (t) => {
  await t.step("includes duration in response", async () => {
    const mockFetch = createMockFetch(() => {
      return new Response(JSON.stringify({ data: { test: true } }));
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      fetch: mockFetch,
    });

    const response = await client.query("query { test }");
    await client.close();

    assertEquals(typeof response.duration, "number");
    assertEquals(response.duration >= 0, true);
  });

  await t.step("includes status in response", async () => {
    const mockFetch = createMockFetch(() => {
      return new Response(JSON.stringify({ data: null }), { status: 200 });
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      fetch: mockFetch,
    });

    const response = await client.query("query { test }");
    await client.close();

    assertEquals(response.status, 200);
  });

  await t.step("includes extensions in response", async () => {
    const mockFetch = createMockFetch(() => {
      return new Response(
        JSON.stringify({
          data: { test: true },
          extensions: { tracing: { duration: 123 } },
        }),
      );
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      fetch: mockFetch,
    });

    const response = await client.query("query { test }");
    await client.close();

    assertEquals(response.extensions, { tracing: { duration: 123 } });
  });

  await t.step("includes raw response", async () => {
    const mockFetch = createMockFetch(() => {
      return new Response(JSON.stringify({ data: null }));
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      fetch: mockFetch,
    });

    const response = await client.query("query { test }");
    await client.close();

    assertInstanceOf(response.raw(), Response);
  });
});

Deno.test("GraphqlClient network errors", async (t) => {
  await t.step("throws GraphqlNetworkError on fetch failure", async () => {
    const mockFetch = createMockFetch(() => {
      throw new TypeError("fetch failed");
    });

    const client = createGraphqlClient({
      url: "http://localhost:4000/graphql",
      fetch: mockFetch,
    });

    const error = await assertRejects(
      () => client.query("query { test }"),
      GraphqlNetworkError,
    );
    assertInstanceOf(error, GraphqlNetworkError);
    assertEquals(error.message.includes("Network error"), true);
    await client.close();
  });

  await t.step(
    "throws GraphqlNetworkError on non-200 HTTP response",
    async () => {
      const mockFetch = createMockFetch(() => {
        return new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        });
      });

      const client = createGraphqlClient({
        url: "http://localhost:4000/graphql",
        fetch: mockFetch,
      });

      const error = await assertRejects(
        () => client.query("query { test }"),
        GraphqlNetworkError,
      );
      assertEquals(error.message, "HTTP 500: Internal Server Error");
      await client.close();
    },
  );

  await t.step(
    "throws GraphqlNetworkError on invalid JSON response",
    async () => {
      const mockFetch = createMockFetch(() => {
        return new Response("not json", { status: 200 });
      });

      const client = createGraphqlClient({
        url: "http://localhost:4000/graphql",
        fetch: mockFetch,
      });

      const error = await assertRejects(
        () => client.query("query { test }"),
        GraphqlNetworkError,
      );
      assertEquals(error.message.includes("Failed to parse"), true);
      await client.close();
    },
  );
});

Deno.test("GraphqlClient partial data with errors", async (t) => {
  await t.step(
    "returns partial data with errors when throwOnError: false",
    async () => {
      const mockFetch = createMockFetch(() => {
        return new Response(
          JSON.stringify({
            data: { user: { id: 1 }, posts: null },
            errors: [{ message: "Posts service unavailable", path: ["posts"] }],
          }),
        );
      });

      const client = createGraphqlClient({
        url: "http://localhost:4000/graphql",
        fetch: mockFetch,
        throwOnError: false,
      });

      const response = await client.query("query { user { id } posts { id } }");
      await client.close();

      assertEquals(response.ok, false);
      assertEquals(response.data(), { user: { id: 1 }, posts: null });
      assertEquals(response.errors?.length, 1);
    },
  );
});

Deno.test("GraphqlClient.subscribe", async (t) => {
  await t.step(
    "throws GraphqlNetworkError when wsEndpoint is not configured",
    async () => {
      const client = createGraphqlClient({
        url: "http://localhost:4000/graphql",
      });

      const iterator = client.subscribe("subscription { newMessage { id } }");
      const error = await assertRejects(
        async () => {
          for await (const _ of iterator) {
            // Should not reach here
          }
        },
        GraphqlNetworkError,
      );
      assertEquals(
        error.message,
        "WebSocket endpoint (wsEndpoint) is not configured",
      );
      await client.close();
    },
  );
});
