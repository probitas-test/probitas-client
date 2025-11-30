/**
 * Integration tests for @probitas/client-graphql using echo-graphql.
 *
 * Run with:
 *   docker compose up -d echo-graphql
 *   deno test -A packages/probitas-client-graphql/integration_test.ts
 *   docker compose down
 */

import { assertEquals, assertInstanceOf } from "@std/assert";
import {
  createGraphqlClient,
  expectGraphqlResponse,
  GraphqlNetworkError,
  outdent,
} from "./mod.ts";

const GRAPHQL_URL = Deno.env.get("GRAPHQL_URL") ??
  "http://localhost:14000/graphql";

async function isGraphqlServerAvailable(): Promise<boolean> {
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
      signal: AbortSignal.timeout(1000),
    });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

Deno.test({
  name: "Integration: echo-graphql",
  ignore: !(await isGraphqlServerAvailable()),
  async fn(t) {
    const client = createGraphqlClient({ endpoint: GRAPHQL_URL });

    await t.step("introspection query - __typename", async () => {
      const res = await client.query<{ __typename: string }>(
        "{ __typename }",
      );

      expectGraphqlResponse(res)
        .ok()
        .status(200)
        .hasData();

      assertEquals(res.data()?.__typename, "Query");
    });

    await t.step("introspection query - __schema", async () => {
      const res = await client.query<{
        __schema: { queryType: { name: string } };
      }>("{ __schema { queryType { name } } }");

      expectGraphqlResponse(res).ok().hasData();

      assertEquals(res.data()?.__schema.queryType.name, "Query");
    });

    await t.step("echo query - basic message", async () => {
      const res = await client.query<{ echo: string }>(
        outdent`
          query Echo($message: String!) {
            echo(message: $message)
          }
        `,
        { message: "Hello, Probitas!" },
      );

      expectGraphqlResponse(res).ok().hasData();
      assertEquals(res.data()?.echo, "Hello, Probitas!");
    });

    await t.step("echoWithDelay for latency testing", async () => {
      const start = Date.now();
      const res = await client.query<{ echoWithDelay: string }>(
        outdent`
          query EchoWithDelay($message: String!, $delayMs: Int!) {
            echoWithDelay(message: $message, delayMs: $delayMs)
          }
        `,
        { message: "Delayed message", delayMs: 500 },
      );
      const elapsed = Date.now() - start;

      expectGraphqlResponse(res).ok().hasData();
      assertEquals(res.data()?.echoWithDelay, "Delayed message");

      // Should have taken at least 500ms
      assertEquals(
        elapsed >= 450,
        true,
        `Expected elapsed >= 450ms, got ${elapsed}ms`,
      );
    });

    await t.step("echoError returns GraphQL error", async () => {
      const clientNoThrow = createGraphqlClient({
        endpoint: GRAPHQL_URL,
        throwOnError: false,
      });

      const res = await clientNoThrow.query<{ echoError: string }>(
        outdent`
          query EchoError($message: String!) {
            echoError(message: $message)
          }
        `,
        { message: "This should fail" },
      );

      expectGraphqlResponse(res).hasErrors();

      await clientNoThrow.close();
    });

    await t.step(
      "echoPartialError returns partial data with errors",
      async () => {
        const clientNoThrow = createGraphqlClient({
          endpoint: GRAPHQL_URL,
          throwOnError: false,
        });

        // echoPartialError takes [String!]! and returns [EchoResult!]!
        // Messages containing "error" should fail per documentation
        const res = await clientNoThrow.query<{
          echoPartialError: Array<
            { message: string | null; error: string | null }
          >;
        }>(
          outdent`
          query PartialError($messages: [String!]!) {
            echoPartialError(messages: $messages) {
              message
              error
            }
          }
        `,
          { messages: ["success", "error", "also success"] },
        );

        expectGraphqlResponse(res).ok().hasData();
        const results = res.data()?.echoPartialError;
        // First and third should succeed, second should have error
        assertEquals(results?.[0]?.message, "success");
        assertEquals(results?.[0]?.error, null);
        assertEquals(results?.[1]?.message, null);
        assertEquals(results?.[1]?.error, "message contains 'error'");
        assertEquals(results?.[2]?.message, "also success");
        assertEquals(results?.[2]?.error, null);

        await clientNoThrow.close();
      },
    );

    await t.step("query with operationName", async () => {
      const res = await client.query(
        outdent`
          query FirstQuery { __typename }
          query SecondQuery { __schema { queryType { name } } }
        `,
        undefined,
        { operationName: "FirstQuery" },
      );

      expectGraphqlResponse(res).ok();
    });

    await t.step("includes duration in response", async () => {
      const res = await client.query("{ __typename }");

      assertEquals(typeof res.duration, "number");
      assertEquals(res.duration >= 0, true);
    });

    await t.step("includes status in response", async () => {
      const res = await client.query("{ __typename }");

      assertEquals(res.status, 200);
    });

    await t.step("includes raw response", async () => {
      const res = await client.query("{ __typename }");

      assertInstanceOf(res.raw, Response);
    });

    await t.step("using await using (AsyncDisposable)", async () => {
      await using c = createGraphqlClient({ endpoint: GRAPHQL_URL });

      const res = await c.query("{ __typename }");
      expectGraphqlResponse(res).ok();
    });

    await t.step("default headers from config", async () => {
      const clientWithHeaders = createGraphqlClient({
        endpoint: GRAPHQL_URL,
        headers: {
          "Authorization": "Bearer test-token",
          "X-Custom-Header": "custom-value",
        },
      });

      const res = await clientWithHeaders.query("{ __typename }");
      expectGraphqlResponse(res).ok();

      await clientWithHeaders.close();
    });

    await t.step("request headers override config headers", async () => {
      const clientWithHeaders = createGraphqlClient({
        endpoint: GRAPHQL_URL,
        headers: { "X-Header": "from-config" },
      });

      const res = await clientWithHeaders.query(
        "{ __typename }",
        undefined,
        { headers: { "X-Header": "from-request" } },
      );

      expectGraphqlResponse(res).ok();

      await clientWithHeaders.close();
    });

    await t.step(
      "throws GraphqlNetworkError on validation error (HTTP 422)",
      async () => {
        // echo-graphql returns HTTP 422 for invalid queries
        try {
          await client.query("{ nonExistentField }");
          throw new Error("Expected GraphqlNetworkError");
        } catch (error) {
          assertInstanceOf(error, GraphqlNetworkError);
          assertEquals(error.message.includes("422"), true);
        }
      },
    );

    await t.step(
      "echoError query returns GraphQL error in response",
      async () => {
        const clientNoThrow = createGraphqlClient({
          endpoint: GRAPHQL_URL,
          throwOnError: false,
        });

        const res = await clientNoThrow.query<{ echoError: string }>(
          outdent`
            query EchoError($message: String!) {
              echoError(message: $message)
            }
          `,
          { message: "This triggers an error" },
        );

        expectGraphqlResponse(res).hasErrors();

        await clientNoThrow.close();
      },
    );

    await t.step("execute() works for queries", async () => {
      const res = await client.execute("query { __typename }");

      expectGraphqlResponse(res).ok();
    });

    await t.step("mutation - createMessage", async () => {
      const res = await client.mutation<{
        createMessage: { id: string; text: string; createdAt: string };
      }>(
        outdent`
          mutation CreateMessage($text: String!) {
            createMessage(text: $text) {
              id
              text
              createdAt
            }
          }
        `,
        { text: "Hello from integration test" },
      );

      expectGraphqlResponse(res).ok().hasData();

      const message = res.data()?.createMessage;
      assertEquals(message?.text, "Hello from integration test");
      assertEquals(typeof message?.id, "string");
      assertEquals(typeof message?.createdAt, "string");
    });

    await t.step("fluent expectation chaining", async () => {
      const res = await client.query<{ __typename: string }>("{ __typename }");

      expectGraphqlResponse(res)
        .ok()
        .status(200)
        .hasData()
        .dataContains({ __typename: "Query" })
        .durationLessThan(5000);
    });

    await t.step(
      "echoWithExtensions returns data with extensions",
      async () => {
        const res = await client.query<{
          echoWithExtensions: string;
        }>(
          outdent`
          query EchoWithExtensions($message: String!) {
            echoWithExtensions(message: $message)
          }
        `,
          { message: "Hello" },
        );

        expectGraphqlResponse(res).ok().hasData();
        assertEquals(res.data()?.echoWithExtensions, "Hello");
        // Server includes timing and tracing extensions
        assertEquals(typeof res.extensions?.timing, "object");
        assertEquals(typeof res.extensions?.tracing, "object");
      },
    );

    await t.step("mutation - updateMessage", async () => {
      // First create a message
      const createRes = await client.mutation<{
        createMessage: { id: string; text: string };
      }>(
        outdent`
          mutation CreateMessage($text: String!) {
            createMessage(text: $text) {
              id
              text
            }
          }
        `,
        { text: "Original text" },
      );

      const messageId = createRes.data()?.createMessage.id;

      // Then update it
      const updateRes = await client.mutation<{
        updateMessage: { id: string; text: string };
      }>(
        outdent`
          mutation UpdateMessage($id: ID!, $text: String!) {
            updateMessage(id: $id, text: $text) {
              id
              text
            }
          }
        `,
        { id: messageId, text: "Updated text" },
      );

      expectGraphqlResponse(updateRes).ok().hasData();
      assertEquals(updateRes.data()?.updateMessage.id, messageId);
      assertEquals(updateRes.data()?.updateMessage.text, "Updated text");
    });

    await t.step("mutation - deleteMessage", async () => {
      // First create a message
      const createRes = await client.mutation<{
        createMessage: { id: string };
      }>(
        outdent`
          mutation CreateMessage($text: String!) {
            createMessage(text: $text) {
              id
            }
          }
        `,
        { text: "To be deleted" },
      );

      const messageId = createRes.data()?.createMessage.id;

      // Then delete it
      const deleteRes = await client.mutation<{
        deleteMessage: boolean;
      }>(
        outdent`
          mutation DeleteMessage($id: ID!) {
            deleteMessage(id: $id)
          }
        `,
        { id: messageId },
      );

      expectGraphqlResponse(deleteRes).ok().hasData();
      assertEquals(deleteRes.data()?.deleteMessage, true);
    });

    await t.step("subscription - countdown", async () => {
      const wsClient = createGraphqlClient({
        endpoint: GRAPHQL_URL,
        wsEndpoint: GRAPHQL_URL.replace("http", "ws"),
      });

      try {
        const numbers: number[] = [];
        for await (
          const res of wsClient.subscribe<{ countdown: number }>(
            outdent`
              subscription Countdown($from: Int!) {
                countdown(from: $from)
              }
            `,
            { from: 3 },
          )
        ) {
          expectGraphqlResponse(res).ok().hasData();
          numbers.push(res.data()?.countdown ?? -1);
        }

        assertEquals(numbers, [3, 2, 1, 0]);
      } finally {
        await wsClient.close();
      }
    });

    await t.step("echoHeaders - verify headers delivery", async () => {
      const clientWithHeaders = createGraphqlClient({
        endpoint: GRAPHQL_URL,
        headers: {
          "Authorization": "Bearer test-token-123",
          "X-Client-Id": "probitas-integration-test",
        },
      });

      try {
        const res = await clientWithHeaders.query<{
          echoHeaders: {
            authorization: string | null;
            custom: string | null;
            all: Array<{ name: string; value: string }>;
          };
        }>(
          outdent`
            query EchoHeaders {
              echoHeaders {
                authorization
                custom(name: "x-client-id")
                all { name value }
              }
            }
          `,
          undefined,
          { headers: { "X-Request-Id": "req-789" } },
        );

        expectGraphqlResponse(res).ok().hasData();

        const headers = res.data()?.echoHeaders;
        // Verify config-level headers were sent
        assertEquals(headers?.authorization, "Bearer test-token-123");
        assertEquals(headers?.custom, "probitas-integration-test");
        // Verify request-level headers were sent via all field
        const requestIdHeader = headers?.all.find((h) =>
          h.name.toLowerCase() === "x-request-id"
        );
        assertEquals(requestIdHeader?.value, "req-789");
      } finally {
        await clientWithHeaders.close();
      }
    });

    await client.close();
  },
});
