---
paths: "packages/**/*, deno.jsonc"
---
# Package Structure

## Layout

```
probitas-client/
├── deno.jsonc           # Root workspace config
├── packages/
│   ├── probitas-client/          # @probitas/client (core)
│   ├── probitas-client-http/     # @probitas/client-http
│   ├── probitas-client-grpc/     # @probitas/client-grpc
│   ├── probitas-client-sql/      # @probitas/client-sql (base)
│   ├── probitas-client-sql-postgres/
│   ├── probitas-client-sql-mysql/
│   └── ... (redis, mongodb, rabbitmq, sqs, etc.)
└── compose.yaml         # Integration test services
```

## Dependency Management

- Each package manages deps in its own `deno.json`
- Root `deno.jsonc`: workspace definition + shared dev deps only
- Internal deps: `jsr:@probitas/client@^0`
