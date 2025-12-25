/**
 * HTTP client for [Probitas](https://github.com/probitas-test/probitas) scenario testing framework.
 *
 * This package provides an HTTP client designed for integration testing of HTTP APIs.
 *
 * ## Features
 *
 * - **All HTTP Methods**: Support for GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
 * - **Request Building**: Headers, query parameters, body (JSON, form, multipart)
 * - **Response Inspection**: Status codes, headers, cookies, body parsing
 * - **Duration Tracking**: Built-in timing for performance monitoring
 * - **Resource Management**: Implements `AsyncDisposable` for proper cleanup
 *
 * ## Installation
 *
 * ```bash
 * deno add jsr:@probitas/client-http
 * ```
 *
 * ## Quick Start
 *
 * ```ts
 * import { createHttpClient } from "@probitas/client-http";
 *
 * interface User {
 *   id: string;
 *   name: string;
 * }
 *
 * const http = createHttpClient({ url: "http://localhost:3000" });
 *
 * // GET request
 * const res = await http.get("/users/123");
 * console.log("Status:", res.status);
 *
 * // Extract typed data
 * const user = res.json as User;
 *
 * // POST request
 * const created = await http.post("/users", {
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({ name: "Jane" }),
 * });
 * console.log("Created:", created.status);
 *
 * await http.close();
 * ```
 *
 * ## Using with `using` Statement
 *
 * ```ts
 * import { createHttpClient } from "@probitas/client-http";
 *
 * await using http = createHttpClient({ url: "http://localhost:3000" });
 *
 * const res = await http.get("/health");
 * console.log("Health:", res.ok);
 * ```
 *
 * ## Related Packages
 *
 * | Package | Description |
 * |---------|-------------|
 * | [`@probitas/client`](https://jsr.io/@probitas/client) | Core utilities and types |
 * | [`@probitas/client-graphql`](https://jsr.io/@probitas/client-graphql) | GraphQL client |
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/probitas-test/probitas-client)
 * - [Probitas Framework](https://github.com/probitas-test/probitas)
 *
 * @module
 */

export type * from "./types.ts";
export * from "./errors.ts";
export * from "./client.ts";
export type * from "./response.ts";
