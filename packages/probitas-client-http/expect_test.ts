import { assertEquals, assertThrows } from "@std/assert";
import { expectHttpResponse } from "./expect.ts";
import type { HttpResponse } from "./types.ts";

function createMockResponse(
  overrides: Partial<HttpResponse> & { body?: Uint8Array | null } = {},
): HttpResponse {
  const hasBodyOverride = "body" in overrides;
  const body = hasBodyOverride
    ? overrides.body
    : new TextEncoder().encode("test body");
  const headers = overrides.headers ??
    new Headers({ "Content-Type": "text/plain" });

  return {
    type: "http" as const,
    ok: overrides.ok ?? true,
    status: overrides.status ?? 200,
    statusText: overrides.statusText ?? "OK",
    headers,
    url: overrides.url ?? "http://localhost/test",
    body: body ?? null,
    duration: overrides.duration ?? 100,
    raw: overrides.raw ?? new Response(),
    arrayBuffer: () => {
      if (!body) return null;
      const buffer = new ArrayBuffer(body.byteLength);
      new Uint8Array(buffer).set(body);
      return buffer;
    },
    blob: () => {
      if (!body) return null;
      const buffer = new ArrayBuffer(body.byteLength);
      new Uint8Array(buffer).set(body);
      return new Blob([buffer]);
    },
    text: () => body ? new TextDecoder().decode(body) : null,
    // deno-lint-ignore no-explicit-any
    json: <T = any>() =>
      body ? JSON.parse(new TextDecoder().decode(body)) as T : null,
  };
}

Deno.test("expectHttpResponse.ok", async (t) => {
  await t.step("passes for 2xx status", () => {
    const response = createMockResponse({ ok: true, status: 200 });
    expectHttpResponse(response).ok();
  });

  await t.step("throws for non-2xx status", () => {
    const response = createMockResponse({ ok: false, status: 404 });
    assertThrows(
      () => expectHttpResponse(response).ok(),
      Error,
      "Expected ok response",
    );
  });
});

Deno.test("expectHttpResponse.notOk", async (t) => {
  await t.step("passes for non-2xx status", () => {
    const response = createMockResponse({ ok: false, status: 404 });
    expectHttpResponse(response).notOk();
  });

  await t.step("throws for 2xx status", () => {
    const response = createMockResponse({ ok: true, status: 200 });
    assertThrows(
      () => expectHttpResponse(response).notOk(),
      Error,
      "Expected non-ok response",
    );
  });
});

Deno.test("expectHttpResponse.status", async (t) => {
  await t.step("passes when status matches", () => {
    const response = createMockResponse({ status: 201 });
    expectHttpResponse(response).status(201);
  });

  await t.step("throws when status does not match", () => {
    const response = createMockResponse({ status: 200 });
    assertThrows(
      () => expectHttpResponse(response).status(201),
      Error,
      "Expected status 201, got 200",
    );
  });
});

Deno.test("expectHttpResponse.statusInRange", async (t) => {
  await t.step("passes when status is in range", () => {
    const response = createMockResponse({ status: 204 });
    expectHttpResponse(response).statusInRange(200, 299);
  });

  await t.step("throws when status is out of range", () => {
    const response = createMockResponse({ status: 404 });
    assertThrows(
      () => expectHttpResponse(response).statusInRange(200, 299),
      Error,
      "Expected status in range 200-299, got 404",
    );
  });
});

Deno.test("expectHttpResponse.header", async (t) => {
  await t.step("passes when header matches string", () => {
    const headers = new Headers({ "X-Custom": "value123" });
    const response = createMockResponse({ headers });
    expectHttpResponse(response).header("X-Custom", "value123");
  });

  await t.step("passes when header matches regex", () => {
    const headers = new Headers({ "X-Custom": "value123" });
    const response = createMockResponse({ headers });
    expectHttpResponse(response).header("X-Custom", /value\d+/);
  });

  await t.step("throws when header does not match", () => {
    const headers = new Headers({ "X-Custom": "value123" });
    const response = createMockResponse({ headers });
    assertThrows(
      () => expectHttpResponse(response).header("X-Custom", "wrong"),
      Error,
      "Expected header X-Custom",
    );
  });

  await t.step("throws when header is missing", () => {
    const response = createMockResponse({ headers: new Headers() });
    assertThrows(
      () => expectHttpResponse(response).header("X-Missing", "value"),
      Error,
      "Header X-Missing not found",
    );
  });
});

