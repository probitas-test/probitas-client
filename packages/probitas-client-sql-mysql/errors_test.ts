import { assertEquals, assertInstanceOf } from "@std/assert";
import { SqlConnectionError, SqlError } from "@probitas/client-sql";
import {
  AccessDeniedError,
  ConnectionRefusedError,
  convertMySqlError,
  MySqlError,
} from "./errors.ts";

Deno.test("MySqlError", async (t) => {
  await t.step("extends SqlError", () => {
    const error = new MySqlError("test error");
    assertInstanceOf(error, SqlError);
    assertInstanceOf(error, Error);
  });

  await t.step("has correct properties", () => {
    const error = new MySqlError("test error", {
      errno: 1064,
      sqlState: "42000",
    });

    assertEquals(error.name, "MySqlError");
    assertEquals(error.message, "test error");
    assertEquals(error.kind, "unknown");
    assertEquals(error.errno, 1064);
    assertEquals(error.sqlState, "42000");
  });

  await t.step("supports error chaining", () => {
    const cause = new Error("original error");
    const error = new MySqlError("wrapped", { cause });

    assertEquals(error.cause, cause);
  });
});

Deno.test("AccessDeniedError", async (t) => {
  await t.step("extends MySqlError with access_denied mysqlKind", () => {
    const error = new AccessDeniedError("Access denied for user", {
      errno: 1045,
    });

    assertInstanceOf(error, MySqlError);
    assertEquals(error.name, "AccessDeniedError");
    assertEquals(error.mysqlKind, "access_denied");
    assertEquals(error.errno, 1045);
  });
});

Deno.test("ConnectionRefusedError", async (t) => {
  await t.step("extends MySqlError with connection_refused mysqlKind", () => {
    const error = new ConnectionRefusedError("Connection refused");

    assertInstanceOf(error, MySqlError);
    assertEquals(error.name, "ConnectionRefusedError");
    assertEquals(error.mysqlKind, "connection_refused");
  });
});

Deno.test("convertMySqlError", async (t) => {
  await t.step("handles non-Error values", () => {
    const error = convertMySqlError("string error");

    assertInstanceOf(error, MySqlError);
    assertEquals(error.message, "string error");
    assertEquals(error.kind, "unknown");
  });

  await t.step("converts ECONNREFUSED to SqlConnectionError", () => {
    const mysqlError = Object.assign(new Error("Connection refused"), {
      code: "ECONNREFUSED",
    });

    const error = convertMySqlError(mysqlError);

    // Connection errors return SqlConnectionError for Failure pattern
    assertInstanceOf(error, SqlConnectionError);
  });

  await t.step("converts errno 1045 to SqlConnectionError", () => {
    const mysqlError = Object.assign(
      new Error("Access denied for user 'root'@'localhost'"),
      {
        errno: 1045,
        sqlState: "28000",
      },
    );

    const error = convertMySqlError(mysqlError);

    // Access denied is a connection-level error for Failure pattern
    assertInstanceOf(error, SqlConnectionError);
  });

  await t.step("converts errno 1064 to QuerySyntaxError", () => {
    const mysqlError = Object.assign(
      new Error("You have an error in your SQL syntax"),
      {
        errno: 1064,
        sqlState: "42000",
      },
    );

    const error = convertMySqlError(mysqlError);

    assertEquals(error.kind, "query");
  });

  await t.step("converts errno 1062 to ConstraintError", () => {
    const mysqlError = Object.assign(
      new Error("Duplicate entry 'foo' for key 'PRIMARY'"),
      {
        errno: 1062,
        sqlState: "23000",
      },
    );

    const error = convertMySqlError(mysqlError);

    assertEquals(error.kind, "constraint");
  });

  await t.step("converts errno 1213 to DeadlockError", () => {
    const mysqlError = Object.assign(
      new Error("Deadlock found when trying to get lock"),
      {
        errno: 1213,
        sqlState: "40001",
      },
    );

    const error = convertMySqlError(mysqlError);

    assertEquals(error.kind, "deadlock");
  });

  await t.step("preserves cause in converted error", () => {
    const originalError = Object.assign(new Error("Original"), {
      errno: 1064,
      sqlState: "42000",
    });

    const error = convertMySqlError(originalError);

    assertEquals(error.cause, originalError);
  });
});
