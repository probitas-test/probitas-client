import type {
  GraphqlClient,
  GraphqlClientConfig,
  GraphqlErrorItem,
  GraphqlOptions,
  GraphqlResponse,
} from "./types.ts";
import { GraphqlExecutionError, GraphqlNetworkError } from "./errors.ts";
import { createGraphqlResponse } from "./response.ts";
import { getLogger } from "@probitas/logger";

const logger = getLogger("probitas", "client", "graphql");

/**
 * Format data for trace logging, truncating large objects.
 */
function formatData(data: unknown): string {
  try {
    const str = JSON.stringify(data);
    return str.length > 500 ? str.slice(0, 500) + "..." : str;
  } catch {
    return "<unserializable>";
  }
}

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

    // Log client creation
    logger.debug("GraphQL client created", {
      endpoint: config.endpoint,
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

    // Log request start
    logger.debug("GraphQL request starting", {
      endpoint: this.config.endpoint,
      operationName: options?.operationName,
      hasVariables: variables !== undefined,
      variableKeys: variables ? Object.keys(variables) : [],
      headers: Object.keys(headers),
    });

    // Trace log with full details
    logger.trace("GraphQL request details", {
      query: formatData(document),
      variables: formatData(variables),
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
      const duration = performance.now() - startTime;
      logger.error("GraphQL network request failed", {
        endpoint: this.config.endpoint,
        operationName: options?.operationName,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
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
      logger.warn("GraphQL network error response", {
        endpoint: this.config.endpoint,
        operationName: options?.operationName,
        status: rawResponse.status,
        statusText: rawResponse.statusText,
        duration: `${duration.toFixed(2)}ms`,
      });
      throw new GraphqlNetworkError(
        `HTTP ${rawResponse.status}: ${rawResponse.statusText}`,
      );
    }

    let responseBody: GraphqlResponseBody<TData>;
    try {
      responseBody = await rawResponse.json();
    } catch (error) {
      logger.error("GraphQL response parsing failed", {
        endpoint: this.config.endpoint,
        operationName: options?.operationName,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
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

    // Log response
    logger.debug("GraphQL response received", {
      endpoint: this.config.endpoint,
      operationName: options?.operationName,
      status: rawResponse.status,
      duration: `${duration.toFixed(2)}ms`,
      hasData: responseBody.data !== undefined && responseBody.data !== null,
      errorCount: responseBody.errors?.length ?? 0,
      contentType: rawResponse.headers.get("content-type"),
    });

    // Trace log with response data content
    logger.trace("GraphQL response data", {
      data: formatData(responseBody.data),
    });

    // Determine whether to throw on errors (request option > config > default true)
    const shouldThrow = options?.throwOnError ?? this.config.throwOnError ??
      true;

    if (!response.ok && shouldThrow && response.errors) {
      logger.warn("GraphQL execution error", {
        endpoint: this.config.endpoint,
        operationName: options?.operationName,
        duration: `${duration.toFixed(2)}ms`,
        errorCount: response.errors.length,
      });

      // Trace log with full error array and paths
      logger.trace("GraphQL error details", {
        errors: formatData(response.errors),
      });

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
      logger.error("GraphQL subscription failed", {
        reason: "WebSocket endpoint not configured",
      });
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
        logger.error("GraphQL WebSocket connection failed", {
          wsEndpoint,
          error: errorMessage,
        });
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
          logger.debug("GraphQL WebSocket connection acknowledged", {
            wsEndpoint,
          });
          cleanup();
          resolve();
        } else if (message.type === "connection_error") {
          logger.error("GraphQL WebSocket connection error", {
            wsEndpoint,
            error: JSON.stringify(message.payload),
          });
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

          const response = createGraphqlResponse<TData>({
            data: payload.data ?? null,
            errors: payload.errors ?? null,
            extensions: payload.extensions,
            duration: performance.now() - startTime,
            status: 200,
            raw: new Response(JSON.stringify(payload)),
          });

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
          logger.error("GraphQL subscription error", {
            subscriptionId,
            operationName: options?.operationName,
            error: JSON.stringify(message.payload),
          });
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
      logger.error("GraphQL WebSocket error", {
        subscriptionId,
        operationName: options?.operationName,
      });
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
            logger.warn("GraphQL subscription execution error", {
              subscriptionId,
              operationName: options?.operationName,
              errorCount: response.errors.length,
            });
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
 * Create a new GraphQL client.
 */
export function createGraphqlClient(
  config: GraphqlClientConfig,
): GraphqlClient {
  return new GraphqlClientImpl(config);
}
