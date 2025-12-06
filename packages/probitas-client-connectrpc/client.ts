/**
 * ConnectRPC client implementation.
 *
 * @module
 */

import {
  createFileRegistry,
  type DescService,
  type FileRegistry,
  fromBinary,
} from "@bufbuild/protobuf";
import { FileDescriptorSetSchema } from "@bufbuild/protobuf/wkt";
import { ConnectError, type Transport } from "@connectrpc/connect";
import {
  createConnectTransport,
  createGrpcTransport,
  createGrpcWebTransport,
  Http2SessionManager,
} from "@connectrpc/connect-node";
import {
  CachedServerReflectionClient,
  DynamicDispatchClient,
} from "@lambdalisue/connectrpc-grpcreflect/client";
import { getLogger } from "@probitas/logger";
import { ConnectionError } from "@probitas/client";
import type {
  ConnectProtocol,
  ConnectRpcClientConfig,
  ConnectRpcOptions,
  HttpVersion,
  MethodInfo,
  ServiceDetail,
  ServiceInfo,
  TlsConfig,
} from "./types.ts";
import { fromConnectError } from "./errors.ts";
import type { ConnectRpcResponse } from "./response.ts";
import { ConnectRpcResponseImpl } from "./response.ts";
import type { ConnectRpcStatusCode } from "./status.ts";

const logger = getLogger("probitas", "client", "connectrpc");

/**
 * Reflection API for ConnectRPC client.
 * Only available when client is created with schema: "reflection".
 */
export interface ReflectionApi {
  /**
   * Check if reflection is enabled.
   */
  readonly enabled: boolean;

  /**
   * List all available services on the server.
   * @throws Error if reflection is not enabled
   */
  listServices(): Promise<ServiceInfo[]>;

  /**
   * Get detailed information about a specific service.
   * @param serviceName - Fully qualified service name (e.g., "echo.EchoService")
   * @throws Error if reflection is not enabled
   */
  getServiceInfo(serviceName: string): Promise<ServiceDetail>;

  /**
   * Get methods for a specific service.
   * @param serviceName - Fully qualified service name
   * @throws Error if reflection is not enabled
   */
  listMethods(serviceName: string): Promise<MethodInfo[]>;

  /**
   * Check if a service exists.
   * @param serviceName - Fully qualified service name
   * @throws Error if reflection is not enabled
   */
  hasService(serviceName: string): Promise<boolean>;
}

/**
 * ConnectRPC client interface.
 */
export interface ConnectRpcClient extends AsyncDisposable {
  /** Client configuration */
  readonly config: ConnectRpcClientConfig;

  /** Reflection API (only available when schema: "reflection") */
  readonly reflection: ReflectionApi;

  /**
   * Make a unary RPC call.
   * @param serviceName - Service name (e.g., "echo.EchoService")
   * @param methodName - Method name (e.g., "echo")
   * @param request - Request message
   * @param options - Call options
   */
  call<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    request: TRequest,
    options?: ConnectRpcOptions,
  ): Promise<ConnectRpcResponse>;

  /**
   * Make a server streaming RPC call.
   * @param serviceName - Service name
   * @param methodName - Method name
   * @param request - Request message
   * @param options - Call options
   */
  serverStream<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    request: TRequest,
    options?: ConnectRpcOptions,
  ): AsyncIterable<ConnectRpcResponse>;

  /**
   * Make a client streaming RPC call.
   * @param serviceName - Service name
   * @param methodName - Method name
   * @param requests - Async iterable of request messages
   * @param options - Call options
   */
  clientStream<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    requests: AsyncIterable<TRequest>,
    options?: ConnectRpcOptions,
  ): Promise<ConnectRpcResponse>;

  /**
   * Make a bidirectional streaming RPC call.
   * @param serviceName - Service name
   * @param methodName - Method name
   * @param requests - Async iterable of request messages
   * @param options - Call options
   */
  bidiStream<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    requests: AsyncIterable<TRequest>,
    options?: ConnectRpcOptions,
  ): AsyncIterable<ConnectRpcResponse>;

  /**
   * Close the client connection.
   */
  close(): Promise<void>;
}

