import type {
  GraphqlClient,
  GraphqlClientConfig,
  GraphqlConnectionConfig,
  GraphqlOptions,
} from "./types.ts";
import type { GraphqlErrorItem } from "./types.ts";
import type { GraphqlResponse } from "./response.ts";
import {
  GraphqlExecutionError,
  type GraphqlFailureError,
  GraphqlNetworkError,
} from "./errors.ts";
import {
  GraphqlResponseErrorImpl,
  GraphqlResponseFailureImpl,
  GraphqlResponseSuccessImpl,
} from "./response.ts";
import { AbortError, TimeoutError } from "@probitas/client";
import { getLogger } from "@probitas/logger";

const logger = getLogger("probitas", "client", "graphql");

/**
 * Convert fetch error to appropriate failure error.
 */
function convertFetchError(error: unknown): GraphqlFailureError {
  if (error instanceof AbortError || error instanceof TimeoutError) {
    return error;
  }
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return new AbortError(error.message, { cause: error });
    }
    return new GraphqlNetworkError(error.message, { cause: error });
  }
  return new GraphqlNetworkError(String(error));
}

/**
 * Merge headers from multiple sources.
 * Returns Headers instance to properly support multi-value headers.
 */
function mergeHeaders(
  ...sources: (HeadersInit | undefined)[]
): Headers {
  const result = new Headers();
  for (const source of sources) {
    if (source) {
      const headers = new Headers(source);
      for (const [key, value] of headers) {
        result.set(key, value);
      }
    }
  }
  return result;
}

/**
 * Resolve endpoint URL from string or connection config.
 */
