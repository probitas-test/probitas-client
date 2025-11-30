import type { GrpcResponse } from "./response.ts";
import type { GrpcStatusCode } from "./status.ts";

/**
 * Fluent assertion interface for GrpcResponse.
 */
export interface GrpcResponseExpectation {
  /** Verify that status is OK (code === 0). */
  ok(): this;

  /** Verify that status is not OK. */
  notOk(): this;

  /** Verify the exact status code. */
  code(code: GrpcStatusCode): this;

  /** Verify the status code is one of the specified values. */
  codeIn(...codes: GrpcStatusCode[]): this;

  /** Verify the status message matches exactly or by regex. */
  message(expected: string | RegExp): this;

  /** Verify the status message contains the substring. */
  messageContains(substring: string): this;

  /** Verify the status message using a custom matcher. */
  messageMatch(matcher: (message: string) => void): this;

  /** Verify a trailer value matches exactly or by regex. */
  trailers(key: string, expected: string | RegExp): this;

  /** Verify that a trailer key exists. */
  trailersExist(key: string): this;

  /** Verify that body is null. */
  noContent(): this;

  /** Verify that body is not null. */
  hasContent(): this;

  /** Verify that body contains the specified bytes. */
  bodyContains(subbody: Uint8Array): this;

  /** Verify body using a custom matcher. */
  bodyMatch(matcher: (body: Uint8Array) => void): this;

  /** Verify that data() contains the specified properties. */
  // deno-lint-ignore no-explicit-any
  dataContains<T = any>(subset: Partial<T>): this;

  /** Verify data() using a custom matcher. */
  // deno-lint-ignore no-explicit-any
  dataMatch<T = any>(matcher: (data: T) => void): this;

  /** Verify that json() contains the specified properties. */
  // deno-lint-ignore no-explicit-any
  jsonContains<T = any>(subset: Partial<T>): this;

  /** Verify json() using a custom matcher. */
  // deno-lint-ignore no-explicit-any
  jsonMatch<T = any>(matcher: (body: T) => void): this;

  /** Verify the response duration is less than the threshold. */
  durationLessThan(ms: number): this;
}

function containsSubarray(arr: Uint8Array, sub: Uint8Array): boolean {
  if (sub.length === 0) return true;
  if (sub.length > arr.length) return false;

  outer: for (let i = 0; i <= arr.length - sub.length; i++) {
    for (let j = 0; j < sub.length; j++) {
      if (arr[i + j] !== sub[j]) {
        continue outer;
      }
    }
    return true;
  }
  return false;
}

function containsSubset(obj: unknown, subset: unknown): boolean {
  if (subset === null || typeof subset !== "object") {
    return obj === subset;
  }
  if (obj === null || typeof obj !== "object") {
    return false;
  }
  for (const key of Object.keys(subset)) {
    if (
      !containsSubset(
        (obj as Record<string, unknown>)[key],
        (subset as Record<string, unknown>)[key],
      )
    ) {
      return false;
    }
  }
  return true;
}

class GrpcResponseExpectationImpl implements GrpcResponseExpectation {
  readonly #response: GrpcResponse;

  constructor(response: GrpcResponse) {
    this.#response = response;
  }

  ok(): this {
    if (!this.#response.ok) {
      throw new Error(
        `Expected ok response (code 0), got code ${this.#response.code}`,
      );
    }
    return this;
  }

  notOk(): this {
    if (this.#response.ok) {
      throw new Error(
        `Expected non-ok response, got code ${this.#response.code}`,
      );
    }
    return this;
  }

  code(code: GrpcStatusCode): this {
    if (this.#response.code !== code) {
      throw new Error(
        `Expected code ${code}, got ${this.#response.code}`,
      );
    }
    return this;
  }

