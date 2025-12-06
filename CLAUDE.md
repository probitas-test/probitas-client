# Probitas Client

Client library collection for Probitas scenario testing framework.

## Specifications

Refer to [`docs/specs/00-overview.md`](docs/specs/00-overview.md) for detailed
specifications.

## Project Overview

- **Runtime**: Deno 2.x
- **Package Registry**: JSR (`@probitas/*` namespace)
- **Reference Project**:
  [jsr-probitas/probitas](https://github.com/jsr-probitas/probitas) (main
  Probitas framework)

## Package Structure

```
probitas-client/
├── deno.jsonc                    # Root workspace config
├── packages/
│   └── probitas-client/          # @probitas/client - Core package
│       ├── deno.json             # Package config
│       ├── mod.ts                # Single entry point
│       ├── types.ts              # CommonOptions, RetryOptions
│       ├── errors.ts             # ClientError hierarchy
│       └── *_test.ts             # Tests (excluded from publish)
```

## Development Patterns

### Module Organization

- **Single entry point**: Each package exports through `mod.ts`
- **Use `export *`**: Prefer `export *` over explicit `export { ... }` in mod.ts
- **Type-only exports**: Use `export type *` for types (tree-shaking)
- **Colocated tests**: `*_test.ts` files adjacent to implementation

### Package Config (deno.json)

```json
{
  "name": "@probitas/{package-name}",
  "version": "0.0.0",
  "exports": "./mod.ts",
  "publish": {
    "exclude": ["**/*_test.ts", "**/*_bench.ts"]
  }
}
```

### Error Class Pattern

- Base class `name` property must be typed as `string` (not literal)
- Subclasses can narrow with literal types
- Use `kind` discriminator for switch-based type guards
- Support `ErrorOptions.cause` for error chaining

### Dependency Management

- **Package-level dependencies**: Each package manages its own dependencies in
  its `deno.json`, NOT in the workspace root `deno.jsonc`
- Root `deno.jsonc` only contains: workspace definition, shared dev dependencies
  (testing), and local path overrides for development

### Design Principles

1. **Independent packages** - Each client is a standalone package
2. **Core commonization** - Only shared options/errors in `@probitas/client`
3. **Explicit dependencies** - Each package explicitly imports what it needs
4. **Probitas integration** - All clients implement `AsyncDisposable`
5. **Test-friendly** - Generic methods like `json<T = any>()` for type hints

### Type Parameter Defaults: `any` vs `unknown`

Use `any` only for user-facing APIs where test convenience matters. Use
`unknown` for internal implementations and input parameters.

**Use `any` (with `// deno-lint-ignore no-explicit-any`):**

- Response data methods: `json<T = any>()`, `data<T = any>()`
- Expectation methods: `jsonContains<T = any>()`, `jsonMatch<T = any>()`
- Query result types: `SqlQueryResult<T = Record<string, any>>`

**Use `unknown`:**

- Internal helpers: `containsSubset(obj: unknown, ...)`
- Input parameters: `params?: unknown[]`
- Service type parameters: `GrpcClient<TService = unknown>`
- Internal caches and deserializers

### Implementation Style (T-Wada Style)

Follow test-driven development principles:

1. Write a failing test first
2. Write minimal code to make the test pass
3. Refactor while keeping tests green
4. Repeat

### Testing Strategy

**Unit Tests (`*_test.ts`)**

- Use mocks to avoid actual network/database requests
- Test in isolation without external dependencies
- Run with `deno task test`

**Integration Tests (`integration_test.ts`)**

- File naming: `integration_test.ts` (distinguishes from unit tests `*_test.ts`)
- Add test services to root `compose.yaml` (e.g., echo-http, echo-grpc,
  echo-graphql)
- Test actual requests against real services
- Services should be defined for each client package that needs them

**CI Compatibility Requirements:**

When adding a new integration test:

1. Add service to `compose.yaml` for local development
2. Add the same service to `.github/workflows/test.yml` `services` section
3. Use environment variables for service URLs with sensible defaults:
   ```typescript
   const SERVICE_URL = Deno.env.get("SERVICE_URL") ?? "http://localhost:8080";
   ```
4. Use `isServiceAvailable()` pattern to skip tests when service is unavailable:
   ```typescript
   async function isServiceAvailable(): Promise<boolean> {
     try {
       const res = await fetch(SERVICE_URL, {
         signal: AbortSignal.timeout(1000),
       });
       await res.body?.cancel();
       return res.ok;
     } catch {
       return false;
     }
   }

   Deno.test({
     name: "Integration: ServiceName",
     ignore: !(await isServiceAvailable()),
     async fn(t) {
       // test implementation
     },
   });
   ```

