import { assertEquals, assertInstanceOf } from "@std/assert";
import { createHttpResponse } from "./response.ts";

Deno.test("createHttpResponse", async (t) => {
  await t.step("creates HttpResponse from Response with body", async () => {
    const raw = new Response(JSON.stringify({ name: "test" }), {
      status: 200,
      statusText: "OK",
      headers: { "Content-Type": "application/json" },
    });
    const duration = 100;

    const response = await createHttpResponse(raw, duration);

    assertEquals(response.kind, "http");
    assertEquals(response.ok, true);
    assertEquals(response.status, 200);
    assertEquals(response.statusText, "OK");
    assertEquals(response.headers.get("content-type"), "application/json");
    assertEquals(response.duration, 100);
    assertInstanceOf(response.body, Uint8Array);
  });

  await t.step("creates HttpResponse from Response without body", async () => {
    const raw = new Response(null, {
      status: 204,
      statusText: "No Content",
    });
    const duration = 50;

    const response = await createHttpResponse(raw, duration);

    assertEquals(response.ok, true);
    assertEquals(response.status, 204);
    assertEquals(response.statusText, "No Content");
    assertEquals(response.body, null);
    assertEquals(response.duration, 50);
  });

  await t.step("text() returns body as string", async () => {
    const raw = new Response("hello world", { status: 200 });
    const response = await createHttpResponse(raw, 10);

    assertEquals(response.text(), "hello world");
  });

  await t.step("text() returns null when no body", async () => {
    const raw = new Response(null, { status: 204 });
    const response = await createHttpResponse(raw, 10);

    assertEquals(response.text(), null);
  });

  await t.step("text() can be called multiple times", async () => {
    const raw = new Response("hello", { status: 200 });
    const response = await createHttpResponse(raw, 10);

    assertEquals(response.text(), "hello");
    assertEquals(response.text(), "hello");
    assertEquals(response.text(), "hello");
  });

  await t.step("data() returns parsed JSON", async () => {
    const data = { name: "John", age: 30 };
    const raw = new Response(JSON.stringify(data), { status: 200 });
    const response = await createHttpResponse(raw, 10);

    assertEquals(response.data(), data);
  });

  await t.step("data() returns null when no body", async () => {
    const raw = new Response(null, { status: 204 });
    const response = await createHttpResponse(raw, 10);

    assertEquals(response.data(), null);
  });

  await t.step("data() can be called multiple times", async () => {
    const data = { id: 1 };
    const raw = new Response(JSON.stringify(data), { status: 200 });
    const response = await createHttpResponse(raw, 10);

    assertEquals(response.data(), data);
    assertEquals(response.data(), data);
    assertEquals(response.data(), data);
  });

  await t.step("data() supports generic type hint", async () => {
    interface User {
      id: number;
      name: string;
    }
    const raw = new Response(JSON.stringify({ id: 1, name: "Alice" }), {
      status: 200,
    });
    const response = await createHttpResponse(raw, 10);

    const user = response.data<User>();
    assertEquals(user?.id, 1);
    assertEquals(user?.name, "Alice");
  });

  await t.step("arrayBuffer() returns ArrayBuffer", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const raw = new Response(bytes, { status: 200 });
    const response = await createHttpResponse(raw, 10);

    const buffer = response.arrayBuffer();
    assertInstanceOf(buffer, ArrayBuffer);
    assertEquals(new Uint8Array(buffer!), bytes);
  });

  await t.step("arrayBuffer() returns null when no body", async () => {
    const raw = new Response(null, { status: 204 });
    const response = await createHttpResponse(raw, 10);

    assertEquals(response.arrayBuffer(), null);
  });

  await t.step("blob() returns Blob", async () => {
    const raw = new Response("hello", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
    const response = await createHttpResponse(raw, 10);

    const blob = response.blob();
    assertInstanceOf(blob, Blob);
    assertEquals(await blob!.text(), "hello");
  });

  await t.step("blob() returns null when no body", async () => {
    const raw = new Response(null, { status: 204 });
    const response = await createHttpResponse(raw, 10);

    assertEquals(response.blob(), null);
  });

  await t.step("raw() method returns original Response", async () => {
    const original = new Response("test", { status: 200 });
    const response = await createHttpResponse(original, 10);

    assertEquals(response.raw(), original);
  });

  await t.step("url property reflects Response url", async () => {
    const raw = new Response("test", { status: 200 });
    Object.defineProperty(raw, "url", { value: "http://example.com/api" });
    const response = await createHttpResponse(raw, 10);

    assertEquals(response.url, "http://example.com/api");
  });

  await t.step("ok is false for 4xx status", async () => {
    const raw = new Response("not found", { status: 404 });
    const response = await createHttpResponse(raw, 10);

    assertEquals(response.ok, false);
    assertEquals(response.status, 404);
  });

  await t.step("ok is false for 5xx status", async () => {
    const raw = new Response("server error", { status: 500 });
    const response = await createHttpResponse(raw, 10);

    assertEquals(response.ok, false);
    assertEquals(response.status, 500);
  });
});
