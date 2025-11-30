import { assertEquals, assertThrows } from "@std/assert";
import { expectGraphqlResponse } from "./expect.ts";
import { createGraphqlResponse } from "./response.ts";
import type { GraphqlResponse } from "./types.ts";

function createMockResponse<T>(
  overrides: Partial<{
    data: T | null;
    errors: { message: string }[] | null;
    extensions: Record<string, unknown>;
    duration: number;
    status: number;
  }> = {},
): GraphqlResponse<T> {
  return createGraphqlResponse({
    data: overrides.data ?? null,
    errors: overrides.errors ?? null,
    extensions: overrides.extensions,
    duration: overrides.duration ?? 100,
    status: overrides.status ?? 200,
    raw: new Response(),
  });
}

Deno.test("expectGraphqlResponse.ok()", async (t) => {
  await t.step("passes when no errors", () => {
    const response = createMockResponse({ data: { test: true }, errors: null });
    expectGraphqlResponse(response).ok();
  });

  await t.step("passes when errors is empty array", () => {
    const response = createMockResponse({ data: { test: true }, errors: [] });
    expectGraphqlResponse(response).ok();
  });

  await t.step("throws when errors present", () => {
    const response = createMockResponse({
      errors: [{ message: "Error" }],
    });
    assertThrows(
      () => expectGraphqlResponse(response).ok(),
      Error,
      "Expected ok response",
    );
  });
});

Deno.test("expectGraphqlResponse.hasErrors()", async (t) => {
  await t.step("passes when errors present", () => {
    const response = createMockResponse({
      errors: [{ message: "Error" }],
    });
    expectGraphqlResponse(response).hasErrors();
  });

  await t.step("throws when no errors", () => {
    const response = createMockResponse({ data: { test: true }, errors: null });
    assertThrows(
      () => expectGraphqlResponse(response).hasErrors(),
      Error,
      "Expected response with errors",
    );
  });

  await t.step("throws when errors is empty array", () => {
    const response = createMockResponse({ data: { test: true }, errors: [] });
    assertThrows(() => expectGraphqlResponse(response).hasErrors());
  });
});

Deno.test("expectGraphqlResponse.errorCount()", async (t) => {
  await t.step("passes when count matches", () => {
    const response = createMockResponse({
      errors: [{ message: "Error 1" }, { message: "Error 2" }],
    });
    expectGraphqlResponse(response).errorCount(2);
  });

  await t.step("passes when count is 0 and no errors", () => {
    const response = createMockResponse({ data: { test: true }, errors: null });
    expectGraphqlResponse(response).errorCount(0);
  });

  await t.step("throws when count does not match", () => {
    const response = createMockResponse({
      errors: [{ message: "Error" }],
    });
    assertThrows(
      () => expectGraphqlResponse(response).errorCount(2),
      Error,
      "Expected 2 errors, got 1",
    );
  });
});

Deno.test("expectGraphqlResponse.errorContains()", async (t) => {
  await t.step("passes when error contains message", () => {
    const response = createMockResponse({
      errors: [{ message: "User not found" }],
    });
    expectGraphqlResponse(response).errorContains("not found");
  });

  await t.step("passes when any error contains message", () => {
    const response = createMockResponse({
      errors: [
        { message: "First error" },
        { message: "User not found" },
      ],
    });
    expectGraphqlResponse(response).errorContains("not found");
  });

  await t.step("throws when no error contains message", () => {
    const response = createMockResponse({
      errors: [{ message: "Something else" }],
    });
    assertThrows(
      () => expectGraphqlResponse(response).errorContains("not found"),
      Error,
      'Expected an error containing "not found"',
    );
  });

  await t.step("throws when no errors", () => {
    const response = createMockResponse({ data: { test: true }, errors: null });
    assertThrows(
      () => expectGraphqlResponse(response).errorContains("error"),
      Error,
      "no errors present",
    );
  });
});

Deno.test("expectGraphqlResponse.errorMatch()", async (t) => {
  await t.step("passes matcher function to errors", () => {
    const response = createMockResponse({
      errors: [{ message: "Error 1" }, { message: "Error 2" }],
    });
    expectGraphqlResponse(response).errorMatch((errors) => {
      assertEquals(errors.length, 2);
      assertEquals(errors[0].message, "Error 1");
    });
  });

  await t.step("throws when no errors", () => {
    const response = createMockResponse({ data: { test: true }, errors: null });
    assertThrows(
      () => expectGraphqlResponse(response).errorMatch(() => {}),
      Error,
      "Cannot match errors",
    );
  });
});

Deno.test("expectGraphqlResponse.dataContains()", async (t) => {
  await t.step("passes when data contains subset", () => {
    const response = createMockResponse({
      data: { user: { id: 1, name: "John", email: "john@example.com" } },
    });
    expectGraphqlResponse(response).dataContains({ user: { id: 1 } });
  });

  await t.step("passes with nested objects", () => {
    const response = createMockResponse({
      data: { user: { profile: { age: 30, city: "NYC" } } },
    });
    expectGraphqlResponse(response).dataContains({
      user: { profile: { age: 30 } },
    });
  });

  await t.step("throws when data does not contain subset", () => {
    const response = createMockResponse({
      data: { user: { id: 1 } },
    });
    assertThrows(
      () => expectGraphqlResponse(response).dataContains({ user: { id: 2 } }),
      Error,
      "Expected data to contain",
    );
  });

  await t.step("throws when data is null", () => {
    const response = createMockResponse({ data: null, errors: null });
    assertThrows(
      () => expectGraphqlResponse(response).dataContains({ test: true }),
      Error,
      "data is null",
    );
  });
});

