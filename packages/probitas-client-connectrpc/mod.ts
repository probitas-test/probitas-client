/**
 * ConnectRPC client for Probitas.
 *
 * This package provides a ConnectRPC-based client with Server Reflection support.
 *
 * @example
 * ```typescript
 * import { createConnectRpcClient, expectConnectRpcResponse } from "@probitas/client-connectrpc";
 *
 * // Create client (uses reflection by default)
 * const client = createConnectRpcClient({
 *   address: "localhost:50051",
 * });
 *
 * // Discover services
 * const services = await client.reflection.listServices();
 * console.log("Available services:", services);
 *
 * // Get service info
 * const info = await client.reflection.getServiceInfo("echo.EchoService");
 * console.log("Methods:", info.methods);
 *
 * // Call a method with fluent assertions
 * const response = await client.call(
 *   "echo.EchoService",
 *   "echo",
 *   { message: "Hello!" }
 * );
 *
 * expectConnectRpcResponse(response)
 *   .ok()
 *   .dataContains({ message: "Hello!" })
 *   .durationLessThan(1000);
 *
 * // Test error responses without throwing
 * const errorResponse = await client.call(
 *   "echo.EchoService",
 *   "echo",
 *   { invalid: true },
 *   { throwOnError: false }
 * );
 *
 * expectConnectRpcResponse(errorResponse)
 *   .notOk()
 *   .code(3)  // INVALID_ARGUMENT
 *   .messageContains("invalid");
 *
 * await client.close();
 * ```
 *
 * @module
 */

export type * from "./status.ts";
export * from "./status.ts";

export type * from "./errors.ts";
export * from "./errors.ts";

export type * from "./types.ts";
export * from "./types.ts";

export type * from "./response.ts";
export * from "./response.ts";

export type * from "./expect.ts";
export * from "./expect.ts";

export type * from "./client.ts";
export * from "./client.ts";
