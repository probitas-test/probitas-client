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
  ServerReflectionClient,
} from "@lambdalisue/connectrpc-grpcreflect/client";
import { getLogger } from "@probitas/logger";
import { AbortError, ConnectionError, TimeoutError } from "@probitas/client";
import type {
  ConnectProtocol,
  ConnectRpcClientConfig,
  ConnectRpcConnectionConfig,
  ConnectRpcOptions,
  HttpVersion,
  MethodInfo,
  ServiceDetail,
  ServiceInfo,
  TlsConfig,
} from "./types.ts";
import {
  type ConnectRpcFailureError,
  ConnectRpcNetworkError,
  fromConnectError,
} from "./errors.ts";
import type { ConnectRpcResponse } from "./response.ts";
import {
  ConnectRpcResponseErrorImpl,
  ConnectRpcResponseFailureImpl,
  ConnectRpcResponseSuccessImpl,
} from "./response.ts";

const logger = getLogger("probitas", "client", "connectrpc");

/**
 * Convert error to appropriate failure error.
 */
function convertFetchError(error: unknown): ConnectRpcFailureError {
  if (error instanceof AbortError || error instanceof TimeoutError) {
    return error;
  }
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return new AbortError(error.message, { cause: error });
    }
    return new ConnectRpcNetworkError(error.message, { cause: error });
  }
  return new ConnectRpcNetworkError(String(error));
}

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
  call<TRequest>(
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
  serverStream<TRequest>(
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
  clientStream<TRequest>(
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
  bidiStream<TRequest>(
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
 * Resolve URL from string or connection config to a full URL string.
 *
 * @param url - URL string or connection configuration object
 * @returns Full URL string
 */
function resolveAddress(url: string | ConnectRpcConnectionConfig): string {
  if (typeof url === "string") {
    // If it looks like a URL (starts with http:// or https://), use as-is
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    // Otherwise assume it's host:port format and add http://
    return `http://${url}`;
  }
  const protocol = url.protocol ?? "http";
  const host = url.host ?? "localhost";
  const port = url.port ?? 50051;
  const path = url.path ?? "";
  return `${protocol}://${host}:${port}${path}`;
}

/**
 * Create base URL from resolved address and TLS config.
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
 * Create a new ConnectRPC client instance.
 *
 * The client supports multiple protocols (Connect, gRPC, gRPC-Web) and provides
 * Server Reflection for runtime service discovery without compile-time code generation.
 *
 * @param config - Client configuration including server URL and protocol options
 * @returns A new ConnectRPC client instance
 *
 * @example Basic usage with reflection
 * ```ts
 * import { createConnectRpcClient } from "@probitas/client-connectrpc";
 *
 * const client = createConnectRpcClient({
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
 * import { createConnectRpcClient } from "@probitas/client-connectrpc";
 *
 * const client = createConnectRpcClient({
 *   url: "http://localhost:50051",
 * });
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
 * @example Using different protocols
 * ```ts
 * import { createConnectRpcClient } from "@probitas/client-connectrpc";
 *
 * // Connect protocol (HTTP/1.1 or HTTP/2)
 * const connectClient = createConnectRpcClient({
 *   url: "http://localhost:8080",
 *   protocol: "connect",
 * });
 *
 * // gRPC protocol (HTTP/2 with binary protobuf)
 * const grpcClient = createConnectRpcClient({
 *   url: "http://localhost:50051",
 *   protocol: "grpc",
 * });
 *
 * // gRPC-Web protocol (for browser compatibility)
 * const grpcWebClient = createConnectRpcClient({
 *   url: "http://localhost:8080",
 *   protocol: "grpc-web",
 * });
 *
 * await connectClient.close();
 * await grpcClient.close();
 * await grpcWebClient.close();
 * ```
 *
 * @example Using connection config object
 * ```ts
 * import { createConnectRpcClient } from "@probitas/client-connectrpc";
 *
 * const client = createConnectRpcClient({
 *   url: {
 *     host: "grpc.example.com",
 *     port: 443,
 *     protocol: "https",
 *   },
 * });
 *
 * await client.close();
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * import { createConnectRpcClient } from "@probitas/client-connectrpc";
 *
 * await using client = createConnectRpcClient({
 *   url: "http://localhost:50051",
 * });
 *
 * const res = await client.call("echo.EchoService", "echo", { message: "test" });
 * // Client automatically closed when scope exits
 * ```
 */
export function createConnectRpcClient(
  config: ConnectRpcClientConfig,
): ConnectRpcClient {
  const {
    url,
    protocol = "grpc",
    httpVersion = "2",
    tls,
    schema = "reflection",
  } = config;

  // Resolve URL from string or connection config
  const resolvedUrl = resolveAddress(url);

  logger.debug("Creating ConnectRPC client", {
    url: resolvedUrl,
    protocol,
    httpVersion,
    schemaType: typeof schema === "string" ? "reflection" : "FileDescriptorSet",
  });

  const baseUrl = createBaseUrl(resolvedUrl, tls);

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
    reflectionClient = new CachedServerReflectionClient(
      new ServerReflectionClient(transport),
    );
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
   * Determine whether to throw on error.
   * Priority: request option > config > default (false)
   */
  #shouldThrow(options?: ConnectRpcOptions): boolean {
    return options?.throwOnError ?? this.config.throwOnError ?? false;
  }

  /**
   * Merge default metadata from config with per-call metadata.
   * Per-call metadata takes precedence over default metadata.
   */
  #mergeMetadata(callMetadata?: HeadersInit): Headers | undefined {
    const defaultMetadata = this.config.metadata;
    if (!defaultMetadata && !callMetadata) {
      return undefined;
    }
    const merged = new Headers(defaultMetadata);
    if (callMetadata) {
      const call = new Headers(callMetadata);
      call.forEach((value, key) => {
        merged.set(key, value);
      });
    }
    return merged;
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

  async call<TRequest>(
    serviceName: string,
    methodName: string,
    request: TRequest,
    options?: ConnectRpcOptions,
  ): Promise<ConnectRpcResponse> {
    logger.info("ConnectRPC unary call", {
      service: serviceName,
      method: methodName,
    });

    const shouldThrow = this.#shouldThrow(options);

    let dynamicClient;
    const startTime = performance.now();
    try {
      dynamicClient = await this.#getDynamicClient();
    } catch (error) {
      const duration = performance.now() - startTime;
      const failureError = convertFetchError(error);

      if (shouldThrow) {
        throw failureError;
      }
      return new ConnectRpcResponseFailureImpl({
        error: failureError,
        duration,
      });
    }

    let headers = new Headers();
    let trailers = new Headers();

    const callOptions = {
      signal: options?.signal,
      timeoutMs: options?.timeout,
      headers: this.#mergeMetadata(options?.metadata),
      onHeader: (h: Headers) => {
        headers = h;
      },
      onTrailer: (t: Headers) => {
        trailers = t;
      },
    };

    try {
      const response = await dynamicClient.call(
        serviceName,
        methodName,
        request,
        callOptions,
      );
      const duration = performance.now() - startTime;

      return new ConnectRpcResponseSuccessImpl({
        response,
        headers,
        trailers,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      if (error instanceof ConnectError) {
        // Merge headers and trailers for error metadata
        const metadata = new Headers(headers);
        trailers.forEach((value, key) => {
          metadata.set(key, value);
        });
        const rpcError = fromConnectError(error, metadata);

        if (shouldThrow) {
          throw rpcError;
        }

        // Return error as response
        return new ConnectRpcResponseErrorImpl({
          error,
          rpcError,
          headers,
          trailers,
          duration,
        });
      }

      // Non-ConnectError: treat as network failure
      const failureError = convertFetchError(error);

      if (shouldThrow) {
        throw failureError;
      }
      return new ConnectRpcResponseFailureImpl({
        error: failureError,
        duration,
      });
    }
  }

  async *serverStream<TRequest>(
    serviceName: string,
    methodName: string,
    request: TRequest,
    options?: ConnectRpcOptions,
  ): AsyncIterable<ConnectRpcResponse> {
    logger.info("ConnectRPC server stream", {
      service: serviceName,
      method: methodName,
    });

    const shouldThrow = this.#shouldThrow(options);

    let dynamicClient;
    const startTime = performance.now();
    try {
      dynamicClient = await this.#getDynamicClient();
    } catch (error) {
      const duration = performance.now() - startTime;
      const failureError = convertFetchError(error);

      if (shouldThrow) {
        throw failureError;
      }
      yield new ConnectRpcResponseFailureImpl({
        error: failureError,
        duration,
      });
      return;
    }

    let headers = new Headers();
    let trailers = new Headers();

    const callOptions = {
      signal: options?.signal,
      timeoutMs: options?.timeout,
      headers: this.#mergeMetadata(options?.metadata),
      onHeader: (h: Headers) => {
        headers = h;
      },
      onTrailer: (t: Headers) => {
        trailers = t;
      },
    };

    const stream = dynamicClient.serverStream(
      serviceName,
      methodName,
      request,
      callOptions,
    );

    try {
      for await (const message of stream) {
        const duration = performance.now() - startTime;
        yield new ConnectRpcResponseSuccessImpl({
          response: message,
          headers,
          trailers,
          duration,
        });
      }
    } catch (error) {
      const duration = performance.now() - startTime;
      if (error instanceof ConnectError) {
        const metadata = new Headers(headers);
        trailers.forEach((value, key) => {
          metadata.set(key, value);
        });
        const rpcError = fromConnectError(error, metadata);

        if (shouldThrow) {
          throw rpcError;
        }

        // Yield error as final response
        yield new ConnectRpcResponseErrorImpl({
          error,
          rpcError,
          headers,
          trailers,
          duration,
        });
        return;
      }

      // Non-ConnectError: treat as network failure
      const failureError = convertFetchError(error);

      if (shouldThrow) {
        throw failureError;
      }
      yield new ConnectRpcResponseFailureImpl({
        error: failureError,
        duration,
      });
    }
  }

  async clientStream<TRequest>(
    serviceName: string,
    methodName: string,
    requests: AsyncIterable<TRequest>,
    options?: ConnectRpcOptions,
  ): Promise<ConnectRpcResponse> {
    logger.info("ConnectRPC client stream", {
      service: serviceName,
      method: methodName,
    });

    const shouldThrow = this.#shouldThrow(options);

    let dynamicClient;
    const startTime = performance.now();
    try {
      dynamicClient = await this.#getDynamicClient();
    } catch (error) {
      const duration = performance.now() - startTime;
      const failureError = convertFetchError(error);

      if (shouldThrow) {
        throw failureError;
      }
      return new ConnectRpcResponseFailureImpl({
        error: failureError,
        duration,
      });
    }

    let headers = new Headers();
    let trailers = new Headers();

    const callOptions = {
      signal: options?.signal,
      timeoutMs: options?.timeout,
      headers: this.#mergeMetadata(options?.metadata),
      onHeader: (h: Headers) => {
        headers = h;
      },
      onTrailer: (t: Headers) => {
        trailers = t;
      },
    };

    try {
      const response = await dynamicClient.clientStream(
        serviceName,
        methodName,
        requests,
        callOptions,
      );
      const duration = performance.now() - startTime;

      return new ConnectRpcResponseSuccessImpl({
        response,
        headers,
        trailers,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      if (error instanceof ConnectError) {
        const metadata = new Headers(headers);
        trailers.forEach((value, key) => {
          metadata.set(key, value);
        });
        const rpcError = fromConnectError(error, metadata);

        if (shouldThrow) {
          throw rpcError;
        }

        // Return error as response
        return new ConnectRpcResponseErrorImpl({
          error,
          rpcError,
          headers,
          trailers,
          duration,
        });
      }

      // Non-ConnectError: treat as network failure
      const failureError = convertFetchError(error);

      if (shouldThrow) {
        throw failureError;
      }
      return new ConnectRpcResponseFailureImpl({
        error: failureError,
        duration,
      });
    }
  }

  async *bidiStream<TRequest>(
    serviceName: string,
    methodName: string,
    requests: AsyncIterable<TRequest>,
    options?: ConnectRpcOptions,
  ): AsyncIterable<ConnectRpcResponse> {
    logger.info("ConnectRPC bidirectional stream", {
      service: serviceName,
      method: methodName,
    });

    const shouldThrow = this.#shouldThrow(options);

    let dynamicClient;
    const startTime = performance.now();
    try {
      dynamicClient = await this.#getDynamicClient();
    } catch (error) {
      const duration = performance.now() - startTime;
      const failureError = convertFetchError(error);

      if (shouldThrow) {
        throw failureError;
      }
      yield new ConnectRpcResponseFailureImpl({
        error: failureError,
        duration,
      });
      return;
    }

    let headers = new Headers();
    let trailers = new Headers();

    const callOptions = {
      signal: options?.signal,
      timeoutMs: options?.timeout,
      headers: this.#mergeMetadata(options?.metadata),
      onHeader: (h: Headers) => {
        headers = h;
      },
      onTrailer: (t: Headers) => {
        trailers = t;
      },
    };

    const stream = dynamicClient.bidiStream(
      serviceName,
      methodName,
      requests,
      callOptions,
    );

    try {
      for await (const message of stream) {
        const duration = performance.now() - startTime;
        yield new ConnectRpcResponseSuccessImpl({
          response: message,
          headers,
          trailers,
          duration,
        });
      }
    } catch (error) {
      const duration = performance.now() - startTime;
      if (error instanceof ConnectError) {
        const metadata = new Headers(headers);
        trailers.forEach((value, key) => {
          metadata.set(key, value);
        });
        const rpcError = fromConnectError(error, metadata);

        if (shouldThrow) {
          throw rpcError;
        }

        // Yield error as final response
        yield new ConnectRpcResponseErrorImpl({
          error,
          rpcError,
          headers,
          trailers,
          duration,
        });
        return;
      }

      // Non-ConnectError: treat as network failure
      const failureError = convertFetchError(error);

      if (shouldThrow) {
        throw failureError;
      }
      yield new ConnectRpcResponseFailureImpl({
        error: failureError,
        duration,
      });
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