Deno.test("expectHttpResponse.headerExists", async (t) => {
  await t.step("passes when header exists", () => {
    const headers = new Headers({ "X-Custom": "value" });
    const response = createMockResponse({ headers });
    expectHttpResponse(response).headerExists("X-Custom");
  });

  await t.step("throws when header is missing", () => {
    const response = createMockResponse({ headers: new Headers() });
    assertThrows(
      () => expectHttpResponse(response).headerExists("X-Missing"),
      Error,
      "Header X-Missing not found",
    );
  });
});

Deno.test("expectHttpResponse.contentType", async (t) => {
  await t.step("passes when content type matches string", () => {
    const headers = new Headers({ "Content-Type": "application/json" });
    const response = createMockResponse({ headers });
    expectHttpResponse(response).contentType("application/json");
  });

  await t.step("passes when content type matches regex", () => {
    const headers = new Headers({
      "Content-Type": "application/json; charset=utf-8",
    });
    const response = createMockResponse({ headers });
    expectHttpResponse(response).contentType(/^application\/json/);
  });

  await t.step("throws when content type does not match", () => {
    const headers = new Headers({ "Content-Type": "text/plain" });
    const response = createMockResponse({ headers });
    assertThrows(
      () => expectHttpResponse(response).contentType("application/json"),
      Error,
      "Expected header Content-Type",
    );
  });
});

Deno.test("expectHttpResponse.noContent", async (t) => {
  await t.step("passes when body is null", () => {
    const response = createMockResponse({ body: null });
    expectHttpResponse(response).noContent();
  });

  await t.step("throws when body exists", () => {
    const response = createMockResponse({ body: new Uint8Array([1, 2, 3]) });
    assertThrows(
      () => expectHttpResponse(response).noContent(),
      Error,
      "Expected no content",
    );
  });
});

Deno.test("expectHttpResponse.hasContent", async (t) => {
  await t.step("passes when body exists", () => {
    const response = createMockResponse({ body: new Uint8Array([1, 2, 3]) });
    expectHttpResponse(response).hasContent();
  });

  await t.step("throws when body is null", () => {
    const response = createMockResponse({ body: null });
    assertThrows(
      () => expectHttpResponse(response).hasContent(),
      Error,
      "Expected content",
    );
  });
});

Deno.test("expectHttpResponse.bodyContains", async (t) => {
  await t.step("passes when body contains subbody", () => {
    const body = new Uint8Array([1, 2, 3, 4, 5]);
    const response = createMockResponse({ body });
    expectHttpResponse(response).bodyContains(new Uint8Array([2, 3, 4]));
  });

  await t.step("throws when body does not contain subbody", () => {
    const body = new Uint8Array([1, 2, 3, 4, 5]);
    const response = createMockResponse({ body });
    assertThrows(
      () =>
        expectHttpResponse(response).bodyContains(new Uint8Array([6, 7, 8])),
      Error,
      "Body does not contain expected bytes",
    );
  });
});

Deno.test("expectHttpResponse.bodyMatch", async (t) => {
  await t.step("calls matcher with body", () => {
    const body = new Uint8Array([1, 2, 3]);
    const response = createMockResponse({ body });
    let called = false;
    expectHttpResponse(response).bodyMatch((b) => {
      called = true;
      assertEquals(b, body);
    });
    assertEquals(called, true);
  });

  await t.step("throws if matcher throws", () => {
    const response = createMockResponse({ body: new Uint8Array([1, 2, 3]) });
    assertThrows(
      () =>
        expectHttpResponse(response).bodyMatch(() => {
          throw new Error("custom error");
        }),
      Error,
      "custom error",
    );
  });
});

Deno.test("expectHttpResponse.textContains", async (t) => {
  await t.step("passes when text contains substring", () => {
    const body = new TextEncoder().encode("hello world");
    const response = createMockResponse({ body });
    expectHttpResponse(response).textContains("world");
  });

  await t.step("throws when text does not contain substring", () => {
    const body = new TextEncoder().encode("hello world");
    const response = createMockResponse({ body });
    assertThrows(
      () => expectHttpResponse(response).textContains("foo"),
      Error,
      'Text does not contain "foo"',
    );
  });
});

Deno.test("expectHttpResponse.textMatch", async (t) => {
  await t.step("calls matcher with text", () => {
    const body = new TextEncoder().encode("hello");
    const response = createMockResponse({ body });
    let capturedText = "";
    expectHttpResponse(response).textMatch((text) => {
      capturedText = text;
    });
    assertEquals(capturedText, "hello");
  });
});

