/**
 * Integration tests for MySqlClient.
 *
 * Run with:
 *   docker compose up -d mysql
 *   deno test -A packages/probitas-client-sql-mysql/integration_test.ts
 *   docker compose down
 */

import {
  assertEquals,
  assertExists,
  assertGreaterOrEqual,
  assertLess,
  assertRejects,
} from "@std/assert";
import { createMySqlClient, type MySqlClient } from "./client.ts";
import type { MySqlConnectionConfig } from "./types.ts";

const MYSQL_HOST = Deno.env.get("MYSQL_HOST") ?? "localhost";
const MYSQL_PORT = parseInt(Deno.env.get("MYSQL_PORT") ?? "13306", 10);
const MYSQL_USER = Deno.env.get("MYSQL_USER") ?? "testuser";
const MYSQL_PASSWORD = Deno.env.get("MYSQL_PASSWORD") ?? "testpassword";
const MYSQL_DATABASE = Deno.env.get("MYSQL_DATABASE") ?? "testdb";

const connectionConfig: MySqlConnectionConfig = {
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  username: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
};

async function isMySqlServerAvailable(): Promise<boolean> {
  try {
    const conn = await Deno.connect({
      hostname: MYSQL_HOST,
      port: MYSQL_PORT,
    });
    conn.close();
    return true;
  } catch {
    return false;
  }
}

async function createTestClient(): Promise<MySqlClient> {
  return await createMySqlClient({ url: connectionConfig });
}

