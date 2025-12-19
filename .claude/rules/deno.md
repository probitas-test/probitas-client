---
paths: "**/*.ts"
---
# Deno/TypeScript Rules

## Module Organization

- Single entry point: `mod.ts` with `export *` / `export type *`
- Colocated tests: `*_test.ts` adjacent to implementation
- Internal files: `_*.ts` prefix (not exported from mod.ts)

## Exporting for Tests

Use `_internal` namespace for testing internal functions (don't re-export from
mod.ts):

```ts
export const _internal = { parseValue };
```

## File Naming

```
mod.ts           # Package entry point
types.ts         # Public type definitions
_testutils.ts    # Test utilities (internal)
```

## Key Conventions

- Use `#private` fields (not `private` keyword)
- Error classes must set `this.name` for Worker boundary safety
- All clients implement `AsyncDisposable`
- JSDoc `@example` blocks are type-checked by `deno test --doc`