function resolveEndpointUrl(url: string | GraphqlConnectionConfig): string {
  if (typeof url === "string") {
    return url;
  }
  const protocol = url.protocol ?? "http";
  const host = url.host ?? "localhost";
  const port = url.port;
  const path = url.path ?? "/graphql";
  const portSuffix = port ? `:${port}` : "";
  return `${protocol}://${host}${portSuffix}${path}`;
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
  readonly #endpointUrl: string;

  constructor(config: GraphqlClientConfig) {
    this.config = config;
    this.#endpointUrl = resolveEndpointUrl(config.url);

    // Log client creation
    logger.debug("GraphQL client created", {
      endpoint: this.#endpointUrl,
      wsEndpoint: config.wsEndpoint,
      headersCount: config.headers ? Object.keys(config.headers).length : 0,
    });
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

    // Log request start
    logger.debug("GraphQL request starting", {
      endpoint: this.#endpointUrl,
      operationName: options?.operationName,
      hasVariables: variables !== undefined,
      variableKeys: variables ? Object.keys(variables) : [],
      headers: [...headers.keys()],
    });

    // Trace log with full details
    logger.trace("GraphQL request details", {
      query: document,
      variables,
    });

    const fetchFn = this.config.fetch ?? globalThis.fetch;
    const startTime = performance.now();

    // Determine whether to throw on error (request option > config > default false)
    const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
      false;

    // Attempt fetch - may fail due to network errors
    let rawResponse: Response;
    try {
      rawResponse = await fetchFn(this.#endpointUrl, {
        method: "POST",
        headers,
        body,
        signal: options?.signal,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      const failureError = convertFetchError(error);

      if (shouldThrow) {
        throw failureError;
      }
      return new GraphqlResponseFailureImpl<TData>({
        url: this.#endpointUrl,
        error: failureError,
        duration,
      });
    }

    const duration = performance.now() - startTime;

    // Handle HTTP errors (4xx/5xx) as Failure
    if (!rawResponse.ok) {
      await rawResponse.body?.cancel();
      const networkError = new GraphqlNetworkError(
        `HTTP ${rawResponse.status}: ${rawResponse.statusText}`,
      );

      if (shouldThrow) {
        throw networkError;
      }
      return new GraphqlResponseFailureImpl<TData>({
        url: this.#endpointUrl,
        error: networkError,
        duration,
      });
    }

    // Parse JSON response
    let responseBody: GraphqlResponseBody<TData>;
    try {
      responseBody = await rawResponse.json();
    } catch (error) {
      const networkError = new GraphqlNetworkError(
        "Failed to parse response JSON",
        { cause: error },
      );

      if (shouldThrow) {
        throw networkError;
      }
      return new GraphqlResponseFailureImpl<TData>({
        url: this.#endpointUrl,
        error: networkError,
        duration,
      });
    }

    // Create appropriate response type
    let response: GraphqlResponse<TData>;

    if (responseBody.errors && responseBody.errors.length > 0) {
      // GraphQL execution error
      const executionError = new GraphqlExecutionError(responseBody.errors);
      response = new GraphqlResponseErrorImpl<TData>({
        url: this.#endpointUrl,
        data: responseBody.data ?? null,
        error: executionError,
        extensions: responseBody.extensions ?? null,
        duration,
        status: rawResponse.status,
        raw: rawResponse,
      });
    } else {
      // Success
      response = new GraphqlResponseSuccessImpl<TData>({
        url: this.#endpointUrl,
        data: responseBody.data ?? null,
        extensions: responseBody.extensions ?? null,
        duration,
        status: rawResponse.status,
        raw: rawResponse,
      });
    }

    // Log response
    logger.debug("GraphQL response received", {
      endpoint: this.#endpointUrl,
      operationName: options?.operationName,
      status: rawResponse.status,
      duration: `${duration.toFixed(2)}ms`,
      hasData: responseBody.data !== undefined && responseBody.data !== null,
      errorCount: responseBody.errors?.length ?? 0,
      contentType: rawResponse.headers.get("content-type"),
    });

    // Trace log with response data content
    logger.trace("GraphQL response data", {
      data: responseBody.data,
    });

    // Throw error if required
    if (!response.ok && shouldThrow) {
      throw response.error;
    }

    return response;
  }

  // deno-lint-ignore no-explicit-any
  async *subscribe<TData = any, TVariables = Record<string, any>>(
    document: string,
    variables?: TVariables,
    options?: GraphqlOptions,
  ): AsyncIterable<GraphqlResponse<TData>> {
    const wsEndpoint = this.config.wsEndpoint;
    if (!wsEndpoint) {
      throw new GraphqlNetworkError(
        "WebSocket endpoint (wsEndpoint) is not configured",
      );
    }

    // Log subscription start
    logger.debug("GraphQL subscription starting", {
      wsEndpoint,
      operationName: options?.operationName,
      hasVariables: variables !== undefined,
      variableKeys: variables ? Object.keys(variables) : [],
    });

    const ws = new WebSocket(wsEndpoint, "graphql-transport-ws");

    // Wait for connection to open
    await new Promise<void>((resolve, reject) => {
      const openHandler = () => {
        logger.debug("GraphQL WebSocket connection opened", {
          wsEndpoint,
        });
        ws.onopen = null;
        ws.onerror = null;
        resolve();
      };
      const errorHandler = (event: Event) => {
        const errorMessage = (event as ErrorEvent).message ?? "unknown error";
        ws.onopen = null;
        ws.onerror = null;
        reject(
          new GraphqlNetworkError(
            `WebSocket connection failed: ${errorMessage}`,
          ),
        );
      };
      ws.onopen = openHandler;
      ws.onerror = errorHandler;
    });

    // Send connection_init message
    ws.send(JSON.stringify({ type: "connection_init" }));

    // Wait for connection_ack
    await new Promise<void>((resolve, reject) => {
      let cleaned = false;
      const cleanup = () => {
        if (!cleaned) {
          cleaned = true;
          ws.removeEventListener("message", handler);
        }
      };
      const handler = (event: MessageEvent) => {
        const message = JSON.parse(event.data);
        if (message.type === "connection_ack") {
          cleanup();
          resolve();
        } else if (message.type === "connection_error") {
          cleanup();
          reject(
            new GraphqlNetworkError(
              `WebSocket connection error: ${JSON.stringify(message.payload)}`,
            ),
          );
        }
      };
      ws.addEventListener("message", handler);

      // Ensure cleanup even if promise is cancelled/rejected externally
      // (though this is unlikely in practice)
    });

    // Generate a unique subscription ID
    const subscriptionId = crypto.randomUUID();

    // Send start/subscribe message
    const subscribeMessage = {
      id: subscriptionId,
      type: "subscribe",
      payload: {
        query: document,
        variables: variables ?? undefined,
        operationName: options?.operationName,
      },
    };
    ws.send(JSON.stringify(subscribeMessage));
    logger.debug("GraphQL subscription message sent", {
      subscriptionId,
      operationName: options?.operationName,
    });

    // Create an async iterator to yield responses
    const responseQueue: GraphqlResponse<TData>[] = [];
    let resolveNext: (() => void) | null = null;
    let done = false;
    let error: Error | null = null;

    const messageHandler = (event: MessageEvent) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case "next": {
          const startTime = performance.now();
          const payload = message.payload as GraphqlResponseBody<TData>;

          let response: GraphqlResponse<TData>;
          if (payload.errors && payload.errors.length > 0) {
            const executionError = new GraphqlExecutionError(payload.errors);
            response = new GraphqlResponseErrorImpl<TData>({
              url: wsEndpoint,
              data: payload.data ?? null,
              error: executionError,
              extensions: payload.extensions ?? null,
              duration: performance.now() - startTime,
              status: 200,
              raw: new Response(JSON.stringify(payload)),
            });
          } else {
            response = new GraphqlResponseSuccessImpl<TData>({
              url: wsEndpoint,
              data: payload.data ?? null,
              extensions: payload.extensions ?? null,
              duration: performance.now() - startTime,
              status: 200,
              raw: new Response(JSON.stringify(payload)),
            });
          }

          logger.debug("GraphQL subscription message received", {
            subscriptionId,
            operationName: options?.operationName,
            hasData: payload.data !== undefined && payload.data !== null,
            errorCount: payload.errors?.length ?? 0,
          });

          responseQueue.push(response);
          resolveNext?.();
          break;
        }
        case "error": {
          error = new GraphqlNetworkError(
            `Subscription error: ${JSON.stringify(message.payload)}`,
          );
          done = true;
          resolveNext?.();
          break;
        }
        case "complete": {
          logger.debug("GraphQL subscription completed", {
            subscriptionId,
            operationName: options?.operationName,
          });
          done = true;
          resolveNext?.();
          break;
        }
      }
    };

    ws.addEventListener("message", messageHandler);

    // Handle WebSocket close
    ws.onclose = () => {
      logger.debug("GraphQL WebSocket closed", {
        subscriptionId,
        operationName: options?.operationName,
      });
      done = true;
      resolveNext?.();
    };

    ws.onerror = () => {
      error = new GraphqlNetworkError("WebSocket error during subscription");
      done = true;
      resolveNext?.();
    };

    try {
      while (true) {
        if (responseQueue.length > 0) {
          const response = responseQueue.shift()!;

          // Determine whether to throw on errors
          const shouldThrow = options?.throwOnError ??
            this.config.throwOnError ?? false;

          if (!response.ok && shouldThrow && response.error) {
            throw response.error;
          }

          yield response;
        } else if (done) {
          if (error) {
            throw error;
          }
          break;
        } else {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
          resolveNext = null;
        }
      }
    } finally {
      // Clean up: send stop message and close WebSocket
      logger.debug("GraphQL subscription cleanup", {
        subscriptionId,
        operationName: options?.operationName,
      });
      ws.removeEventListener("message", messageHandler);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ id: subscriptionId, type: "complete" }));
        // Wait for WebSocket to close to avoid resource leaks
        await new Promise<void>((resolve) => {
          ws.onclose = () => resolve();
          ws.close();
        });
      }
      // Clean up event handlers
      ws.onclose = null;
      ws.onerror = null;
    }
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

