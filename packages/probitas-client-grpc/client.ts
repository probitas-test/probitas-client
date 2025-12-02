import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { Buffer } from "node:buffer";
import { type CommonOptions, ConnectionError } from "@probitas/client";
import {
  type ErrorDetail,
  GrpcError,
  GrpcInternalError,
  GrpcNotFoundError,
  GrpcPermissionDeniedError,
  GrpcResourceExhaustedError,
  GrpcUnauthenticatedError,
  GrpcUnavailableError,
} from "./errors.ts";
import { parseStatusDetails } from "./status_details.ts";
import type { GrpcResponse } from "./response.ts";
import { GrpcResponseImpl } from "./response.ts";
import type { GrpcStatusCode } from "./status.ts";
import { GrpcReflectionClient } from "./reflection.ts";

/**
 * TLS configuration for gRPC connections.
 */
export interface TlsConfig {
  /** Root CA certificate (PEM format). */
  readonly rootCerts?: Uint8Array;
  /** Client certificate (PEM format). */
  readonly clientCert?: Uint8Array;
  /** Client private key (PEM format). */
  readonly clientKey?: Uint8Array;
  /** Skip server certificate verification (use only for testing). */
  readonly insecure?: boolean;
}

/**
 * Configuration for creating a gRPC client.
 */
export interface GrpcClientConfig extends CommonOptions {
  /** Server address (host:port). */
  readonly address: string;

  /** TLS configuration. If not provided, uses insecure credentials. */
  readonly tls?: TlsConfig;

  /** Default metadata to send with every request. */
  readonly metadata?: Record<string, string>;

  /**
   * Schema resolution configuration.
   * - "reflection": Use Server Reflection to discover services dynamically
   * - string/string[]: .proto file path(s)
   * - Uint8Array: FileDescriptorSet binary (from `protoc --descriptor_set_out`)
   */
  readonly schema?: "reflection" | string | string[] | Uint8Array;

  /**
   * Proto loader options.
   */
  readonly protoLoaderOptions?: protoLoader.Options;

  /**
   * Whether to throw GrpcError on non-OK responses (code !== 0).
   * Can be overridden per-request via GrpcOptions.throwOnError.
   * @default true
   */
  readonly throwOnError?: boolean;
}

/**
 * Options for individual gRPC calls.
 */
export interface GrpcOptions extends CommonOptions {
  /** Metadata to send with the request. */
  readonly metadata?: Record<string, string>;

  /**
   * Whether to throw GrpcError on non-OK responses (code !== 0).
   * Overrides GrpcClientConfig.throwOnError.
   * @default true (when not specified in client config)
   */
  readonly throwOnError?: boolean;
}

/**
 * Method name type helper.
 * When TService is unknown, allows any string.
 * When TService is a specific type, restricts to keyof TService.
 */
type MethodName<TService> = unknown extends TService ? string
  : keyof TService & string;

/**
 * gRPC client interface.
 */
export interface GrpcClient<TService = unknown> extends AsyncDisposable {
  /** The client configuration. */
  readonly config: GrpcClientConfig;

  /**
   * Make a unary RPC call.
   * @param method - Full method path (e.g., "/package.Service/Method")
   * @param request - Request message (will be serialized based on schema)
   * @param options - Call options
   */
  call<TRequest = unknown>(
    method: MethodName<TService>,
    request: TRequest,
    options?: GrpcOptions,
  ): Promise<GrpcResponse>;

  /**
   * Make a server streaming RPC call.
   * @param method - Full method path (e.g., "/package.Service/Method")
   * @param request - Request message
   * @param options - Call options
   */
  serverStream<TRequest = unknown>(
    method: MethodName<TService>,
    request: TRequest,
    options?: GrpcOptions,
  ): AsyncIterable<GrpcResponse>;

  /**
   * Make a client streaming RPC call.
   * @param method - Full method path (e.g., "/package.Service/Method")
   * @param requests - Async iterable of request messages
   * @param options - Call options
   */
  clientStream<TRequest = unknown>(
    method: MethodName<TService>,
    requests: AsyncIterable<TRequest>,
    options?: GrpcOptions,
  ): Promise<GrpcResponse>;

