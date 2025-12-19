import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert";
import { HttpBody } from "./body.ts";

Deno.test("HttpBody", async (t) => {
  await t.step("bytes returns raw bytes", () => {
    const bytes = new TextEncoder().encode("hello");
    const body = new HttpBody(bytes);
    assertEquals(body.bytes, bytes);
  });

  await t.step("bytes returns null when no body", () => {
    const body = new HttpBody(null);
    assertEquals(body.bytes, null);
  });

  await t.step("text() returns body as string", () => {
    const body = new HttpBody(new TextEncoder().encode("hello world"));
    assertEquals(body.text(), "hello world");
  });

  await t.step("text() returns null when no body", () => {
    const body = new HttpBody(null);
    assertEquals(body.text(), null);
  });

  await t.step("text() can be called multiple times", () => {
    const body = new HttpBody(new TextEncoder().encode("hello"));
    assertEquals(body.text(), "hello");
    assertEquals(body.text(), "hello");
    assertEquals(body.text(), "hello");
  });

  await t.step("json() returns parsed JSON", () => {
    const data = { name: "John", age: 30 };
    const body = new HttpBody(new TextEncoder().encode(JSON.stringify(data)));
    assertEquals(body.json(), data);
  });

  await t.step("json() returns null when no body", () => {
    const body = new HttpBody(null);
    assertEquals(body.json(), null);
  });

  await t.step("json() throws when body is not valid JSON", () => {
    const body = new HttpBody(new TextEncoder().encode("not json"));
    assertThrows(() => body.json(), SyntaxError);
  });

  await t.step("json() can be called multiple times", () => {
    const data = { id: 1 };
    const body = new HttpBody(new TextEncoder().encode(JSON.stringify(data)));
    assertEquals(body.json(), data);
    assertEquals(body.json(), data);
    assertEquals(body.json(), data);
  });

  await t.step("json() supports generic type hint", () => {
    interface User {
      id: number;
      name: string;
    }
    const body = new HttpBody(
      new TextEncoder().encode(JSON.stringify({ id: 1, name: "Alice" })),
    );
    const user = body.json<User>();
    assertEquals(user?.id, 1);
    assertEquals(user?.name, "Alice");
  });

  await t.step("arrayBuffer() returns ArrayBuffer", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const body = new HttpBody(bytes);
    const buffer = body.arrayBuffer();
    assertInstanceOf(buffer, ArrayBuffer);
    assertEquals(new Uint8Array(buffer!), bytes);
  });

  await t.step("arrayBuffer() returns null when no body", () => {
    const body = new HttpBody(null);
    assertEquals(body.arrayBuffer(), null);
  });

  await t.step("blob() returns Blob", async () => {
    const body = new HttpBody(new TextEncoder().encode("hello"));
    const blob = body.blob();
    assertInstanceOf(blob, Blob);
    assertEquals(await blob!.text(), "hello");
  });

  await t.step(
    "blob() returns Blob with content type from headers",
    async () => {
      const headers = new Headers({ "content-type": "application/json" });
      const body = new HttpBody(
        new TextEncoder().encode('{"a":1}'),
        headers,
      );
      const blob = body.blob();
      assertEquals(blob!.type, "application/json");
      assertEquals(await blob!.text(), '{"a":1}');
    },
  );

  await t.step("blob() returns null when no body", () => {
    const body = new HttpBody(null);
    assertEquals(body.blob(), null);
  });
});
