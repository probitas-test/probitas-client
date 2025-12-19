# Development Patterns

Coding conventions and development practices for Probitas Client.

## Testing Strategy

### Unit Tests (`*_test.ts`)

- Use mocks to avoid actual network/database requests
- Test in isolation without external dependencies
- Run with `deno task test`

### Integration Tests (`integration_test.ts`)

- File naming: `integration_test.ts` (distinguishes from unit tests `*_test.ts`)
- Add test services to root `compose.yaml`
- Test actual requests against real services
- Services should be defined for each client package that needs them

### CI Compatibility Requirements

When adding a new integration test:

1. Add service to `compose.yaml` for local development
2. Add the same service to `.github/workflows/test.yml` `services` section
3. Use environment variables for service URLs with sensible defaults:
   ```ts
   const SERVICE_URL = Deno.env.get("SERVICE_URL") ?? "http://localhost:8080";
   ```
4. Use `isServiceAvailable()` pattern to skip tests when service is unavailable:
   ```ts
   const SERVICE_URL = Deno.env.get("SERVICE_URL") ?? "http://localhost:8080";

   async function isServiceAvailable(): Promise<boolean> {
     try {
       const res = await fetch(SERVICE_URL, {
         signal: AbortSignal.timeout(1000),
       });
       await res.body?.cancel();
       return res.ok;
     } catch {
       return false;
     }
   }

   Deno.test({
     name: "Integration: ServiceName",
     ignore: !(await isServiceAvailable()),
     async fn(t) {
       console.log(t.name);
       // test implementation
     },
   });
   ```

### Current Integration Test Services

| Package             | Service         | Image                                  | Local Port | CI Port |
| ------------------- | --------------- | -------------------------------------- | ---------- | ------- |
| client-http         | echo-http       | `ghcr.io/jsr-probitas/echo-http`       | 18080      | 18080   |
| client-connectrpc   | echo-connectrpc | `ghcr.io/jsr-probitas/echo-connectrpc` | 18082      | 18082   |
| client-grpc         | echo-grpc       | `ghcr.io/jsr-probitas/echo-grpc`       | 50051      | 50051   |
| client-graphql      | echo-graphql    | `ghcr.io/jsr-probitas/echo-graphql`    | 14000      | 14000   |
| client-sql-postgres | postgres        | `postgres:16`                          | 15432      | 15432   |
| client-sql-mysql    | mysql           | `mysql:8.0`                            | 13306      | 13306   |
| client-deno-kv      | denokv          | `ghcr.io/denoland/denokv`              | 4512       | 4512    |
| client-redis        | redis           | `redis:7`                              | 16379      | 16379   |
| client-mongodb      | mongodb         | `mongo:7`                              | 27017      | 27017   |
| client-rabbitmq     | rabbitmq        | `rabbitmq:3-management`                | 5672       | 5672    |
| client-sqs          | localstack      | `localstack/localstack`                | 4566       | 4566    |

## Error Class Pattern

- Base class `name` property must be typed as `string` (not literal)
- Subclasses can narrow with literal types
- Use `kind` discriminator for switch-based type guards
- Support `ErrorOptions.cause` for error chaining

## Type Parameter Defaults: `any` vs `unknown`

Use `any` only for user-facing APIs where test convenience matters. Use
`unknown` for internal implementations and input parameters.

**Use `any` (with `// deno-lint-ignore no-explicit-any`):**

- Response data methods: `json<T = any>()`, `data<T = any>()`
- Expectation methods: `jsonContains<T = any>()`, `jsonMatch<T = any>()`
- Query result types: `SqlQueryResult<T = Record<string, any>>`

**Use `unknown`:**

- Internal helpers: `containsSubset(obj: unknown, ...)`
- Input parameters: `params?: unknown[]`
- Service type parameters: `GrpcClient<TService = unknown>`
- Internal caches and deserializers

## Client Implementation Guidelines

### AsyncDisposable Pattern

All clients must implement `AsyncDisposable` for Probitas integration:

```ts
export class HttpClient implements AsyncDisposable {
  async [Symbol.asyncDispose](): Promise<void> {
    // Cleanup resources
    console.log("cleaned up");
  }
}
```

### Generic Methods for Type Hints

Provide generic methods for test convenience:

```ts
interface User {
  name: string;
}

interface HttpResponse {
  // deno-lint-ignore no-explicit-any
  json<T = any>(): Promise<T>;
}

const response: HttpResponse = {
  async json<T>(): Promise<T> {
    return {} as T;
  },
};

// Allows users to specify expected types without casts
const data = await response.json<User>();
```

## Implementation Style (T-Wada Style)

Follow test-driven development principles:

1. Write a failing test first
2. Write minimal code to make the test pass
3. Refactor while keeping tests green
4. Repeat