**Current Integration Test Services:**

| Package             | Service         | Image                                  | Local Port | CI Port |
| ------------------- | --------------- | -------------------------------------- | ---------- | ------- |
| client-http         | echo-http       | `ghcr.io/jsr-probitas/echo-http`       | 18080      | 18080   |
| client-connectrpc   | echo-connectrpc | `ghcr.io/jsr-probitas/echo-connectrpc` | 18082      | 18082   |
| client-grpc         | echo-grpc       | `ghcr.io/jsr-probitas/echo-grpc`       | 50051      | 50051   |
| client-graphql      | echo-graphql    | `ghcr.io/jsr-probitas/echo-graphql`    | 14000      | 14000   |
| client-sql-postgres | postgres        | `postgres:16`                          | 15432      | 15432   |
| client-sql-mysql    | mysql           | `mysql:8.0`                            | 13306      | 13306   |
| client-deno-kv      | denokv          | `ghcr.io/denoland/denokv`              | 4512       | 4512    |
| client-redis        | redis           | `redis:7`                              | 16379      | 16379   |
| client-mongodb      | mongodb         | `mongo:7`                              | 27017      | 27017   |
| client-rabbitmq     | rabbitmq        | `rabbitmq:3-management`                | 5672       | 5672    |
| client-sqs          | localstack      | `localstack/localstack`                | 4566       | 4566    |

Example `compose.yaml` structure:

```yaml
services:
  echo-http:
    image: ghcr.io/jsr-probitas/echo-http:latest
    ports:
      - "18080:80"
  echo-connectrpc:
    image: ghcr.io/jsr-probitas/echo-connectrpc:latest
    ports:
      - "18082:8080"
  echo-grpc:
    image: ghcr.io/jsr-probitas/echo-grpc:latest
    ports:
      - "50051:50051"
  echo-graphql:
    image: ghcr.io/jsr-probitas/echo-graphql:latest
    ports:
      - "14000:8080"
```

## Commands

```bash
deno task check       # Type check all files
deno task test        # Run tests (parallel, shuffled)
deno task test:coverage  # Run tests with coverage
deno task coverage    # Generate coverage report
deno task verify      # Run fmt, lint, type check, and tests
```

## Development Environment

- A Nix flake is provided to supply the Deno toolchain without global installs.
- Enter the shell with `nix develop`, or add `use flake` to `.envrc` and run
  `direnv allow` for auto-activation.
- Run project tasks (e.g., `deno task check`, `deno task test`) from within the
  Nix shell for consistent tooling.

---

## STRICT RULES (MUST FOLLOW)

### 1. Git Commit Restriction

**NEVER commit without explicit user permission.**

- Commits are forbidden by default
- Only perform a commit ONCE when the user explicitly grants permission
- After committing, MUST recite this rule:
  > "Reminder: Commits are forbidden by default. I will not commit again unless
  > explicitly permitted."

### 2. Backup Before Destructive Operations

**ALWAYS create a backup before any operation that may lose working tree
state.**

Examples requiring backup:

- `git restore`
- `git reset`
- `git checkout` (switching branches with uncommitted changes)
- `git stash drop`
- Any file deletion or overwrite of uncommitted work

### 3. Pre-Completion Verification

**BEFORE reporting task completion, run ALL of the following and ensure zero
errors/warnings:**

```bash
deno task verify
```

### 4. English for Version-Controlled Content

**Use English for ALL content tracked by Git:**

- Code (variable names, function names)
- Comments
- Documentation (README, CLAUDE.md, etc.)
- Commit messages
- Error messages in code

### 5. Stay in Worktree During Worktree Tasks

**NEVER leave the worktree directory when working on a worktree task.**

- If you start work in `.worktrees/{branch}/`, ALL operations must stay there
- Do NOT `cd` to the root repository or other directories
- Run all commands (git, deno, etc.) from within the worktree
- If you need to check the root repository state, use absolute paths without
  changing directory

### 6. Git Stash is Forbidden in Worktrees

**NEVER use `git stash` in worktree environments.**

Git stash is shared across all worktrees. This causes accidental cross-worktree
contamination.

**Use backup branch instead:**

```bash
git checkout -b "backup/$(git branch --show-current)/$(date +%Y%m%d-%H%M%S)"
git commit -am "WIP: before risky refactoring"
git checkout -
git cherry-pick --no-commit HEAD@{1}
```

This creates a persistent backup branch while keeping changes in your working
tree.
