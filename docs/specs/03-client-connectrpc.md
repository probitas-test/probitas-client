# @probitas/client-connectrpc

ConnectRPC client package supporting Connect, gRPC, and gRPC-Web protocols.

This package provides the core ConnectRPC/gRPC functionality with Server
Reflection support. The `@probitas/client-grpc` package is a thin wrapper around
this package with `protocol: "grpc"` fixed.

## ConnectRpcResponse

```typescript
/**
 * ConnectRPC response
 */
interface ConnectRpcResponse {
  /** Whether the call succeeded (code === 0) */
  readonly ok: boolean;

  /** ConnectRPC/gRPC status code */
  readonly code: ConnectRpcStatusCode;

  /** Status message (empty string for successful responses) */
  readonly message: string;

  /** Response headers */
  readonly headers: Record<string, string>;

  /** Response trailers (sent at end of RPC) */
  readonly trailers: Record<string, string>;

  /** Response time in milliseconds */
  readonly duration: number;

  /**
   * Get deserialized response data.
   * Returns the response message as-is (already deserialized by Connect).
   * Returns null if the response is an error or has no data.
   */
  data<T = any>(): T | null;

  /**
   * Get raw response message.
   */
  raw(): unknown;
}

/** ConnectRPC/gRPC status codes */
type ConnectRpcStatusCode =
  | 0 // OK
  | 1 // CANCELLED
  | 2 // UNKNOWN
  | 3 // INVALID_ARGUMENT
  | 4 // DEADLINE_EXCEEDED
  | 5 // NOT_FOUND
  | 6 // ALREADY_EXISTS
  | 7 // PERMISSION_DENIED
  | 8 // RESOURCE_EXHAUSTED
  | 9 // FAILED_PRECONDITION
  | 10 // ABORTED
  | 11 // OUT_OF_RANGE
  | 12 // UNIMPLEMENTED
  | 13 // INTERNAL
  | 14 // UNAVAILABLE
  | 15 // DATA_LOSS
  | 16; // UNAUTHENTICATED

/** Status code constants for readable assertions */
const ConnectRpcStatus = {
  OK: 0,
  CANCELLED: 1,
  UNKNOWN: 2,
  INVALID_ARGUMENT: 3,
  DEADLINE_EXCEEDED: 4,
  NOT_FOUND: 5,
  ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7,
  RESOURCE_EXHAUSTED: 8,
  FAILED_PRECONDITION: 9,
  ABORTED: 10,
  OUT_OF_RANGE: 11,
  UNIMPLEMENTED: 12,
  INTERNAL: 13,
  UNAVAILABLE: 14,
  DATA_LOSS: 15,
  UNAUTHENTICATED: 16,
} as const;
```

## ConnectRpcError

```typescript
/**
 * Rich error detail from google.rpc.Status.
 */
interface ErrorDetail {
  /** Type URL (e.g., "type.googleapis.com/google.rpc.BadRequest") */
  readonly typeUrl: string;

  /**
   * Decoded error detail value.
   * The structure depends on the typeUrl.
   */
  readonly value: unknown;
}

class ConnectRpcError extends ClientError {
  readonly code: ConnectRpcStatusCode;
  readonly rawMessage: string;
  readonly metadata?: Record<string, string>;

  /** Array of decoded error details */
  readonly details: readonly ErrorDetail[];
}

class ConnectRpcUnauthenticatedError extends ConnectRpcError {
  readonly code = 16;
}
class ConnectRpcPermissionDeniedError extends ConnectRpcError {
  readonly code = 7;
}
class ConnectRpcNotFoundError extends ConnectRpcError {
  readonly code = 5;
}
class ConnectRpcResourceExhaustedError extends ConnectRpcError {
  readonly code = 8;
}
class ConnectRpcInternalError extends ConnectRpcError {
  readonly code = 13;
}
class ConnectRpcUnavailableError extends ConnectRpcError {
  readonly code = 14;
}
```

## expectConnectRpcResponse

```typescript
interface ConnectRpcResponseExpectation {
  // --- Status checks ---
  ok(): this;
  notOk(): this;
  code(code: ConnectRpcStatusCode): this;
  codeIn(...codes: ConnectRpcStatusCode[]): this;

  // --- Message checks ---
  message(expected: string | RegExp): this;
  messageContains(substring: string): this;
  messageMatch(matcher: (message: string) => void): this;

  // --- Header checks ---
  headers(key: string, expected: string | RegExp): this;
  headersExist(key: string): this;

  // --- Trailer checks ---
  trailers(key: string, expected: string | RegExp): this;
  trailersExist(key: string): this;

  // --- Data checks ---
  noContent(): this;
  hasContent(): this;
  dataContains<T = any>(subset: Partial<T>): this;
  dataMatch<T = any>(matcher: (data: T) => void): this;

  // --- Performance ---
  durationLessThan(ms: number): this;
}

function expectConnectRpcResponse(
  response: ConnectRpcResponse,
): ConnectRpcResponseExpectation;
```

## ConnectRpcClient