Deno.test("expectGraphqlResponse.dataMatch()", async (t) => {
  await t.step("passes matcher function to data", () => {
    const response = createMockResponse({
      data: { count: 5 },
    });
    expectGraphqlResponse(response).dataMatch((data: { count: number }) => {
      assertEquals(data.count, 5);
    });
  });

  await t.step("throws when data is null", () => {
    const response = createMockResponse({ data: null, errors: null });
    assertThrows(
      () => expectGraphqlResponse(response).dataMatch(() => {}),
      Error,
      "data is null",
    );
  });
});

Deno.test("expectGraphqlResponse.extensionExists()", async (t) => {
  await t.step("passes when extension exists", () => {
    const response = createMockResponse({
      data: { test: true },
      extensions: { tracing: { duration: 100 } },
    });
    expectGraphqlResponse(response).extensionExists("tracing");
  });

  await t.step("throws when extension does not exist", () => {
    const response = createMockResponse({
      data: { test: true },
      extensions: { other: {} },
    });
    assertThrows(
      () => expectGraphqlResponse(response).extensionExists("tracing"),
      Error,
      'Expected extension "tracing" to exist',
    );
  });

  await t.step("throws when no extensions", () => {
    const response = createMockResponse({ data: { test: true } });
    assertThrows(
      () => expectGraphqlResponse(response).extensionExists("tracing"),
      Error,
      'Expected extension "tracing" to exist',
    );
  });
});

Deno.test("expectGraphqlResponse.extensionMatch()", async (t) => {
  await t.step("passes matcher function to extension value", () => {
    const response = createMockResponse({
      data: { test: true },
      extensions: { tracing: { duration: 100 } },
    });
    expectGraphqlResponse(response).extensionMatch(
      "tracing",
      (value: unknown) => {
        assertEquals(value, { duration: 100 });
      },
    );
  });

  await t.step("throws when extension not found", () => {
    const response = createMockResponse({
      data: { test: true },
      extensions: { other: {} },
    });
    assertThrows(
      () => expectGraphqlResponse(response).extensionMatch("tracing", () => {}),
      Error,
      'Extension "tracing" not found',
    );
  });
});

Deno.test("expectGraphqlResponse.durationLessThan()", async (t) => {
  await t.step("passes when duration is less", () => {
    const response = createMockResponse({ data: null, duration: 50 });
    expectGraphqlResponse(response).durationLessThan(100);
  });

  await t.step("throws when duration is equal", () => {
    const response = createMockResponse({ data: null, duration: 100 });
    assertThrows(
      () => expectGraphqlResponse(response).durationLessThan(100),
      Error,
      "Expected duration < 100ms, got 100ms",
    );
  });

  await t.step("throws when duration is greater", () => {
    const response = createMockResponse({ data: null, duration: 150 });
    assertThrows(
      () => expectGraphqlResponse(response).durationLessThan(100),
      Error,
      "Expected duration < 100ms, got 150ms",
    );
  });
});

Deno.test("expectGraphqlResponse fluent chaining", () => {
  const response = createMockResponse({
    data: { user: { id: 1 } },
    extensions: { tracing: {} },
    duration: 50,
  });

  expectGraphqlResponse(response)
    .ok()
    .dataContains({ user: { id: 1 } })
    .extensionExists("tracing")
    .durationLessThan(100);
});

Deno.test("expectGraphqlResponse.status()", async (t) => {
  await t.step("passes when status matches", () => {
    const response = createMockResponse({ data: null, status: 200 });
    expectGraphqlResponse(response).status(200);
  });

  await t.step("throws when status does not match", () => {
    const response = createMockResponse({ data: null, status: 500 });
    assertThrows(
      () => expectGraphqlResponse(response).status(200),
      Error,
      "Expected status 200, got 500",
    );
  });
});

Deno.test("expectGraphqlResponse.hasData()", async (t) => {
  await t.step("passes when data is not null", () => {
    const response = createMockResponse({ data: { test: true } });
    expectGraphqlResponse(response).hasData();
  });

  await t.step("throws when data is null", () => {
    const response = createMockResponse({ data: null });
    assertThrows(
      () => expectGraphqlResponse(response).hasData(),
      Error,
      "Expected data, but data is null",
    );
  });
});

Deno.test("expectGraphqlResponse.noData()", async (t) => {
  await t.step("passes when data is null", () => {
    const response = createMockResponse({ data: null });
    expectGraphqlResponse(response).noData();
  });

  await t.step("throws when data is not null", () => {
    const response = createMockResponse({ data: { test: true } });
    assertThrows(
      () => expectGraphqlResponse(response).noData(),
      Error,
      "Expected no data, but data exists",
    );
  });
});
