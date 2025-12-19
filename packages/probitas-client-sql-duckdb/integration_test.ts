import { assertEquals, assertRejects } from "@std/assert";

/**
 * Check if DuckDB native library is available.
 * @duckdb/node-api bundles platform binaries (including libduckdb) for common
 * OS/CPU targets, so it usually works without a system install. We still guard
 * with a dynamic import to avoid module load errors on unsupported platforms or
 * when the native library is missing.
 */
async function isDuckDbAvailable(): Promise<boolean> {
  try {
    const { createDuckDbClient } = await import("./mod.ts");
    const client = await createDuckDbClient({});
    await client.close();
    return true;
  } catch {
    return false;
  }
}

const duckDbAvailable = await isDuckDbAvailable();

Deno.test({
  name: "Integration: DuckDbClient",
  ignore: !duckDbAvailable,
  async fn(t) {
    // Dynamic import to avoid module load errors when DuckDB is not available
    const {
      createDuckDbClient,
      QuerySyntaxError,
      ConstraintError,
    } = await import("./mod.ts");
    type DuckDbClient = Awaited<ReturnType<typeof createDuckDbClient>>;

    await t.step("has dialect property", async () => {
      const client = await createDuckDbClient({});

      try {
        assertEquals(client.dialect, "duckdb");
      } finally {
        await client.close();
      }
    });

    await t.step("executes simple SELECT query", async () => {
      const client = await createDuckDbClient({});

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
      const client = await createDuckDbClient({});

      try {
        const result = await client.query<{ a: number; b: string }>(
          "SELECT $1::INTEGER as a, $2::VARCHAR as b",
          [42, "hello"],
        );

        assertEquals(result.rows.first(), { a: 42, b: "hello" });
      } finally {
        await client.close();
      }
    });

    await t.step("creates table and inserts data", async () => {
      const client = await createDuckDbClient({});

      try {
        await client.query(`
          CREATE TABLE users (
            id INTEGER PRIMARY KEY,
            name VARCHAR NOT NULL,
            email VARCHAR UNIQUE
          )
        `);

        const insertResult = await client.query(
          "INSERT INTO users (id, name, email) VALUES ($1, $2, $3)",
          [1, "Alice", "alice@example.com"],
        );

        assertEquals(insertResult.ok, true);

        const selectResult = await client.query<
          { id: number; name: string; email: string }
        >(
          "SELECT * FROM users WHERE id = $1",
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
      const client = await createDuckDbClient({});

      try {
        await client.query(
          "CREATE TABLE items (id INTEGER PRIMARY KEY, value VARCHAR)",
        );

        const empty = await client.queryOne<{ id: number; value: string }>(
          "SELECT * FROM items WHERE id = $1",
          [999],
        );
        assertEquals(empty, undefined);

        await client.query(
          "INSERT INTO items (id, value) VALUES ($1, $2)",
          [1, "test"],
        );

        const found = await client.queryOne<{ id: number; value: string }>(
          "SELECT * FROM items WHERE id = $1",
          [1],
        );
        assertEquals(found, { id: 1, value: "test" });
      } finally {
        await client.close();
      }
    });

    await t.step("handles syntax errors", async () => {
      const client = await createDuckDbClient({});

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
      const client = await createDuckDbClient({});

      try {
        await client.query(`
          CREATE TABLE unique_test (
            id INTEGER PRIMARY KEY,
            code VARCHAR UNIQUE
          )
        `);

        await client.query(
          "INSERT INTO unique_test (id, code) VALUES ($1, $2)",
          [1, "ABC"],
        );

        await assertRejects(
          () =>
            client.query(
              "INSERT INTO unique_test (id, code) VALUES ($1, $2)",
              [2, "ABC"],
            ),
          ConstraintError,
        );
      } finally {
        await client.close();
      }
    });

    await t.step("transaction commits on success", async () => {
      const client = await createDuckDbClient({});

      try {
        await client.query(
          "CREATE TABLE tx_test (id INTEGER PRIMARY KEY, value VARCHAR)",
        );

        await client.transaction(async (tx) => {
          await tx.query("INSERT INTO tx_test (id, value) VALUES ($1, $2)", [
            1,
            "one",
          ]);
          await tx.query("INSERT INTO tx_test (id, value) VALUES ($1, $2)", [
            2,
            "two",
          ]);
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
      const client = await createDuckDbClient({});

      try {
        await client.query(
          "CREATE TABLE rollback_test (id INTEGER PRIMARY KEY, value VARCHAR)",
        );

        try {
          await client.transaction(async (tx) => {
            await tx.query(
              "INSERT INTO rollback_test (id, value) VALUES ($1, $2)",
              [1, "should rollback"],
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

    await t.step("supports AsyncDisposable", async () => {
      let clientRef: DuckDbClient | undefined;

      {
        await using client = await createDuckDbClient({});
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

    await t.step(
      "standard assertions work with DuckDB results",
      async () => {
        const client = await createDuckDbClient({});

        try {
          await client.query(`
            CREATE TABLE sample_test (
              id INTEGER PRIMARY KEY,
              name VARCHAR
            )
          `);

          await client.query(
            "INSERT INTO sample_test (id, name) VALUES ($1, $2)",
            [1, "Alice"],
          );
          await client.query(
            "INSERT INTO sample_test (id, name) VALUES ($1, $2)",
            [2, "Bob"],
          );

          const result = await client.query<{ id: number; name: string }>(
            "SELECT * FROM sample_test ORDER BY id",
          );

          assertEquals(result.ok, true);
          assertEquals(result.rows.length > 0, true);
          assertEquals(result.rows.length, 2);
          assertEquals(
            result.rows.some((r) => r.name === "Alice"),
            true,
          );
        } finally {
          await client.close();
        }
      },
    );

    await t.step("DuckDB specific: analytical queries", async () => {
      const client = await createDuckDbClient({});

      try {
        await client.query(`
          CREATE TABLE sales (
            product VARCHAR,
            amount DECIMAL(10,2),
            date DATE
          )
        `);

        await client.query(
          "INSERT INTO sales VALUES ($1, $2, $3)",
          ["Widget", 100.00, "2024-01-01"],
        );
        await client.query(
          "INSERT INTO sales VALUES ($1, $2, $3)",
          ["Widget", 150.00, "2024-01-02"],
        );
        await client.query(
          "INSERT INTO sales VALUES ($1, $2, $3)",
          ["Gadget", 200.00, "2024-01-01"],
        );

        // DuckDB excels at analytical queries
        const result = await client.query<{ product: string; total: number }>(
          `SELECT product, SUM(amount) as total
           FROM sales
           GROUP BY product
           ORDER BY total DESC`,
        );

        assertEquals(result.rows.length, 2);
        assertEquals(result.rows[0].product, "Widget");
      } finally {
        await client.close();
      }
    });

    await t.step("DuckDB specific: window functions", async () => {
      const client = await createDuckDbClient({});

      try {
        await client.query(`
          CREATE TABLE events (
            id INTEGER,
            category VARCHAR,
            value INTEGER
          )
        `);

        await client.query("INSERT INTO events VALUES (1, 'A', 10)");
        await client.query("INSERT INTO events VALUES (2, 'A', 20)");
        await client.query("INSERT INTO events VALUES (3, 'B', 30)");

        const result = await client.query<{
          id: number;
          category: string;
          value: number;
          running_total: bigint;
        }>(
          `SELECT id, category, value,
                  SUM(value) OVER (PARTITION BY category ORDER BY id) as running_total
           FROM events
           ORDER BY id`,
        );

        assertEquals(result.rows.length, 3);
        assertEquals(result.rows[0].running_total, 10n);
        assertEquals(result.rows[1].running_total, 30n);
      } finally {
        await client.close();
      }
    });

    await t.step("DuckDB specific: queryCsv reads CSV file", async () => {
      const client = await createDuckDbClient({});
      const csvPath = await Deno.makeTempFile({ suffix: ".csv" });

      try {
        // Create a CSV file
        await Deno.writeTextFile(
          csvPath,
          "id,name,value\n1,Alice,100\n2,Bob,200\n",
        );

        const result = await client.queryCsv<{
          id: number;
          name: string;
          value: number;
        }>(csvPath);

        assertEquals(result.ok, true);
        assertEquals(result.rows.length, 2);
        assertEquals(result.rows[0].name, "Alice");
        assertEquals(result.rows[1].name, "Bob");
      } finally {
        await client.close();
        await Deno.remove(csvPath);
      }
    });

    await t.step(
      "DuckDB specific: queryParquet reads Parquet file",
      async () => {
        const client = await createDuckDbClient({});
        const parquetPath = await Deno.makeTempFile({ suffix: ".parquet" });

        try {
          // Create a Parquet file using DuckDB's COPY command
          await client.query(`
          CREATE TABLE parquet_source (id INTEGER, name VARCHAR, value INTEGER)
        `);
          await client.query(
            "INSERT INTO parquet_source VALUES (1, 'Alice', 100)",
          );
          await client.query(
            "INSERT INTO parquet_source VALUES (2, 'Bob', 200)",
          );
          await client.query(
            `COPY parquet_source TO '${
              parquetPath.replace(/'/g, "''")
            }' (FORMAT PARQUET)`,
          );

          const result = await client.queryParquet<{
            id: number;
            name: string;
            value: number;
          }>(parquetPath);

          assertEquals(result.ok, true);
          assertEquals(result.rows.length, 2);
          assertEquals(result.rows[0].name, "Alice");
          assertEquals(result.rows[1].name, "Bob");
        } finally {
          await client.close();
          await Deno.remove(parquetPath);
        }
      },
    );

    await t.step("DuckDB specific: JSON data types", async () => {
      const client = await createDuckDbClient({});

      try {
        await client.query(`
          CREATE TABLE json_test (
            id INTEGER PRIMARY KEY,
            data JSON
          )
        `);

        await client.query(
          "INSERT INTO json_test VALUES ($1, $2::JSON)",
          [1, '{"name": "Alice", "age": 30}'],
        );

        const result = await client.query<{ id: number; data: string }>(
          "SELECT id, data::VARCHAR as data FROM json_test WHERE id = $1",
          [1],
        );

        assertEquals(result.rows.length, 1);
        const parsed = JSON.parse(result.rows[0].data);
        assertEquals(parsed.name, "Alice");
        assertEquals(parsed.age, 30);
      } finally {
        await client.close();
      }
    });

    await t.step(
      "DuckDB specific: CTE (Common Table Expressions)",
      async () => {
        const client = await createDuckDbClient({});

        try {
          const result = await client.query<{
            n: number | bigint;
            factorial: number | bigint;
          }>(`
          WITH RECURSIVE factorial(n, fact) AS (
            SELECT 1, 1
            UNION ALL
            SELECT n + 1, fact * (n + 1)
            FROM factorial
            WHERE n < 5
          )
          SELECT n, fact as factorial FROM factorial
        `);

          assertEquals(result.rows.length, 5);
          // DuckDB may return number or bigint depending on the computation
          assertEquals(Number(result.rows[4].factorial), 120); // 5! = 120
        } finally {
          await client.close();
        }
      },
    );
  },
});
