import { assertEquals, assertInstanceOf } from "@std/assert";
import { SqlError } from "@probitas/client-sql";
import {
  BusyError,
  convertSqliteError,
  DatabaseLockedError,
  ReadonlyDatabaseError,
  SqliteError,
} from "./errors.ts";

Deno.test("SqliteError", async (t) => {
  await t.step("extends SqlError", () => {
    const error = new SqliteError("test error");
    assertInstanceOf(error, SqlError);
    assertInstanceOf(error, Error);
  });

  await t.step("has correct properties", () => {
    const error = new SqliteError("test error", {
      extendedCode: 2067,
    });

    assertEquals(error.name, "SqliteError");
    assertEquals(error.message, "test error");
    assertEquals(error.kind, "unknown");
    assertEquals(error.extendedCode, 2067);
  });

  await t.step("supports error chaining", () => {
    const cause = new Error("original error");
    const error = new SqliteError("wrapped", { cause });

    assertEquals(error.cause, cause);
  });
});

Deno.test("DatabaseLockedError", async (t) => {
  await t.step("extends SqliteError with database_locked sqliteKind", () => {
    const error = new DatabaseLockedError("database is locked", {
      extendedCode: 6,
    });

    assertInstanceOf(error, SqliteError);
    assertEquals(error.name, "DatabaseLockedError");
    assertEquals(error.sqliteKind, "database_locked");
    assertEquals(error.extendedCode, 6);
  });
});

Deno.test("ReadonlyDatabaseError", async (t) => {
  await t.step("extends SqliteError with readonly sqliteKind", () => {
    const error = new ReadonlyDatabaseError(
      "attempt to write a readonly database",
    );

    assertInstanceOf(error, SqliteError);
    assertEquals(error.name, "ReadonlyDatabaseError");
    assertEquals(error.sqliteKind, "readonly");
  });
});

Deno.test("BusyError", async (t) => {
  await t.step("extends SqliteError with busy sqliteKind", () => {
    const error = new BusyError("database is busy");

    assertInstanceOf(error, SqliteError);
    assertEquals(error.name, "BusyError");
    assertEquals(error.sqliteKind, "busy");
  });
});

Deno.test("convertSqliteError", async (t) => {
  await t.step("handles non-Error values", () => {
    const error = convertSqliteError("string error");

    assertInstanceOf(error, SqliteError);
    assertEquals(error.message, "string error");
    assertEquals(error.kind, "unknown");
  });

  await t.step("converts 'database is busy' message to BusyError", () => {
    const sqliteError = new Error("database is busy");

    const error = convertSqliteError(sqliteError);

    assertInstanceOf(error, BusyError);
    assertEquals((error as BusyError).sqliteKind, "busy");
  });

  await t.step("converts 'database is locked' message to DeadlockError", () => {
    const sqliteError = new Error("database table is locked");

    const error = convertSqliteError(sqliteError);

    assertEquals(error.kind, "deadlock");
  });

  await t.step(
    "converts readonly database message to ReadonlyDatabaseError",
    () => {
      const sqliteError = new Error("attempt to write a readonly database");

      const error = convertSqliteError(sqliteError);

      assertInstanceOf(error, ReadonlyDatabaseError);
      assertEquals((error as ReadonlyDatabaseError).sqliteKind, "readonly");
    },
  );

  await t.step(
    "converts UNIQUE constraint failed message to ConstraintError",
    () => {
      const sqliteError = new Error("UNIQUE constraint failed: users.email");

      const error = convertSqliteError(sqliteError);

      assertEquals(error.kind, "constraint");
    },
  );

  await t.step(
    "converts constraint message with code to ConstraintError",
    () => {
      const sqliteError = Object.assign(
        new Error("UNIQUE constraint failed"),
        {
          code: 2067,
        },
      );

      const error = convertSqliteError(sqliteError);

      assertEquals(error.kind, "constraint");
    },
  );

  await t.step("converts syntax error message to QuerySyntaxError", () => {
    const sqliteError = new Error('near "SELEC": syntax error');

    const error = convertSqliteError(sqliteError);

    assertEquals(error.kind, "query");
  });

  await t.step("converts 'no such table' to QuerySyntaxError", () => {
    const sqliteError = new Error("no such table: users");

    const error = convertSqliteError(sqliteError);

    assertEquals(error.kind, "query");
  });

  await t.step("preserves cause in converted error", () => {
    const originalError = new Error("UNIQUE constraint failed: test.code");

    const error = convertSqliteError(originalError);

    assertEquals(error.cause, originalError);
  });

  await t.step("handles errors with code property", () => {
    const sqliteError = Object.assign(new Error("some sqlite error"), {
      code: 5,
    });

    const error = convertSqliteError(sqliteError);

    assertInstanceOf(error, BusyError);
    assertEquals(error.extendedCode, 5);
  });
});
