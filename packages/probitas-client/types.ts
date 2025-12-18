/**
 * Common connection configuration shared across all network clients.
 *
 * This interface provides a unified way to configure connection parameters
 * for all network-based clients. Each client extends this with service-specific
 * options while maintaining a consistent base.
 *
 * @example Use with string URL
 * ```ts
 * import { createHttpClient } from "@probitas/client-http";
 * const client = createHttpClient({ url: "http://localhost:3000" });
 * await client[Symbol.asyncDispose]();
 * ```
 *
 * @example Use with config object
 * ```ts
 * import { createHttpClient } from "@probitas/client-http";
 * const client = createHttpClient({
 *   url: {
 *     host: "api.example.com",
 *     port: 443,
 *     username: "user",
 *     password: "secret",
 *   },
 * });
 * await client[Symbol.asyncDispose]();
 * ```
 */
export interface CommonConnectionConfig {
  /**
   * Hostname or IP address.
   * @default "localhost"
   */
  readonly host?: string;

  /**
   * Port number. Each service has its own default.
   */
  readonly port?: number;

  /**
   * Username for authentication.
   */
  readonly username?: string;

  /**
   * Password for authentication.
   */
  readonly password?: string;
}

/**
 * Retry configuration options.
 */
export interface RetryOptions {
  /**
   * Maximum number of attempts (1 = no retry).
   * @default 1
   */
  readonly maxAttempts?: number;

  /**
   * Backoff strategy.
   * @default "exponential"
   */
  readonly backoff?: "linear" | "exponential";

  /**
   * Initial delay in milliseconds.
   * @default 1000
   */
  readonly initialDelay?: number;

  /**
   * Maximum delay in milliseconds.
   * @default 30000
   */
  readonly maxDelay?: number;

  /**
   * Function to determine if the error should trigger a retry.
   */
  readonly retryOn?: (error: Error) => boolean;
}

/**
 * Common options shared across all clients.
 */
export interface CommonOptions {
  /**
   * Timeout in milliseconds.
   */
  readonly timeout?: number;

  /**
   * AbortSignal for cancellation.
   */
  readonly signal?: AbortSignal;

  /**
   * Retry configuration.
   */
  readonly retry?: RetryOptions;
}

/**
 * Base interface for all client result types.
 *
 * All client operation results (responses, query results, etc.) extend this interface,
 * providing a consistent structure across all Probitas clients. The `kind` property
 * serves as a discriminator for type-safe switch statements.
 *
 * This mirrors the design of {@link ClientError} where `kind` is used instead of `type`
 * for consistency across the framework.
 *
 * @example
 * ```ts
 * import type { ClientResult } from "@probitas/client";
 *
 * interface HttpResponse extends ClientResult {
 *   readonly kind: "http";
 *   readonly status: number;
 * }
 *
 * interface SqlQueryResult extends ClientResult {
 *   readonly kind: "sql";
 *   readonly rowCount: number;
 * }
 *
 * type MyResult = HttpResponse | SqlQueryResult;
 *
 * function handleResult(result: MyResult) {
 *   // Check if request reached the server
 *   if (!result.processed) {
 *     console.error("Network failure:", result.error);
 *     return;
 *   }
 *
 *   // Check if operation succeeded
 *   if (!result.ok) {
 *     console.error("Operation failed:", result.error);
 *     return;
 *   }
 *
 *   // Type narrowing by kind
 *   switch (result.kind) {
 *     case "http":
 *       console.log(`HTTP ${result.status} in ${result.duration}ms`);
 *       break;
 *     case "sql":
 *       console.log(`${result.rowCount} rows in ${result.duration}ms`);
 *       break;
 *   }
 * }
 * ```
 */
export interface ClientResult {
  /**
   * Result kind discriminator.
   *
   * The `kind` property is typed as `string` to allow client-specific packages
   * to define their own result kinds without modifying this core package.
   * Subinterfaces can narrow the type using literal types with `as const`.
   */
  readonly kind: string;

  /**
   * Whether the operation was processed by the server.
   *
   * - `true`: Server received and processed the request (success or error response)
   * - `false`: Request failed before reaching the server (network error, timeout, etc.)
   *
   * Use this to distinguish between "server returned an error" and "couldn't reach server".
   */
  readonly processed: boolean;

  /**
   * Whether the operation succeeded.
   *
   * For HTTP responses, this corresponds to status 200-299.
   * For database operations, this indicates successful execution.
   * Always `false` when `processed` is `false`.
   */
  readonly ok: boolean;

  /**
   * Error that occurred during the operation (null if successful).
   *
   * Contains the error when `ok` is `false`. The specific error type depends
   * on the client kind (e.g., HttpError, GraphqlError, SqlError).
   */
  readonly error: Error | null;

  /**
   * Operation duration in milliseconds.
   *
   * Measured from operation start to completion, useful for performance analysis
   * and timeout monitoring.
   */
  readonly duration: number;
}
