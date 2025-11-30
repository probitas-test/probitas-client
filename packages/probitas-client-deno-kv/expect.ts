import type {
  DenoKvAtomicResult,
  DenoKvDeleteResult,
  DenoKvEntries,
  DenoKvGetResult,
  DenoKvListResult,
  DenoKvSetResult,
} from "./results.ts";

/**
 * Fluent API for validating DenoKvGetResult.
 */
export interface DenoKvGetResultExpectation<T> {
  /** Assert that operation succeeded */
  ok(): this;

  /** Assert that operation did not succeed */
  notOk(): this;

  /** Assert that no value was found (value is null) */
  noContent(): this;

  /** Assert that a value was found (value is not null) */
  hasContent(): this;

  /** Assert that value equals expected */
  value(expected: T): this;

  /** Assert that value contains expected properties */
  valueContains(subset: Partial<T>): this;

  /** Assert value using custom matcher function */
  valueMatch(matcher: (value: T) => void): this;

  /** Assert that versionstamp exists */
  hasVersionstamp(): this;

  /** Assert that duration is less than threshold (ms) */
  durationLessThan(ms: number): this;
}

/**
 * Fluent API for validating DenoKvListResult.
 */
export interface DenoKvListResultExpectation<T> {
  /** Assert that operation succeeded */
  ok(): this;

  /** Assert that operation did not succeed */
  notOk(): this;

  /** Assert that no entries were found */
  noContent(): this;

  /** Assert that at least one entry was found */
  hasContent(): this;

  /** Assert that entry count equals expected */
  count(expected: number): this;

  /** Assert that entry count is at least min */
  countAtLeast(min: number): this;

  /** Assert that entry count is at most max */
  countAtMost(max: number): this;

  /** Assert that at least one entry contains expected properties */
  entryContains(subset: { key?: Deno.KvKey; value?: Partial<T> }): this;

  /** Assert entries using custom matcher function */
  entriesMatch(matcher: (entries: DenoKvEntries<T>) => void): this;

  /** Assert that duration is less than threshold (ms) */
  durationLessThan(ms: number): this;
}

/**
 * Fluent API for validating write operation results (set, delete, atomic).
 */
export interface DenoKvWriteResultExpectation {
  /** Assert that operation succeeded */
  ok(): this;

  /** Assert that operation did not succeed */
  notOk(): this;

  /** Assert that versionstamp exists */
  hasVersionstamp(): this;

  /** Assert that duration is less than threshold (ms) */
  durationLessThan(ms: number): this;
}

/**
 * Check if an object contains all properties from subset (deep comparison).
 */
function containsProperties<T>(
  obj: unknown,
  subset: Partial<T>,
): boolean {
  if (typeof obj !== "object" || obj === null) return false;
  if (typeof subset !== "object" || subset === null) return false;

  for (const [key, expectedValue] of Object.entries(subset)) {
    if (!(key in obj)) return false;
    const actualValue = (obj as Record<string, unknown>)[key];
    if (typeof expectedValue === "object" && expectedValue !== null) {
      if (!containsProperties(actualValue, expectedValue as Partial<unknown>)) {
        return false;
      }
    } else if (actualValue !== expectedValue) {
      return false;
    }
  }
  return true;
}

/**
 * Check if two KvKey arrays are equal.
 */
function keysEqual(a: Deno.KvKey, b: Deno.KvKey): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * DenoKvGetResultExpectation implementation.
 */
