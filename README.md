# Probitas Client

[![Test](https://github.com/jsr-probitas/probitas-client/actions/workflows/test.yml/badge.svg)](https://github.com/jsr-probitas/probitas-client/actions/workflows/test.yml)
[![Publish](https://github.com/jsr-probitas/probitas-client/actions/workflows/publish.yml/badge.svg)](https://github.com/jsr-probitas/probitas-client/actions/workflows/publish.yml)
[![codecov](https://codecov.io/gh/jsr-probitas/probitas-client/graph/badge.svg)](https://codecov.io/gh/jsr-probitas/probitas-client)

Client library collection for exercising Probitas scenarios against real
services. Each protocol-specific client shares the same ergonomics and error
model so scenario code stays consistent.

## Highlights

- Multi-protocol coverage: HTTP, ConnectRPC/gRPC/gRPC-Web, GraphQL, SQL
  (Postgres/MySQL/SQLite/DuckDB), MongoDB, Redis, RabbitMQ, SQS, and Deno KV
- Shared `ClientError` hierarchy with per-client literal `kind` values for safe
  narrowing
- AsyncDisposable-aware clients for predictable resource cleanup in Probitas
  scenarios
- Built for Deno 2.x and published on JSR under the `@probitas/*` namespace

## Packages

| Package                         | JSR                                                                                                         | Description                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `@probitas/client`              | [![JSR](https://jsr.io/badges/@probitas/client)](https://jsr.io/@probitas/client)                           | Core options and error base types shared by all clients                |
| `@probitas/client-http`         | [![JSR](https://jsr.io/badges/@probitas/client-http)](https://jsr.io/@probitas/client-http)                 | HTTP client with buffered responses and cookie support                 |
| `@probitas/client-connectrpc`   | [![JSR](https://jsr.io/badges/@probitas/client-connectrpc)](https://jsr.io/@probitas/client-connectrpc)     | ConnectRPC client supporting Connect, gRPC, and gRPC-Web protocols     |
| `@probitas/client-grpc`         | [![JSR](https://jsr.io/badges/@probitas/client-grpc)](https://jsr.io/@probitas/client-grpc)                 | gRPC client (thin wrapper over client-connectrpc with protocol="grpc") |
| `@probitas/client-graphql`      | [![JSR](https://jsr.io/badges/@probitas/client-graphql)](https://jsr.io/@probitas/client-graphql)           | GraphQL client with data/error helpers                                 |
| `@probitas/client-sql`          | [![JSR](https://jsr.io/badges/@probitas/client-sql)](https://jsr.io/@probitas/client-sql)                   | Shared SQL result/transaction types                                    |
| `@probitas/client-sql-postgres` | [![JSR](https://jsr.io/badges/@probitas/client-sql-postgres)](https://jsr.io/@probitas/client-sql-postgres) | PostgreSQL client built on the shared SQL types                        |
| `@probitas/client-sql-mysql`    | [![JSR](https://jsr.io/badges/@probitas/client-sql-mysql)](https://jsr.io/@probitas/client-sql-mysql)       | MySQL client built on the shared SQL types                             |
| `@probitas/client-sql-sqlite`   | [![JSR](https://jsr.io/badges/@probitas/client-sql-sqlite)](https://jsr.io/@probitas/client-sql-sqlite)     | SQLite client built on the shared SQL types                            |
| `@probitas/client-sql-duckdb`   | [![JSR](https://jsr.io/badges/@probitas/client-sql-duckdb)](https://jsr.io/@probitas/client-sql-duckdb)     | DuckDB client built on the shared SQL types                            |
| `@probitas/client-mongodb`      | [![JSR](https://jsr.io/badges/@probitas/client-mongodb)](https://jsr.io/@probitas/client-mongodb)           | MongoDB client with session/transaction helpers                        |
| `@probitas/client-redis`        | [![JSR](https://jsr.io/badges/@probitas/client-redis)](https://jsr.io/@probitas/client-redis)               | Redis client for command execution                                     |
| `@probitas/client-deno-kv`      | [![JSR](https://jsr.io/badges/@probitas/client-deno-kv)](https://jsr.io/@probitas/client-deno-kv)           | Deno KV client for key-value storage                                   |
| `@probitas/client-sqs`          | [![JSR](https://jsr.io/badges/@probitas/client-sqs)](https://jsr.io/@probitas/client-sqs)                   | SQS client targeting LocalStack for integration testing                |
| `@probitas/client-rabbitmq`     | [![JSR](https://jsr.io/badges/@probitas/client-rabbitmq)](https://jsr.io/@probitas/client-rabbitmq)         | RabbitMQ client with channel lifecycle management                      |

## Quick Start

Add the clients you need to your `deno.json` imports (JSR aliases are already
provided in the workspace):

```jsonc
{
  "imports": {
    "@probitas/client-http": "jsr:@probitas/client-http@^0"
  }
}
```

Use them inside Probitas scenarios with resource-managed clients:

```typescript
import { scenario } from "jsr:@probitas/probitas";
import { createHttpClient } from "@probitas/client-http";
import { assertEquals } from "@std/assert";

export default scenario("example http request")
  .resource(
    "http",
    () => createHttpClient({ url: "http://localhost:18080" }),
  )
  .step("call API", (ctx) => ctx.resources.http.get("/get?hello=world"))
  .step("assert response", (ctx) => {
    const response = ctx.previous;
    assertEquals(response.status, 200);
    assertEquals(response.data().args.hello, "world");
  })
  .build();
```

Refer to `docs/clients.md` for package-specific usage notes and to the
[Probitas framework](https://github.com/jsr-probitas/probitas) for scenario
authoring.

## Development

- Tooling: Deno 2.x. A Nix flake is provided (`nix develop`) for consistent
  tooling.
- Tasks: `deno task verify` runs fmt, lint, type-check, and tests. See
  `deno.jsonc` for the full task list.
- Integration services: `compose.yaml` starts local dependencies
  (HTTP/ConnectRPC/gRPC/GraphQL echo servers, Postgres/MySQL, Redis, MongoDB,
  RabbitMQ, LocalStack, Deno KV). Echo server images are published to
  `ghcr.io/jsr-probitas/`.
- Specs: Detailed protocol expectations are tracked in
  [`docs/specs/00-overview.md`](docs/specs/00-overview.md).

## Documentation

- [`docs/overview.md`](docs/overview.md) – architecture, design principles,
  error model, and testing approach
- [`docs/clients.md`](docs/clients.md) – client capabilities, configuration, and
  integration tips

## License

See [LICENSE](LICENSE) for details.