/**
 * Create base URL from address and TLS config.
 */
function createBaseUrl(address: string, tls?: TlsConfig): string {
  // If address already has protocol, use as-is
  if (address.startsWith("http://") || address.startsWith("https://")) {
    return address;
  }

  // Otherwise, add protocol based on TLS config
  // Use HTTPS if TLS is configured and not explicitly insecure
  const protocol = tls && !tls.insecure ? "https" : "http";
  return `${protocol}://${address}`;
}

/**
 * Create Connect transport based on protocol.
 */
function createTransport(
  protocol: ConnectProtocol,
  baseUrl: string,
  httpVersion: HttpVersion,
  useBinaryFormat: boolean,
  sessionManager?: Http2SessionManager,
): Transport {
  const transportOptions = {
    baseUrl,
    httpVersion,
    useBinaryFormat,
    sessionManager,
  };

  switch (protocol) {
    case "connect":
      return createConnectTransport(transportOptions);
    case "grpc":
      return createGrpcTransport(transportOptions);
    case "grpc-web":
      return createGrpcWebTransport(transportOptions);
    default:
      throw new Error(`Unsupported protocol: ${protocol}`);
  }
}

/**
 * Convert DescService method to MethodInfo.
 */
function toMethodInfo(
  method: DescService["methods"][number],
): MethodInfo {
  let kind: MethodInfo["kind"];
  if (method.methodKind === "unary") {
    kind = "unary";
  } else if (method.methodKind === "server_streaming") {
    kind = "server_streaming";
  } else if (method.methodKind === "client_streaming") {
    kind = "client_streaming";
  } else {
    kind = "bidi_streaming";
  }

  return {
    name: method.name,
    localName: method.localName,
    kind,
    inputType: method.input.typeName,
    outputType: method.output.typeName,
    idempotent: method.idempotency === 1, // IDEMPOTENT = 1
  };
}

/**
 * Create a ConnectRPC client.
 *
 * @example
 * ```typescript
 * // Create client (uses reflection by default)
 * const client = createConnectRpcClient({
 *   address: "localhost:50051",
 * });
 *
 * // Discover services
 * const services = await client.reflection.listServices();
 * console.log("Available services:", services);
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
 */