```typescript
/** Protocol options for ConnectRPC transport */
type ConnectProtocol = "connect" | "grpc" | "grpc-web";

/** HTTP version for transport */
type HttpVersion = "1.1" | "2";

interface ConnectRpcClientConfig extends CommonOptions {
  /** Server address (host:port or full URL) */
  readonly address: string;

  /**
   * Protocol to use.
   * @default "grpc"
   */
  readonly protocol?: ConnectProtocol;

  /**
   * HTTP version to use.
   * @default "2"
   */
  readonly httpVersion?: HttpVersion;

  /** TLS configuration */
  readonly tls?: TlsConfig;

  /** Default metadata to send with every request */
  readonly metadata?: Record<string, string>;

  /**
   * Schema resolution configuration.
   * - "reflection": Use Server Reflection (default)
   * - string: Path to FileDescriptorSet binary file
   * - Uint8Array: FileDescriptorSet binary data
   * - FileDescriptorSet: Pre-parsed FileDescriptorSet message object
   * @default "reflection"
   */
  readonly schema?: "reflection" | string | Uint8Array | FileDescriptorSet;

  /**
   * Whether to use binary format for messages.
   * @default true
   */
  readonly useBinaryFormat?: boolean;

  /**
   * Throw ConnectRpcError on non-OK responses (code !== 0).
   * Overridable per request via ConnectRpcOptions.throwOnError.
   * @default true
   */
  readonly throwOnError?: boolean;
}

interface ConnectRpcClient extends AsyncDisposable {
  readonly config: ConnectRpcClientConfig;

  /** Reflection API (only available when schema: "reflection") */
  readonly reflection: ReflectionApi;

  call<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    request: TRequest,
    options?: ConnectRpcOptions,
  ): Promise<ConnectRpcResponse>;

  serverStream<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    request: TRequest,
    options?: ConnectRpcOptions,
  ): AsyncIterable<ConnectRpcResponse>;

  clientStream<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    requests: AsyncIterable<TRequest>,
    options?: ConnectRpcOptions,
  ): Promise<ConnectRpcResponse>;

  bidiStream<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    requests: AsyncIterable<TRequest>,
    options?: ConnectRpcOptions,
  ): AsyncIterable<ConnectRpcResponse>;

  close(): Promise<void>;
}

interface ConnectRpcOptions extends CommonOptions {
  readonly metadata?: Record<string, string>;

  /**
   * Throw ConnectRpcError on non-OK responses (code !== 0).
   * Overrides ConnectRpcClientConfig.throwOnError.
   * @default true (when client config leaves it unset)
   */
  readonly throwOnError?: boolean;
}

function createConnectRpcClient(
  config: ConnectRpcClientConfig,
): ConnectRpcClient;
```

## ReflectionApi

```typescript
interface ReflectionApi {
  /** Check if reflection is enabled */
  readonly enabled: boolean;

  /** List all available services on the server */
  listServices(): Promise<ServiceInfo[]>;

  /** Get detailed information about a specific service */
  getServiceInfo(serviceName: string): Promise<ServiceDetail>;

  /** Get methods for a specific service */
  listMethods(serviceName: string): Promise<MethodInfo[]>;

  /** Check if a service exists */
  hasService(serviceName: string): Promise<boolean>;
}

interface ServiceInfo {
  /** Fully qualified service name (e.g., "echo.EchoService") */
  readonly name: string;
  /** Proto file name */
  readonly file: string;
}

interface ServiceDetail {
  readonly name: string;
  readonly fullName: string;
  readonly packageName: string;
  readonly protoFile: string;
  readonly methods: readonly MethodInfo[];
}

interface MethodInfo {
  readonly name: string;
  readonly localName: string;
  readonly kind:
    | "unary"
    | "server_streaming"
    | "client_streaming"
    | "bidi_streaming";
  readonly inputType: string;
  readonly outputType: string;
  readonly idempotent: boolean;
}
```

## Examples

```typescript
import {
  ConnectRpcError,
  ConnectRpcStatus,
  createConnectRpcClient,
  expectConnectRpcResponse,
} from "@probitas/client-connectrpc";

// Create client with reflection (default)
const client = createConnectRpcClient({
  address: "localhost:50051",
});

// Discover services using reflection
const services = await client.reflection.listServices();
console.log("Available services:", services);

// Get service details
const info = await client.reflection.getServiceInfo("echo.EchoService");
console.log("Methods:", info.methods);

// Unary call
const res = await client.call("echo.EchoService", "echo", {
  message: "Hello!",
});
expectConnectRpcResponse(res)
  .ok()
  .hasContent()
  .dataContains({ message: "Hello!" })
  .durationLessThan(1000);

// Access typed data
const data = res.data<{ message: string }>();
console.log(data?.message);

// Test error responses without throwing
const errorRes = await client.call(
  "echo.EchoService",
  "echo",
  { invalid: true },
  { throwOnError: false },
);
expectConnectRpcResponse(errorRes)
  .notOk()
  .code(ConnectRpcStatus.INVALID_ARGUMENT)
  .messageContains("invalid");

// Server streaming
for await (
  const msg of client.serverStream("echo.EchoService", "streamEcho", {
    message: "Hello",
    count: 3,
  })
) {
  expectConnectRpcResponse(msg).ok();
  console.log(msg.data());
}

// Using different protocols
const connectClient = createConnectRpcClient({
  address: "localhost:8080",
  protocol: "connect", // Use Connect protocol instead of gRPC
  httpVersion: "1.1",
});

const grpcWebClient = createConnectRpcClient({
  address: "localhost:8080",
  protocol: "grpc-web", // Use gRPC-Web protocol
});

// Using FileDescriptorSet instead of reflection
const descriptorBytes = await Deno.readFile("./proto/descriptor.pb");
const staticClient = createConnectRpcClient({
  address: "localhost:50051",
  schema: descriptorBytes, // No reflection needed
});

await client.close();
```
