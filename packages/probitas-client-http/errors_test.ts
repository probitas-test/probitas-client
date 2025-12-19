import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert";
import { ClientError } from "@probitas/client";
import { HttpError } from "./errors.ts";

Deno.test("HttpError", async (t) => {
  await t.step("extends ClientError", () => {
    const error = new HttpError(500, "Internal Server Error");
    assertInstanceOf(error, ClientError);
    assertInstanceOf(error, HttpError);
  });

  await t.step("has correct properties", () => {
    const error = new HttpError(404, "Not Found");
    assertEquals(error.name, "HttpError");
    assertEquals(error.kind, "http");
    assertEquals(error.status, 404);
    assertEquals(error.statusText, "Not Found");
  });

  await t.step("generates message from status", () => {
    const error = new HttpError(404, "Not Found");
    assertEquals(error.message, "404: Not Found");
  });

  await t.step("includes body in message when provided", () => {
    const body = new TextEncoder().encode('{"error": "not found"}');
    const error = new HttpError(404, "Not Found", { body });
    assertEquals(error.message.includes("404: Not Found"), true);
    assertEquals(error.message.includes("not found"), true);
  });

  await t.step("supports cause option", () => {
    const cause = new Error("network error");
    const error = new HttpError(500, "Internal Server Error", { cause });
    assertEquals(error.cause, cause);
  });

  await t.step("body is null by default", () => {
    const error = new HttpError(500, "Internal Server Error");
    assertEquals(error.body, null);
  });

  await t.step("body property stores raw bytes", () => {
    const body = new TextEncoder().encode("error details");
    const error = new HttpError(500, "Internal Server Error", { body });
    assertInstanceOf(error.body, Uint8Array);
    assertEquals(error.body, body);
  });

  await t.step("headers property stores response headers", () => {
    const headers = new Headers({ "Content-Type": "application/json" });
    const error = new HttpError(500, "Internal Server Error", { headers });
    assertEquals(error.headers?.get("Content-Type"), "application/json");
  });

  await t.step("text() returns body as string", () => {
    const body = new TextEncoder().encode("error message");
    const error = new HttpError(500, "Internal Server Error", { body });
    assertEquals(error.text(), "error message");
  });

  await t.step("text() returns null when no body", () => {
    const error = new HttpError(500, "Internal Server Error");
    assertEquals(error.text(), null);
  });

  await t.step("text() can be called multiple times", () => {
    const body = new TextEncoder().encode("error message");
    const error = new HttpError(500, "Internal Server Error", { body });
    assertEquals(error.text(), error.text());
  });

  await t.step("json() returns parsed JSON", () => {
    const body = new TextEncoder().encode('{"code": "NOT_FOUND", "id": 123}');
    const error = new HttpError(404, "Not Found", { body });
    assertEquals(error.json(), { code: "NOT_FOUND", id: 123 });
  });

  await t.step("json() returns null when no body", () => {
    const error = new HttpError(500, "Internal Server Error");
    assertEquals(error.json(), null);
  });

  await t.step("json() throws when body is not valid JSON", () => {
    const body = new TextEncoder().encode("not json");
    const error = new HttpError(500, "Internal Server Error", { body });
    assertThrows(() => error.json(), SyntaxError);
  });

  await t.step("json() can be called multiple times", () => {
    const body = new TextEncoder().encode('{"error": true}');
    const error = new HttpError(500, "Internal Server Error", { body });
    assertEquals(error.json(), error.json());
  });

  await t.step("json() supports generic type hint", () => {
    interface ErrorResponse {
      code: string;
      message: string;
    }
    const body = new TextEncoder().encode('{"code": "ERR", "message": "fail"}');
    const error = new HttpError(500, "Internal Server Error", { body });
    const data = error.json<ErrorResponse>();
    assertEquals(data?.code, "ERR");
    assertEquals(data?.message, "fail");
  });

  await t.step("arrayBuffer() returns ArrayBuffer", () => {
    const body = new TextEncoder().encode("data");
    const error = new HttpError(500, "Internal Server Error", { body });
    const buffer = error.arrayBuffer();
    assertInstanceOf(buffer, ArrayBuffer);
    assertEquals(buffer?.byteLength, 4);
  });

  await t.step("arrayBuffer() returns null when no body", () => {
    const error = new HttpError(500, "Internal Server Error");
    assertEquals(error.arrayBuffer(), null);
  });

  await t.step("blob() returns Blob with content type", () => {
    const body = new TextEncoder().encode('{"test": true}');
    const headers = new Headers({ "Content-Type": "application/json" });
    const error = new HttpError(500, "Internal Server Error", {
      body,
      headers,
    });
    const blob = error.blob();
    assertInstanceOf(blob, Blob);
    assertEquals(blob?.type, "application/json");
    assertEquals(blob?.size, body.length);
  });

  await t.step("blob() returns null when no body", () => {
    const error = new HttpError(500, "Internal Server Error");
    assertEquals(error.blob(), null);
  });
});
