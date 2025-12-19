import { assertEquals } from "@std/assert";
import {
  CookieJar,
  domainMatches,
  parseSetCookie,
  pathMatches,
} from "./cookie.ts";

Deno.test("parseSetCookie", async (t) => {
  await t.step("parses simple cookie", () => {
    const url = new URL("http://example.com/");
    const cookie = parseSetCookie("session=abc123", url);
    assertEquals(cookie?.name, "session");
    assertEquals(cookie?.value, "abc123");
  });

  await t.step("parses cookie with attributes", () => {
    const url = new URL("http://example.com/");
    const cookie = parseSetCookie(
      "token=xyz; Path=/api; HttpOnly; Secure; SameSite=Strict",
      url,
    );
    assertEquals(cookie?.name, "token");
    assertEquals(cookie?.value, "xyz");
    assertEquals(cookie?.path, "/api");
    assertEquals(cookie?.httpOnly, true);
    assertEquals(cookie?.secure, true);
    assertEquals(cookie?.sameSite, "strict");
  });

  await t.step("parses cookie with domain", () => {
    const url = new URL("http://sub.example.com/");
    const cookie = parseSetCookie("foo=bar; Domain=example.com", url);
    assertEquals(cookie?.name, "foo");
    assertEquals(cookie?.domain, "example.com");
  });

  await t.step("parses cookie with leading dot domain", () => {
    const url = new URL("http://sub.example.com/");
    const cookie = parseSetCookie("foo=bar; Domain=.example.com", url);
    assertEquals(cookie?.domain, "example.com");
  });

  await t.step("parses Max-Age", () => {
    const url = new URL("http://example.com/");
    const before = Date.now();
    const cookie = parseSetCookie("foo=bar; Max-Age=3600", url);
    const after = Date.now();

    // Expires should be ~1 hour from now
    const expires = cookie?.expires?.getTime() ?? 0;
    assertEquals(expires >= before + 3600000, true);
    assertEquals(expires <= after + 3600000, true);
  });

  await t.step("parses Expires", () => {
    const url = new URL("http://example.com/");
    const cookie = parseSetCookie(
      "foo=bar; Expires=Wed, 21 Oct 2025 07:28:00 GMT",
      url,
    );
    assertEquals(cookie?.expires?.toISOString(), "2025-10-21T07:28:00.000Z");
  });

  await t.step("returns null for invalid cookie", () => {
    const url = new URL("http://example.com/");
    assertEquals(parseSetCookie("invalid", url), null);
    assertEquals(parseSetCookie("", url), null);
  });

  await t.step("uses default path from request path", () => {
    const url = new URL("http://example.com/api/users/123");
    const cookie = parseSetCookie("foo=bar", url);
    assertEquals(cookie?.path, "/api/users");
  });
});

Deno.test("domainMatches", async (t) => {
  await t.step("exact match", () => {
    assertEquals(domainMatches("example.com", "example.com"), true);
  });

  await t.step("subdomain match", () => {
    assertEquals(domainMatches("sub.example.com", "example.com"), true);
    assertEquals(domainMatches("a.b.example.com", "example.com"), true);
  });

  await t.step("no match for different domain", () => {
    assertEquals(domainMatches("other.com", "example.com"), false);
    assertEquals(domainMatches("notexample.com", "example.com"), false);
  });

  await t.step("no match for partial suffix", () => {
    assertEquals(domainMatches("fakeexample.com", "example.com"), false);
  });
});

Deno.test("pathMatches", async (t) => {
  await t.step("exact match", () => {
    assertEquals(pathMatches("/api/users", "/api/users"), true);
  });

  await t.step("prefix match with slash", () => {
    assertEquals(pathMatches("/api/users/123", "/api/users"), true);
    assertEquals(pathMatches("/api/users/", "/api/users"), true);
  });

  await t.step("root path matches all", () => {
    assertEquals(pathMatches("/api/users", "/"), true);
    assertEquals(pathMatches("/anything", "/"), true);
  });

  await t.step("trailing slash in cookie path", () => {
    assertEquals(pathMatches("/api/users", "/api/"), true);
  });

  await t.step("no match for different path", () => {
    assertEquals(pathMatches("/other", "/api"), false);
    assertEquals(pathMatches("/apiext", "/api"), false);
  });
});

