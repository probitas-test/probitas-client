import type { CommonConnectionConfig, CommonOptions } from "@probitas/client";
import type { GraphqlResponse } from "./response.ts";

/**
 * GraphQL error item as per GraphQL specification.
 * @see https://spec.graphql.org/October2021/#sec-Errors.Error-Result-Format
 */
export interface GraphqlErrorItem {
  /** Error message */
  readonly message: string;

  /** Location(s) in the GraphQL document where the error occurred */
  readonly locations?: readonly { line: number; column: number }[];

  /** Path to the field that caused the error */
  readonly path?: readonly (string | number)[];

  /** Additional error metadata */
  readonly extensions?: Record<string, unknown>;
}

export type { GraphqlResponse };

/**
 * Options for individual GraphQL requests.
 */
export interface GraphqlOptions extends CommonOptions {
  /** Additional request headers */
  readonly headers?: Record<string, string>;

  /** Operation name (for documents with multiple operations) */
  readonly operationName?: string;

  /**
   * Whether to throw GraphqlError when response contains errors.
   * @default true (inherited from client config if not specified)
   */
  readonly throwOnError?: boolean;
}

/**
 * GraphQL connection configuration.
 *
 * Extends CommonConnectionConfig with GraphQL-specific options.
 */
export interface GraphqlConnectionConfig extends CommonConnectionConfig {
  /**
   * Protocol to use.
   * @default "http"
   */
  readonly protocol?: "http" | "https";

  /**
   * GraphQL endpoint path.
   * @default "/graphql"
   */
  readonly path?: string;
}

/**
 * GraphQL client configuration.
 */
export interface GraphqlClientConfig extends CommonOptions {
  /**
   * GraphQL endpoint URL.
   *
   * Can be a URL string or a connection configuration object.
   *
   * @example
   * ```ts
   * // String URL
   * { url: "http://localhost:4000/graphql" }
   *
   * // Connection config object
   * { url: { host: "api.example.com", port: 443, protocol: "https" } }
   * ```
   */
  readonly url: string | GraphqlConnectionConfig;

  /** Default headers for all requests */
  readonly headers?: Record<string, string>;

  /** WebSocket endpoint URL (for subscriptions) */
  readonly wsEndpoint?: string;

  /** Custom fetch implementation (for testing/mocking) */
  readonly fetch?: typeof fetch;

  /**
   * Whether to throw GraphqlError when response contains errors.
   * Can be overridden per-request via GraphqlOptions.
   * @default true
   */
  readonly throwOnError?: boolean;
}

/**
 * GraphQL client interface.
 */
export interface GraphqlClient extends AsyncDisposable {
  /** Client configuration */
  readonly config: GraphqlClientConfig;

  /** Execute a GraphQL query */
  // deno-lint-ignore no-explicit-any
  query<TData = any, TVariables = Record<string, any>>(
    query: string,
    variables?: TVariables,
    options?: GraphqlOptions,
  ): Promise<GraphqlResponse<TData>>;

  /** Execute a GraphQL mutation */
  // deno-lint-ignore no-explicit-any
  mutation<TData = any, TVariables = Record<string, any>>(
    mutation: string,
    variables?: TVariables,
    options?: GraphqlOptions,
  ): Promise<GraphqlResponse<TData>>;

  /** Execute a GraphQL document (query or mutation) */
  // deno-lint-ignore no-explicit-any
  execute<TData = any, TVariables = Record<string, any>>(
    document: string,
    variables?: TVariables,
    options?: GraphqlOptions,
  ): Promise<GraphqlResponse<TData>>;

  /** Subscribe to a GraphQL subscription via WebSocket */
  // deno-lint-ignore no-explicit-any
  subscribe<TData = any, TVariables = Record<string, any>>(
    document: string,
    variables?: TVariables,
    options?: GraphqlOptions,
  ): AsyncIterable<GraphqlResponse<TData>>;

  /** Close the client and release resources */
  close(): Promise<void>;
}
