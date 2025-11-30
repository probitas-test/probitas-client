/**
 * Integration tests for @probitas/client-http using echo-http.
 *
 * Run with:
 *   docker compose up -d echo-http
 *   deno test -A packages/probitas-client-http/integration_test.ts
 *   docker compose down
 */

import { assertEquals, assertInstanceOf } from "@std/assert";
import {
  createHttpClient,
  expectHttpResponse,
  HttpNotFoundError,
} from "./mod.ts";

const ECHO_HTTP_URL = Deno.env.get("ECHO_HTTP_URL") ?? "http://localhost:18080";

async function isEchoHttpAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${ECHO_HTTP_URL}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

Deno.test({
  name: "Integration: echo-http",
  ignore: !(await isEchoHttpAvailable()),
  async fn(t) {
    const client = createHttpClient({ baseUrl: ECHO_HTTP_URL });

    await t.step("GET /get returns request info", async () => {
      const res = await client.get("/get", {
        query: { foo: "bar", num: 42 },
        headers: { "X-Custom-Header": "test-value" },
      });

      expectHttpResponse(res)
        .ok()
        .status(200)
        .contentType(/^application\/json/);

      const json = res.json<{
        args: Record<string, string>;
        headers: Record<string, string>;
        url: string;
      }>();

      assertEquals(json?.args.foo, "bar");
      assertEquals(json?.args.num, "42");
      assertEquals(json?.headers["X-Custom-Header"], "test-value");
    });

    await t.step("POST /post with JSON body", async () => {
      const payload = { name: "John", email: "john@example.com" };
      const res = await client.post("/post", payload);

      expectHttpResponse(res)
        .ok()
        .status(200)
        .contentType(/^application\/json/);

      const json = res.json<{
        json: typeof payload;
        headers: Record<string, string>;
      }>();

      assertEquals(json?.json, payload);
      assertEquals(json?.headers["Content-Type"], "application/json");
    });

    await t.step("POST /post with form data", async () => {
      const params = new URLSearchParams({
        username: "alice",
        password: "secret",
      });
      const res = await client.post("/post", params);

      expectHttpResponse(res).ok().status(200);

      const json = res.json<{ form: Record<string, string> }>();
      assertEquals(json?.form.username, "alice");
      assertEquals(json?.form.password, "secret");
    });

    await t.step("PUT /put", async () => {
      const res = await client.put("/put", { updated: true });

      expectHttpResponse(res).ok().status(200);

      const json = res.json<{ json: { updated: boolean } }>();
      assertEquals(json?.json.updated, true);
    });

    await t.step("PATCH /patch", async () => {
      const res = await client.patch("/patch", { patched: "value" });

      expectHttpResponse(res).ok().status(200);

      const json = res.json<{ json: { patched: string } }>();
      assertEquals(json?.json.patched, "value");
    });

    await t.step("DELETE /delete", async () => {
      const res = await client.delete("/delete");

      expectHttpResponse(res).ok().status(200);
    });

    await t.step("GET /status/201 returns custom status", async () => {
      const res = await client.request("GET", "/status/201");

      expectHttpResponse(res).ok().status(201);
    });

    await t.step("GET /status/404 throws HttpNotFoundError", async () => {
      try {
        await client.get("/status/404");
        throw new Error("Expected HttpNotFoundError");
      } catch (error) {
        assertInstanceOf(error, HttpNotFoundError);
        assertEquals(error.status, 404);
      }
    });

    await t.step("GET /headers returns request headers", async () => {
      const res = await client.get("/headers", {
        headers: {
          "Accept": "application/json",
        },
      });

      expectHttpResponse(res).ok();

      const json = res.json<{ headers: Record<string, string> }>();
      // Verify Accept header was sent (echo-http echoes back headers)
      assertEquals(json?.headers["Accept"], "application/json");
    });

    await t.step("GET /delay/1 measures duration", async () => {
      const res = await client.get("/delay/1");

      expectHttpResponse(res).ok();
      // Should take at least 1 second
      assertEquals(
        res.duration >= 1000,
        true,
        `Expected duration >= 1000ms, got ${res.duration}ms`,
      );
    });

    await t.step("response body can be read multiple times", async () => {
      const res = await client.get("/get");

      // Read as text
      const text1 = res.text();
      const text2 = res.text();
      assertEquals(text1, text2);

      // Read as JSON
      const json1 = res.json();
      const json2 = res.json();
      assertEquals(json1, json2);

      // Body bytes are also available
      assertInstanceOf(res.body, Uint8Array);
    });

    await t.step("uses default headers from config", async () => {
      const clientWithHeaders = createHttpClient({
        baseUrl: ECHO_HTTP_URL,
        headers: {
          "Authorization": "Bearer token123",
          "X-Api-Version": "v1",
        },
      });

      const res = await clientWithHeaders.get("/headers");
      const json = res.json<{ headers: Record<string, string> }>();

      assertEquals(json?.headers["Authorization"], "Bearer token123");
      assertEquals(json?.headers["X-Api-Version"], "v1");

      await clientWithHeaders.close();
    });

    await t.step("request headers override config headers", async () => {
      const clientWithHeaders = createHttpClient({
        baseUrl: ECHO_HTTP_URL,
        headers: { "X-Header": "from-config" },
      });

      const res = await clientWithHeaders.get("/headers", {
        headers: { "X-Header": "from-request" },
      });
      const json = res.json<{ headers: Record<string, string> }>();

      assertEquals(json?.headers["X-Header"], "from-request");

      await clientWithHeaders.close();
    });

    await t.step("redirect: follow (default) follows redirects", async () => {
      const res = await client.get("/redirect/3");

      expectHttpResponse(res).ok().status(200);

      const json = res.json<{ redirected: boolean }>();
      assertEquals(json?.redirected, true);
    });

    await t.step("redirect: manual returns redirect response", async () => {
      const res = await client.get("/redirect/3", {
        redirect: "manual",
        throwOnError: false,
      });

      // Should return the redirect response without following
      assertEquals(res.status, 302);
      assertEquals(res.ok, false);
      // Location header should be present
      assertEquals(res.headers.has("location"), true);
    });

    await t.step("redirect: error throws on redirect", async () => {
      try {
        await client.get("/redirect/1", {
          redirect: "error",
          throwOnError: false,
        });
        throw new Error("Expected fetch to throw on redirect");
      } catch (error) {
        // fetch throws TypeError when redirect is "error" and response is redirect
        assertInstanceOf(error, TypeError);
      }
    });

    await t.step("config-level redirect setting", async () => {
      const clientManual = createHttpClient({
        baseUrl: ECHO_HTTP_URL,
        redirect: "manual",
        throwOnError: false,
      });

      const res = await clientManual.get("/redirect/1");
      assertEquals(res.status, 302);

      await clientManual.close();
    });

    await t.step("request redirect overrides config redirect", async () => {
      const clientManual = createHttpClient({
        baseUrl: ECHO_HTTP_URL,
        redirect: "manual",
      });

      // Override manual with follow
      const res = await clientManual.get("/redirect/1", { redirect: "follow" });
      expectHttpResponse(res).ok().status(200);

      await clientManual.close();
    });

    await client.close();
  },
});

