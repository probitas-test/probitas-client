# Probitas Client Specifications

Client library suite for Probitas scenario testing. Each client ships as an
independent package but follows shared ergonomics.

## Design Principles

1. **Independent packages** – Each client is its own `@probitas/client-*`
   package (e.g., HTTP, gRPC, SQL).
2. **Core-only commons** – `@probitas/client` exposes only shared options and
   the base error types.
3. **Explicit dependencies** – Every package imports what it needs; no hidden
   globals.
4. **Probitas integration** – All clients implement `AsyncDisposable`.
5. **Test friendly** – Helpers like `json<T = any>()` keep assertions concise
   during scenario tests.

## Type Parameter Defaults: `any` vs `unknown`

- **Use `any` (with `// deno-lint-ignore no-explicit-any`)** for user-facing
  response helpers to maximize test ergonomics:
  - Response data: `json<T = any>()`, `data<T = any>()`
  - Expectations: `jsonContains<T = any>()`, `jsonMatch<T = any>()`
  - SQL results: `SqlQueryResult<T = Record<string, any>>`
- **Use `unknown`** for internal helpers, inputs, and caches:
  - Helpers: `containsSubset(obj: unknown, ...)`
  - Inputs: `params?: unknown[]`
  - Service generics: `GrpcClient<TService = unknown>`

## Package Status

| Package                         | Description                                             | Status    |
| ------------------------------- | ------------------------------------------------------- | --------- |
| `@probitas/client`              | Core (CommonOptions, ClientError base)                  | ✅        |
| `@probitas/client-http`         | HTTP client                                             | ✅        |
| `@probitas/client-connectrpc`   | ConnectRPC client (Connect/gRPC/gRPC-Web protocols)     | ✅        |
| `@probitas/client-grpc`         | gRPC client (thin wrapper over client-connectrpc)       | ✅        |
| `@probitas/client-graphql`      | GraphQL client                                          | ✅        |
| `@probitas/client-sql`          | Shared SQL types (SqlQueryResult, SqlTransaction, etc.) | ✅        |
| `@probitas/client-sql-postgres` | PostgreSQL client                                       | ✅        |
| `@probitas/client-sql-mysql`    | MySQL client                                            | ✅        |
| `@probitas/client-sql-sqlite`   | SQLite client                                           | ✅        |
| `@probitas/client-sql-duckdb`   | DuckDB client                                           | ✅        |
| `@probitas/client-mongodb`      | MongoDB client                                          | ✅        |
| `@probitas/client-redis`        | Redis client                                            | ✅        |
| `@probitas/client-dynamodb`     | DynamoDB client                                         | (planned) |
| `@probitas/client-deno-kv`      | Deno KV client                                          | ✅        |
| `@probitas/client-sqs`          | SQS client                                              | ✅        |
| `@probitas/client-rabbitmq`     | RabbitMQ client                                         | ✅        |

## Import Examples

```typescript
// Core (shared options and error base)
import {
  ClientError,
  type CommonOptions,
  TimeoutError,
} from "@probitas/client";

// HTTP
import {
  createHttpClient,
  expectHttpResponse,
  type HttpResponse,
} from "@probitas/client-http";

// ConnectRPC (supports Connect, gRPC, and gRPC-Web protocols)
import {
  type ConnectRpcResponse,
  createConnectRpcClient,
  expectConnectRpcResponse,
} from "@probitas/client-connectrpc";

// gRPC (thin wrapper over ConnectRPC with protocol="grpc")
import {
  createGrpcClient,
  expectGrpcResponse,
  type GrpcResponse,
} from "@probitas/client-grpc";

// GraphQL
import {
  createGraphqlClient,
  expectGraphqlResponse,
  type GraphqlResponse,
} from "@probitas/client-graphql";

// SQL shared types
import {
  expectSqlQueryResult,
  type SqlQueryResult,
} from "@probitas/client-sql";

// PostgreSQL (imports shared SQL types from @probitas/client-sql)
import { createPostgresClient } from "@probitas/client-sql-postgres";
import {
  expectSqlQueryResult,
  type SqlQueryResult,
} from "@probitas/client-sql";

// Others
import { createMongoClient } from "@probitas/client-mongodb";
import { createRedisClient } from "@probitas/client-redis";
```

## Compatibility

- **Runtime**: Deno 2.x
- **TypeScript**: 5.x
- **Probitas**: 0.x

## Spec Index

- [01-client](./01-client.md)
- [02-client-http](./02-client-http.md)
- [03-client-connectrpc](./03-client-connectrpc.md)
- [03-client-grpc](./03-client-grpc.md)
- [04-client-graphql](./04-client-graphql.md)
- [05-client-sql](./05-client-sql.md)
- [06-client-sql-postgres](./06-client-sql-postgres.md)
- [07-client-sql-mysql](./07-client-sql-mysql.md)
- [08-client-sql-sqlite](./08-client-sql-sqlite.md)
- [09-client-sql-duckdb](./09-client-sql-duckdb.md)
- [10-client-mongodb](./10-client-mongodb.md)
- [11-client-redis](./11-client-redis.md)
- [12-client-dynamodb](./12-client-dynamodb.md)
- [13-client-deno-kv](./13-client-deno-kv.md)
- [14-client-sqs](./14-client-sqs.md)
- [15-client-rabbitmq](./15-client-rabbitmq.md)
- [99-examples](./99-examples.md)
