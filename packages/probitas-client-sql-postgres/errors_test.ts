import { assertEquals, assertInstanceOf } from "@std/assert";
import {
  ConstraintError,
  DeadlockError,
  QuerySyntaxError,
  SqlError,
} from "@probitas/client-sql";
import { mapPostgresError, type PostgresErrorLike } from "./errors.ts";

Deno.test("mapPostgresError", async (t) => {
  await t.step("maps syntax error (SQLSTATE 42xxx)", async (t) => {
    await t.step("42601 - syntax_error", () => {
      const error = mapPostgresError({
        message: "syntax error at or near SELECT",
        code: "42601",
      });

      assertInstanceOf(error, QuerySyntaxError);
      assertEquals(error.kind, "query");
      assertEquals(error.sqlState, "42601");
      assertEquals(error.message, "syntax error at or near SELECT");
    });

    await t.step("42P01 - undefined_table", () => {
      const error = mapPostgresError({
        message: 'relation "nonexistent" does not exist',
        code: "42P01",
      });

      assertInstanceOf(error, QuerySyntaxError);
      assertEquals(error.kind, "query");
      assertEquals(error.sqlState, "42P01");
    });

    await t.step("42703 - undefined_column", () => {
      const error = mapPostgresError({
        message: 'column "foo" does not exist',
        code: "42703",
      });

      assertInstanceOf(error, QuerySyntaxError);
      assertEquals(error.kind, "query");
      assertEquals(error.sqlState, "42703");
    });
  });

  await t.step("maps constraint violation (SQLSTATE 23xxx)", async (t) => {
    await t.step("23505 - unique_violation", () => {
      const error = mapPostgresError({
        message: 'duplicate key value violates unique constraint "pk_users"',
        code: "23505",
        constraint: "pk_users",
      });

      assertInstanceOf(error, ConstraintError);
      assertEquals(error.kind, "constraint");
      assertEquals(error.sqlState, "23505");
      assertEquals(error.constraint, "pk_users");
    });

    await t.step("23503 - foreign_key_violation", () => {
      const error = mapPostgresError({
        message:
          'insert or update on table "orders" violates foreign key constraint',
        code: "23503",
        constraint: "fk_orders_user",
      });

      assertInstanceOf(error, ConstraintError);
      assertEquals(error.kind, "constraint");
      assertEquals(error.sqlState, "23503");
      assertEquals(error.constraint, "fk_orders_user");
    });

    await t.step("23502 - not_null_violation", () => {
      const error = mapPostgresError({
        message: 'null value in column "name" violates not-null constraint',
        code: "23502",
      });

      assertInstanceOf(error, ConstraintError);
      assertEquals(error.kind, "constraint");
      assertEquals(error.sqlState, "23502");
      assertEquals(error.constraint, "unknown");
    });

    await t.step("23514 - check_violation", () => {
      const error = mapPostgresError({
        message: 'new row for relation "users" violates check constraint',
        code: "23514",
        constraint: "chk_age_positive",
      });

      assertInstanceOf(error, ConstraintError);
      assertEquals(error.kind, "constraint");
      assertEquals(error.constraint, "chk_age_positive");
    });
  });

  await t.step("maps deadlock errors", async (t) => {
    await t.step("40P01 - deadlock_detected", () => {
      const error = mapPostgresError({
        message: "deadlock detected",
        code: "40P01",
      });

      assertInstanceOf(error, DeadlockError);
      assertEquals(error.kind, "deadlock");
      assertEquals(error.sqlState, "40P01");
    });

    await t.step("40001 - serialization_failure", () => {
      const error = mapPostgresError({
        message: "could not serialize access due to concurrent update",
        code: "40001",
      });

      assertInstanceOf(error, DeadlockError);
      assertEquals(error.kind, "deadlock");
      assertEquals(error.sqlState, "40001");
    });
  });

  await t.step("maps other transaction rollback to SqlError", () => {
    const error = mapPostgresError({
      message: "transaction_rollback",
      code: "40000",
    });

    assertInstanceOf(error, SqlError);
    assertEquals(error.kind, "unknown");
    assertEquals(error.sqlState, "40000");
  });

  await t.step(
    "maps unknown errors to SqlError with kind unknown",
    async (t) => {
      await t.step("unrecognized SQLSTATE", () => {
        const error = mapPostgresError({
          message: "some internal error",
          code: "XX000",
        });

        assertInstanceOf(error, SqlError);
        assertEquals(error.kind, "unknown");
        assertEquals(error.sqlState, "XX000");
      });

      await t.step("error without code", () => {
        const error = mapPostgresError({
          message: "connection lost",
        });

        assertInstanceOf(error, SqlError);
        assertEquals(error.kind, "unknown");
        assertEquals(error.sqlState, undefined);
      });
    },
  );

  await t.step("preserves original error as cause", () => {
    const originalError: PostgresErrorLike = {
      message: "test error",
      code: "42601",
    };

    const error = mapPostgresError(originalError);

    assertEquals(error.cause, originalError);
  });

  await t.step("preserves error message", () => {
    const message = "very specific error message with details";
    const error = mapPostgresError({
      message,
      code: "42601",
    });

    assertEquals(error.message, message);
  });
});
