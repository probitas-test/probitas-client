/**
 * Shared body handling for HTTP responses and errors.
 *
 * This class handles body parsing (text, JSON) with caching and
 * provides consistent behavior across HttpResponse and HttpError.
 */
export class HttpBody {
  readonly bytes: Uint8Array | null;
  readonly #headers: Headers | null;
  readonly #text: string | null;
  readonly #json: unknown;
  readonly #jsonError: Error | null;

  constructor(bytes: Uint8Array | null, headers?: Headers | null) {
    this.bytes = bytes;
    this.#headers = headers ?? null;

    // Decode text and parse JSON once during construction
    const text = bytes ? new TextDecoder().decode(bytes) : null;
    let json: unknown = null;
    let jsonError: Error | null = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch (e) {
        jsonError = e instanceof Error ? e : new Error(String(e));
      }
    }
    this.#text = text;
    this.#json = json;
    this.#jsonError = jsonError;
  }

  /** Get body as ArrayBuffer (null if no body) */
  arrayBuffer(): ArrayBuffer | null {
    if (this.bytes === null) {
      return null;
    }
    const buffer = new ArrayBuffer(this.bytes.byteLength);
    new Uint8Array(buffer).set(this.bytes);
    return buffer;
  }

  /** Get body as Blob (null if no body) */
  blob(): Blob | null {
    if (this.bytes === null) {
      return null;
    }
    const contentType = this.#headers?.get("content-type") ?? "";
    return new Blob([this.arrayBuffer()!], { type: contentType });
  }

  /** Get body as text (null if no body) */
  text(): string | null {
    return this.#text;
  }

  /**
   * Get body as parsed JSON (null if no body).
   * @throws SyntaxError if body is not valid JSON
   */
  // deno-lint-ignore no-explicit-any
  json<T = any>(): T | null {
    if (this.#jsonError) {
      throw this.#jsonError;
    }
    return this.#json as T | null;
  }
}
