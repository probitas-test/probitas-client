import { AbortError, ClientError, TimeoutError } from "@probitas/client";
import { HttpBody } from "./body.ts";

/**
 * Format error message with status and body detail.
 * JSON bodies are pretty-printed with Deno.inspect for readability.
 */
function formatErrorMessage(
  status: number,
  statusText: string,
  body: HttpBody,
): string {
  const text = body.text();
  if (text === null) {
    return `${status}: ${statusText}`;
  }
  // Try to parse as JSON for pretty-printing, otherwise use text as-is
  let detail: string;
  try {
    const json = body.json();
    detail = Deno.inspect(json, {
      compact: false,
      sorted: true,
      trailingComma: true,
    });
  } catch {
    detail = text;
  }
  const indented = detail
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `${status}: ${statusText}\n\n${indented}`;
}

/**
 * Options for creating an HttpError.
 */
export interface HttpErrorOptions extends ErrorOptions {
  /** Response body as raw bytes */
  readonly body?: Uint8Array | null;
  /** Response headers */
  readonly headers?: Headers | null;
}

/**
 * HTTP error class for non-2xx responses.
 *
 * This error is thrown (or returned in response.error) when the server
 * responds with a 4xx or 5xx status code. It includes the response body
 * for inspecting error details.
 *
 * @example Check status code and body
 * ```ts
 * import { createHttpClient, HttpError } from "@probitas/client-http";
 *
 * const http = createHttpClient({ url: "http://localhost:3000", throwOnError: true });
 * try {
 *   await http.get("/not-found");
 * } catch (error) {
 *   if (error instanceof HttpError && error.status === 404) {
 *     console.log("Not found:", error.text());
 *   }
 * }
 * ```
 */
export class HttpError extends ClientError {
  override readonly name: string = "HttpError";
  override readonly kind = "http" as const;

  /** HTTP status code */
  readonly status: number;

  /** HTTP status text */
  readonly statusText: string;

  /** Response headers (null if not available) */
  readonly headers: Headers | null;

  readonly #body: HttpBody;

  constructor(
    status: number,
    statusText: string,
    options?: HttpErrorOptions,
  ) {
    const headers = options?.headers ?? null;
    const body = new HttpBody(options?.body ?? null, headers);
    const message = formatErrorMessage(status, statusText, body);
    super(message, "http", options);
    this.status = status;
    this.statusText = statusText;
    this.headers = headers;
    this.#body = body;
  }

  /** Response body as raw bytes (null if no body) */
  get body(): Uint8Array | null {
    return this.#body.bytes;
  }

  /** Get body as ArrayBuffer (null if no body) */
  arrayBuffer(): ArrayBuffer | null {
    return this.#body.arrayBuffer();
  }

  /** Get body as Blob (null if no body) */
  blob(): Blob | null {
    return this.#body.blob();
  }

  /** Get body as text (null if no body) */
  text(): string | null {
    return this.#body.text();
  }

  /**
   * Get body as parsed JSON (null if no body).
   * @template T - defaults to any for test convenience
   * @throws SyntaxError if body is not valid JSON
   */
  // deno-lint-ignore no-explicit-any
  json<T = any>(): T | null {
    return this.#body.json<T>();
  }
}

/**
 * Error thrown when a network-level failure occurs.
 *
 * This error indicates that the request could not be processed by the server
 * due to network issues (connection refused, DNS resolution failure, etc.).
 */
export class HttpNetworkError extends ClientError {
  override readonly name = "HttpNetworkError";
  override readonly kind = "network" as const;

  constructor(message: string, options?: ErrorOptions) {
    super(message, "network", options);
  }
}

/**
 * Error types that indicate the operation was not processed.
 * These are errors that occur before the request reaches the server.
 */
export type HttpFailureError =
  | HttpNetworkError
  | AbortError
  | TimeoutError;
