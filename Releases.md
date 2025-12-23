### 2025.12.23

#### @probitas/client-connectrpc 0.6.0 (minor)

- BREAKING(@probitas/client-http,@probitas/client-graphql,@probitas/client-connectrpc):
  convert getter methods to properties

#### @probitas/client-graphql 0.5.0 (minor)

- BREAKING(@probitas/client-http,@probitas/client-graphql,@probitas/client-connectrpc):
  convert getter methods to properties

#### @probitas/client-http 0.5.0 (minor)

- BREAKING(@probitas/client-http,@probitas/client-graphql,@probitas/client-connectrpc):
  convert getter methods to properties

### 2025.12.19

#### @probitas/client 0.4.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-connectrpc 0.5.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-deno-kv 0.4.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-graphql 0.4.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-grpc 0.5.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-http 0.4.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-mongodb 0.5.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-rabbitmq 0.4.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-redis 0.4.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-sql 0.4.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-sql-duckdb 0.4.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-sql-mysql 0.4.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-sql-postgres 0.4.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-sql-sqlite 0.4.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

#### @probitas/client-sqs 0.4.1 (patch)

- refactor(*): migrate from @probitas/logger to @logtape/logtape
- refactor(*): reorganize .claude configuration for context efficiency

### 2025.12.19

#### @probitas/client 0.4.0 (minor)

- feat(*)!: add processed and error properties to ClientResult interface

#### @probitas/client-connectrpc 0.5.0 (minor)

- feat(@probitas/client-connectrpc)!: implement Failure pattern for network
  errors
- feat(*)!: add processed and error properties to ClientResult interface
- refactor(@probitas/client-connectrpc)!: simplify API and unify patterns

#### @probitas/client-deno-kv 0.4.0 (minor)

- feat(@probitas/client-deno-kv)!: implement Failure pattern for network errors
- feat(*)!: add processed and error properties to ClientResult interface
- refactor(@probitas/client-deno-kv)!: simplify API and unify error handling

#### @probitas/client-graphql 0.4.0 (minor)

- feat(@probitas/client-graphql)!: implement Failure pattern for network errors
- feat(*)!: add processed and error properties to ClientResult interface
- refactor(@probitas/client-graphql)!: simplify API and unify nullable patterns
- refactor(@probitas/client-graphql)!: change response.errors array to
  response.error property

#### @probitas/client-grpc 0.5.0 (minor)

- feat(*)!: add processed and error properties to ClientResult interface

#### @probitas/client-http 0.4.0 (minor)

- feat(@probitas/client-http)!: implement Failure pattern for network errors
- feat(*)!: add processed and error properties to ClientResult interface
- feat(@probitas/client-http)!: rename .data() to .json() for Web API
  consistency
- refactor(@probitas/client-http)!: simplify API and add cookie support

#### @probitas/client-mongodb 0.5.0 (minor)

- feat(@probitas/client-mongodb)!: implement Failure pattern for network errors
- feat(*)!: add processed and error properties to ClientResult interface
- refactor(@probitas/client-mongodb)!: simplify API and adopt deadline pattern

#### @probitas/client-rabbitmq 0.4.0 (minor)

- feat(@probitas/client-rabbitmq)!: implement Failure pattern for network errors
- feat(*)!: add processed and error properties to ClientResult interface
- refactor(@probitas/client-rabbitmq)!: simplify API and adopt deadline pattern

#### @probitas/client-redis 0.4.0 (minor)

- feat(@probitas/client-redis)!: implement Failure pattern for network errors
- feat(*)!: add processed and error properties to ClientResult interface
- refactor(@probitas/client-redis)!: simplify API and adopt deadline pattern

#### @probitas/client-sql 0.4.0 (minor)

- feat(@probitas/client-sql,@probitas/client-sql-postgres,@probitas/client-sql-mysql,@probitas/client-sql-sqlite,@probitas/client-sql-duckdb)!:
  implement Failure pattern for network errors
- feat(*)!: add processed and error properties to ClientResult interface
- refactor(@probitas/client-sql)!: simplify API and result patterns

#### @probitas/client-sql-duckdb 0.4.0 (minor)