  /**
   * Make a bidirectional streaming RPC call.
   * @param method - Full method path (e.g., "/package.Service/Method")
   * @param requests - Async iterable of request messages
   * @param options - Call options
   */
  bidiStream<TRequest = unknown>(
    method: MethodName<TService>,
    requests: AsyncIterable<TRequest>,
    options?: GrpcOptions,
  ): AsyncIterable<GrpcResponse>;

  /**
   * Close the client connection.
   */
  close(): Promise<void>;
}

function createCredentials(tls?: TlsConfig): grpc.ChannelCredentials {
  if (!tls) {
    return grpc.credentials.createInsecure();
  }
  if (tls.insecure) {
    return grpc.credentials.createInsecure();
  }
  return grpc.credentials.createSsl(
    tls.rootCerts ? Buffer.from(tls.rootCerts) : null,
    tls.clientKey ? Buffer.from(tls.clientKey) : null,
    tls.clientCert ? Buffer.from(tls.clientCert) : null,
  );
}

function createMetadata(
  defaultMeta?: Record<string, string>,
  callMeta?: Record<string, string>,
): grpc.Metadata {
  const metadata = new grpc.Metadata();
  if (defaultMeta) {
    for (const [key, value] of Object.entries(defaultMeta)) {
      metadata.add(key, value);
    }
  }
  if (callMeta) {
    for (const [key, value] of Object.entries(callMeta)) {
      metadata.add(key, value);
    }
  }
  return metadata;
}

function metadataToRecord(metadata: grpc.Metadata): Record<string, string> {
  const record: Record<string, string> = {};
  const map = metadata.getMap();
  for (const [key, value] of Object.entries(map)) {
    record[key] = typeof value === "string" ? value : value.toString();
  }
  return record;
}

function createCallOptions(options?: GrpcOptions): grpc.CallOptions {
  const callOptions: grpc.CallOptions = {};
  if (options?.timeout) {
    callOptions.deadline = new Date(Date.now() + options.timeout);
  }
  return callOptions;
}

/**
 * Extract error details from metadata.
 * The grpc-status-details-bin trailer contains base64-encoded google.rpc.Status.
 */
function extractErrorDetails(
  metadata?: Record<string, string>,
): ErrorDetail[] {
  if (!metadata) {
    return [];
  }

  // grpc-status-details-bin contains the encoded google.rpc.Status
  const statusDetailsBin = metadata["grpc-status-details-bin"];
  if (!statusDetailsBin) {
    return [];
  }

  return parseStatusDetails(statusDetailsBin);
}

/**
 * Create appropriate GrpcError subclass based on status code.
 */
function createGrpcError(
  code: GrpcStatusCode,
  message: string,
  metadata?: Record<string, string>,
): GrpcError {
  const details = extractErrorDetails(metadata);
  const options = { metadata, details };

  switch (code) {
    case 5:
      return new GrpcNotFoundError(message, options);
    case 7:
      return new GrpcPermissionDeniedError(message, options);
    case 8:
      return new GrpcResourceExhaustedError(message, options);
    case 13:
      return new GrpcInternalError(message, options);
    case 14:
      return new GrpcUnavailableError(message, options);
    case 16:
      return new GrpcUnauthenticatedError(message, options);
    default:
      return new GrpcError(
        `gRPC error (code ${code}): ${message}`,
        code,
        message,
        options,
      );
  }
}

/**
 * Determine whether to throw on error based on config and options.
 * Options take precedence over config, default is true.
 */
function shouldThrowOnError(
  config: GrpcClientConfig,
  options?: GrpcOptions,
): boolean {
  if (options?.throwOnError !== undefined) {
    return options.throwOnError;
  }
  if (config.throwOnError !== undefined) {
    return config.throwOnError;
  }
  return true;
}