/**
 * Create a new GraphQL client instance.
 *
 * The client provides methods for executing GraphQL queries, mutations,
 * and subscriptions with automatic error handling and response parsing.
 *
 * @param config - Client configuration including URL and default options
 * @returns A new GraphQL client instance
 *
 * @example Basic query
 * ```ts
 * import { createGraphqlClient } from "@probitas/client-graphql";
 *
 * const client = createGraphqlClient({
 *   url: "http://localhost:4000/graphql",
 * });
 *
 * const response = await client.query(`
 *   query GetUser($id: ID!) {
 *     user(id: $id) { id name email }
 *   }
 * `, { id: "123" });
 *
 * console.log(response.data());
 * await client.close();
 * ```
 *
 * @example Using connection config object
 * ```ts
 * import { createGraphqlClient } from "@probitas/client-graphql";
 *
 * const client = createGraphqlClient({
 *   url: { host: "api.example.com", port: 443, protocol: "https" },
 * });
 * await client.close();
 * ```
 *
 * @example Mutation with error handling
 * ```ts
 * import { createGraphqlClient } from "@probitas/client-graphql";
 *
 * const client = createGraphqlClient({ url: "http://localhost:4000/graphql" });
 *
 * const response = await client.mutation(`
 *   mutation CreateUser($input: CreateUserInput!) {
 *     createUser(input: $input) { id }
 *   }
 * `, { input: { name: "Alice", email: "alice@example.com" } });
 *
 * if (response.ok) {
 *   console.log("Created user:", response.data().createUser.id);
 * }
 *
 * await client.close();
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * import { createGraphqlClient } from "@probitas/client-graphql";
 *
 * await using client = createGraphqlClient({
 *   url: "http://localhost:4000/graphql",
 * });
 * const response = await client.query(`{ __typename }`);
 * // Client automatically closed when scope exits
 * ```
 */
export function createGraphqlClient(
  config: GraphqlClientConfig,
): GraphqlClient {
  return new GraphqlClientImpl(config);
}
