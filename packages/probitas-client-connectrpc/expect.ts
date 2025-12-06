/**
 * Fluent expectation API for ConnectRPC responses.
 *
 * @module
 */

import type { ConnectRpcResponse } from "./response.ts";
import type { ConnectRpcStatusCode } from "./status.ts";

/**
 * Fluent assertion interface for ConnectRpcResponse.
 */
export interface ConnectRpcResponseExpectation {
  /** Verify that status is OK (code === 0). */
  ok(): this;

  /** Verify that status is not OK. */
  notOk(): this;

  /** Verify the exact status code. */
  code(code: ConnectRpcStatusCode): this;

  /** Verify the status code is one of the specified values. */
  codeIn(...codes: ConnectRpcStatusCode[]): this;

  /** Verify the status message matches exactly or by regex. */
  message(expected: string | RegExp): this;

  /** Verify the status message contains the substring. */
  messageContains(substring: string): this;

  /** Verify the status message using a custom matcher. */
  messageMatch(matcher: (message: string) => void): this;

  /** Verify a header value matches exactly or by regex. */
  headers(key: string, expected: string | RegExp): this;

  /** Verify that a header key exists. */
  headersExist(key: string): this;

  /** Verify a trailer value matches exactly or by regex. */
  trailers(key: string, expected: string | RegExp): this;

  /** Verify that a trailer key exists. */
  trailersExist(key: string): this;

  /** Verify that data() is null. */
  noContent(): this;

  /** Verify that data() is not null. */
  hasContent(): this;

  /** Verify that data() contains the specified properties (deep partial match). */
  // deno-lint-ignore no-explicit-any
  dataContains<T = any>(subset: Partial<T>): this;

  /** Verify data() using a custom matcher. */
  // deno-lint-ignore no-explicit-any
  dataMatch<T = any>(matcher: (data: T) => void): this;

  /** Verify that response duration is less than the threshold. */
  durationLessThan(ms: number): this;
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

class ConnectRpcResponseExpectationImpl
  implements ConnectRpcResponseExpectation {
  readonly #response: ConnectRpcResponse;

  constructor(response: ConnectRpcResponse) {
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

  code(code: ConnectRpcStatusCode): this {
    if (this.#response.code !== code) {
      throw new Error(
        `Expected code ${code}, got ${this.#response.code}`,
      );
    }
    return this;
  }

  codeIn(...codes: ConnectRpcStatusCode[]): this {
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

  headers(key: string, expected: string | RegExp): this {
    const value = this.#response.headers[key];
    if (typeof expected === "string") {
      if (value !== expected) {
        throw new Error(
          `Expected header "${key}" to be "${expected}", got "${value}"`,
        );
      }
    } else {
      if (value === undefined || !expected.test(value)) {
        throw new Error(
          `Expected header "${key}" to match ${expected}, got "${value}"`,
        );
      }
    }
    return this;
  }

  headersExist(key: string): this {
    if (!(key in this.#response.headers)) {
      throw new Error(`Expected header "${key}" to exist`);
    }
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
    if (this.#response.data() !== null) {
      throw new Error("Expected no data, but data is not null");
    }
    return this;
  }

  hasContent(): this {
    if (this.#response.data() === null) {
      throw new Error("Expected data, but data is null");
    }
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
 * Create a fluent assertion for a ConnectRpcResponse.
 */
export function expectConnectRpcResponse(
  response: ConnectRpcResponse,
): ConnectRpcResponseExpectation {
  return new ConnectRpcResponseExpectationImpl(response);
}