Deno.test({
  name: "Integration: echo-http cookies",
  ignore: !(await isEchoHttpAvailable()),
  async fn(t) {
    await t.step("GET /cookies returns cookies sent by client", async () => {
      const client = createHttpClient({
        baseUrl: ECHO_HTTP_URL,
        cookies: { initial: { session: "test123", user: "alice" } },
      });

      const res = await client.get("/cookies");

      expectHttpResponse(res).ok();
      const json = res.json<{ cookies: Record<string, string> }>();
      assertEquals(json?.cookies.session, "test123");
      assertEquals(json?.cookies.user, "alice");

      await client.close();
    });

    await t.step("GET /cookies/set stores cookies from response", async () => {
      const client = createHttpClient({
        baseUrl: ECHO_HTTP_URL,
      });

      // /cookies/set sets cookies and redirects; use manual redirect to capture cookies
      const res = await client.get("/cookies/set", {
        query: { flavor: "chocolate", count: "5" },
        redirect: "manual",
        throwOnError: false,
      });
      assertEquals(res.status, 302);

      // Verify cookies were stored in jar from Set-Cookie header
      const cookies = client.getCookies();
      assertEquals(cookies.flavor, "chocolate");
      assertEquals(cookies.count, "5");

      await client.close();
    });

    await t.step("cookies persist across multiple requests", async () => {
      const client = createHttpClient({
        baseUrl: ECHO_HTTP_URL,
      });

      // First request sets a cookie (use manual redirect to capture Set-Cookie)
      await client.get("/cookies/set", {
        query: { auth: "bearer-token" },
        redirect: "manual",
        throwOnError: false,
      });

      // Second request should send the cookie back
      const res = await client.get("/cookies");
      const json = res.json<{ cookies: Record<string, string> }>();
      assertEquals(json?.cookies.auth, "bearer-token");

      await client.close();
    });

    await t.step("clearCookies removes all cookies", async () => {
      const client = createHttpClient({
        baseUrl: ECHO_HTTP_URL,
        cookies: { initial: { initial: "value" } },
      });

      // Verify initial cookie is sent
      let res = await client.get("/cookies");
      let json = res.json<{ cookies: Record<string, string> }>();
      assertEquals(json?.cookies.initial, "value");

      // Clear cookies
      client.clearCookies();

      // Verify no cookies are sent
      res = await client.get("/cookies");
      json = res.json<{ cookies: Record<string, string> }>();
      assertEquals(json?.cookies.initial, undefined);

      await client.close();
    });

    await t.step("setCookie manually adds cookies", async () => {
      const client = createHttpClient({
        baseUrl: ECHO_HTTP_URL,
      });

      // Manually set a cookie
      client.setCookie("manual", "cookie-value");

      // Verify it's sent
      const res = await client.get("/cookies");
      const json = res.json<{ cookies: Record<string, string> }>();
      assertEquals(json?.cookies.manual, "cookie-value");

      await client.close();
    });
  },
});
