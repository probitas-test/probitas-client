import {
  assert,
  assertEquals,
  assertFalse,
  assertInstanceOf,
} from "@std/assert";
import {
  createSqlQueryResultError,
  createSqlQueryResultFailure,
  createSqlQueryResultSuccess,
  type SqlQueryResult,
} from "./result.ts";
import { QuerySyntaxError, SqlConnectionError } from "./errors.ts";

Deno.test("createSqlQueryResultSuccess", async (t) => {
  await t.step("creates with all properties", () => {
    const result = createSqlQueryResultSuccess({
      rows: [{ id: 1, name: "Alice" }],
      rowCount: 1,
      duration: 10,
      lastInsertId: 1n,
    });

    assert(result.ok);
    assertEquals(result.processed, true);
    assertEquals(result.error, null);
    assertEquals(result.rowCount, 1);
    assertEquals(result.duration, 10);
    assertEquals(result.lastInsertId, 1n);
    assertEquals(result.kind, "sql");
  });

  await t.step("rows is readonly array", () => {
    const result = createSqlQueryResultSuccess({
      rows: [{ id: 1 }, { id: 2 }],
      rowCount: 0,
      duration: 5,
    });

    assertEquals(Array.isArray(result.rows), true);
    assertEquals(result.rows.length, 2);
  });

  await t.step("map() transforms rows", () => {
    const result = createSqlQueryResultSuccess({
      rows: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }],
      rowCount: 0,
      duration: 5,
    });

    const names = result.map((row) => row.name);
    assertEquals(names, ["Alice", "Bob"]);
  });

  await t.step("as() creates class instances", () => {
    class User {
      readonly id: number;
      readonly displayName: string;

      constructor(row: { id: number; name: string }) {
        this.id = row.id;
        this.displayName = `User: ${row.name}`;
      }
    }

    const result = createSqlQueryResultSuccess({
      rows: [{ id: 1, name: "Alice" }],
      rowCount: 0,
      duration: 5,
    });

    const users = result.as(User);
    assertEquals(users.length, 1);
    assertInstanceOf(users[0], User);
    assertEquals(users[0].id, 1);
    assertEquals(users[0].displayName, "User: Alice");
  });

  await t.step("optional properties default to null", () => {
    const result = createSqlQueryResultSuccess({
      rows: [],
      rowCount: 0,
      duration: 0,
    });

    assertEquals(result.lastInsertId, null);
    assertEquals(result.warnings, null);
  });

  await t.step("warnings property", () => {
    const result = createSqlQueryResultSuccess({
      rows: [],
      rowCount: 0,
      duration: 0,
      warnings: ["truncation occurred"],
    });

    assertEquals(result.warnings, ["truncation occurred"]);
  });
});

Deno.test("createSqlQueryResultError", async (t) => {
  await t.step("creates with error", () => {
    const error = new QuerySyntaxError("Syntax error near SELECT");
    const result = createSqlQueryResultError(error, 10);

    assertFalse(result.ok);
    assertEquals(result.processed, true);
    assertEquals(result.error, error);
    assertEquals(result.rowCount, 0);
    assertEquals(result.duration, 10);
    assertEquals(result.kind, "sql");
  });

  await t.step("rows is empty array", () => {
    const error = new QuerySyntaxError("Syntax error");
    const result = createSqlQueryResultError(error, 5);

    assertEquals(Array.isArray(result.rows), true);
    assertEquals(result.rows.length, 0);
  });

  await t.step("map() returns empty array", () => {
    const error = new QuerySyntaxError("Syntax error");
    const result = createSqlQueryResultError<{ id: number }>(error, 5);

    const mapped = result.map((row) => row.id);
    assertEquals(mapped, []);
  });

  await t.step("as() returns empty array", () => {
    class User {
      constructor(_row: { id: number }) {}
    }

    const error = new QuerySyntaxError("Syntax error");
    const result = createSqlQueryResultError<{ id: number }>(error, 5);

    const users = result.as(User);
    assertEquals(users, []);
  });
});

Deno.test("createSqlQueryResultFailure", async (t) => {
  await t.step("creates with connection error", () => {
    const error = new SqlConnectionError("Connection refused");
    const result = createSqlQueryResultFailure(error, 100);

    assertFalse(result.ok);
    assertEquals(result.processed, false);
    assertEquals(result.error, error);
    assertEquals(result.rows, null);
    assertEquals(result.rowCount, null);
    assertEquals(result.duration, 100);
    assertEquals(result.kind, "sql");
  });

  await t.step("map() returns empty array", () => {
    const error = new SqlConnectionError("Connection refused");
    const result = createSqlQueryResultFailure<{ id: number }>(error, 100);

    const mapped = result.map((row) => row.id);
    assertEquals(mapped, []);
  });

  await t.step("as() returns empty array", () => {
    class User {
      constructor(_row: { id: number }) {}
    }

    const error = new SqlConnectionError("Connection refused");
    const result = createSqlQueryResultFailure<{ id: number }>(error, 100);

    const users = result.as(User);
    assertEquals(users, []);
  });
});

Deno.test("SqlQueryResult type narrowing", async (t) => {
  await t.step("narrows by ok property", () => {
    const successResult: SqlQueryResult<{ id: number }> =
      createSqlQueryResultSuccess({
        rows: [{ id: 1 }],
        rowCount: 1,
        duration: 10,
      });

    if (successResult.ok) {
      // TypeScript knows this is SqlQueryResultSuccess
      assertEquals(successResult.rows[0], { id: 1 });
    }

    const errorResult: SqlQueryResult<{ id: number }> =
      createSqlQueryResultError(
        new QuerySyntaxError("Syntax error"),
        10,
      );

    if (!errorResult.ok) {
      // TypeScript knows this is SqlQueryResultError | SqlQueryResultFailure
      assertEquals(errorResult.error.message, "Syntax error");
    }
  });

  await t.step("narrows by processed property", () => {
    const failureResult: SqlQueryResult<{ id: number }> =
      createSqlQueryResultFailure(
        new SqlConnectionError("Connection refused"),
        100,
      );

    if (!failureResult.processed) {
      // TypeScript knows this is SqlQueryResultFailure
      assertEquals(failureResult.rows, null);
      assertEquals(failureResult.rowCount, null);
    }

    const successResult: SqlQueryResult<{ id: number }> =
      createSqlQueryResultSuccess({
        rows: [{ id: 1 }],
        rowCount: 1,
        duration: 10,
      });

    if (successResult.processed) {
      // TypeScript knows this is SqlQueryResultSuccess | SqlQueryResultError
      assertEquals(typeof successResult.rowCount, "number");
    }
  });
});
