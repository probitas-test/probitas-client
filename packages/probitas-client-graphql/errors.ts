import { ClientError } from "@probitas/client";
import type { GraphqlErrorItem, GraphqlResponse } from "./types.ts";

/**
 * Options for GraphqlError constructor.
 */
export interface GraphqlErrorOptions extends ErrorOptions {
  /** Associated GraphQL response */
  readonly response?: GraphqlResponse;
}

/**
 * Base GraphQL error class.
 */
export class GraphqlError extends ClientError {
  override readonly name: string = "GraphqlError";
  override readonly kind = "graphql" as const;

  /** GraphQL errors from response */
  readonly errors: readonly GraphqlErrorItem[];

  /** Associated GraphQL response (if available) */
  readonly response?: GraphqlResponse;

  constructor(
    message: string,
    errors: readonly GraphqlErrorItem[],
    options?: GraphqlErrorOptions,
  ) {
    super(message, "graphql", options);
    this.errors = errors;
    this.response = options?.response;
  }
}

/**
 * Error thrown for network/HTTP errors before GraphQL processing.
 */
export class GraphqlNetworkError extends GraphqlError {
  override readonly name = "GraphqlNetworkError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, [], options);
  }
}

/**
 * Error thrown for GraphQL validation errors.
 */
export class GraphqlValidationError extends GraphqlError {
  override readonly name = "GraphqlValidationError";

  constructor(
    errors: readonly GraphqlErrorItem[],
    options?: GraphqlErrorOptions,
  ) {
    const message = `GraphQL validation failed: ${
      errors.map((e) => e.message).join("; ")
    }`;
    super(message, errors, options);
  }
}

/**
 * Error thrown for GraphQL execution errors.
 */
export class GraphqlExecutionError extends GraphqlError {
  override readonly name = "GraphqlExecutionError";

  constructor(
    errors: readonly GraphqlErrorItem[],
    options?: GraphqlErrorOptions,
  ) {
    const message = `GraphQL execution failed: ${
      errors.map((e) => e.message).join("; ")
    }`;
    super(message, errors, options);
  }
}
