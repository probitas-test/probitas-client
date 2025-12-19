/**
 * gRPC client for [Probitas](https://github.com/jsr-probitas/probitas) scenario testing framework.
 *
 * This package provides a gRPC client with Server Reflection support, designed for
 * integration testing of gRPC services. It is a thin wrapper around
 * [`@probitas/client-connectrpc`](https://jsr.io/@probitas/client-connectrpc) with
 * `protocol: "grpc"` pre-configured.
 *
 * ## Features
 *
 * - **Native gRPC**: Uses gRPC protocol (HTTP/2 with binary protobuf)
 * - **Server Reflection**: Auto-discover services and methods at runtime
 * - **TLS Support**: Configure secure connections with custom certificates
 * - **Duration Tracking**: Built-in timing for performance monitoring
 * - **Error Handling**: Test error responses without throwing exceptions
 * - **Resource Management**: Implements `AsyncDisposable` for proper cleanup
 *
 * ## Installation
 *
 * ```bash
 * deno add jsr:@probitas/client-grpc
 * ```
 *
 * ## Quick Start
 *
 * ```ts
 * import { createGrpcClient } from "@probitas/client-grpc";
 *
 * // Create client (uses reflection by default)
 * const client = createGrpcClient({
 *   url: "http://localhost:50051",
 * });
 *
 * // Call a method
 * const response = await client.call(
 *   "echo.EchoService",
 *   "echo",
 *   { message: "Hello!" }
 * );
 * console.log(response.data());
 *
 * await client.close();
 * ```
 *
 * ## Service Discovery
 *
 * ```ts
 * import { createGrpcClient } from "@probitas/client-grpc";
 *
 * const client = createGrpcClient({ url: "http://localhost:50051" });
 *
 * // Discover available services
 * const services = await client.reflection.listServices();
 * console.log("Services:", services);
 *
 * // Get method information
 * const info = await client.reflection.getServiceInfo("echo.EchoService");
 * console.log("Methods:", info.methods);
 *
 * await client.close();
 * ```
 *
 * ## Using with `using` Statement
 *
 * ```ts
 * import { createGrpcClient } from "@probitas/client-grpc";
 *
 * await using client = createGrpcClient({ url: "http://localhost:50051" });
 *
 * const res = await client.call("echo.EchoService", "echo", { message: "test" });
 * console.log(res.data());
 * // Client automatically closed when block exits
 * ```
 *
 * ## Related Packages
 *
 * | Package | Description |
 * |---------|-------------|
 * | [`@probitas/client`](https://jsr.io/@probitas/client) | Core utilities and types |
 * | [`@probitas/client-connectrpc`](https://jsr.io/@probitas/client-connectrpc) | ConnectRPC client (supports Connect, gRPC, gRPC-Web) |
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/jsr-probitas/probitas-client)
 * - [Probitas Framework](https://github.com/jsr-probitas/probitas)
 * - [gRPC](https://grpc.io/)
 *
 * @module
 */

import {
  type ConnectRpcClient,
  type ConnectRpcClientConfig,
  createConnectRpcClient,
} from "@probitas/client-connectrpc";

// Re-export types and utilities from client-connectrpc with gRPC-specific aliases
export {
  // Client
  type ConnectRpcClient as GrpcClient,
  // Errors
  ConnectRpcError as GrpcError,
  type ConnectRpcErrorOptions as GrpcErrorOptions,
  ConnectRpcNetworkError as GrpcNetworkError,
  type ConnectRpcOptions as GrpcOptions,
  // Response types
  type ConnectRpcResponse as GrpcResponse,
  type ConnectRpcResponseError as GrpcResponseError,
  type ConnectRpcResponseFailure as GrpcResponseFailure,
  type ConnectRpcResponseSuccess as GrpcResponseSuccess,
  // Status codes
  ConnectRpcStatus as GrpcStatus,
  type ConnectRpcStatusCode as GrpcStatusCode,
  type ErrorDetail,
  // Types
  type FileDescriptorSet,
  getStatusName as getGrpcStatusName,
  isConnectRpcStatusCode as isGrpcStatusCode,
  type MethodInfo,
  type ReflectionApi,
  type ServiceDetail,
  type ServiceInfo,
  type TlsConfig,
} from "@probitas/client-connectrpc";

/**
 * Configuration for creating a gRPC client.
 *
 * This is a subset of ConnectRpcClientConfig with protocol fixed to "grpc".
 */
export interface GrpcClientConfig
  extends Omit<ConnectRpcClientConfig, "protocol"> {}

/**
 * Create a new gRPC client instance.
 *
 * This is a thin wrapper around `createConnectRpcClient` with `protocol: "grpc"` fixed.
 * The client provides Server Reflection support for runtime service discovery.
 *
 * @param config - Client configuration including server address
 * @returns A new gRPC client instance
 *
 * @example Basic usage with reflection
 * ```ts
 * import { createGrpcClient } from "@probitas/client-grpc";
 *
 * const client = createGrpcClient({
 *   url: "http://localhost:50051",
 * });
 *
 * // Call a method
 * const response = await client.call(
 *   "echo.EchoService",
 *   "echo",
 *   { message: "Hello!" }
 * );
 * console.log(response.data());
 *
 * await client.close();
 * ```
 *
 * @example Service discovery with reflection
 * ```ts
 * import { createGrpcClient } from "@probitas/client-grpc";
 *
 * const client = createGrpcClient({
 *   url: "http://localhost:50051",
 * });
 *
 * // Discover available services
 * const services = await client.reflection.listServices();
 * console.log("Available services:", services);
 *
 * // Get method information
 * const info = await client.reflection.getServiceInfo("echo.EchoService");
 * console.log("Methods:", info.methods);
 *
 * await client.close();
 * ```
 *
 * @example Testing error responses
 * ```ts
 * import { createGrpcClient } from "@probitas/client-grpc";
 *
 * const client = createGrpcClient({ url: "http://localhost:50051" });
 *
 * const response = await client.call(
 *   "user.UserService",
 *   "getUser",
 *   { id: "non-existent" },
 *   { throwOnError: false }
 * );
 *
 * if (!response.ok) {
 *   console.log("Error code:", response.statusCode);  // NOT_FOUND = 5
 * }
 *
 * await client.close();
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * import { createGrpcClient } from "@probitas/client-grpc";
 *
 * await using client = createGrpcClient({
 *   url: "http://localhost:50051",
 * });
 *
 * const res = await client.call("echo.EchoService", "echo", { message: "test" });
 * console.log(res.data());
 * // Client automatically closed when scope exits
 * ```
 */
export function createGrpcClient(config: GrpcClientConfig): ConnectRpcClient {
  return createConnectRpcClient({
    ...config,
    protocol: "grpc",
  });
}
