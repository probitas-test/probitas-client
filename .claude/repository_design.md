# Design Philosophy

This document describes the design principles and architectural decisions for
Probitas Client libraries.

## Overall Principles

1. **Independent packages** - Each client is a standalone package
2. **Core commonization** - Only shared options/errors in `@probitas/client`
3. **Explicit dependencies** - Each package explicitly imports what it needs
4. **Probitas integration** - All clients implement `AsyncDisposable`
5. **Test-friendly** - Generic methods like `json<T = any>()` for type hints

## Core Package (`@probitas/client`)

The core package provides shared types and error classes used across all client
packages:

### Shared Types

- `CommonOptions` - Base options shared across clients (timeout, signal, etc.)
- `RetryOptions` - Retry configuration for resilient operations

### Error Hierarchy

```typescript
// Base error class for all client errors
export class ClientError extends Error {
  readonly kind: string;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ClientError";
    this.kind = "client";
  }
}

// Specialized errors
export class ConnectionError extends ClientError {
  override readonly kind = "connection" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConnectionError";
  }
}

export class TimeoutError extends ClientError {
  override readonly kind = "timeout" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TimeoutError";
  }
}

export class ProtocolError extends ClientError {
  override readonly kind = "protocol" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProtocolError";
  }
}
```

The `kind` discriminator enables switch-based type guards without relying on
`instanceof` (which can fail across module boundaries).

## Client Package Design

### Single Entry Point

Each client package exports through `mod.ts`:

```ts ignore
// mod.ts
export * from "./client.ts";
export type * from "./types.ts";
```

### AsyncDisposable Contract

All clients implement `AsyncDisposable` for automatic resource cleanup:

```typescript
interface HttpClientOptions {
  baseUrl: string;
}

class HttpClient implements AsyncDisposable {
  constructor(options: HttpClientOptions) {
    console.log(options.baseUrl);
  }

  async [Symbol.asyncDispose](): Promise<void> {
    console.log("cleaned up");
  }
}

const options: HttpClientOptions = { baseUrl: "http://localhost:8080" };
await using client = new HttpClient(options);
// Resources automatically cleaned up when scope exits
```

This enables clean integration with Probitas scenarios using `setup` and
`cleanup` steps.

### Result Types

Client methods return result types that support fluent assertion chains:

```typescript
interface User {
  name: string;
  id: number;
}

interface HttpResult {
  expectStatus(status: number): void;
  expectJsonContains(data: unknown): void;
  json<T = unknown>(): T;
}

class HttpClient {
  async get(path: string): Promise<HttpResult> {
    console.log(path);
    return {
      expectStatus(status: number): void {
        console.log(status);
      },
      expectJsonContains(data: unknown): void {
        console.log(data);
      },
      json<T = unknown>(): T {
        return {} as T;
      },
    };
  }
}

const client = new HttpClient();
const result = await client.get("/api/users");

// Type-safe assertions
result.expectStatus(200);
result.expectJsonContains({ name: "Alice" });

// Type-hinted data access
const user = result.json<User>();
```

### Generic Type Parameters

Response methods use `any` as default for ergonomic test code:

```typescript
interface User {
  name: string;
  id: number;
}

interface HttpResponse {
  // deno-lint-ignore no-explicit-any
  json<T = any>(): T;
}

const response: HttpResponse = {
  json<T>(): T {
    return {} as T;
  },
};

// No cast needed in tests
const data = response.json();

// Type hint when needed
const user = response.json<User>();
```

## Protocol-Specific Clients

### HTTP Client (`@probitas/client-http`)

- Standard HTTP operations (GET, POST, PUT, DELETE, etc.)
- Request/response inspection
- Header and body assertions

### SQL Clients (`@probitas/client-sql-*`)

- Query execution with parameterized statements
- Transaction support
- Result set assertions

### Message Queue Clients (`@probitas/client-rabbitmq`, `@probitas/client-sqs`)

- Message publishing and consumption
- Queue management
- Message content assertions

### Database Clients (`@probitas/client-mongodb`, `@probitas/client-redis`, `@probitas/client-deno-kv`)

- Document/key-value operations
- Query builders
- Data assertions

## Separation of Concerns

```
┌─────────────────────────────────────────────────────┐
│                  @probitas/client                    │
│         (shared types, errors, options)              │
└──────────────────────┬──────────────────────────────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
    ▼                  ▼                  ▼
┌─────────┐      ┌─────────┐      ┌─────────────┐
│  HTTP   │      │   SQL   │      │  Message Q  │
│ client  │      │ clients │      │   clients   │
└─────────┘      └─────────┘      └─────────────┘
```

Each client package:

- Depends only on `@probitas/client` for shared types
- Has no dependencies on other client packages (except SQL variants)
- Can be installed and used independently
