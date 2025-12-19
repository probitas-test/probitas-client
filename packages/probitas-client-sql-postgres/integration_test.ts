/**
 * Integration tests for PostgresClient.
 *
 * Run with:
 *   docker compose up -d postgres
 *   deno test -A packages/probitas-client-sql-postgres/integration_test.ts
 *   docker compose down
 */

import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertRejects,
} from "@std/assert";
import {
  ConstraintError,
  createPostgresClient,
  type PostgresClient,
  QuerySyntaxError,
} from "./mod.ts";

const CONNECTION_STRING =
  "postgres://testuser:testpassword@localhost:15432/testdb";

/**
 * Check if PostgreSQL is available for integration testing.
 */
async function isPostgresAvailable(): Promise<boolean> {
  try {
    const client = await createPostgresClient({
      url: CONNECTION_STRING,
    });
    await client.close();
    return true;
  } catch {
    return false;
  }
}

const postgresAvailable = await isPostgresAvailable();

Deno.test({
  name: "Integration: PostgresClient",
  ignore: !postgresAvailable,
  async fn(t) {
    await t.step("has dialect property", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        assertEquals(client.dialect, "postgres");
      } finally {
        await client.close();
      }
    });

    await t.step("executes simple SELECT query", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        const result = await client.query<{ value: number }>(
          "SELECT 1 as value",
        );

        assert(result.ok);
        assertEquals(result.rows[0], { value: 1 });
        assertEquals(result.rowCount, 1);
      } finally {
        await client.close();
      }
    });

    await t.step("queryOne returns first row", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        const row = await client.queryOne<{ a: number; b: number }>(
          "SELECT 1 as a, 2 as b",
        );

        assertEquals(row, { a: 1, b: 2 });
      } finally {
        await client.close();
      }
    });

    await t.step("queryOne returns undefined when no rows", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        const row = await client.queryOne("SELECT 1 WHERE false");

        assertEquals(row, undefined);
      } finally {
        await client.close();
      }
    });

    await t.step("executes parameterized query", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        const result = await client.query<{ sum: number }>(
          "SELECT $1::int + $2::int as sum",
          [10, 20],
        );

        assert(result.ok);
        assertEquals(result.rows[0], { sum: 30 });
      } finally {
        await client.close();
      }
    });

    await t.step("transaction auto-commit on success", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS test_commit (
            id SERIAL PRIMARY KEY,
            value TEXT NOT NULL
          )
        `);
        await client.query("TRUNCATE TABLE test_commit");

        await client.transaction(async (tx) => {
          await tx.query("INSERT INTO test_commit (value) VALUES ($1)", [
            "committed",
          ]);
        });

        const result = await client.query<{ value: string }>(
          "SELECT value FROM test_commit",
        );
        assert(result.ok);
        assertEquals(result.rows[0]?.value, "committed");
      } finally {
        await client.query("DROP TABLE IF EXISTS test_commit");
        await client.close();
      }
    });

    await t.step("transaction auto-rollback on error", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS test_rollback (
            id SERIAL PRIMARY KEY,
            value TEXT NOT NULL
          )
        `);
        await client.query("TRUNCATE TABLE test_rollback");

        await assertRejects(
          () =>
            client.transaction(async (tx) => {
              await tx.query("INSERT INTO test_rollback (value) VALUES ($1)", [
                "rolled_back",
              ]);
              throw new Error("Intentional rollback");
            }),
          Error,
          "Intentional rollback",
        );

        const result = await client.query<{ count: string }>(
          "SELECT COUNT(*) as count FROM test_rollback",
        );
        assert(result.ok);
        assertEquals(result.rows[0]?.count, "0");
      } finally {
        await client.query("DROP TABLE IF EXISTS test_rollback");
        await client.close();
      }
    });

    await t.step("transaction with isolation level", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        const isolation = await client.transaction(
          async (tx) => {
            const result = await tx.query<{ transaction_isolation: string }>(
              "SHOW transaction_isolation",
            );
            if (!result.ok) throw result.error;
            return result.rows[0]?.transaction_isolation;
          },
          { isolationLevel: "serializable" },
        );

        assertEquals(isolation, "serializable");
      } finally {
        await client.close();
      }
    });

    await t.step("transaction returns value", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        const result = await client.transaction(async (tx) => {
          const row = await tx.queryOne<{ value: number }>(
            "SELECT 42 as value",
          );
          return row?.value;
        });

        assertEquals(result, 42);
      } finally {
        await client.close();
      }
    });

    await t.step("constraint error handling - unique violation", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS test_unique (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL
          )
        `);
        await client.query("TRUNCATE TABLE test_unique");

        await client.query(
          "INSERT INTO test_unique (email) VALUES ($1)",
          ["test@example.com"],
        );

        const result = await client.query(
          "INSERT INTO test_unique (email) VALUES ($1)",
          ["test@example.com"],
        );

        assert(!result.ok);
        assertInstanceOf(result.error, ConstraintError);
        assertEquals(result.error.kind, "constraint");
      } finally {
        await client.query("DROP TABLE IF EXISTS test_unique");
        await client.close();
      }
    });

    await t.step("syntax error handling", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        const result = await client.query("SELEC 1");

        assert(!result.ok);
        assertInstanceOf(result.error, QuerySyntaxError);
        assertEquals(result.error.kind, "query");
      } finally {
        await client.close();
      }
    });

    await t.step("AsyncDisposable - await using syntax", async () => {
      let clientRef: PostgresClient | null = null;

      {
        await using client = await createPostgresClient({
          url: CONNECTION_STRING,
        });

        clientRef = client;

        const result = await client.query<{ value: number }>(
          "SELECT 42 as value",
        );
        assert(result.ok);
        assertEquals(result.rows[0]?.value, 42);
      }

      // After exiting the block, the client should be closed
      // Attempting to query should return Failure
      const result = await clientRef!.query("SELECT 1");
      assert(!result.ok);
      assert(!result.processed);
      assertEquals(result.error.message, "Client is closed");
    });

    await t.step("multiple queries in sequence", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        const results = await Promise.all([
          client.query<{ n: number }>("SELECT 1 as n"),
          client.query<{ n: number }>("SELECT 2 as n"),
          client.query<{ n: number }>("SELECT 3 as n"),
        ]);

        assert(results[0].ok);
        assert(results[1].ok);
        assert(results[2].ok);
        assertEquals(results[0].rows[0]?.n, 1);
        assertEquals(results[1].rows[0]?.n, 2);
        assertEquals(results[2].rows[0]?.n, 3);
      } finally {
        await client.close();
      }
    });

    await t.step("result metadata includes duration", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        const result = await client.query("SELECT pg_sleep(0.01)");

        assert(result.ok);
        assertEquals(typeof result.duration, "number");
        // Duration should be at least 10ms (we slept for 10ms)
        assertEquals(result.duration >= 10, true);
      } finally {
        await client.close();
      }
    });

    await t.step("url config object", async () => {
      const client = await createPostgresClient({
        url: {
          host: "localhost",
          port: 15432,
          database: "testdb",
          username: "testuser",
          password: "testpassword",
        },
      });

      try {
        const result = await client.query<{ value: number }>(
          "SELECT 1 as value",
        );
        assert(result.ok);
        assertEquals(result.rows[0]?.value, 1);
      } finally {
        await client.close();
      }
    });

    await t.step("pool configuration", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
        pool: {
          max: 5,
          idleTimeout: 10000,
          connectTimeout: 5000,
        },
      });

      try {
        const result = await client.query<{ value: number }>(
          "SELECT 1 as value",
        );
        assert(result.ok);
        assertEquals(result.rows[0]?.value, 1);
      } finally {
        await client.close();
      }
    });

    await t.step("application name", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
        applicationName: "test-app",
      });

      try {
        const result = await client.query<{ application_name: string }>(
          "SELECT current_setting('application_name') as application_name",
        );
        assert(result.ok);
        assertEquals(result.rows[0]?.application_name, "test-app");
      } finally {
        await client.close();
      }
    });

    await t.step("notify sends notification", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        // Just test that notify doesn't throw
        await client.notify("test_channel", "test payload");
      } finally {
        await client.close();
      }
    });

    await t.step("copyTo returns query results as arrays", async () => {
      const client = await createPostgresClient({
        url: CONNECTION_STRING,
      });

      try {
        const rows: unknown[][] = [];
        for await (const row of client.copyTo("SELECT 1 as a, 2 as b")) {
          rows.push(row);
        }

        assertEquals(rows.length, 1);
        assertEquals(rows[0], [1, 2]);
      } finally {
        await client.close();
      }
    });
  },
});