  codeIn(...codes: GrpcStatusCode[]): this {
    if (!codes.includes(this.#response.code)) {
      throw new Error(
        `Expected code to be one of [${
          codes.join(", ")
        }], got ${this.#response.code}`,
      );
    }
    return this;
  }

  message(expected: string | RegExp): this {
    const msg = this.#response.message;
    if (typeof expected === "string") {
      if (msg !== expected) {
        throw new Error(`Expected message "${expected}", got "${msg}"`);
      }
    } else {
      if (!expected.test(msg)) {
        throw new Error(
          `Expected message to match ${expected}, got "${msg}"`,
        );
      }
    }
    return this;
  }

  messageContains(substring: string): this {
    if (!this.#response.message.includes(substring)) {
      throw new Error(`Expected message to contain "${substring}"`);
    }
    return this;
  }

  messageMatch(matcher: (message: string) => void): this {
    matcher(this.#response.message);
    return this;
  }

  trailers(key: string, expected: string | RegExp): this {
    const value = this.#response.trailers[key];
    if (typeof expected === "string") {
      if (value !== expected) {
        throw new Error(
          `Expected trailer "${key}" to be "${expected}", got "${value}"`,
        );
      }
    } else {
      if (value === undefined || !expected.test(value)) {
        throw new Error(
          `Expected trailer "${key}" to match ${expected}, got "${value}"`,
        );
      }
    }
    return this;
  }

  trailersExist(key: string): this {
    if (!(key in this.#response.trailers)) {
      throw new Error(`Expected trailer "${key}" to exist`);
    }
    return this;
  }

  noContent(): this {
    if (this.#response.body !== null) {
      throw new Error(
        `Expected no content, but body has ${this.#response.body.length} bytes`,
      );
    }
    return this;
  }

  hasContent(): this {
    if (this.#response.body === null) {
      throw new Error("Expected content, but body is null");
    }
    return this;
  }

  bodyContains(subbody: Uint8Array): this {
    if (this.#response.body === null) {
      throw new Error(
        "Expected body to contain specified bytes, but body is null",
      );
    }
    if (!containsSubarray(this.#response.body, subbody)) {
      throw new Error("Expected body to contain specified bytes");
    }
    return this;
  }

  bodyMatch(matcher: (body: Uint8Array) => void): this {
    if (this.#response.body === null) {
      throw new Error("Cannot match body: body is null");
    }
    matcher(this.#response.body);
    return this;
  }

  // deno-lint-ignore no-explicit-any
  dataContains<T = any>(subset: Partial<T>): this {
    const data = this.#response.data<T>();
    if (!containsSubset(data, subset)) {
      throw new Error(
        `Expected data to contain ${JSON.stringify(subset)}, got ${
          JSON.stringify(data)
        }`,
      );
    }
    return this;
  }

  // deno-lint-ignore no-explicit-any
  dataMatch<T = any>(matcher: (data: T) => void): this {
    const data = this.#response.data<T>();
    if (data === null) {
      throw new Error("Cannot match data: data is null");
    }
    matcher(data);
    return this;
  }

  // deno-lint-ignore no-explicit-any
  jsonContains<T = any>(subset: Partial<T>): this {
    const json = this.#response.json<T>();
    if (!containsSubset(json, subset)) {
      throw new Error(
        `Expected JSON to contain ${JSON.stringify(subset)}, got ${
          JSON.stringify(json)
        }`,
      );
    }
    return this;
  }

  // deno-lint-ignore no-explicit-any
  jsonMatch<T = any>(matcher: (body: T) => void): this {
    const json = this.#response.json<T>();
    if (json === null) {
      throw new Error("Cannot match JSON: body is null");
    }
    matcher(json);
    return this;
  }

  durationLessThan(ms: number): this {
    if (this.#response.duration >= ms) {
      throw new Error(
        `Expected duration < ${ms}ms, got ${this.#response.duration}ms`,
      );
    }
    return this;
  }
}

/**
 * Create a fluent assertion for a GrpcResponse.
 */
export function expectGrpcResponse(
  response: GrpcResponse,
): GrpcResponseExpectation {
  return new GrpcResponseExpectationImpl(response);
}