class DenoKvGetResultExpectationImpl<T>
  implements DenoKvGetResultExpectation<T> {
  readonly #result: DenoKvGetResult<T>;

  constructor(result: DenoKvGetResult<T>) {
    this.#result = result;
  }

  ok(): this {
    if (!this.#result.ok) {
      throw new Error("Expected ok result");
    }
    return this;
  }

  notOk(): this {
    if (this.#result.ok) {
      throw new Error("Expected not ok result");
    }
    return this;
  }

  noContent(): this {
    if (this.#result.value !== null) {
      throw new Error("Expected no content, but value exists");
    }
    return this;
  }

  hasContent(): this {
    if (this.#result.value === null) {
      throw new Error("Expected content, but value is null");
    }
    return this;
  }

  value(expected: T): this {
    if (this.#result.value === null) {
      throw new Error("Expected value, but value is null");
    }
    if (JSON.stringify(this.#result.value) !== JSON.stringify(expected)) {
      throw new Error(
        `Expected value ${JSON.stringify(expected)}, got ${
          JSON.stringify(this.#result.value)
        }`,
      );
    }
    return this;
  }

  valueContains(subset: Partial<T>): this {
    if (this.#result.value === null) {
      throw new Error(
        "Expected value to contain properties, but value is null",
      );
    }
    if (!containsProperties(this.#result.value, subset)) {
      throw new Error("Value does not contain expected properties");
    }
    return this;
  }

  valueMatch(matcher: (value: T) => void): this {
    if (this.#result.value === null) {
      throw new Error("Expected value for matching, but value is null");
    }
    matcher(this.#result.value);
    return this;
  }

  hasVersionstamp(): this {
    if (this.#result.versionstamp === null) {
      throw new Error("Expected versionstamp, but it is null");
    }
    return this;
  }

  durationLessThan(ms: number): this {
    if (this.#result.duration >= ms) {
      throw new Error(
        `Expected duration < ${ms}ms, got ${this.#result.duration}ms`,
      );
    }
    return this;
  }
}

/**
 * DenoKvListResultExpectation implementation.
 */
class DenoKvListResultExpectationImpl<T>
  implements DenoKvListResultExpectation<T> {
  readonly #result: DenoKvListResult<T>;

  constructor(result: DenoKvListResult<T>) {
    this.#result = result;
  }

  ok(): this {
    if (!this.#result.ok) {
      throw new Error("Expected ok result");
    }
    return this;
  }

  notOk(): this {
    if (this.#result.ok) {
      throw new Error("Expected not ok result");
    }
    return this;
  }

  noContent(): this {
    if (this.#result.entries.length !== 0) {
      throw new Error(
        `Expected no entries, but found ${this.#result.entries.length}`,
      );
    }
    return this;
  }

  hasContent(): this {
    if (this.#result.entries.length === 0) {
      throw new Error("Expected entries, but none found");
    }
    return this;
  }

  count(expected: number): this {
    if (this.#result.entries.length !== expected) {
      throw new Error(
        `Expected ${expected} entries, got ${this.#result.entries.length}`,
      );
    }
    return this;
  }

  countAtLeast(min: number): this {
    if (this.#result.entries.length < min) {
      throw new Error(
        `Expected at least ${min} entries, got ${this.#result.entries.length}`,
      );
    }
    return this;
  }

  countAtMost(max: number): this {
    if (this.#result.entries.length > max) {
      throw new Error(
        `Expected at most ${max} entries, got ${this.#result.entries.length}`,
      );
    }
    return this;
  }

  entryContains(subset: { key?: Deno.KvKey; value?: Partial<T> }): this {
    const found = this.#result.entries.some((entry) => {
      if (subset.key !== undefined && !keysEqual(entry.key, subset.key)) {
        return false;
      }
      if (
        subset.value !== undefined &&
        !containsProperties(entry.value, subset.value)
      ) {
        return false;
      }
      return true;
    });

    if (!found) {
      throw new Error("No entry matches the expected criteria");
    }
    return this;
  }

  entriesMatch(matcher: (entries: DenoKvEntries<T>) => void): this {
    matcher(this.#result.entries);
    return this;
  }

  durationLessThan(ms: number): this {
    if (this.#result.duration >= ms) {
      throw new Error(
        `Expected duration < ${ms}ms, got ${this.#result.duration}ms`,
      );
    }
    return this;
  }
}

/**
 * DenoKvWriteResultExpectation implementation.
 */
class DenoKvWriteResultExpectationImpl implements DenoKvWriteResultExpectation {
  readonly #result: DenoKvSetResult | DenoKvDeleteResult | DenoKvAtomicResult;

  constructor(
    result: DenoKvSetResult | DenoKvDeleteResult | DenoKvAtomicResult,
  ) {
    this.#result = result;
  }

  ok(): this {
    if (!this.#result.ok) {
      throw new Error("Expected ok result");
    }
    return this;
  }

  notOk(): this {
    if (this.#result.ok) {
      throw new Error("Expected not ok result");
    }
    return this;
  }

  hasVersionstamp(): this {
    if (!("versionstamp" in this.#result) || !this.#result.versionstamp) {
      throw new Error("Expected versionstamp, but it is missing or empty");
    }
    return this;
  }

  durationLessThan(ms: number): this {
    if (this.#result.duration >= ms) {
      throw new Error(
        `Expected duration < ${ms}ms, got ${this.#result.duration}ms`,
      );
    }
    return this;
  }
}

/**
 * Create a fluent expectation chain for DenoKvGetResult validation.
 */
// deno-lint-ignore no-explicit-any
export function expectDenoKvGetResult<T = any>(
  result: DenoKvGetResult<T>,
): DenoKvGetResultExpectation<T> {
  return new DenoKvGetResultExpectationImpl(result);
}

/**
 * Create a fluent expectation chain for DenoKvListResult validation.
 */
// deno-lint-ignore no-explicit-any
export function expectDenoKvListResult<T = any>(
  result: DenoKvListResult<T>,
): DenoKvListResultExpectation<T> {
  return new DenoKvListResultExpectationImpl(result);
}

/**
 * Create a fluent expectation chain for DenoKvSetResult validation.
 */
export function expectDenoKvSetResult(
  result: DenoKvSetResult,
): DenoKvWriteResultExpectation {
  return new DenoKvWriteResultExpectationImpl(result);
}

/**
 * Create a fluent expectation chain for DenoKvDeleteResult validation.
 */
export function expectDenoKvDeleteResult(
  result: DenoKvDeleteResult,
): DenoKvWriteResultExpectation {
  return new DenoKvWriteResultExpectationImpl(result);
}

/**
 * Create a fluent expectation chain for DenoKvAtomicResult validation.
 */
export function expectDenoKvAtomicResult(
  result: DenoKvAtomicResult,
): DenoKvWriteResultExpectation {
  return new DenoKvWriteResultExpectationImpl(result);
}
