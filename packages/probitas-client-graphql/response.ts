import type { GraphqlErrorItem, GraphqlResponse } from "./types.ts";

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
  readonly type = "graphql" as const;
  readonly ok: boolean;
  readonly errors: readonly GraphqlErrorItem[] | null;
  readonly extensions?: Record<string, unknown>;
  readonly duration: number;
  readonly status: number;
  readonly headers: Headers;
  readonly raw: globalThis.Response;

  readonly #data: T | null;

  constructor(options: GraphqlResponseOptions<T>) {
    this.#data = options.data;
    this.errors = options.errors;
    this.ok = options.errors === null || options.errors.length === 0;
    this.extensions = options.extensions;
    this.duration = options.duration;
    this.status = options.status;
    this.headers = options.raw.headers;
    this.raw = options.raw;
  }

  data<U = T>(): U | null {
    return this.#data as U | null;
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
