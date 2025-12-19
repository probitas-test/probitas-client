---
paths: "**/*.ts"
---
# Development Patterns

## Testing Strategy

- **Unit tests** (`*_test.ts`): Mocks, no external dependencies
- **Integration tests** (`integration_test.ts`): Real services via compose.yaml

## Integration Test Pattern

Use `isServiceAvailable()` to skip when service unavailable:

```ts
const SERVICE_URL = Deno.env.get("SERVICE_URL") ?? "http://localhost:8080";

async function isServiceAvailable(): Promise<boolean> {
  try {
    const res = await fetch(SERVICE_URL, { signal: AbortSignal.timeout(1000) });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

Deno.test({
  name: "Integration: ServiceName",
  ignore: !(await isServiceAvailable()),
  fn() { /* ... */ },
});
```

When adding integration tests: update both `compose.yaml` and
`.github/workflows/test.yml` services section.

## Type Parameter Defaults

- **`any`**: User-facing response methods (`json<T = any>()`)
- **`unknown`**: Internal helpers, input parameters
