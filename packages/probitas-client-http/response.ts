import type { HttpResponse } from "./types.ts";

/**
 * Implementation of HttpResponse with pre-loaded body.
 */
class HttpResponseImpl implements HttpResponse {
  readonly type = "http" as const;
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly url: string;
  readonly body: Uint8Array | null;
  readonly duration: number;
  readonly raw: globalThis.Response;

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
    this.raw = raw;
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
  json<T = any>(): T | null {
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
