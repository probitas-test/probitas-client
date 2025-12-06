# Clients and Usage

This repository ships a set of protocol-focused clients with common ergonomics.
All clients accept `CommonOptions` (`timeout`, `signal`, `retry`), implement
`AsyncDisposable`, and expose expectation helpers for terse assertions in
scenarios.

## Core Concepts

- **Common options**: Timeouts and retry policies (`maxAttempts`, `backoff`,
  `initialDelay`, `maxDelay`, `retryOn`) flow through every client.
- **Expectations**: Each client exposes `expect*` helpers (HTTP/GraphQL/gRPC
  response checks, SQL result checks, Redis/Deno KV assertions) that throw
  `ClientError` subclasses on failure.
- **Buffered responses**: HTTP and gRPC responses buffer bodies so assertions
  can run multiple times without re-reading streams.
- **Cleanup**: Dispose clients in a `scenario().resource()` or `step()`
  teardown; they follow the Probitas Disposable/AsyncDisposable contract.

## Package Notes

- **@probitas/client**: Exposes `CommonOptions`, `RetryOptions`, and the
  `ClientError` base (`kind: string`, `cause`, typed subclasses for
  connection/timeout/abort).
- **@probitas/client-http**: `createHttpClient` wraps `fetch` with base URL,
  headers, cookie jar, redirect modes, and `throwOnError` toggles.
  `HttpResponse` buffers the body and surfaces `duration`. `expectHttpResponse`
  validates status, headers, text/JSON/body content, and latency.
- **@probitas/client-connectrpc**: `createConnectRpcClient` provides ConnectRPC
  support with three protocol options: Connect, gRPC, and gRPC-Web. Supports
  Server Reflection by default or accepts FileDescriptorSet schema hints.
  `ConnectRpcResponse` exposes status, headers, trailers, and `data()` accessor.
  Includes `ReflectionApi` for runtime service discovery. Errors include decoded
  Rich Error Model details.
- **@probitas/client-grpc**: Thin wrapper around `@probitas/client-connectrpc`
  with `protocol: "grpc"` fixed. All types are re-exported with `Grpc` prefix
  aliases (`GrpcClient`, `GrpcResponse`, `GrpcError`, etc.). Use this when you
  only need gRPC protocol; use `client-connectrpc` directly for Connect or
  gRPC-Web.
- **@probitas/client-graphql**: Thin wrapper over HTTP with GraphQL-specific
  response helpers. `GraphqlResponse` keeps `data` and `errors` accessible
  without throwing. `expectGraphqlResponse` validates status, error presence,
  and payload shape.
- **@probitas/client-sql + drivers**: Shared `SqlQueryResult` with
  `rows.first()/last()`, `map`, and `as` helpers; `SqlTransaction` supports
  isolation levels. Driver packages (Postgres/MySQL/SQLite/DuckDB) provide
  `create*Client` that reuse the shared result types. `expectSqlQueryResult`
  validates success, content, row counts, and duration.
- **@probitas/client-mongodb**: Session-aware client with transaction helpers,
  basic CRUD shortcuts, and expectation helpers for count/result metadata.
- **@probitas/client-redis**: Promise-based command helpers with expectations
  for key/value existence and pattern matching of replies.
- **@probitas/client-deno-kv**: Connects to a Deno KV server (token-aware),
  includes bucket helpers and expectations for presence/versioning.
- **@probitas/client-sqs**: Targets LocalStack by default; helpers for queue
  creation, message send/receive/delete, and visibility timeouts.
- **@probitas/client-rabbitmq**: Channel-oriented client with queue/exchange
  helpers, publish/consume utilities, and expectation helpers for delivery
  counts and ack/nack flows.

## Integration Services

`compose.yaml` starts the local services used in integration tests:

| Service                | Image                                      | Port            |
| ---------------------- | ------------------------------------------ | --------------- |
| HTTP echo              | `ghcr.io/jsr-probitas/echo-http:latest`    | `18080`         |
| gRPC echo              | `ghcr.io/jsr-probitas/echo-grpc:latest`    | `50051`         |
| GraphQL echo           | `ghcr.io/jsr-probitas/echo-graphql:latest` | `14000`         |
| Postgres               | `postgres:16`                              | `15432`         |
| MySQL                  | `mysql:8.0`                                | `13306`         |
| Deno KV                | `ghcr.io/denoland/denokv`                  | `4512`          |
| Redis                  | `redis:7`                                  | `16379`         |
| MongoDB                | `mongo:7`                                  | `27017`         |
| RabbitMQ (AMQP + mgmt) | `rabbitmq:3-management`                    | `5672`, `15672` |
| LocalStack (SQS)       | `localstack/localstack`                    | `4566`          |

Echo server images are published to `ghcr.io/jsr-probitas/`. Use availability
checks (`isServiceAvailable`) when adding new integration tests so CI can skip
gracefully.

## Additional References

- Probitas scenario authoring and CLI: see the
  [Probitas framework](https://github.com/jsr-probitas/probitas).
- Protocol specifications and API expectations:
  [`docs/specs/00-overview.md`](./specs/00-overview.md) (HTTP, gRPC, GraphQL,
  SQL variants, MongoDB, Redis, Deno KV, SQS, RabbitMQ).
