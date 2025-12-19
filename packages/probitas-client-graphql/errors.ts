import { AbortError, ClientError, TimeoutError } from "@probitas/client";
import type { GraphqlErrorItem } from "./types.ts";

/**
 * Error thrown for GraphQL execution errors.
 *
 * This error is returned when the GraphQL server processes the request
 * but returns errors in the response (validation errors, resolver errors, etc.).
 */
export class GraphqlExecutionError extends ClientError {
  override readonly name = "GraphqlExecutionError";
  override readonly kind = "graphql" as const;

  /** GraphQL errors from response */
  readonly errors: readonly GraphqlErrorItem[];

  constructor(
    errors: readonly GraphqlErrorItem[],
    options?: ErrorOptions,
  ) {
    const message = formatGraphqlErrors(errors);
    super(message, "graphql", options);
    this.errors = errors;
  }
}

/**
 * Error thrown for network-level failures.
 *
 * This error indicates that the request could not reach or be processed
 * by the GraphQL server (connection refused, HTTP errors, etc.).
 */
export class GraphqlNetworkError extends ClientError {
  override readonly name = "GraphqlNetworkError";
  override readonly kind = "network" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, "network", options);
  }
}

/**
 * Format GraphQL errors for display.
 */
function formatGraphqlErrors(errors: readonly GraphqlErrorItem[]): string {
  const detail = Deno.inspect(errors, {
    compact: false,
    sorted: true,
    trailingComma: true,
  });
  const indented = detail
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `GraphQL execution failed:\n\n${indented}`;
}

/**
 * Error types that indicate the operation was not processed.
 * These are errors that occur before the request reaches the GraphQL server.
 */
export type GraphqlFailureError =
  | GraphqlNetworkError
  | AbortError
  | TimeoutError;
