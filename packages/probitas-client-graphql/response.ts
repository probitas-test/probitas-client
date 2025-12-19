import type { ClientResult } from "@probitas/client";
import type { GraphqlErrorItem } from "./types.ts";

/**
 * GraphQL response interface with pre-loaded body.
 */
// deno-lint-ignore no-explicit-any
export interface GraphqlResponse<T = any> extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"graphql"` for GraphQL responses. Use this in switch statements
   * for type-safe narrowing of union types.
   */
  readonly kind: "graphql";

  /**
   * Whether the request was successful (no errors).
   *
   * Inherited from ClientResult. True when errors array is null or empty,
   * false when GraphQL errors are present.
   */
  readonly ok: boolean;

  /**
   * GraphQL errors array (null if no errors).
   *
   * Contains validation, execution, or resolver errors from the GraphQL server.
   */
  readonly errors: readonly GraphqlErrorItem[] | null;

  /**
   * Response extensions.
   *
   * Custom metadata added by the GraphQL server (tracing, metrics, etc.).
   */
  readonly extensions?: Record<string, unknown>;

  /**
   * Response time in milliseconds.
   *
   * Inherited from ClientResult. Measures the full request/response cycle.
   */
  readonly duration: number;

  /**
   * HTTP status code.
   *
   * The underlying HTTP status (typically 200 even for GraphQL errors).
   */
  readonly status: number;

  /**
   * Headers from the HTTP response.
   *
   * Includes content-type, cache-control, and custom headers.
   */
  readonly headers: Headers;

  /**
   * Get response data (null if no data).
   * Does not throw even if errors are present.
   */
  data<U = T>(): U | null;

  /**
   * Get the raw Web standard Response object.
   * Useful for streaming or accessing low-level response details.
   */
  raw(): globalThis.Response;
}

/**
 * Options for creating a GraphqlResponse.
 */
export interface GraphqlResponseOptions<T> {
  readonly data: T | null;
  readonly errors: readonly GraphqlErrorItem[] | null;
  readonly extensions?: Record<string, unknown>;
  readonly duration: number;
  readonly status: number;
  readonly raw: globalThis.Response;
}

/**
 * Implementation of GraphqlResponse.
 */
class GraphqlResponseImpl<T> implements GraphqlResponse<T> {
  readonly kind = "graphql" as const;
  readonly ok: boolean;
  readonly errors: readonly GraphqlErrorItem[] | null;
  readonly extensions?: Record<string, unknown>;
  readonly duration: number;
  readonly status: number;
  readonly headers: Headers;

  readonly #data: T | null;
  readonly #raw: globalThis.Response;

  constructor(options: GraphqlResponseOptions<T>) {
    this.#data = options.data;
    this.#raw = options.raw;
    this.errors = options.errors;
    this.ok = options.errors === null || options.errors.length === 0;
    this.extensions = options.extensions;
    this.duration = options.duration;
    this.status = options.status;
    this.headers = options.raw.headers;
  }

  data<U = T>(): U | null {
    return this.#data as U | null;
  }

  raw(): globalThis.Response {
    return this.#raw;
  }
}

/**
 * Create a GraphqlResponse from parsed response data.
 */
export function createGraphqlResponse<T>(
  options: GraphqlResponseOptions<T>,
): GraphqlResponse<T> {
  return new GraphqlResponseImpl(options);
}