Deno.test("expectHttpResponse.jsonContains", async (t) => {
  await t.step("passes when JSON contains subset", () => {
    const body = new TextEncoder().encode(
      JSON.stringify({ id: 1, name: "John", age: 30 }),
    );
    const response = createMockResponse({ body });
    expectHttpResponse(response).jsonContains({ name: "John" });
  });

  await t.step("throws when JSON does not contain subset", () => {
    const body = new TextEncoder().encode(
      JSON.stringify({ id: 1, name: "John" }),
    );
    const response = createMockResponse({ body });
    assertThrows(
      () => expectHttpResponse(response).jsonContains({ name: "Jane" }),
      Error,
      "JSON does not contain expected properties",
    );
  });

  await t.step("passes when JSON contains nested object subset", () => {
    const body = new TextEncoder().encode(
      JSON.stringify({
        args: { name: "probitas", version: "1.0" },
        headers: { "Content-Type": "application/json" },
      }),
    );
    const response = createMockResponse({ body });
    expectHttpResponse(response).jsonContains({ args: { name: "probitas" } });
  });

  await t.step("passes when JSON contains deeply nested subset", () => {
    const body = new TextEncoder().encode(
      JSON.stringify({
        data: {
          user: {
            profile: { name: "John", age: 30 },
            settings: { theme: "dark" },
          },
        },
      }),
    );
    const response = createMockResponse({ body });
    expectHttpResponse(response).jsonContains({
      data: { user: { profile: { name: "John" } } },
    });
  });

  await t.step("passes when JSON contains nested array elements", () => {
    const body = new TextEncoder().encode(
      JSON.stringify({
        items: [1, 2, 3],
        nested: { values: [10, 20, 30] },
      }),
    );
    const response = createMockResponse({ body });
    expectHttpResponse(response).jsonContains({ items: [1, 2, 3] });
  });

  await t.step("throws when nested object does not match", () => {
    const body = new TextEncoder().encode(
      JSON.stringify({
        args: { name: "probitas", version: "1.0" },
      }),
    );
    const response = createMockResponse({ body });
    assertThrows(
      () =>
        expectHttpResponse(response).jsonContains({
          args: { name: "different" },
        }),
      Error,
      "JSON does not contain expected properties",
    );
  });

  await t.step("throws when nested property is missing", () => {
    const body = new TextEncoder().encode(
      JSON.stringify({
        args: { version: "1.0" },
      }),
    );
    const response = createMockResponse({ body });
    assertThrows(
      () =>
        expectHttpResponse(response).jsonContains({ args: { name: "test" } }),
      Error,
      "JSON does not contain expected properties",
    );
  });

  await t.step("passes with mixed nested and top-level properties", () => {
    const body = new TextEncoder().encode(
      JSON.stringify({
        status: "ok",
        data: { message: "Hello", count: 42 },
      }),
    );
    const response = createMockResponse({ body });
    expectHttpResponse(response).jsonContains({
      status: "ok",
      data: { message: "Hello" },
    });
  });
});

Deno.test("expectHttpResponse.jsonMatch", async (t) => {
  await t.step("calls matcher with parsed JSON", () => {
    const body = new TextEncoder().encode(
      JSON.stringify({ id: 1, name: "John" }),
    );
    const response = createMockResponse({ body });
    let capturedJson = null;
    expectHttpResponse(response).jsonMatch((json) => {
      capturedJson = json;
    });
    assertEquals(capturedJson, { id: 1, name: "John" });
  });

  await t.step("supports type parameter", () => {
    interface User {
      id: number;
      name: string;
    }
    const body = new TextEncoder().encode(
      JSON.stringify({ id: 1, name: "John" }),
    );
    const response = createMockResponse({ body });
    expectHttpResponse(response).jsonMatch<User>((user) => {
      assertEquals(user.id, 1);
      assertEquals(user.name, "John");
    });
  });
});

Deno.test("expectHttpResponse.durationLessThan", async (t) => {
  await t.step("passes when duration is less than threshold", () => {
    const response = createMockResponse({ duration: 50 });
    expectHttpResponse(response).durationLessThan(100);
  });

  await t.step("throws when duration exceeds threshold", () => {
    const response = createMockResponse({ duration: 150 });
    assertThrows(
      () => expectHttpResponse(response).durationLessThan(100),
      Error,
      "Expected duration < 100ms, got 150ms",
    );
  });
});

Deno.test("expectHttpResponse chaining", async (t) => {
  await t.step("allows chaining multiple assertions", () => {
    const body = new TextEncoder().encode(
      JSON.stringify({ id: 1, name: "John" }),
    );
    const headers = new Headers({ "Content-Type": "application/json" });
    const response = createMockResponse({
      ok: true,
      status: 200,
      headers,
      body,
      duration: 50,
    });

    expectHttpResponse(response)
      .ok()
      .status(200)
      .contentType("application/json")
      .hasContent()
      .jsonContains({ name: "John" })
      .durationLessThan(100);
  });
});