export function createConnectRpcClient(
  config: ConnectRpcClientConfig,
): ConnectRpcClient {
  const {
    address,
    protocol = "grpc",
    httpVersion = "2",
    tls,
    schema = "reflection",
  } = config;

  logger.debug("Creating ConnectRPC client", {
    address,
    protocol,
    httpVersion,
    schemaType: typeof schema === "string" ? "reflection" : "FileDescriptorSet",
  });

  const baseUrl = createBaseUrl(address, tls);

  // Create Http2SessionManager for proper connection lifecycle management.
  //
  // ConnectRPC's Http2SessionManager has internal timers for:
  // 1. idleConnectionTimeoutMs: Closes idle connections after timeout
  // 2. pingIntervalMs: Sends HTTP/2 PING frames to keep connections alive
  //
  // These timers cause issues with Deno:
  // - pingIntervalMs: Deno's Node.js compatibility layer doesn't implement
  //   Http2Session.ping(), causing "Not implemented" errors
  // - Both timers: Deno's test sanitizer detects them as resource leaks
  //
  // Solution: Set both to Number.MAX_SAFE_INTEGER to effectively disable them.
  // This works because ConnectRPC's internal safeSetTimeout() function ignores
  // timeout values greater than 0x7fffffff (max signed 32-bit integer, ~24.8 days).
  // See: @connectrpc/connect-node/dist/esm/http2-session-manager.js:516-520
  //
  // Trade-offs:
  // - No automatic idle connection cleanup (must call close() explicitly)
  // - No HTTP/2 keepalive pings (connections may be closed by server/network)
  // - For short-lived test scenarios, this is acceptable
  const sessionManager = new Http2SessionManager(baseUrl, {
    idleConnectionTimeoutMs: Number.MAX_SAFE_INTEGER,
    pingIntervalMs: Number.MAX_SAFE_INTEGER,
  });

  const useBinaryFormat = config.useBinaryFormat ?? true;
  const transport = createTransport(
    protocol,
    baseUrl,
    httpVersion,
    useBinaryFormat,
    sessionManager,
  );

  // Initialize schema source: either reflection client or static FileRegistry
  let reflectionClient: CachedServerReflectionClient | undefined;
  let staticRegistry: FileRegistry | undefined;

  if (schema === "reflection") {
    // Use server reflection to discover services dynamically
    reflectionClient = new CachedServerReflectionClient(transport);
  } else if (typeof schema === "string") {
    // Load FileDescriptorSet from file path
    logger.debug("Loading FileDescriptorSet from file", { path: schema });
    const bytes = Deno.readFileSync(schema);
    const fileDescriptorSet = fromBinary(FileDescriptorSetSchema, bytes);
    staticRegistry = createFileRegistry(fileDescriptorSet);
    logger.debug("Created FileRegistry from file", {
      path: schema,
      fileCount: fileDescriptorSet.file.length,
    });
  } else if (schema instanceof Uint8Array) {
    // Create FileRegistry from FileDescriptorSet binary
    const fileDescriptorSet = fromBinary(FileDescriptorSetSchema, schema);
    staticRegistry = createFileRegistry(fileDescriptorSet);
    logger.debug("Created FileRegistry from Uint8Array", {
      fileCount: fileDescriptorSet.file.length,
    });
  } else if (schema !== undefined) {
    // schema is FileDescriptorSet object
    staticRegistry = createFileRegistry(schema);
    logger.debug("Created FileRegistry from FileDescriptorSet object", {
      fileCount: schema.file.length,
    });
  }

  return new ConnectRpcClientImpl(
    config,
    transport,
    sessionManager,
    reflectionClient,
    staticRegistry,
  );
}

/**
 * Implementation of ConnectRpcClient.
 *
 * Uses DynamicDispatchClient from connectrpc-grpcreflect for simplified
 * dynamic method invocation. This eliminates the need for manual client
 * caching and message type resolution.
 */
class ConnectRpcClientImpl implements ConnectRpcClient {
  readonly config: ConnectRpcClientConfig;
  readonly #transport: Transport;
  readonly #sessionManager: Http2SessionManager;
  readonly #reflectionClient?: CachedServerReflectionClient;
  readonly #reflectionApi: ReflectionApi;

  // Lazy-initialized DynamicDispatchClient and FileRegistry
  // When staticRegistry is provided, #fileRegistry is initialized immediately.
  #dynamicClient?: DynamicDispatchClient;
  #fileRegistry?: FileRegistry;
  #closed = false;

  constructor(
    config: ConnectRpcClientConfig,
    transport: Transport,
    sessionManager: Http2SessionManager,
    reflectionClient?: CachedServerReflectionClient,
    staticRegistry?: FileRegistry,
  ) {
    this.config = config;
    this.#transport = transport;
    this.#sessionManager = sessionManager;
    this.#reflectionClient = reflectionClient;
    this.#fileRegistry = staticRegistry;
    this.#reflectionApi = new ReflectionApiImpl(this);
  }

  get reflection(): ReflectionApi {
    return this.#reflectionApi;
  }

