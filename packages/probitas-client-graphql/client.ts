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
  mutate<TData = any, TVariables = Record<string, any>>(
    mutation: string,
    variables?: TVariables,
    options?: GraphqlOptions,
  ): Promise<GraphqlResponse<TData>> {
    return this.mutation<TData, TVariables>(mutation, variables, options);
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
      await rawResponse.body?.cancel();
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

    const ws = new WebSocket(wsEndpoint, "graphql-transport-ws");

    // Wait for connection to open
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (event) =>
        reject(
          new GraphqlNetworkError(
            `WebSocket connection failed: ${
              (event as ErrorEvent).message ?? "unknown error"
            }`,
          ),
        );
    });

    // Send connection_init message
    ws.send(JSON.stringify({ type: "connection_init" }));

    // Wait for connection_ack
    await new Promise<void>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const message = JSON.parse(event.data);
        if (message.type === "connection_ack") {
          ws.removeEventListener("message", handler);
          resolve();
        } else if (message.type === "connection_error") {
          ws.removeEventListener("message", handler);
          reject(
            new GraphqlNetworkError(
              `WebSocket connection error: ${JSON.stringify(message.payload)}`,
            ),
          );
        }
      };
      ws.addEventListener("message", handler);
    });

    // Generate a unique subscription ID
    const subscriptionId = crypto.randomUUID();

    // Send start/subscribe message
    ws.send(
      JSON.stringify({
        id: subscriptionId,
        type: "subscribe",
        payload: {
          query: document,
          variables: variables ?? undefined,
          operationName: options?.operationName,
        },
      }),
    );

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

          const response = createGraphqlResponse<TData>({
            data: payload.data ?? null,
            errors: payload.errors ?? null,
            extensions: payload.extensions,
            duration: performance.now() - startTime,
            status: 200,
            raw: new Response(JSON.stringify(payload)),
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
          done = true;
          resolveNext?.();
          break;
        }
      }
    };

    ws.addEventListener("message", messageHandler);

    // Handle WebSocket close
    ws.onclose = () => {
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
            this.config.throwOnError ?? true;

          if (!response.ok && shouldThrow && response.errors) {
            throw new GraphqlExecutionError(response.errors, { response });
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
      ws.removeEventListener("message", messageHandler);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ id: subscriptionId, type: "complete" }));
        // Wait for WebSocket to close to avoid resource leaks
        await new Promise<void>((resolve) => {
          ws.onclose = () => resolve();
          ws.close();
        });
      }
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
 * Create a new GraphQL client.
 */
export function createGraphqlClient(
  config: GraphqlClientConfig,
): GraphqlClient {
  return new GraphqlClientImpl(config);
}
