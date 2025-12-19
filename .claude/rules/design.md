---
paths: "packages/**/*.ts"
---
# Design Philosophy

## Principles

1. **Independent packages** - Each client is standalone
2. **Core commonization** - Shared types/errors only in `@probitas/client`
3. **AsyncDisposable** - All clients implement it for resource cleanup
4. **Test-friendly** - Generic methods like `json<T = any>()` for type hints

## Core Package (`@probitas/client`)

- `CommonOptions`, `RetryOptions` - Shared option types
- `ClientError` with `kind` discriminator for switch-based type guards
- Specialized: `ConnectionError`, `TimeoutError`, `ProtocolError`

## Error Pattern

Use `kind` discriminator (not `instanceof` - fails across module boundaries):

```ts
export class ClientError extends Error {
  readonly kind: string;
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClientError";
    this.kind = "client";
  }
}
```

## Result Types

Client methods return fluent assertion chains:

```ts
const result = await client.get("/api/users");
result.expectStatus(200);
result.expectJsonContains({ name: "Alice" });
const user = result.json<User>();
```
