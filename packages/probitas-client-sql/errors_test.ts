import { assertEquals, assertInstanceOf } from "@std/assert";
import { ClientError } from "@probitas/client";
import {
  ConstraintError,
  DeadlockError,
  QuerySyntaxError,
  SqlConnectionError,
  SqlError,
} from "./errors.ts";

Deno.test("SqlError", async (t) => {
  await t.step("extends ClientError", () => {
    const error = new SqlError("SQL error", "unknown");
    assertInstanceOf(error, ClientError);
    assertInstanceOf(error, Error);
  });

  await t.step("has correct name and kind", () => {
    const error = new SqlError("SQL error", "query");
    assertEquals(error.name, "SqlError");
    assertEquals(error.kind, "query");
    assertEquals(error.message, "SQL error");
  });

  await t.step("sqlState defaults to null", () => {
    const error = new SqlError("SQL error", "query");
    assertEquals(error.sqlState, null);
  });

  await t.step("accepts sqlState", () => {
    const error = new SqlError("Unique violation", "constraint", {
      sqlState: "23505",
    });
    assertEquals(error.sqlState, "23505");
  });

  await t.step("supports cause option", () => {
    const cause = new Error("Original error");
    const error = new SqlError("SQL error", "unknown", { cause });
    assertEquals(error.cause, cause);
  });

  await t.step("supports both sqlState and cause", () => {
    const cause = new Error("Original error");
    const error = new SqlError("SQL error", "constraint", {
      sqlState: "23505",
      cause,
    });
    assertEquals(error.sqlState, "23505");
    assertEquals(error.cause, cause);
  });
});

Deno.test("QuerySyntaxError", async (t) => {
  await t.step("extends SqlError and ClientError", () => {
    const error = new QuerySyntaxError("Syntax error near SELECT");
    assertInstanceOf(error, SqlError);
    assertInstanceOf(error, ClientError);
    assertInstanceOf(error, Error);
  });

  await t.step("has correct name and kind", () => {
    const error = new QuerySyntaxError("Syntax error");
    assertEquals(error.name, "QuerySyntaxError");
    assertEquals(error.kind, "query");
  });

  await t.step("accepts sqlState", () => {
    const error = new QuerySyntaxError("Syntax error", { sqlState: "42601" });
    assertEquals(error.sqlState, "42601");
  });
});

Deno.test("ConstraintError", async (t) => {
  await t.step("extends SqlError and ClientError", () => {
    const error = new ConstraintError("Unique violation", "users_email_key");
    assertInstanceOf(error, SqlError);
    assertInstanceOf(error, ClientError);
    assertInstanceOf(error, Error);
  });

  await t.step("has correct name and kind", () => {
    const error = new ConstraintError("Unique violation", "users_email_key");
    assertEquals(error.name, "ConstraintError");
    assertEquals(error.kind, "constraint");
  });

  await t.step("has constraint property", () => {
    const error = new ConstraintError("Unique violation", "users_email_key");
    assertEquals(error.constraint, "users_email_key");
  });

  await t.step("accepts sqlState", () => {
    const error = new ConstraintError("Unique violation", "users_email_key", {
      sqlState: "23505",
    });
    assertEquals(error.sqlState, "23505");
  });
});

Deno.test("DeadlockError", async (t) => {
  await t.step("extends SqlError and ClientError", () => {
    const error = new DeadlockError("Deadlock detected");
    assertInstanceOf(error, SqlError);
    assertInstanceOf(error, ClientError);
    assertInstanceOf(error, Error);
  });

  await t.step("has correct name and kind", () => {
    const error = new DeadlockError("Deadlock detected");
    assertEquals(error.name, "DeadlockError");
    assertEquals(error.kind, "deadlock");
  });

  await t.step("accepts sqlState", () => {
    const error = new DeadlockError("Deadlock detected", { sqlState: "40P01" });
    assertEquals(error.sqlState, "40P01");
  });
});

Deno.test("SqlConnectionError", async (t) => {
  await t.step("extends SqlError and ClientError", () => {
    const error = new SqlConnectionError("Connection refused");
    assertInstanceOf(error, SqlError);
    assertInstanceOf(error, ClientError);
    assertInstanceOf(error, Error);
  });

  await t.step("has correct name and kind", () => {
    const error = new SqlConnectionError("Connection refused");
    assertEquals(error.name, "SqlConnectionError");
    assertEquals(error.kind, "connection");
  });

  await t.step("accepts sqlState", () => {
    const error = new SqlConnectionError("Connection timeout", {
      sqlState: "08006",
    });
    assertEquals(error.sqlState, "08006");
  });

  await t.step("supports cause option", () => {
    const cause = new Error("ECONNREFUSED");
    const error = new SqlConnectionError("Connection refused", { cause });
    assertEquals(error.cause, cause);
  });
});