- feat(@probitas/client-sql,@probitas/client-sql-postgres,@probitas/client-sql-mysql,@probitas/client-sql-sqlite,@probitas/client-sql-duckdb)!:
  implement Failure pattern for network errors
- feat(*)!: add processed and error properties to ClientResult interface

#### @probitas/client-sql-mysql 0.4.0 (minor)

- feat(@probitas/client-sql,@probitas/client-sql-postgres,@probitas/client-sql-mysql,@probitas/client-sql-sqlite,@probitas/client-sql-duckdb)!:
  implement Failure pattern for network errors
- feat(*)!: add processed and error properties to ClientResult interface

#### @probitas/client-sql-postgres 0.4.0 (minor)

- feat(@probitas/client-sql,@probitas/client-sql-postgres,@probitas/client-sql-mysql,@probitas/client-sql-sqlite,@probitas/client-sql-duckdb)!:
  implement Failure pattern for network errors
- feat(*)!: add processed and error properties to ClientResult interface

#### @probitas/client-sql-sqlite 0.4.0 (minor)

- feat(@probitas/client-sql,@probitas/client-sql-postgres,@probitas/client-sql-mysql,@probitas/client-sql-sqlite,@probitas/client-sql-duckdb)!:
  implement Failure pattern for network errors
- feat(*)!: add processed and error properties to ClientResult interface

#### @probitas/client-sqs 0.4.0 (minor)

- feat(@probitas/client-sqs)!: implement Failure pattern for network errors
- feat(*)!: add processed and error properties to ClientResult interface
- refactor(@probitas/client-sqs)!: simplify API and adopt deadline pattern

### 2025.12.17

#### @probitas/client 0.3.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-connectrpc 0.4.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-deno-kv 0.3.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-graphql 0.3.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-grpc 0.4.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-http 0.3.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-mongodb 0.4.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-rabbitmq 0.3.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-redis 0.3.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-sql 0.3.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-sql-duckdb 0.3.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-sql-mysql 0.3.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-sql-postgres 0.3.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-sql-sqlite 0.3.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

#### @probitas/client-sqs 0.3.1 (patch)

- fix(*): align logging levels with logging_rules.md conventions
- docs(*): add JSDoc type checking with deno check --doc
- docs(*): migrate CLAUDE.md to .claude/ directory structure

### 2025.12.12

#### @probitas/client 0.3.0 (minor)