  /**
   * Merge default metadata from config with per-call metadata.
   * Per-call metadata takes precedence over default metadata.
   */
  #mergeMetadata(
    callMetadata?: Record<string, string>,
  ): Record<string, string> | undefined {
    const defaultMetadata = this.config.metadata;
    if (!defaultMetadata && !callMetadata) {
      return undefined;
    }
    if (!defaultMetadata) {
      return callMetadata;
    }
    if (!callMetadata) {
      return defaultMetadata;
    }
    return { ...defaultMetadata, ...callMetadata };
  }

  /**
   * Get or build the file registry.
   * Returns static registry if provided via Uint8Array schema,
   * otherwise builds from reflection.
   */
  async #getFileRegistry(): Promise<FileRegistry> {
    // Return cached or static registry if available
    if (this.#fileRegistry) {
      return this.#fileRegistry;
    }

    // Build from reflection if available
    if (this.#reflectionClient) {
      logger.debug("Building file registry via reflection");
      this.#fileRegistry = await this.#reflectionClient.buildFileRegistry();
      return this.#fileRegistry;
    }

    // Neither static registry nor reflection client available
    throw new Error(
      "No schema available. " +
        "Create client with schema: 'reflection' or provide a FileDescriptorSet.",
    );
  }

  /**
   * Get or create the DynamicDispatchClient.
   * Lazily initialized on first RPC call.
   */
  async #getDynamicClient(): Promise<DynamicDispatchClient> {
    if (this.#closed) {
      throw new ConnectionError("Client is closed");
    }

    if (this.#dynamicClient) {
      return this.#dynamicClient;
    }

    const registry = await this.#getFileRegistry();
    this.#dynamicClient = new DynamicDispatchClient(this.#transport, registry);
    return this.#dynamicClient;
  }

  /**
   * Get service descriptor for creating typed clients.
   */
  async getServiceDescriptor(serviceName: string): Promise<DescService> {
    if (this.#closed) {
      throw new ConnectionError("Client is closed");
    }

    const registry = await this.#getFileRegistry();
    const service = registry.getService(serviceName);

    if (!service) {
      throw new Error(
        `Service ${serviceName} not found in file registry. ` +
          `Available types: ${[...registry].map((t) => t.typeName).join(", ")}`,
      );
    }

    return service;
  }

  /**
   * List all available services.
   */
  async listServices(): Promise<ServiceInfo[]> {
    if (this.#closed) {
      throw new ConnectionError("Client is closed");
    }

    if (!this.#reflectionClient) {
      throw new Error(
        "Reflection is not enabled. " +
          "Create client with schema: 'reflection' to use reflection API.",
      );
    }

    logger.debug("Listing services via reflection");

    const serviceNames = await this.#reflectionClient.listServices();
    const services: ServiceInfo[] = [];

    for (const name of serviceNames) {
      // Skip reflection and health services
      if (
        name.startsWith("grpc.reflection.") ||
        name === "grpc.health.v1.Health"
      ) {
        continue;
      }

      try {
        const desc = await this.#reflectionClient.getServiceDescriptor(name);
        services.push({
          name,
          file: desc.file.name ?? "",
        });
      } catch {
        services.push({
          name,
          file: "",
        });
      }
    }

    return services;
  }

  /**
   * Get detailed information about a service.
   */
  async getServiceInfo(serviceName: string): Promise<ServiceDetail> {
    if (this.#closed) {
      throw new ConnectionError("Client is closed");
    }

    const service = await this.getServiceDescriptor(serviceName);
    const file = service.file;

    return {
      name: service.name,
      fullName: service.typeName,
      packageName: file.proto.package ?? "",
      protoFile: file.proto.name ?? "",
      methods: service.methods.map(toMethodInfo),
    };
  }

  /**
   * Check if a service exists.
   */
  async hasService(serviceName: string): Promise<boolean> {
    if (this.#closed) {
      throw new ConnectionError("Client is closed");
    }

    const services = await this.listServices();
    return services.some((s) => s.name === serviceName);
  }

  async call<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    request: TRequest,
    options?: ConnectRpcOptions,
  ): Promise<ConnectRpcResponse> {
    logger.debug("ConnectRPC unary call", {
      service: serviceName,
      method: methodName,
    });

    const dynamicClient = await this.#getDynamicClient();
    const headers: Record<string, string> = {};
    const trailers: Record<string, string> = {};

    const callOptions = {
      signal: options?.signal,
      timeoutMs: options?.timeout,
      headers: this.#mergeMetadata(options?.metadata),
      onHeader: (h: Headers) => {
        h.forEach((value, key) => {
          headers[key] = value;
        });
      },
      onTrailer: (t: Headers) => {
        t.forEach((value, key) => {
          trailers[key] = value;
        });
      },
    };

    const startTime = performance.now();
    try {
      const response = await dynamicClient.call(
        serviceName,
        methodName,
        request,
        callOptions,
      );
      const duration = performance.now() - startTime;

      return new ConnectRpcResponseImpl({
        code: 0, // OK
        message: "",
        headers,
        trailers,
        duration,
        responseMessage: response,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      if (error instanceof ConnectError) {
        const metadata = { ...headers, ...trailers };
        const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
          true;

        if (shouldThrow) {
          throw fromConnectError(error, metadata);
        }

        // Return error as response
        return new ConnectRpcResponseImpl({
          code: error.code as ConnectRpcStatusCode,
          message: error.rawMessage || error.message,
          headers,
          trailers,
          duration,
          responseMessage: null,
        });
      }
      throw error;
    }
  }

  async *serverStream<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    request: TRequest,
    options?: ConnectRpcOptions,
  ): AsyncIterable<ConnectRpcResponse> {
    logger.debug("ConnectRPC server stream", {
      service: serviceName,
      method: methodName,
    });

    const dynamicClient = await this.#getDynamicClient();
    const headers: Record<string, string> = {};
    const trailers: Record<string, string> = {};

    const callOptions = {
      signal: options?.signal,
      timeoutMs: options?.timeout,
      headers: this.#mergeMetadata(options?.metadata),
      onHeader: (h: Headers) => {
        h.forEach((value, key) => {
          headers[key] = value;
        });
      },
      onTrailer: (t: Headers) => {
        t.forEach((value, key) => {
          trailers[key] = value;
        });
      },
    };

    const startTime = performance.now();
    const stream = dynamicClient.serverStream(
      serviceName,
      methodName,
      request,
      callOptions,
    );

    try {
      for await (const message of stream) {
        const duration = performance.now() - startTime;
        yield new ConnectRpcResponseImpl({
          code: 0,
          message: "",
          headers,
          trailers,
          duration,
          responseMessage: message,
        });
      }
    } catch (error) {
      const duration = performance.now() - startTime;
      if (error instanceof ConnectError) {
        const metadata = { ...headers, ...trailers };
        const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
          true;

        if (shouldThrow) {
          throw fromConnectError(error, metadata);
        }

        // Yield error as final response
        yield new ConnectRpcResponseImpl({
          code: error.code as ConnectRpcStatusCode,
          message: error.rawMessage || error.message,
          headers,
          trailers,
          duration,
          responseMessage: null,
        });
        return;
      }
      throw error;
    }
  }

  async clientStream<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    requests: AsyncIterable<TRequest>,
    options?: ConnectRpcOptions,
  ): Promise<ConnectRpcResponse> {
    logger.debug("ConnectRPC client stream", {
      service: serviceName,
      method: methodName,
    });

    const dynamicClient = await this.#getDynamicClient();
    const headers: Record<string, string> = {};
    const trailers: Record<string, string> = {};

    const callOptions = {
      signal: options?.signal,
      timeoutMs: options?.timeout,
      headers: this.#mergeMetadata(options?.metadata),
      onHeader: (h: Headers) => {
        h.forEach((value, key) => {
          headers[key] = value;
        });
      },
      onTrailer: (t: Headers) => {
        t.forEach((value, key) => {
          trailers[key] = value;
        });
      },
    };

    const startTime = performance.now();
    try {
      const response = await dynamicClient.clientStream(
        serviceName,
        methodName,
        requests,
        callOptions,
      );
      const duration = performance.now() - startTime;

      return new ConnectRpcResponseImpl({
        code: 0,
        message: "",
        headers,
        trailers,
        duration,
        responseMessage: response,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      if (error instanceof ConnectError) {
        const metadata = { ...headers, ...trailers };
        const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
          true;

        if (shouldThrow) {
          throw fromConnectError(error, metadata);
        }

        // Return error as response
        return new ConnectRpcResponseImpl({
          code: error.code as ConnectRpcStatusCode,
          message: error.rawMessage || error.message,
          headers,
          trailers,
          duration,
          responseMessage: null,
        });
      }
      throw error;
    }
  }

  async *bidiStream<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    requests: AsyncIterable<TRequest>,
    options?: ConnectRpcOptions,
  ): AsyncIterable<ConnectRpcResponse> {
    logger.debug("ConnectRPC bidirectional stream", {
      service: serviceName,
      method: methodName,
    });

    const dynamicClient = await this.#getDynamicClient();
    const headers: Record<string, string> = {};
    const trailers: Record<string, string> = {};

    const callOptions = {
      signal: options?.signal,
      timeoutMs: options?.timeout,
      headers: this.#mergeMetadata(options?.metadata),
      onHeader: (h: Headers) => {
        h.forEach((value, key) => {
          headers[key] = value;
        });
      },
      onTrailer: (t: Headers) => {
        t.forEach((value, key) => {
          trailers[key] = value;
        });
      },
    };

    const startTime = performance.now();
    const stream = dynamicClient.bidiStream(
      serviceName,
      methodName,
      requests,
      callOptions,
    );

    try {
      for await (const message of stream) {
        const duration = performance.now() - startTime;
        yield new ConnectRpcResponseImpl({
          code: 0,
          message: "",
          headers,
          trailers,
          duration,
          responseMessage: message,
        });
      }
    } catch (error) {
      const duration = performance.now() - startTime;
      if (error instanceof ConnectError) {
        const metadata = { ...headers, ...trailers };
        const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
          true;

        if (shouldThrow) {
          throw fromConnectError(error, metadata);
        }

        // Yield error as final response
        yield new ConnectRpcResponseImpl({
          code: error.code as ConnectRpcStatusCode,
          message: error.rawMessage || error.message,
          headers,
          trailers,
          duration,
          responseMessage: null,
        });
        return;
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;

    logger.debug("Closing ConnectRPC client");

    // Clear cached state
    this.#dynamicClient = undefined;
    this.#fileRegistry = undefined;

    // Close reflection client if present.
    // This cancels any in-flight reflection requests via AbortController.
    if (this.#reflectionClient) {
      await this.#reflectionClient.close();
    }

    // Abort the HTTP/2 session manager to close all connections.
    this.#sessionManager.abort();

    // Wait for HTTP/2 session cleanup to complete.
    //
    // Deno's node:http2 compatibility layer performs cleanup asynchronously
    // after session.destroy() is called. Without this delay, Deno's test
    // resource sanitizer may detect "http2Client" or "http2ClientConnection"
    // as leaked resources.
    //
    // The 50ms delay allows:
    // 1. Pending stream handlers to complete
    // 2. Socket close events to propagate
    // 3. Internal cleanup callbacks to execute
    //
    // This is a workaround for Deno's node:http2 implementation.
    // See: https://github.com/denoland/deno/issues/26234
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

/**
 * Implementation of ReflectionApi.
 */
class ReflectionApiImpl implements ReflectionApi {
  readonly #client: ConnectRpcClientImpl;

  constructor(client: ConnectRpcClientImpl) {
    this.#client = client;
  }

  get enabled(): boolean {
    // Reflection is enabled if schema is "reflection" (explicit) or undefined (default)
    const schema = this.#client.config.schema;
    return schema === "reflection" || schema === undefined;
  }

  async listServices(): Promise<ServiceInfo[]> {
    return await this.#client.listServices();
  }

  async getServiceInfo(serviceName: string): Promise<ServiceDetail> {
    return await this.#client.getServiceInfo(serviceName);
  }

  async listMethods(serviceName: string): Promise<MethodInfo[]> {
    const serviceInfo = await this.getServiceInfo(serviceName);
    return [...serviceInfo.methods];
  }

  async hasService(serviceName: string): Promise<boolean> {
    return await this.#client.hasService(serviceName);
  }
}
