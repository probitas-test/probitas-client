import type { ClientResult } from "@probitas/client";
import type { HttpError } from "./errors.ts";

/**
 * HTTP response with pre-loaded body for synchronous access.
 *
 * Wraps Web standard Response, allowing body to be read synchronously
 * and multiple times (unlike the streaming-based standard Response).
 *
 * This interface represents a **successful HTTP response** where the request
 * was completed (regardless of status code). Use `ok` to check if the status
 * is in the 2xx range.
 */
export interface HttpResponse extends ClientResult {
  /**
   * Result kind discriminator.
   *
   * Always `"http"` for HTTP responses. Use this in switch statements
   * for type-safe narrowing of union types.
   */
  readonly kind: "http";

  // --- Web standard Response compatible properties ---

  /** Whether the response was successful (status 200-299) */
  readonly ok: boolean;

  /** HTTP status code */
  readonly status: number;

  /** HTTP status text */
  readonly statusText: string;

  /** Response headers */
  readonly headers: Headers;

  /** Request URL */
  readonly url: string;

  // --- Body access (synchronous, reusable, null if no body) ---

  /** Response body as raw bytes (null if no body) */
  readonly body: Uint8Array | null;

  /** Get body as ArrayBuffer (null if no body) */
  arrayBuffer(): ArrayBuffer | null;

  /** Get body as Blob (null if no body) */
  blob(): Blob | null;

  /** Get body as text (null if no body) */
  text(): string | null;

  /**
   * Get body as parsed JSON (null if no body)
   * @template T - defaults to any for test convenience
   */
  // deno-lint-ignore no-explicit-any
  data<T = any>(): T | null;

  // --- Additional properties ---

  /** Response time in milliseconds */
  readonly duration: number;

  /** Get raw Web standard Response (for streaming or special cases) */
  raw(): globalThis.Response;
}

/**
 * Implementation of HttpResponse with pre-loaded body.
 */
class HttpResponseImpl implements HttpResponse {
  readonly kind = "http" as const;
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly url: string;
  readonly body: Uint8Array | null;
  readonly duration: number;

  #raw: globalThis.Response;
  #textCache: string | null | undefined;
  #jsonCache: unknown | undefined;
  #jsonParsed = false;

  constructor(
    raw: globalThis.Response,
    body: Uint8Array | null,
    duration: number,
  ) {
    this.ok = raw.ok;
    this.status = raw.status;
    this.statusText = raw.statusText;
    this.headers = raw.headers;
    this.url = raw.url;
    this.body = body;
    this.duration = duration;
    this.#raw = raw;
  }

  raw(): globalThis.Response {
    return this.#raw;
  }

  arrayBuffer(): ArrayBuffer | null {
    if (this.body === null) {
      return null;
    }
    // Create a new ArrayBuffer copy to ensure correct type
    const buffer = new ArrayBuffer(this.body.byteLength);
    new Uint8Array(buffer).set(this.body);
    return buffer;
  }

  blob(): Blob | null {
    if (this.body === null) {
      return null;
    }
    const contentType = this.headers.get("content-type") ?? "";
    // Use arrayBuffer() to get a properly typed buffer
    return new Blob([this.arrayBuffer()!], { type: contentType });
  }

  text(): string | null {
    if (this.body === null) {
      return null;
    }
    if (this.#textCache === undefined) {
      this.#textCache = new TextDecoder().decode(this.body);
    }
    return this.#textCache;
  }

  // deno-lint-ignore no-explicit-any
  data<T = any>(): T | null {
    if (this.body === null) {
      return null;
    }
    if (!this.#jsonParsed) {
      const textValue = this.text();
      this.#jsonCache = textValue !== null ? JSON.parse(textValue) : null;
      this.#jsonParsed = true;
    }
    return this.#jsonCache as T;
  }
}

/**
 * Create HttpResponse from raw Response.
 *
 * Consumes the response body and creates a reusable HttpResponse.
 */
export async function createHttpResponse(
  raw: globalThis.Response,
  duration: number,
): Promise<HttpResponse> {
  let body: Uint8Array | null = null;

  if (raw.body !== null) {
    const arrayBuffer = await raw.arrayBuffer();
    if (arrayBuffer.byteLength > 0) {
      body = new Uint8Array(arrayBuffer);
    }
  }

  return new HttpResponseImpl(raw, body, duration);
}

/**
 * HTTP response failure result.
 *
 * Represents a failure to complete an HTTP request due to network errors,
 * connection failures, or other issues that prevented the request from
 * reaching the server or receiving a response.
 *
 * Note: HTTP error status codes (4xx, 5xx) are NOT represented by this type.
 * Those are successful HTTP responses with error status codes and are
 * represented by `HttpResponse` with `ok: false`.
 */
export interface HttpResponseFailure {
  /** Result kind discriminator */
  readonly kind: "http";

  /** Always false for failure results */
  readonly ok: false;

  /** The error that caused the failure */
  readonly error: HttpError;

  /** Response time in milliseconds until failure */
  readonly duration: number;
}

/**
 * Union type for HTTP response results.
 *
 * Use type narrowing with the `status` property to distinguish between
 * HttpResponse and HttpResponseFailure:
 *
 * ```ts ignore
 * const result = await http.get("/api/data");
 * if ("status" in result) {
 *   // result is HttpResponse - request completed
 *   console.log(result.status, result.data());
 * } else {
 *   // result is HttpResponseFailure - request failed
 *   console.error(result.error.message);
 * }
 * ```
 */
export type HttpResponseType = HttpResponse | HttpResponseFailure;

/**
 * Create an HTTP response failure result.
 *
 * @param error - The error that caused the failure
 * @param duration - Time in milliseconds until failure
 */
export function createHttpResponseFailure(
  error: HttpError,
  duration: number,
): HttpResponseFailure {
  return {
    kind: "http",
    ok: false as const,
    error,
    duration,
  };
}
