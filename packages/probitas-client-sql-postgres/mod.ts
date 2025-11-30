// Client
export * from "./client.ts";

// Transaction (internal, used by client.transaction())
export { PostgresTransaction } from "./transaction.ts";

// Errors
export * from "./errors.ts";

// Re-export SQL types for convenience
export { SqlQueryResult } from "@probitas/client-sql";
export type {
  SqlIsolationLevel,
  SqlQueryResultInit,
  SqlQueryResultMetadata,
  SqlTransaction,
  SqlTransactionOptions,
} from "@probitas/client-sql";

// Re-export SQL errors for convenience
export {
  ConstraintError,
  DeadlockError,
  QuerySyntaxError,
  SqlError,
} from "@probitas/client-sql";
export type { SqlErrorKind, SqlErrorOptions } from "@probitas/client-sql";
