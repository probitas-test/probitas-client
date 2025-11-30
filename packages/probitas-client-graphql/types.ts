import type { CommonOptions } from "@probitas/client";

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

/**
 * GraphQL response interface with pre-loaded body.
 */
// deno-lint-ignore no-explicit-any
export interface GraphqlResponse<T = any> {
  /** Whether the request was successful (no errors) */
  readonly ok: boolean;

  /** Response data (null if errors occurred with no partial data) */
  readonly data: T | null;

  /** GraphQL errors array (null if no errors) */
  readonly errors: readonly GraphqlErrorItem[] | null;

  /** Response extensions */
  readonly extensions?: Record<string, unknown>;

  /** Response time in milliseconds */
  readonly duration: number;

  /** HTTP status code */
  readonly status: number;

  /** Raw Web standard Response (for streaming or special cases) */
  readonly raw: globalThis.Response;
}

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
 * GraphQL client configuration.
 */
export interface GraphqlClientConfig extends CommonOptions {
  /** GraphQL endpoint URL */
  readonly endpoint: string;

  /** Default headers for all requests */
  readonly headers?: Record<string, string>;

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

  /** Close the client and release resources */
  close(): Promise<void>;
}
