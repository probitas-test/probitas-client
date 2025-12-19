import { assertEquals, assertInstanceOf } from "@std/assert";
import { SqlQueryResult } from "./result.ts";
import { SqlRows } from "./rows.ts";

Deno.test("SqlQueryResult", async (t) => {
  await t.step("creates with all properties", () => {
    const result = new SqlQueryResult({
      ok: true,
      rows: [{ id: 1, name: "Alice" }],
      rowCount: 1,
      duration: 10,
      lastInsertId: 1n,
    });

    assertEquals(result.ok, true);
    assertEquals(result.rowCount, 1);
    assertEquals(result.duration, 10);
    assertEquals(result.lastInsertId, 1n);
  });

  await t.step("rows is SqlRows instance", () => {
    const result = new SqlQueryResult({
      ok: true,
      rows: [{ id: 1 }, { id: 2 }],
      rowCount: 0,
      duration: 5,
    });

    assertInstanceOf(result.rows, SqlRows);
    assertEquals(result.rows.length, 2);
  });

  await t.step("rows has first/last methods", () => {
    const result = new SqlQueryResult({
      ok: true,
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
      rowCount: 0,
      duration: 5,
    });

    assertEquals(result.rows.first(), { id: 1 });
    assertEquals(result.rows.last(), { id: 3 });
  });

  await t.step("map() transforms rows", () => {
    const result = new SqlQueryResult({
      ok: true,
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

    const result = new SqlQueryResult({
      ok: true,
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

  await t.step("optional properties default to undefined", () => {
    const result = new SqlQueryResult({
      ok: true,
      rows: [],
      rowCount: 0,
      duration: 0,
    });

    assertEquals(result.lastInsertId, undefined);
    assertEquals(result.warnings, undefined);
  });

  await t.step("warnings property", () => {
    const result = new SqlQueryResult({
      ok: true,
      rows: [],
      rowCount: 0,
      duration: 0,
      warnings: ["truncation occurred"],
    });

    assertEquals(result.warnings, ["truncation occurred"]);
  });
});
