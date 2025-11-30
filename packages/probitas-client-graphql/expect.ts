import type { GraphqlResponse } from "./types.ts";

/**
 * Fluent API for GraphQL response validation.
 */
export interface GraphqlResponseExpectation {
  /** Assert that response has no errors */
  ok(): this;

  /** Assert that response has errors */
  hasErrors(): this;

  /** Assert exact number of errors */
  errorCount(n: number): this;

  /** Assert that at least one error contains the message */
  errorContains(message: string): this;

  /** Assert errors using custom matcher */
  errorMatch(matcher: (errors: readonly { message: string }[]) => void): this;

  /** Assert that data is not null */
  hasData(): this;

  /** Assert that data is null */
  noData(): this;

  /** Assert that data contains expected subset (deep partial match) */
  // deno-lint-ignore no-explicit-any
  dataContains<T = any>(subset: Partial<T>): this;

  /** Assert data using custom matcher */
  // deno-lint-ignore no-explicit-any
  dataMatch<T = any>(matcher: (data: T) => void): this;

  /** Assert that an extension key exists */
  extensionExists(key: string): this;

  /** Assert extension using custom matcher */
  extensionMatch(key: string, matcher: (value: unknown) => void): this;

  /** Assert HTTP status code */
  status(code: number): this;

  /** Assert that response duration is less than threshold (ms) */
  durationLessThan(ms: number): this;
}

/**
 * Deep partial match check.
 */
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

/**
 * GraphqlResponseExpectation implementation.
 */
class GraphqlResponseExpectationImpl implements GraphqlResponseExpectation {
  readonly #response: GraphqlResponse;

  constructor(response: GraphqlResponse) {
    this.#response = response;
  }

  ok(): this {
    if (!this.#response.ok) {
      const errorMessages = this.#response.errors
        ?.map((e) => e.message)
        .join("; ");
      throw new Error(`Expected ok response, got errors: ${errorMessages}`);
    }
    return this;
  }

  hasErrors(): this {
    if (this.#response.ok) {
      throw new Error("Expected response with errors, but got ok response");
    }
    return this;
  }

  errorCount(n: number): this {
    const actual = this.#response.errors?.length ?? 0;
    if (actual !== n) {
      throw new Error(`Expected ${n} errors, got ${actual}`);
    }
    return this;
  }

  errorContains(message: string): this {
    if (!this.#response.errors || this.#response.errors.length === 0) {
      throw new Error(
        `Expected an error containing "${message}", but no errors present`,
      );
    }
    const found = this.#response.errors.some((e) =>
      e.message.includes(message)
    );
    if (!found) {
      throw new Error(
        `Expected an error containing "${message}", but none found`,
      );
    }
    return this;
  }

  errorMatch(matcher: (errors: readonly { message: string }[]) => void): this {
    if (!this.#response.errors) {
      throw new Error("Cannot match errors: no errors present");
    }
    matcher(this.#response.errors);
    return this;
  }

  hasData(): this {
    if (this.#response.data === null) {
      throw new Error("Expected data, but data is null");
    }
    return this;
  }

  noData(): this {
    if (this.#response.data !== null) {
      throw new Error("Expected no data, but data exists");
    }
    return this;
  }

  // deno-lint-ignore no-explicit-any
  dataContains<T = any>(subset: Partial<T>): this {
    if (this.#response.data === null) {
      throw new Error("Expected data to contain subset, but data is null");
    }
    if (!containsSubset(this.#response.data, subset)) {
      throw new Error(
        `Expected data to contain ${JSON.stringify(subset)}, got ${
          JSON.stringify(this.#response.data)
        }`,
      );
    }
    return this;
  }

  // deno-lint-ignore no-explicit-any
  dataMatch<T = any>(matcher: (data: T) => void): this {
    if (this.#response.data === null) {
      throw new Error("Cannot match data: data is null");
    }
    matcher(this.#response.data as T);
    return this;
  }

  extensionExists(key: string): this {
    if (!this.#response.extensions || !(key in this.#response.extensions)) {
      throw new Error(`Expected extension "${key}" to exist`);
    }
    return this;
  }

  extensionMatch(key: string, matcher: (value: unknown) => void): this {
    if (!this.#response.extensions || !(key in this.#response.extensions)) {
      throw new Error(`Extension "${key}" not found`);
    }
    matcher(this.#response.extensions[key]);
    return this;
  }

  status(code: number): this {
    if (this.#response.status !== code) {
      throw new Error(
        `Expected status ${code}, got ${this.#response.status}`,
      );
    }
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
 * Create a fluent expectation chain for GraphQL response validation.
 */
export function expectGraphqlResponse(
  response: GraphqlResponse,
): GraphqlResponseExpectation {
  return new GraphqlResponseExpectationImpl(response);
}
