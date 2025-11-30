/**
 * Integration tests for @probitas/client-graphql.
 *
 * Run with:
 *   docker compose up -d
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
  name: "Integration: GraphQL",
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

      assertEquals(res.data?.__typename, "Query");
    });

    await t.step("introspection query - __schema", async () => {
      const res = await client.query<{
        __schema: { queryType: { name: string } };
      }>("{ __schema { queryType { name } } }");

      expectGraphqlResponse(res).ok().hasData();

      assertEquals(res.data?.__schema.queryType.name, "Query");
    });

    await t.step("query with variables", async () => {
      // Using introspection to test variables since it's available on all GraphQL servers
      const res = await client.query<{ __type: { name: string } | null }>(
        outdent`
          query GetType($name: String!) {
            __type(name: $name) {
              name
            }
          }
        `,
        { name: "Query" },
      );

      expectGraphqlResponse(res).ok();
      assertEquals(res.data?.__type?.name, "Query");
    });

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
      // Cannot directly verify headers were sent, but can verify the request succeeds
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

    await t.step("mutation method works", async () => {
      // Using introspection as a "mutation" since we can't guarantee
      // the test server has actual mutations. The method should still
      // send the request correctly.
      const res = await client.mutation("query { __typename }");

      expectGraphqlResponse(res).ok();
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
