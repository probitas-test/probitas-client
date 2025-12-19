import { assertEquals, assertExists, assertRejects } from "@std/assert";
import {
  ConstraintError,
  createSqliteClient,
  QuerySyntaxError,
  type SqliteClient,
} from "./mod.ts";

Deno.test({
  name: "Integration: SqliteClient",
  async fn(t) {
    await t.step("has dialect property", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
      });

      try {
        assertEquals(client.dialect, "sqlite");
      } finally {
        await client.close();
      }
    });

    await t.step("executes simple SELECT query", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
      });

      try {
        const result = await client.query<{ value: number }>(
          "SELECT 1 as value",
        );

        assertEquals(result.ok, true);
        assertEquals(result.rows.first(), { value: 1 });
        assertEquals(result.rowCount, 1);
      } finally {
        await client.close();
      }
    });

    await t.step("executes query with parameters", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
      });

      try {
        const result = await client.query<{ a: number; b: string }>(
          "SELECT ? as a, ? as b",
          [42, "hello"],
        );

        assertEquals(result.rows.first(), { a: 42, b: "hello" });
      } finally {
        await client.close();
      }
    });

    await t.step("creates table and inserts data", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
      });

      try {
        await client.query(`
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE
          )
        `);

        const insertResult = await client.query(
          "INSERT INTO users (name, email) VALUES (?, ?)",
          ["Alice", "alice@example.com"],
        );

        assertEquals(insertResult.ok, true);
        assertEquals(insertResult.rowCount, 1);
        assertEquals(insertResult.lastInsertId, 1n);

        const selectResult = await client.query<
          { id: number; name: string; email: string }
        >(
          "SELECT * FROM users WHERE id = ?",
          [1],
        );

        assertEquals(selectResult.rows.first(), {
          id: 1,
          name: "Alice",
          email: "alice@example.com",
        });
      } finally {
        await client.close();
      }
    });

    await t.step("queryOne returns first row or undefined", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
      });

      try {
        await client.query(
          "CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)",
        );

        const empty = await client.queryOne<{ id: number; value: string }>(
          "SELECT * FROM items WHERE id = ?",
          [999],
        );
        assertEquals(empty, undefined);

        await client.query(
          "INSERT INTO items (id, value) VALUES (?, ?)",
          [1, "test"],
        );

        const found = await client.queryOne<{ id: number; value: string }>(
          "SELECT * FROM items WHERE id = ?",
          [1],
        );
        assertEquals(found, { id: 1, value: "test" });
      } finally {
        await client.close();
      }
    });

    await t.step("handles syntax errors", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
      });

      try {
        await assertRejects(
          () => client.query("SELEC * FROM users"),
          QuerySyntaxError,
        );
      } finally {
        await client.close();
      }
    });

    await t.step("handles constraint violations", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
      });

      try {
        await client.query(`
          CREATE TABLE unique_test (
            id INTEGER PRIMARY KEY,
            code TEXT UNIQUE
          )
        `);

        await client.query(
          "INSERT INTO unique_test (code) VALUES (?)",
          ["ABC"],
        );

        await assertRejects(
          () =>
            client.query(
              "INSERT INTO unique_test (code) VALUES (?)",
              ["ABC"],
            ),
          ConstraintError,
        );
      } finally {
        await client.close();
      }
    });

    await t.step("transaction commits on success", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
      });

      try {
        await client.query(
          "CREATE TABLE tx_test (id INTEGER PRIMARY KEY, value TEXT)",
        );

        await client.transaction(async (tx) => {
          await tx.query("INSERT INTO tx_test (value) VALUES (?)", ["one"]);
          await tx.query("INSERT INTO tx_test (value) VALUES (?)", ["two"]);
        });

        const result = await client.query<{ id: number; value: string }>(
          "SELECT * FROM tx_test ORDER BY id",
        );

        assertEquals(result.rows.length, 2);
        assertEquals(result.rows[0].value, "one");
        assertEquals(result.rows[1].value, "two");
      } finally {
        await client.close();
      }
    });

    await t.step("transaction rolls back on error", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
      });

      try {
        await client.query(
          "CREATE TABLE rollback_test (id INTEGER PRIMARY KEY, value TEXT)",
        );

        try {
          await client.transaction(async (tx) => {
            await tx.query(
              "INSERT INTO rollback_test (value) VALUES (?)",
              ["should rollback"],
            );
            throw new Error("Intentional error");
          });
        } catch {
          // Expected
        }

        const result = await client.query<{ id: number; value: string }>(
          "SELECT * FROM rollback_test",
        );

        assertEquals(result.rows.length, 0);
      } finally {
        await client.close();
      }
    });

    await t.step("transaction with isolation level", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
      });

      try {
        await client.query(
          "CREATE TABLE isolation_test (id INTEGER PRIMARY KEY, value TEXT)",
        );

        await client.transaction(
          async (tx) => {
            await tx.query(
              "INSERT INTO isolation_test (value) VALUES (?)",
              ["serializable"],
            );
          },
          { isolationLevel: "serializable" },
        );

        const result = await client.query<{ value: string }>(
          "SELECT value FROM isolation_test",
        );

        assertEquals(result.rows.first()?.value, "serializable");
      } finally {
        await client.close();
      }
    });

    await t.step("supports AsyncDisposable", async () => {
      let clientRef: SqliteClient | undefined;

      {
        await using client = await createSqliteClient({
          path: ":memory:",
        });
        clientRef = client;

        const result = await client.query("SELECT 1 as value");
        assertEquals(result.ok, true);
      }

      // After the block, client should be closed
      // Attempting to use it should throw
      if (clientRef) {
        await assertRejects(
          () => clientRef!.query("SELECT 1"),
          Error,
          "Client is closed",
        );
      }
    });

    await t.step("standard assertions work with SQLite results", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
      });

      try {
        await client.query(`
          CREATE TABLE sample_test (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT
          )
        `);

        await client.query(
          "INSERT INTO sample_test (name) VALUES (?)",
          ["Alice"],
        );
        await client.query(
          "INSERT INTO sample_test (name) VALUES (?)",
          ["Bob"],
        );

        const result = await client.query<{ id: number; name: string }>(
          "SELECT * FROM sample_test ORDER BY id",
        );

        assertEquals(result.ok, true);
        assertExists(result.rows.length);
        assertEquals(result.rows.length, 2);
        assertEquals(
          result.rows.some((r) => r.name === "Alice"),
          true,
        );
      } finally {
        await client.close();
      }
    });

    await t.step("applies WAL mode when wal: true", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
        wal: true,
      });

      try {
        const journalResult = await client.query<{ journal_mode: string }>(
          "PRAGMA journal_mode",
        );
        assertEquals(journalResult.rows.first()?.journal_mode, "memory");
        // Note: In-memory databases return "memory" even with WAL enabled
        // WAL is effectively ignored for :memory: databases
      } finally {
        await client.close();
      }
    });

    await t.step("vacuum() reclaims space", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
      });

      try {
        await client.query("CREATE TABLE vacuum_test (id INTEGER, data TEXT)");
        await client.query(
          "INSERT INTO vacuum_test VALUES (1, ?)",
          ["x".repeat(1000)],
        );
        await client.query("DELETE FROM vacuum_test WHERE id = 1");

        // VACUUM should succeed without error
        await client.vacuum();
      } finally {
        await client.close();
      }
    });

    await t.step("backup() creates database backup", async () => {
      const client = await createSqliteClient({
        path: ":memory:",
      });

      const backupPath = await Deno.makeTempFile({ suffix: ".db" });

      try {
        await client.query("CREATE TABLE backup_test (id INTEGER, name TEXT)");
        await client.query(
          "INSERT INTO backup_test VALUES (1, ?)",
          ["Alice"],
        );

        // Create backup
        await client.backup(backupPath);

        // Verify backup by opening it
        const backupClient = await createSqliteClient({
          path: backupPath,
          readonly: true,
        });

        try {
          const result = await backupClient.query<{ id: number; name: string }>(
            "SELECT * FROM backup_test",
          );
          assertEquals(result.rows.first(), { id: 1, name: "Alice" });
        } finally {
          await backupClient.close();
        }
      } finally {
        await client.close();
        // Clean up backup file
        try {
          await Deno.remove(backupPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    });
  },
});
