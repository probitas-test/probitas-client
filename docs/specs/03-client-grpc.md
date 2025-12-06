# @probitas/client-grpc

gRPC client package.

This package is a **thin wrapper** around `@probitas/client-connectrpc` with
`protocol: "grpc"` fixed. All types are re-exported with `Grpc` prefix aliases
for familiarity.

## Relationship with client-connectrpc

```
@probitas/client-grpc
    └── @probitas/client-connectrpc (with protocol: "grpc")
```

- All functionality is provided by `@probitas/client-connectrpc`
- Types like `GrpcClient`, `GrpcResponse`, `GrpcError` are aliases for
  `ConnectRpcClient`, `ConnectRpcResponse`, `ConnectRpcError`
- Use `@probitas/client-grpc` when you only need gRPC protocol
- Use `@probitas/client-connectrpc` directly if you need Connect or gRPC-Web
  protocols

## GrpcResponse

```typescript
/**
 * gRPC response (alias for ConnectRpcResponse)
 */
interface GrpcResponse {
  /** Whether the call succeeded (code === 0) */
  readonly ok: boolean;

  /** gRPC status code */
  readonly code: GrpcStatusCode;

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
   * Returns null if the response is an error or has no data.
   */
  data<T = any>(): T | null;

  /**
   * Get raw response message.
   */
  raw(): unknown;
}

/** gRPC status codes */
type GrpcStatusCode =
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

/** Status code constants */
const GrpcStatus = {
  OK: 0,
  CANCELLED: 1,
  // ... same as ConnectRpcStatus
} as const;
```

## GrpcError

```typescript
/**
 * Error detail (google.rpc.Status.details)
 */
interface ErrorDetail {
  readonly typeUrl: string;
  readonly value: unknown;
}

class GrpcError extends ClientError {
  readonly code: GrpcStatusCode;
  readonly rawMessage: string;
  readonly metadata?: Record<string, string>;
  readonly details: readonly ErrorDetail[];
}

// Error subclasses (aliases for ConnectRpc* errors)
class GrpcUnauthenticatedError extends GrpcError {
  readonly code = 16;
}
class GrpcPermissionDeniedError extends GrpcError {
  readonly code = 7;
}
class GrpcNotFoundError extends GrpcError {
  readonly code = 5;
}
class GrpcResourceExhaustedError extends GrpcError {
  readonly code = 8;
}
class GrpcInternalError extends GrpcError {
  readonly code = 13;
}
class GrpcUnavailableError extends GrpcError {
  readonly code = 14;
}
```

## expectGrpcResponse

```typescript
interface GrpcResponseExpectation {
  // --- Status checks ---
  ok(): this;
  notOk(): this;
  code(code: GrpcStatusCode): this;
  codeIn(...codes: GrpcStatusCode[]): this;

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

function expectGrpcResponse(response: GrpcResponse): GrpcResponseExpectation;
```

## GrpcClient

```typescript
interface GrpcClientConfig extends CommonOptions {
  /** Server address (host:port or full URL) */
  readonly address: string;

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
   * Throw GrpcError on non-OK responses (code !== 0).
   * @default true
   */
  readonly throwOnError?: boolean;
}

interface GrpcClient extends AsyncDisposable {
  readonly config: GrpcClientConfig;

  /** Reflection API (only available when schema: "reflection") */
  readonly reflection: ReflectionApi;

  call<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    request: TRequest,
    options?: GrpcOptions,
  ): Promise<GrpcResponse>;

  serverStream<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    request: TRequest,
    options?: GrpcOptions,
  ): AsyncIterable<GrpcResponse>;

  clientStream<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    requests: AsyncIterable<TRequest>,
    options?: GrpcOptions,
  ): Promise<GrpcResponse>;

  bidiStream<TRequest = unknown>(
    serviceName: string,
    methodName: string,
    requests: AsyncIterable<TRequest>,
    options?: GrpcOptions,
  ): AsyncIterable<GrpcResponse>;

  close(): Promise<void>;
}

interface GrpcOptions extends CommonOptions {
  readonly metadata?: Record<string, string>;
  readonly throwOnError?: boolean;
}

function createGrpcClient(config: GrpcClientConfig): GrpcClient;
```

## Examples

```typescript
import {
  createGrpcClient,
  expectGrpcResponse,
  GrpcError,
  GrpcStatus,
} from "@probitas/client-grpc";

// Create client (uses reflection by default)
const grpc = createGrpcClient({
  address: "localhost:50051",
});

// Discover available services
const services = await grpc.reflection.listServices();
console.log("Services:", services);

// Unary call
const res = await grpc.call("echo.EchoService", "echo", { message: "Hello!" });
expectGrpcResponse(res)
  .ok()
  .hasContent()
  .dataContains({ message: "Hello!" });

// Validate headers/trailers
const res2 = await grpc.call("example.v1.Service", "GetWithTrailers", {
  id: "456",
});
expectGrpcResponse(res2)
  .ok()
  .trailersExist("x-request-id")
  .trailers("x-request-id", /^req-/);

// Handle errors
try {
  await grpc.call("echo.EchoService", "echo", { invalid: true });
} catch (error) {
  if (error instanceof GrpcError) {
    console.log(error.code); // e.g., 3 (INVALID_ARGUMENT)
    console.log(error.rawMessage);

    for (const detail of error.details) {
      console.log(detail.typeUrl, detail.value);
    }
  }
}

// Test error responses without throwing
const errorRes = await grpc.call(
  "echo.EchoService",
  "echo",
  { invalid: true },
  { throwOnError: false },
);
expectGrpcResponse(errorRes)
  .notOk()
  .code(GrpcStatus.INVALID_ARGUMENT);

// Server streaming
for await (
  const res of grpc.serverStream("echo.EchoService", "streamEcho", {
    message: "Hello",
    count: 3,
  })
) {
  expectGrpcResponse(res).ok();
  console.log(res.data());
}

// Using FileDescriptorSet instead of reflection
const descriptorBytes = await Deno.readFile("./descriptor.pb");
const staticGrpc = createGrpcClient({
  address: "localhost:50051",
  schema: descriptorBytes,
});

await grpc.close();
```
