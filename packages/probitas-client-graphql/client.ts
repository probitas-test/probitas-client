import type {
  GraphqlClient,
  GraphqlClientConfig,
  GraphqlErrorItem,
  GraphqlOptions,
  GraphqlResponse,
} from "./types.ts";
import { GraphqlExecutionError, GraphqlNetworkError } from "./errors.ts";
import { createGraphqlResponse } from "./response.ts";

/**
 * Merge headers from multiple sources.
 * Later sources override earlier ones.
 */
function mergeHeaders(
  ...sources: (Record<string, string> | undefined)[]
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const source of sources) {
    if (source) {
      Object.assign(result, source);
    }
  }
  return result;
}

/**
 * GraphQL response structure from server.
 */
interface GraphqlResponseBody<T> {
  data?: T | null;
  errors?: GraphqlErrorItem[];
  extensions?: Record<string, unknown>;
}

/**
 * GraphqlClient implementation.
 */
class GraphqlClientImpl implements GraphqlClient {
  readonly config: GraphqlClientConfig;

  constructor(config: GraphqlClientConfig) {
    this.config = config;
  }

  // deno-lint-ignore no-explicit-any
  query<TData = any, TVariables = Record<string, any>>(
    query: string,
    variables?: TVariables,
    options?: GraphqlOptions,
  ): Promise<GraphqlResponse<TData>> {
    return this.execute<TData, TVariables>(query, variables, options);
  }

  // deno-lint-ignore no-explicit-any
  mutation<TData = any, TVariables = Record<string, any>>(
    mutation: string,
    variables?: TVariables,
    options?: GraphqlOptions,
  ): Promise<GraphqlResponse<TData>> {
    return this.execute<TData, TVariables>(mutation, variables, options);
  }

  // deno-lint-ignore no-explicit-any
  async execute<TData = any, TVariables = Record<string, any>>(
    document: string,
    variables?: TVariables,
    options?: GraphqlOptions,
  ): Promise<GraphqlResponse<TData>> {
    const headers = mergeHeaders(
      { "Content-Type": "application/json" },
      this.config.headers,
      options?.headers,
    );

    const body = JSON.stringify({
      query: document,
      variables: variables ?? undefined,
      operationName: options?.operationName,
    });

    const fetchFn = this.config.fetch ?? globalThis.fetch;
    const startTime = performance.now();

    let rawResponse: Response;
    try {
      rawResponse = await fetchFn(this.config.endpoint, {
        method: "POST",
        headers,
        body,
        signal: options?.signal,
      });
    } catch (error) {
      throw new GraphqlNetworkError(
        `Network error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }

    const duration = performance.now() - startTime;

    if (!rawResponse.ok) {
      throw new GraphqlNetworkError(
        `HTTP ${rawResponse.status}: ${rawResponse.statusText}`,
      );
    }

    let responseBody: GraphqlResponseBody<TData>;
    try {
      responseBody = await rawResponse.json();
    } catch (error) {
      throw new GraphqlNetworkError("Failed to parse response JSON", {
        cause: error,
      });
    }

    const response = createGraphqlResponse<TData>({
      data: responseBody.data ?? null,
      errors: responseBody.errors ?? null,
      extensions: responseBody.extensions,
      duration,
      status: rawResponse.status,
      raw: rawResponse,
    });

    // Determine whether to throw on errors (request option > config > default true)
    const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
      true;

    if (!response.ok && shouldThrow && response.errors) {
      throw new GraphqlExecutionError(response.errors, { response });
    }

    return response;
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

/**
 * Create a new GraphQL client.
 */
export function createGraphqlClient(
  config: GraphqlClientConfig,
): GraphqlClient {
  return new GraphqlClientImpl(config);
}
