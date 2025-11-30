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
  GraphqlExecutionError,
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

        const res = await clientNoThrow.query<{
          echo: string;
          echoPartialError: string | null;
        }>(
          outdent`
          query PartialError($message: String!) {
            echo(message: $message)
            echoPartialError(message: $message)
          }
        `,
          { message: "Test" },
        );

        // Should have both data and errors
        expectGraphqlResponse(res).hasErrors();
        // echo should still return data even if echoPartialError fails
        assertEquals(res.data()?.echo, "Test");

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
      "throws GraphqlExecutionError on validation error",
      async () => {
        try {
          await client.query("{ nonExistentField }");
          throw new Error("Expected GraphqlExecutionError");
        } catch (error) {
          assertInstanceOf(error, GraphqlExecutionError);
          assertEquals(error.errors.length > 0, true);
        }
      },
    );

    await t.step(
      "returns errors without throwing when throwOnError: false",
      async () => {
        const clientNoThrow = createGraphqlClient({
          endpoint: GRAPHQL_URL,
          throwOnError: false,
        });

        const res = await clientNoThrow.query("{ nonExistentField }");

        expectGraphqlResponse(res)
          .hasErrors()
          .errorContains("nonExistentField");

        await clientNoThrow.close();
      },
    );

    await t.step("execute() works for queries", async () => {
      const res = await client.execute("query { __typename }");

      expectGraphqlResponse(res).ok();
    });

    await t.step("mutation - createMessage", async () => {
      const res = await client.mutation<{
        createMessage: { id: string; text: string; timestamp: string };
      }>(
        outdent`
          mutation CreateMessage($text: String!) {
            createMessage(text: $text) {
              id
              text
              timestamp
            }
          }
        `,
        { text: "Hello from integration test" },
      );

      expectGraphqlResponse(res).ok().hasData();

      const message = res.data()?.createMessage;
      assertEquals(message?.text, "Hello from integration test");
      assertEquals(typeof message?.id, "string");
      assertEquals(typeof message?.timestamp, "string");
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

    await client.close();
  },
});
