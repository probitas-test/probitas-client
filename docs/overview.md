# Overview

Probitas Client provides protocol-specific clients that share a consistent shape
for options, errors, expectations, and resource cleanup. The packages are
designed for scenario-driven tests authored with the Probitas framework.

## Design Principles

- **Independent packages**: Each protocol is shipped as its own
  `@probitas/client-*` module; only common options/errors live in
  `@probitas/client`.
- **Explicit dependencies**: Each package declares its own imports; the
  workspace root only supplies shared dev tooling and local path overrides.
- **AsyncDisposable-first**: Clients implement `AsyncDisposable` so scenarios
  can rely on deterministic cleanup.
- **Test-friendly APIs**: Helpers such as `json<T = any>()` and expectation
  builders keep assertions terse in scenarios.
- **Runtime/Registry**: Target Deno 2.x and publish via JSR under the
  `@probitas/*` namespace.

## Error Model

- Base `ClientError` exposes `kind: string` and supports `cause` via
  `ErrorOptions`.
- Subclasses narrow `kind` with literal types (e.g., `"connection"`,
  `"timeout"`, SQL-specific `"constraint"`) to keep type guards precise without
  expanding the core union.
- Protocol packages define their own error kinds (HTTP status-derived errors,
  gRPC status errors with decoded details, SQL constraint/deadlock errors,
  etc.).

## Type Parameter Defaults

- Use `any` only for user-facing response helpers to keep test ergonomics
  (`json<T = any>()`, `data<T = any>()`, expectation matchers). Annotate with
  `// deno-lint-ignore no-explicit-any` where needed.
- Use `unknown` for inputs and internals (helper parameters, caches, service
  type parameters).

## Workspace Layout

- Root `deno.jsonc` defines the workspace and shared tasks; each package has its
  own `deno.json` for dependencies.
- Entry points are `mod.ts` files that re-export implementation modules using
  `export *` / `export type *`.
- Tests live next to implementations as `*_test.ts` and are excluded from
  publish.

## Testing & Verification

- Primary commands live in `deno.jsonc`: `deno task test`, `deno task check`,
  and the all-in-one `deno task verify` (fmt, lint, type-check, tests). Run
  `deno task verify` before considering work complete.
- Integration dependencies are defined in `compose.yaml` (echo servers,
  databases, message brokers, LocalStack, Deno KV). Services are mirrored in CI;
  guard integration tests with availability checks when adding new ones.
- Echo server images (echo-http, echo-connectrpc, echo-grpc, echo-graphql) are
  published to `ghcr.io/jsr-probitas/`. Refer to the
  [Probitas framework](https://github.com/jsr-probitas/probitas) for CLI
  conventions.

## Specifications

Authoritative specs now live in-repo under
[`docs/specs/00-overview.md`](./specs/00-overview.md). Consult them when
extending a client:

- `00-overview.md`: package list and shared rules
- `01-client*.md`: core options and `ClientError` design
- `02-16*.md`: protocol-specific expectations (HTTP, ConnectRPC, gRPC, GraphQL,
  SQL variants, MongoDB, Redis, Deno KV, SQS, RabbitMQ)
- `99-examples.md`: usage patterns