/**
 * Create a gRPC client using @grpc/grpc-js.
 *
 * @example
 * ```typescript
 * // With .proto file
 * const client = await createGrpcClient({
 *   address: "localhost:50051",
 *   schema: "./greeter.proto",
 * });
 *
 * const response = await client.call("SayHello", { name: "World" });
 * console.log(response.json()); // { message: "Hello World" }
 *
 * await client.close();
 * ```
 */
export async function createGrpcClient<TService = unknown>(
  config: GrpcClientConfig,
): Promise<GrpcClient<TService>> {
  const credentials = createCredentials(config.tls);
  const loaderOptions: protoLoader.Options = {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    ...config.protoLoaderOptions,
  };

  // Load proto definition if schema is provided as file path(s)
  let packageDefinition: protoLoader.PackageDefinition | undefined;
  let grpcObject: grpc.GrpcObject | undefined;
  let reflectionClient: GrpcReflectionClient | undefined;

  if (config.schema === "reflection") {
    // Use Server Reflection to discover services dynamically
    reflectionClient = new GrpcReflectionClient(
      config.address,
      credentials,
    );
  } else if (config.schema) {
    if (typeof config.schema === "string" || Array.isArray(config.schema)) {
      // Load from .proto file path(s)
      const protoFiles = Array.isArray(config.schema)
        ? config.schema
        : [config.schema];

      packageDefinition = await protoLoader.load(protoFiles, loaderOptions);
      grpcObject = grpc.loadPackageDefinition(packageDefinition);
    } else if (config.schema instanceof Uint8Array) {
      // Load from FileDescriptorSet binary (protoc --descriptor_set_out)
      packageDefinition = protoLoader.loadFileDescriptorSetFromBuffer(
        Buffer.from(config.schema),
        loaderOptions,
      );
      grpcObject = grpc.loadPackageDefinition(packageDefinition);
    }
  }

  return new GrpcClientImpl<TService>(
    config,
    credentials,
    packageDefinition,
    grpcObject,
    reflectionClient,
    loaderOptions,
  );
}

// deno-lint-ignore no-explicit-any
type ServiceClient = grpc.Client & Record<string, any>;

class GrpcClientImpl<TService> implements GrpcClient<TService> {
  readonly config: GrpcClientConfig;
  readonly #credentials: grpc.ChannelCredentials;
  readonly #packageDefinition?: protoLoader.PackageDefinition;
  #grpcObject?: grpc.GrpcObject;
  readonly #reflectionClient?: GrpcReflectionClient;
  readonly #clients: Map<string, ServiceClient> = new Map();
  readonly #reflectionCache: Map<string, grpc.GrpcObject> = new Map();
  readonly #protoLoaderOptions: protoLoader.Options;
  #closed = false;

  constructor(
    config: GrpcClientConfig,
    credentials: grpc.ChannelCredentials,
    packageDefinition?: protoLoader.PackageDefinition,
    grpcObject?: grpc.GrpcObject,
    reflectionClient?: GrpcReflectionClient,
    protoLoaderOptions: protoLoader.Options = {},
  ) {
    this.config = config;
    this.#credentials = credentials;
    this.#packageDefinition = packageDefinition;
    this.#grpcObject = grpcObject;
    this.#reflectionClient = reflectionClient;
    this.#protoLoaderOptions = protoLoaderOptions;
  }

  async #getServiceClientAsync(servicePath: string): Promise<ServiceClient> {
    if (this.#closed) {
      throw new ConnectionError("Client is closed");
    }

    const cached = this.#clients.get(servicePath);
    if (cached) {
      return cached;
    }

