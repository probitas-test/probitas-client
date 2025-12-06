# Probitas Client

Client library collection for exercising Probitas scenarios against real
services. Each protocol-specific client shares the same ergonomics, error model,
and expectation helpers so scenario code stays consistent.

## Highlights

- Multi-protocol coverage: HTTP, ConnectRPC/gRPC/gRPC-Web, GraphQL, SQL
  (Postgres/MySQL/SQLite/DuckDB), MongoDB, Redis, RabbitMQ, SQS, and Deno KV
- Shared `ClientError` hierarchy with per-client literal `kind` values for safe
  narrowing
- Response/expectation helpers (`expectHttpResponse`, `expectSqlQueryResult`,
  etc.) tailored for test assertions
- AsyncDisposable-aware clients for predictable resource cleanup in Probitas
  scenarios
- Built for Deno 2.x and published on JSR under the `@probitas/*` namespace

## Packages

| Package                         | Description                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `@probitas/client`              | Core options and error base types shared by all clients                      |
| `@probitas/client-http`         | HTTP client with buffered responses, cookie support, and expectation helpers |
| `@probitas/client-connectrpc`   | ConnectRPC client supporting Connect, gRPC, and gRPC-Web protocols           |
| `@probitas/client-grpc`         | gRPC client (thin wrapper over client-connectrpc with protocol="grpc")       |
| `@probitas/client-graphql`      | GraphQL client with data/error helpers and expectations                      |
| `@probitas/client-sql`          | Shared SQL result/transaction types and expectations                         |
| `@probitas/client-sql-postgres` | PostgreSQL client built on the shared SQL types                              |
| `@probitas/client-sql-mysql`    | MySQL client built on the shared SQL types                                   |
| `@probitas/client-sql-sqlite`   | SQLite client built on the shared SQL types                                  |
| `@probitas/client-sql-duckdb`   | DuckDB client built on the shared SQL types                                  |
| `@probitas/client-mongodb`      | MongoDB client with session/transaction helpers                              |
| `@probitas/client-redis`        | Redis client with expectation helpers for command results                    |
| `@probitas/client-deno-kv`      | Deno KV client with bucket helpers and expectations                          |
| `@probitas/client-sqs`          | SQS client targeting LocalStack for integration testing                      |
| `@probitas/client-rabbitmq`     | RabbitMQ client with channel lifecycle management                            |

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
import { scenario } from "probitas";
import { createHttpClient, expectHttpResponse } from "@probitas/client-http";

export default scenario("example http request")
  .resource(
    "http",
    () => createHttpClient({ baseUrl: "http://localhost:18080" }),
  )
  .step("call API", (ctx) => ctx.resources.http.get("/get?hello=world"))
  .step("assert response", (ctx) => {
    expectHttpResponse(ctx.previous)
      .ok()
      .jsonContains({ args: { hello: "world" } });
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
