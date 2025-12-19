import {
  assert,
  assertEquals,
  assertFalse,
  assertInstanceOf,
} from "@std/assert";
import { HttpError } from "./errors.ts";
import { HttpResponseErrorImpl, HttpResponseSuccessImpl } from "./response.ts";

/**
 * Helper to create HttpResponseSuccessImpl from a Response.
 * Pre-loads the body as Uint8Array.
 */
async function createSuccessResponse(
  raw: Response,
  duration: number,
): Promise<HttpResponseSuccessImpl> {
  let body: Uint8Array | null = null;
  if (raw.body !== null) {
    const arrayBuffer = await raw.arrayBuffer();
    if (arrayBuffer.byteLength > 0) {
      body = new Uint8Array(arrayBuffer);
    }
  }
  return new HttpResponseSuccessImpl(raw, body, duration);
}

/**
 * Helper to create HttpResponseErrorImpl from a Response.
 * Pre-loads the body and creates HttpError.
 */
async function createErrorResponse(
  raw: Response,
  duration: number,
): Promise<HttpResponseErrorImpl> {
  let body: Uint8Array | null = null;
  if (raw.body !== null) {
    const arrayBuffer = await raw.arrayBuffer();
    if (arrayBuffer.byteLength > 0) {
      body = new Uint8Array(arrayBuffer);
    }
  }
  const error = new HttpError(raw.status, raw.statusText, {
    body,
    headers: raw.headers,
  });
  return new HttpResponseErrorImpl(raw, duration, error);
}

Deno.test("HttpResponseSuccessImpl", async (t) => {
  await t.step("creates from Response with body", async () => {
    const raw = new Response(JSON.stringify({ name: "test" }), {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json" },
    });
    const duration = 100;

    const response = await createSuccessResponse(raw, duration);

    assert(response.processed);
    assertEquals(response.kind, "http");
    assert(response.ok);
    assertEquals(response.status, 200);
    assertEquals(response.statusText, "OK");
    assertEquals(response.headers.get("content-type"), "application/json");
    assertEquals(response.duration, 100);
    assertInstanceOf(response.body, Uint8Array);
  });

  await t.step("creates from Response without body", async () => {
    const raw = new Response(null, {
      status: 204,
      statusText: "No Content",
    });
    const duration = 50;

    const response = await createSuccessResponse(raw, duration);

    assert(response.ok);
    assertEquals(response.status, 204);
    assertEquals(response.statusText, "No Content");
    assertEquals(response.body, null);
    assertEquals(response.duration, 50);
  });

  await t.step("text() returns body as string", async () => {
    const raw = new Response("hello world", { status: 200 });
    const response = await createSuccessResponse(raw, 10);

    assertEquals(response.text(), "hello world");
  });

  await t.step("text() returns null when no body", async () => {
    const raw = new Response(null, { status: 204 });
    const response = await createSuccessResponse(raw, 10);

    assertEquals(response.text(), null);
  });

  await t.step("text() can be called multiple times", async () => {
    const raw = new Response("hello", { status: 200 });
    const response = await createSuccessResponse(raw, 10);

    assertEquals(response.text(), "hello");
    assertEquals(response.text(), "hello");
    assertEquals(response.text(), "hello");
  });

  await t.step("json() returns parsed JSON", async () => {
    const data = { name: "John", age: 30 };
    const raw = new Response(JSON.stringify(data), { status: 200 });
    const response = await createSuccessResponse(raw, 10);

    assertEquals(response.json(), data);
  });

  await t.step("json() returns null when no body", async () => {
    const raw = new Response(null, { status: 204 });
    const response = await createSuccessResponse(raw, 10);

    assertEquals(response.json(), null);
  });

  await t.step("json() can be called multiple times", async () => {
    const data = { id: 1 };
    const raw = new Response(JSON.stringify(data), { status: 200 });
    const response = await createSuccessResponse(raw, 10);

    assertEquals(response.json(), data);
    assertEquals(response.json(), data);
    assertEquals(response.json(), data);
  });

  await t.step("json() supports generic type hint", async () => {
    interface User {
      id: number;
      name: string;
    }
    const raw = new Response(JSON.stringify({ id: 1, name: "Alice" }), {
      status: 200,
    });
    const response = await createSuccessResponse(raw, 10);

    const user = response.json<User>();
    assertEquals(user?.id, 1);
    assertEquals(user?.name, "Alice");
  });

  await t.step("arrayBuffer() returns ArrayBuffer", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const raw = new Response(bytes, { status: 200 });
    const response = await createSuccessResponse(raw, 10);

    const buffer = response.arrayBuffer();
    assertInstanceOf(buffer, ArrayBuffer);
    assertEquals(new Uint8Array(buffer!), bytes);
  });

  await t.step("arrayBuffer() returns null when no body", async () => {
    const raw = new Response(null, { status: 204 });
    const response = await createSuccessResponse(raw, 10);

    assertEquals(response.arrayBuffer(), null);
  });

  await t.step("blob() returns Blob", async () => {
    const raw = new Response("hello", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
    const response = await createSuccessResponse(raw, 10);

    const blob = response.blob();
    assertInstanceOf(blob, Blob);
    assertEquals(await blob!.text(), "hello");
  });

  await t.step("blob() returns null when no body", async () => {
    const raw = new Response(null, { status: 204 });
    const response = await createSuccessResponse(raw, 10);

    assertEquals(response.blob(), null);
  });

  await t.step("raw() method returns original Response", async () => {
    const original = new Response("test", { status: 200 });
    const response = await createSuccessResponse(original, 10);

    assertEquals(response.raw(), original);
  });

  await t.step("url property reflects Response url", async () => {
    const raw = new Response("test", { status: 200 });
    Object.defineProperty(raw, "url", { value: "http://example.com/api" });
    const response = await createSuccessResponse(raw, 10);

    assertEquals(response.url, "http://example.com/api");
  });
});

Deno.test("HttpResponseErrorImpl", async (t) => {
  await t.step("creates from 4xx Response", async () => {
    const raw = new Response("not found", {
      status: 404,
      statusText: "Not Found",
    });
    const response = await createErrorResponse(raw, 10);

    assert(response.processed);
    assertFalse(response.ok);
    assertEquals(response.status, 404);
    assertEquals(response.statusText, "Not Found");
    assertInstanceOf(response.error, HttpError);
  });

  await t.step("creates from 5xx Response", async () => {
    const raw = new Response("server error", {
      status: 500,
      statusText: "Internal Server Error",
    });
    const response = await createErrorResponse(raw, 10);

    assertFalse(response.ok);
    assertEquals(response.status, 500);
    assertInstanceOf(response.error, HttpError);
  });

  await t.step("body methods proxy to error", async () => {
    const errorBody = JSON.stringify({ error: "not found" });
    const raw = new Response(errorBody, {
      status: 404,
      statusText: "Not Found",
      headers: { "Content-Type": "application/json" },
    });
    const response = await createErrorResponse(raw, 10);

    assertEquals(response.text(), errorBody);
    assertEquals(response.json(), { error: "not found" });
    assertInstanceOf(response.body, Uint8Array);
  });

  await t.step("raw() returns original Response", async () => {
    const original = new Response("error", { status: 500 });
    const response = await createErrorResponse(original, 10);

    assertEquals(response.raw(), original);
  });
});