    // Try reflection first if available
    if (this.#reflectionClient && !this.#grpcObject) {
      const cachedGrpcObject = this.#reflectionCache.get(servicePath);
      if (cachedGrpcObject) {
        return this.#createClientFromGrpcObject(servicePath, cachedGrpcObject);
      }

      // Use reflection to get service definition
      const descriptor = await this.#reflectionClient.getDescriptorBySymbol(
        servicePath,
      );
      const packageDefinition = descriptor.getPackageDefinition(
        this.#protoLoaderOptions,
      );
      const grpcObject = grpc.loadPackageDefinition(packageDefinition);
      this.#reflectionCache.set(servicePath, grpcObject);
      return this.#createClientFromGrpcObject(servicePath, grpcObject);
    }

    if (!this.#grpcObject) {
      throw new Error(
        "No schema loaded. Provide a .proto file path or use 'reflection' in config.schema",
      );
    }

    return this.#createClientFromGrpcObject(servicePath, this.#grpcObject);
  }

  #createClientFromGrpcObject(
    servicePath: string,
    grpcObject: grpc.GrpcObject,
  ): ServiceClient {
    // Navigate through the package path to find the service
    const parts = servicePath.split(".");
    // deno-lint-ignore no-explicit-any
    let current: any = grpcObject;
    for (const part of parts) {
      current = current?.[part];
      if (!current) {
        throw new Error(`Service not found: ${servicePath}`);
      }
    }

    if (typeof current !== "function") {
      throw new Error(`Invalid service: ${servicePath}`);
    }

    const client = new current(
      this.config.address,
      this.#credentials,
    ) as ServiceClient;
    this.#clients.set(servicePath, client);
    return client;
  }

  #parseMethodPath(
    method: string,
  ): { servicePath: string; methodName: string } {
    // Method can be:
    // - "/package.Service/Method" (full path)
    // - "package.Service/Method" (without leading slash)
    // - "Method" (method name only, requires single service in proto)
    const normalized = method.startsWith("/") ? method.slice(1) : method;
    const slashIndex = normalized.lastIndexOf("/");

    if (slashIndex === -1) {
      // Just method name - find the service from package definition
      if (!this.#packageDefinition) {
        throw new Error(
          `Cannot resolve method "${method}" without service path. ` +
            "Use full path like '/package.Service/Method'",
        );
      }
      // Try to find the method in loaded services
      for (const [fullPath, def] of Object.entries(this.#packageDefinition)) {
        // deno-lint-ignore no-explicit-any
        const methodDef = (def as any)[method];
        if (methodDef) {
          const servicePath = fullPath.replace(/\/[^/]+$/, "");
          return { servicePath, methodName: method };
        }
      }
      throw new Error(`Method not found: ${method}`);
    }

    return {
      servicePath: normalized.slice(0, slashIndex),
      methodName: normalized.slice(slashIndex + 1),
    };
  }

  async call<TRequest = unknown>(
    method: keyof TService & string,
    request: TRequest,
    options?: GrpcOptions,
  ): Promise<GrpcResponse> {
    const { servicePath, methodName } = this.#parseMethodPath(method as string);
    const client = await this.#getServiceClientAsync(servicePath);
    const metadata = createMetadata(this.config.metadata, options?.metadata);
    const callOptions = createCallOptions(options);
    const throwOnError = shouldThrowOnError(this.config, options);

    const startTime = performance.now();

    return new Promise<GrpcResponse>((resolve, reject) => {
      const methodFn = client[methodName];
      if (typeof methodFn !== "function") {
        reject(new Error(`Method not found: ${methodName}`));
        return;
      }

      // Track state for coordinating callback and status event
      // deno-lint-ignore no-explicit-any
      let pendingResponse: any = null;
      let trailers: Record<string, string> = {};
      let statusReceived = false;
      let callbackReceived = false;

      const tryResolve = () => {
        // Only resolve when both callback and status event have been received
        if (!callbackReceived || !statusReceived) return;

        const duration = performance.now() - startTime;
        const body = pendingResponse
          ? new TextEncoder().encode(JSON.stringify(pendingResponse))
          : null;

        resolve(
          new GrpcResponseImpl({
            code: 0,
            message: "",
            body,
            trailers,
            duration,
            deserializer: () => pendingResponse,
          }),
        );
      };

      const call = methodFn.call(
        client,
        request,
        metadata,
        callOptions,
        // deno-lint-ignore no-explicit-any
        (error: grpc.ServiceError | null, response: any) => {
          if (error) {
            const duration = performance.now() - startTime;
            const code = (error.code ?? 2) as GrpcStatusCode;
            const errorMessage = error.message ?? "Unknown error";
            // On error, trailing metadata comes from error.metadata
            const errorTrailers = error.metadata
              ? metadataToRecord(error.metadata)
              : {};

            if (throwOnError) {
              reject(createGrpcError(code, errorMessage, errorTrailers));
              return;
            }

            resolve(
              new GrpcResponseImpl({
                code,
                message: errorMessage,
                body: null,
                trailers: errorTrailers,
                duration,
                deserializer: (bytes) => {
                  const text = new TextDecoder().decode(bytes);
                  return JSON.parse(text);
                },
              }),
            );
            return;
          }

          // Success: store response and wait for status event
          pendingResponse = response;
          callbackReceived = true;
          tryResolve();
        },
      ) as grpc.ClientUnaryCall;

      // Listen for status event to capture trailing metadata
      call.on("status", (status: grpc.StatusObject) => {
        if (status.metadata) {
          trailers = metadataToRecord(status.metadata);
        }
        statusReceived = true;
        tryResolve();
      });
    });
  }

  async *serverStream<TRequest = unknown>(
    method: keyof TService & string,
    request: TRequest,
    options?: GrpcOptions,
  ): AsyncIterable<GrpcResponse> {
    const { servicePath, methodName } = this.#parseMethodPath(method as string);
    const client = await this.#getServiceClientAsync(servicePath);
    const metadata = createMetadata(this.config.metadata, options?.metadata);
    const callOptions = createCallOptions(options);
    const throwOnError = shouldThrowOnError(this.config, options);

    const methodFn = client[methodName];
    if (typeof methodFn !== "function") {
      throw new Error(`Method not found: ${methodName}`);
    }

    const stream = methodFn.call(
      client,
      request,
      metadata,
      callOptions,
    ) as grpc.ClientReadableStream<unknown>;

    const startTime = performance.now();

    const queue: Array<{
      type: "data" | "error" | "end";
      // deno-lint-ignore no-explicit-any
      value?: any;
      error?: grpc.ServiceError;
    }> = [];
    let resolver: (() => void) | null = null;

    stream.on("data", (data) => {
      queue.push({ type: "data", value: data });
      resolver?.();
    });

    stream.on("error", (error: grpc.ServiceError) => {
      queue.push({ type: "error", error });
      resolver?.();
    });

    stream.on("end", () => {
      queue.push({ type: "end" });
      resolver?.();
    });

    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          resolver = resolve;
        });
        resolver = null;
      }

      const item = queue.shift();
      if (!item) continue;

      const duration = performance.now() - startTime;

      if (item.type === "end") {
        break;
      }

      if (item.type === "error") {
        const code = (item.error?.code ?? 2) as GrpcStatusCode;
        const errorMessage = item.error?.message ?? "Unknown error";
        const errorTrailers = item.error?.metadata
          ? metadataToRecord(item.error.metadata)
          : {};

        if (throwOnError) {
          throw createGrpcError(code, errorMessage, errorTrailers);
        }

        yield new GrpcResponseImpl({
          code,
          message: errorMessage,
          body: null,
          trailers: errorTrailers,
          duration,
        });
        break;
      }

      const body = item.value
        ? new TextEncoder().encode(JSON.stringify(item.value))
        : null;

      yield new GrpcResponseImpl({
        code: 0,
        message: "",
        body,
        trailers: {},
        duration,
        deserializer: () => item.value,
      });
    }
  }

  async clientStream<TRequest = unknown>(
    method: keyof TService & string,
    requests: AsyncIterable<TRequest>,
    options?: GrpcOptions,
  ): Promise<GrpcResponse> {
    const { servicePath, methodName } = this.#parseMethodPath(method as string);
    const client = await this.#getServiceClientAsync(servicePath);
    const metadata = createMetadata(this.config.metadata, options?.metadata);
    const callOptions = createCallOptions(options);
    const throwOnError = shouldThrowOnError(this.config, options);

    const methodFn = client[methodName];
    if (typeof methodFn !== "function") {
      throw new Error(`Method not found: ${methodName}`);
    }

    const startTime = performance.now();

    return new Promise<GrpcResponse>((resolve, reject) => {
      const stream = methodFn.call(
        client,
        metadata,
        callOptions,
        // deno-lint-ignore no-explicit-any
        (error: grpc.ServiceError | null, response: any) => {
          const duration = performance.now() - startTime;

          if (error) {
            const code = (error.code ?? 2) as GrpcStatusCode;
            const errorMessage = error.message ?? "Unknown error";
            const errorTrailers = error.metadata
              ? metadataToRecord(error.metadata)
              : {};

            if (throwOnError) {
              reject(createGrpcError(code, errorMessage, errorTrailers));
              return;
            }

            resolve(
              new GrpcResponseImpl({
                code,
                message: errorMessage,
                body: null,
                trailers: errorTrailers,
                duration,
              }),
            );
            return;
          }

          const body = response
            ? new TextEncoder().encode(JSON.stringify(response))
            : null;

          resolve(
            new GrpcResponseImpl({
              code: 0,
              message: "",
              body,
              trailers: {},
              duration,
              deserializer: () => response,
            }),
          );
        },
      ) as grpc.ClientWritableStream<TRequest>;

      (async () => {
        try {
          for await (const request of requests) {
            stream.write(request);
          }
          stream.end();
        } catch (err) {
          reject(err);
        }
      })();
    });
  }

  async *bidiStream<TRequest = unknown>(
    method: keyof TService & string,
    requests: AsyncIterable<TRequest>,
    options?: GrpcOptions,
  ): AsyncIterable<GrpcResponse> {
    const { servicePath, methodName } = this.#parseMethodPath(method as string);
    const client = await this.#getServiceClientAsync(servicePath);
    const metadata = createMetadata(this.config.metadata, options?.metadata);
    const callOptions = createCallOptions(options);
    const throwOnError = shouldThrowOnError(this.config, options);

    const methodFn = client[methodName];
    if (typeof methodFn !== "function") {
      throw new Error(`Method not found: ${methodName}`);
    }

    const stream = methodFn.call(
      client,
      metadata,
      callOptions,
    ) as grpc.ClientDuplexStream<TRequest, unknown>;

    const startTime = performance.now();

    // Write requests in the background
    (async () => {
      try {
        for await (const request of requests) {
          stream.write(request);
        }
        stream.end();
      } catch {
        stream.end();
      }
    })();

    const queue: Array<{
      type: "data" | "error" | "end";
      // deno-lint-ignore no-explicit-any
      value?: any;
      error?: grpc.ServiceError;
    }> = [];
    let resolver: (() => void) | null = null;

    stream.on("data", (data) => {
      queue.push({ type: "data", value: data });
      resolver?.();
    });

    stream.on("error", (error: grpc.ServiceError) => {
      queue.push({ type: "error", error });
      resolver?.();
    });

    stream.on("end", () => {
      queue.push({ type: "end" });
      resolver?.();
    });

    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          resolver = resolve;
        });
        resolver = null;
      }

      const item = queue.shift();
      if (!item) continue;

      const duration = performance.now() - startTime;

      if (item.type === "end") {
        break;
      }

      if (item.type === "error") {
        const code = (item.error?.code ?? 2) as GrpcStatusCode;
        const errorMessage = item.error?.message ?? "Unknown error";
        const errorTrailers = item.error?.metadata
          ? metadataToRecord(item.error.metadata)
          : {};

        if (throwOnError) {
          throw createGrpcError(code, errorMessage, errorTrailers);
        }

        yield new GrpcResponseImpl({
          code,
          message: errorMessage,
          body: null,
          trailers: errorTrailers,
          duration,
        });
        break;
      }

      const body = item.value
        ? new TextEncoder().encode(JSON.stringify(item.value))
        : null;

      yield new GrpcResponseImpl({
        code: 0,
        message: "",
        body,
        trailers: {},
        duration,
        deserializer: () => item.value,
      });
    }
  }

  close(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    this.#closed = true;

    for (const client of this.#clients.values()) {
      client.close();
    }
    this.#clients.clear();

    // Close the reflection client's internal gRPC client
    if (this.#reflectionClient) {
      this.#reflectionClient.close();
    }

    return Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}