Deno.test("CookieJar", async (t) => {
  await t.step("stores and retrieves cookie", () => {
    const jar = new CookieJar();
    const url = new URL("http://example.com/");
    const cookie = parseSetCookie("session=abc", url)!;

    jar.set(cookie, url);
    const cookies = jar.getCookiesForUrl(url);

    assertEquals(cookies.length, 1);
    assertEquals(cookies[0].name, "session");
    assertEquals(cookies[0].value, "abc");
  });

  await t.step("respects path matching", () => {
    const jar = new CookieJar();
    const url = new URL("http://example.com/api/");
    const cookie = parseSetCookie("token=xyz; Path=/api", url)!;

    jar.set(cookie, url);

    // Should match /api paths
    assertEquals(
      jar.getCookiesForUrl(new URL("http://example.com/api/users")).length,
      1,
    );

    // Should not match other paths
    assertEquals(
      jar.getCookiesForUrl(new URL("http://example.com/other")).length,
      0,
    );
  });

  await t.step("respects domain matching", () => {
    const jar = new CookieJar();
    const url = new URL("http://sub.example.com/");
    const cookie = parseSetCookie("foo=bar; Domain=example.com", url)!;

    jar.set(cookie, url);

    // Should match any subdomain
    assertEquals(
      jar.getCookiesForUrl(new URL("http://other.example.com/")).length,
      1,
    );
    assertEquals(
      jar.getCookiesForUrl(new URL("http://example.com/")).length,
      1,
    );

    // Should not match different domain
    assertEquals(
      jar.getCookiesForUrl(new URL("http://other.com/")).length,
      0,
    );
  });

  await t.step("respects secure flag", () => {
    const jar = new CookieJar();
    const url = new URL("https://example.com/");
    const cookie = parseSetCookie("secure=yes; Secure", url)!;

    jar.set(cookie, url);

    // Should match HTTPS
    assertEquals(
      jar.getCookiesForUrl(new URL("https://example.com/")).length,
      1,
    );

    // Should not match HTTP
    assertEquals(
      jar.getCookiesForUrl(new URL("http://example.com/")).length,
      0,
    );
  });

  await t.step("filters expired cookies", () => {
    const jar = new CookieJar();
    const url = new URL("http://example.com/");
    const expiredCookie = parseSetCookie(
      "old=value; Expires=Wed, 01 Jan 2020 00:00:00 GMT",
      url,
    )!;

    jar.set(expiredCookie, url);
    assertEquals(jar.getCookiesForUrl(url).length, 0);
  });

  await t.step("getCookieHeader formats correctly", () => {
    const jar = new CookieJar();
    const url = new URL("http://example.com/");

    jar.setCookie("a", "1", "example.com");
    jar.setCookie("b", "2", "example.com");

    const header = jar.getCookieHeader(url);
    assertEquals(header?.includes("a=1"), true);
    assertEquals(header?.includes("b=2"), true);
    assertEquals(header?.includes("; "), true);
  });

  await t.step("getCookieHeader returns null when empty", () => {
    const jar = new CookieJar();
    const url = new URL("http://example.com/");
    assertEquals(jar.getCookieHeader(url), null);
  });

  await t.step("getAll returns all cookies", () => {
    const jar = new CookieJar();
    jar.setCookie("a", "1", "example.com");
    jar.setCookie("b", "2", "other.com");

    const all = jar.getAll();
    assertEquals(all["a"], "1");
    assertEquals(all["b"], "2");
  });

  await t.step("clear removes all cookies", () => {
    const jar = new CookieJar();
    jar.setCookie("a", "1", "example.com");
    jar.setCookie("b", "2", "other.com");

    jar.clear();
    assertEquals(jar.size, 0);
    assertEquals(jar.getAll(), {});
  });

  await t.step("sorts cookies by path length", () => {
    const jar = new CookieJar();
    const url = new URL("http://example.com/api/users/123");

    // Add cookies with different paths
    const rootCookie = parseSetCookie("root=1; Path=/", url)!;
    const apiCookie = parseSetCookie("api=2; Path=/api", url)!;
    const usersCookie = parseSetCookie("users=3; Path=/api/users", url)!;

    jar.set(rootCookie, url);
    jar.set(apiCookie, url);
    jar.set(usersCookie, url);

    const cookies = jar.getCookiesForUrl(url);
    assertEquals(cookies.length, 3);
    // Most specific path first
    assertEquals(cookies[0].name, "users");
    assertEquals(cookies[1].name, "api");
    assertEquals(cookies[2].name, "root");
  });
});