- BREAKING(@probitas/client,@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  unify result types with ClientResult interface
- docs(*): require full package name with @probitas/ prefix in commit scopes

#### @probitas/client-connectrpc 0.4.0 (minor)

- BREAKING(@probitas/client,@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  unify result types with ClientResult interface
- BREAKING(@probitas/client-connectrpc): improve response and error handling
- docs(@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  add comprehensive JSDoc documentation to result types
- docs(*): require full package name with @probitas/ prefix in commit scopes

#### @probitas/client-deno-kv 0.3.0 (minor)

- BREAKING(@probitas/client,@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  unify result types with ClientResult interface
- docs(@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  add comprehensive JSDoc documentation to result types
- docs(*): require full package name with @probitas/ prefix in commit scopes

#### @probitas/client-graphql 0.3.0 (minor)

- BREAKING(@probitas/client,@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  unify result types with ClientResult interface
- BREAKING(@probitas/client-graphql): change raw property to method for
  consistency
- docs(@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  add comprehensive JSDoc documentation to result types
- docs(*): require full package name with @probitas/ prefix in commit scopes

#### @probitas/client-grpc 0.4.0 (minor)

- BREAKING(@probitas/client-grpc): align with connectrpc statusCode property
  change
- docs(*): require full package name with @probitas/ prefix in commit scopes

#### @probitas/client-http 0.3.0 (minor)

- BREAKING(@probitas/client,@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  unify result types with ClientResult interface
- BREAKING(@probitas/client-http): change raw property to method for consistency
- docs(@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  add comprehensive JSDoc documentation to result types
- docs(*): require full package name with @probitas/ prefix in commit scopes

#### @probitas/client-mongodb 0.4.0 (minor)

- BREAKING(@probitas/client,@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  unify result types with ClientResult interface
- BREAKING(@probitas/client-mongodb): split insert type discriminator and
  reorganize types
- docs(@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  add comprehensive JSDoc documentation to result types
- docs(*): require full package name with @probitas/ prefix in commit scopes

#### @probitas/client-rabbitmq 0.3.0 (minor)

- BREAKING(@probitas/client,@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  unify result types with ClientResult interface
- docs(@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  add comprehensive JSDoc documentation to result types
- docs(*): require full package name with @probitas/ prefix in commit scopes
- refactor(@probitas/client-rabbitmq): move result types to dedicated file

#### @probitas/client-redis 0.3.0 (minor)

- BREAKING(@probitas/client,@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  unify result types with ClientResult interface
- docs(@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  add comprehensive JSDoc documentation to result types
- docs(*): require full package name with @probitas/ prefix in commit scopes
- refactor(@probitas/client-redis): move result types to dedicated file

#### @probitas/client-sql 0.3.0 (minor)

- BREAKING(@probitas/client,@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  unify result types with ClientResult interface
- BREAKING(@probitas/client-sql,@probitas/client-sql-duckdb,@probitas/client-sql-mysql,@probitas/client-sql-postgres,@probitas/client-sql-sqlite):
  flatten metadata into direct properties
- docs(@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  add comprehensive JSDoc documentation to result types
- docs(*): require full package name with @probitas/ prefix in commit scopes

#### @probitas/client-sql-duckdb 0.3.0 (minor)

- BREAKING(@probitas/client-sql,@probitas/client-sql-duckdb,@probitas/client-sql-mysql,@probitas/client-sql-postgres,@probitas/client-sql-sqlite):
  flatten metadata into direct properties
- docs(*): require full package name with @probitas/ prefix in commit scopes

#### @probitas/client-sql-mysql 0.3.0 (minor)

- BREAKING(@probitas/client-sql,@probitas/client-sql-duckdb,@probitas/client-sql-mysql,@probitas/client-sql-postgres,@probitas/client-sql-sqlite):
  flatten metadata into direct properties
- docs(*): require full package name with @probitas/ prefix in commit scopes

#### @probitas/client-sql-postgres 0.3.0 (minor)

- BREAKING(@probitas/client-sql,@probitas/client-sql-duckdb,@probitas/client-sql-mysql,@probitas/client-sql-postgres,@probitas/client-sql-sqlite):
  flatten metadata into direct properties
- docs(*): require full package name with @probitas/ prefix in commit scopes

#### @probitas/client-sql-sqlite 0.3.0 (minor)

- BREAKING(@probitas/client-sql,@probitas/client-sql-duckdb,@probitas/client-sql-mysql,@probitas/client-sql-postgres,@probitas/client-sql-sqlite):
  flatten metadata into direct properties
- docs(*): require full package name with @probitas/ prefix in commit scopes

#### @probitas/client-sqs 0.3.0 (minor)

- BREAKING(@probitas/client,@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  unify result types with ClientResult interface
- docs(@probitas/client-connectrpc,@probitas/client-deno-kv,@probitas/client-graphql,@probitas/client-http,@probitas/client-mongodb,@probitas/client-rabbitmq,@probitas/client-redis,@probitas/client-sql,@probitas/client-sqs):
  add comprehensive JSDoc documentation to result types
- docs(*): require full package name with @probitas/ prefix in commit scopes
- refactor(@probitas/client-sqs): move result types to dedicated file

### 2025.12.09

#### @probitas/client 0.2.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-connectrpc 0.3.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-deno-kv 0.2.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-graphql 0.2.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-grpc 0.3.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-http 0.2.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-mongodb 0.3.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-rabbitmq 0.2.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-redis 0.2.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-sql 0.2.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-sql-duckdb 0.2.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-sql-mysql 0.2.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-sql-postgres 0.2.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-sql-sqlite 0.2.0 (minor)

- BREAKING(*): remove expect functionality

#### @probitas/client-sqs 0.2.0 (minor)

- BREAKING(*): remove expect functionality

### 2025.12.08

#### @probitas/client 0.1.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-connectrpc 0.2.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-deno-kv 0.1.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-graphql 0.1.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-grpc 0.2.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-http 0.1.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-mongodb 0.2.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-rabbitmq 0.1.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-redis 0.1.2 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-sql 0.1.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-sql-duckdb 0.1.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-sql-mysql 0.1.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-sql-postgres 0.1.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-sql-sqlite 0.1.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

#### @probitas/client-sqs 0.1.1 (patch)

- refactor(*): remove logger.warn/error for cleaner Probitas output

### 2025.12.07

#### @probitas/client-connectrpc 0.2.0 (minor)

- BREAKING(client-connectrpc,client-grpc): rename status() to code() for gRPC
  consistency

#### @probitas/client-grpc 0.2.0 (minor)

- BREAKING(client-connectrpc,client-grpc): rename status() to code() for gRPC
  consistency

#### @probitas/client-mongodb 0.2.0 (minor)

- BREAKING(client-mongodb): remove countBetween() for API consistency

### 2025.12.07

#### @probitas/client-redis 0.1.1 (patch)

- fix(client-redis): export RedisResultBase for public API completeness

### 2025.12.07

#### @probitas/client 0.1.0 (minor)

- BREAKING(*): unify expect method names across all clients
- BREAKING(*): unify connection options to `url` across all clients

#### @probitas/client-connectrpc 0.1.0 (minor)

- BREAKING(*): unify expect method names across all clients
- BREAKING(*): unify connection options to `url` across all clients

#### @probitas/client-deno-kv 0.1.0 (minor)

- BREAKING(*): unify expect method names across all clients
- BREAKING(*): unify connection options to `url` across all clients

#### @probitas/client-graphql 0.1.0 (minor)

- BREAKING(client-graphql,client-mongodb): remove deprecated aliases

#### @probitas/client-grpc 0.1.0 (minor)

- BREAKING(*): unify expect method names across all clients
- BREAKING(*): unify connection options to `url` across all clients

#### @probitas/client-http 0.1.0 (minor)

- BREAKING(client-http): rename json() to data() for API consistency

#### @probitas/client-mongodb 0.1.0 (minor)

- BREAKING(client-graphql,client-mongodb): remove deprecated aliases

#### @probitas/client-rabbitmq 0.1.0 (minor)

- BREAKING(*): unify expect method names across all clients
- BREAKING(*): unify connection options to `url` across all clients

#### @probitas/client-redis 0.1.0 (minor)

- BREAKING(*): unify expect method names across all clients
- BREAKING(*): unify connection options to `url` across all clients

#### @probitas/client-sql 0.1.0 (minor)

- BREAKING(*): unify expect method names across all clients
- BREAKING(*): unify connection options to `url` across all clients

#### @probitas/client-sql-duckdb 0.1.0 (minor)

- BREAKING(*): unify expect method names across all clients
- BREAKING(*): unify connection options to `url` across all clients

#### @probitas/client-sql-mysql 0.1.0 (minor)

- BREAKING(*): unify expect method names across all clients
- BREAKING(*): unify connection options to `url` across all clients

#### @probitas/client-sql-postgres 0.1.0 (minor)

- BREAKING(*): unify expect method names across all clients
- BREAKING(*): unify connection options to `url` across all clients

#### @probitas/client-sql-sqlite 0.1.0 (minor)

- BREAKING(*): unify expect method names across all clients
- BREAKING(*): unify connection options to `url` across all clients

#### @probitas/client-sqs 0.1.0 (minor)

- BREAKING(*): unify expect method names across all clients
- BREAKING(*): unify connection options to `url` across all clients

### 2025.12.07

#### @probitas/client 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-connectrpc 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-deno-kv 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-graphql 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-grpc 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-http 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-mongodb 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-rabbitmq 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-redis 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-sql 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-sql-duckdb 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-sql-mysql 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-sql-postgres 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-sql-sqlite 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files

#### @probitas/client-sqs 0.0.8 (patch)

- docs(*): enhance API documentation for all client packages
- docs(*): add comprehensive JSDoc documentation to all package mod.ts files
