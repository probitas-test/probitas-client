/**
 * Common connection configuration shared across all network clients.
 *
 * This interface provides a unified way to configure connection parameters
 * for all network-based clients. Each client extends this with service-specific
 * options while maintaining a consistent base.
 *
 * @example
 * ```ts
 * // Use with string URL
 * createHttpClient({ url: "http://localhost:3000" });
 *
 * // Use with config object
 * createHttpClient({
 *   url: {
 *     host: "api.example.com",
 *     port: 443,
 *     username: "user",
 *     password: "secret",
 *   },
 * });
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
 * function handleResult(result: ClientResult) {
 *   switch (result.kind) {
 *     case "http":
 *       // TypeScript narrows to HttpResponse
 *       console.log(result.status);
 *       break;
 *     case "sql":
 *       // TypeScript narrows to SqlQueryResult
 *       console.log(result.rowCount);
 *       break;
 *   }
 *
 *   if (result.ok) {
 *     console.log(`Success in ${result.duration}ms`);
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
   * Whether the operation succeeded.
   *
   * For HTTP responses, this corresponds to status 200-299.
   * For database operations, this indicates successful execution.
   */
  readonly ok: boolean;

  /**
   * Operation duration in milliseconds.
   *
   * Measured from operation start to completion, useful for performance analysis
   * and timeout monitoring.
   */
  readonly duration: number;
}