Deno.test({
  name: "Integration: MySQL",
  ignore: !(await isMySqlServerAvailable()),
  async fn(t) {
    await t.step("basic query - SELECT 1", async () => {
      const client = await createTestClient();

      try {
        const result = await client.query<{ result: number }>(
          "SELECT 1 as result",
        );

        assertEquals(result.ok, true);
        assertEquals(result.rows.length, 1);

        assertEquals(result.rows.first()?.result, 1);
      } finally {
        await client.close();
      }
    });

    await t.step("dialect property", async () => {
      await using client = await createTestClient();
      assertEquals(client.dialect, "mysql");
    });

    await t.step("connection URL format", async () => {
      const connectionUrl =
        `mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}`;
      await using client = await createMySqlClient({ url: connectionUrl });

      const result = await client.query<{ result: number }>(
        "SELECT 1 as result",
      );

      assertEquals(result.ok, true);
      assertEquals(result.rows.length, 1);
    });

    await t.step("using with statement (AsyncDisposable)", async () => {
      await using client = await createTestClient();

      const result = await client.query<{ now: Date }>("SELECT NOW() as now");

      assertEquals(result.ok, true);
      assertEquals(result.rows.length, 1);
    });

    await t.step("parameterized query", async () => {
      await using client = await createTestClient();

      const result = await client.query<{ sum: number }>(
        "SELECT ? + ? as sum",
        [10, 20],
      );

      assertEquals(result.ok, true);
      assertEquals(result.rows.length, 1);

      assertEquals(result.rows.first()?.sum, 30);
    });

    await t.step("queryOne returns first row", async () => {
      await using client = await createTestClient();

      const row = await client.queryOne<{ value: string }>(
        "SELECT 'hello' as value",
      );

      assertEquals(row?.value, "hello");
    });

    await t.step("queryOne returns undefined for no results", async () => {
      await using client = await createTestClient();

      const row = await client.queryOne<{ value: number }>(
        "SELECT * FROM (SELECT 1 as value) t WHERE value = 0",
      );

      assertEquals(row, undefined);
    });

    await t.step("CREATE TABLE, INSERT, SELECT, DROP", async () => {
      await using client = await createTestClient();

      // Create table
      await client.query(`
        CREATE TABLE IF NOT EXISTS test_users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE
        )
      `);

      try {
        // Insert
        const insertResult = await client.query(
          "INSERT INTO test_users (name, email) VALUES (?, ?)",
          ["Alice", "alice@example.com"],
        );

        assertEquals(insertResult.ok, true);
        assertEquals(insertResult.rowCount, 1);
        assertExists(insertResult.lastInsertId);

        // Select
        const selectResult = await client.query<{
          id: number;
          name: string;
          email: string;
        }>(
          "SELECT * FROM test_users WHERE name = ?",
          ["Alice"],
        );

        assertEquals(selectResult.ok, true);
        assertEquals(selectResult.rows.length, 1);

        assertEquals(selectResult.rows.first()?.name, "Alice");
        assertEquals(selectResult.rows.first()?.email, "alice@example.com");
      } finally {
        // Drop table
        await client.query("DROP TABLE IF EXISTS test_users");
      }
    });

    await t.step("transaction helper with auto-commit", async () => {
      await using client = await createTestClient();

      await client.query(`
        CREATE TABLE IF NOT EXISTS test_tx_helper (
          id INT AUTO_INCREMENT PRIMARY KEY,
          value VARCHAR(100)
        )
      `);

      try {
        const lastInsertId = await client.transaction(async (tx) => {
          const result = await tx.query(
            "INSERT INTO test_tx_helper (value) VALUES (?)",
            ["auto-committed"],
          );
          return result.lastInsertId;
        });

        assertEquals(typeof lastInsertId, "bigint");

        const result = await client.query<{ value: string }>(
          "SELECT value FROM test_tx_helper WHERE id = ?",
          [lastInsertId],
        );

        assertEquals(result.ok, true);
        assertEquals(result.rows.length, 1);

        assertEquals(result.rows.first()?.value, "auto-committed");
      } finally {
        await client.query("DROP TABLE IF EXISTS test_tx_helper");
      }
    });

    await t.step("transaction helper with auto-rollback on error", async () => {
      await using client = await createTestClient();

      await client.query(`
        CREATE TABLE IF NOT EXISTS test_tx_error (
          id INT AUTO_INCREMENT PRIMARY KEY,
          value VARCHAR(100)
        )
      `);

      try {
        await assertRejects(
          async () => {
            await client.transaction(async (tx) => {
              await tx.query("INSERT INTO test_tx_error (value) VALUES (?)", [
                "will-rollback",
              ]);
              throw new Error("Intentional error");
            });
          },
          Error,
          "Intentional error",
        );

        const result = await client.query<{ value: string }>(
          "SELECT value FROM test_tx_error WHERE value = ?",
          ["will-rollback"],
        );

        assertEquals(result.ok, true);
        assertEquals(result.rows.length, 0);
      } finally {
        await client.query("DROP TABLE IF EXISTS test_tx_error");
      }
    });

    await t.step("transaction with isolation level", async () => {
      await using client = await createTestClient();

      await client.transaction(async (tx) => {
        const result = await tx.query<{ level: string }>(
          "SELECT @@transaction_isolation as level",
        );

        assertEquals(result.rows.first()?.level, "SERIALIZABLE");
      }, { isolationLevel: "serializable" });
    });

    await t.step("result metadata - lastInsertId", async () => {
      await using client = await createTestClient();

      await client.query(`
        CREATE TABLE IF NOT EXISTS test_insert_id (
          id INT AUTO_INCREMENT PRIMARY KEY,
          value VARCHAR(100)
        )
      `);

      try {
        const result = await client.query(
          "INSERT INTO test_insert_id (value) VALUES (?)",
          ["test"],
        );

        assertEquals(result.ok, true);
        assertEquals(result.rowCount, 1);
        assertExists(result.lastInsertId);

        assertEquals(typeof result.lastInsertId, "bigint");
      } finally {
        await client.query("DROP TABLE IF EXISTS test_insert_id");
      }
    });

    await t.step("result transformation - map()", async () => {
      await using client = await createTestClient();

      const result = await client.query<{ n: number }>(
        "SELECT 1 as n UNION SELECT 2 UNION SELECT 3",
      );

      const doubled = result.map((row) => row.n * 2);

      assertEquals(doubled.sort(), [2, 4, 6]);
    });

    await t.step("duration tracking", async () => {
      await using client = await createTestClient();

      const result = await client.query("SELECT SLEEP(0.1)");

      assertEquals(result.ok, true);
      assertLess(result.duration, 1000);

      // Should take at least 100ms due to SLEEP
      assertGreaterOrEqual(result.duration, 100);
    });
  },
});
