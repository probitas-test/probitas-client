import { containsSubset } from "@probitas/client";
import type {
  RabbitMqAckResult,
  RabbitMqConsumeResult,
  RabbitMqExchangeResult,
  RabbitMqMessageProperties,
  RabbitMqPublishResult,
  RabbitMqQueueResult,
} from "./types.ts";

/**
 * Fluent API for RabbitMQ publish result validation.
 */
export interface RabbitMqPublishResultExpectation {
  /** Assert that result ok is true */
  ok(): this;

  /** Assert that result ok is false */
  notOk(): this;

  /** Assert that duration is less than threshold (ms) */
  durationLessThan(ms: number): this;
}

/**
 * Fluent API for RabbitMQ consume result validation.
 */
export interface RabbitMqConsumeResultExpectation {
  /** Assert that result ok is true */
  ok(): this;

  /** Assert that result ok is false */
  notOk(): this;

  /** Assert that message is null (empty queue) */
  noContent(): this;

  /** Assert that message is not null */
  hasContent(): this;

  /** Assert that content contains the given subbody */
  contentContains(subbody: Uint8Array): this;

  /** Assert content using custom matcher function */
  contentMatch(matcher: (content: Uint8Array) => void): this;

  /** Assert that properties contain the given subset */
  propertyContains(subset: Partial<RabbitMqMessageProperties>): this;

  /** Assert that routing key matches expected */
  routingKey(expected: string): this;

  /** Assert that exchange matches expected */
  exchange(expected: string): this;

  /** Assert that duration is less than threshold (ms) */
  durationLessThan(ms: number): this;
}

/**
 * Fluent API for RabbitMQ exchange result validation.
 * Same interface as publish result (ok, duration only).
 */
export type RabbitMqExchangeResultExpectation =
  RabbitMqPublishResultExpectation;

/**
 * Fluent API for RabbitMQ ack result validation.
 * Same interface as publish result (ok, duration only).
 */
export type RabbitMqAckResultExpectation = RabbitMqPublishResultExpectation;

/**
 * Fluent API for RabbitMQ queue result validation.
 */
export interface RabbitMqQueueResultExpectation {
  /** Assert that result ok is true */
  ok(): this;

  /** Assert that result ok is false */
  notOk(): this;

  /** Assert that message count equals expected */
  messageCount(count: number): this;

  /** Assert that message count is at least min */
  messageCountAtLeast(min: number): this;

  /** Assert that consumer count equals expected */
  consumerCount(count: number): this;

  /** Assert that duration is less than threshold (ms) */
  durationLessThan(ms: number): this;
}

/**
 * Base result type for simple ok/duration results.
 */
interface SimpleResult {
  readonly ok: boolean;
  readonly duration: number;
}

/**
 * Implementation for RabbitMQ publish result expectations.
 */
class RabbitMqPublishResultExpectationImpl<T extends SimpleResult>
  implements RabbitMqPublishResultExpectation {
  readonly #result: T;

  constructor(result: T) {
    this.#result = result;
  }

  ok(): this {
    if (!this.#result.ok) {
      throw new Error("Expected ok result, but ok is false");
    }
    return this;
  }

  notOk(): this {
    if (this.#result.ok) {
      throw new Error("Expected not ok result, but ok is true");
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
 * Implementation for RabbitMQ consume result expectations.
 */
class RabbitMqConsumeResultExpectationImpl
  implements RabbitMqConsumeResultExpectation {
  readonly #result: RabbitMqConsumeResult;

  constructor(result: RabbitMqConsumeResult) {
    this.#result = result;
  }

  ok(): this {
    if (!this.#result.ok) {
      throw new Error("Expected ok result, but ok is false");
    }
    return this;
  }

  notOk(): this {
    if (this.#result.ok) {
      throw new Error("Expected not ok result, but ok is true");
    }
    return this;
  }

  noContent(): this {
    if (this.#result.message !== null) {
      throw new Error("Expected no message, but message exists");
    }
    return this;
  }

  hasContent(): this {
    if (this.#result.message === null) {
      throw new Error("Expected message, but message is null");
    }
    return this;
  }

  contentContains(subbody: Uint8Array): this {
    if (this.#result.message === null) {
      throw new Error("Expected message, but message is null");
    }

    const content = this.#result.message.content;
    const subbodyStr = new TextDecoder().decode(subbody);
    const contentStr = new TextDecoder().decode(content);

    if (!contentStr.includes(subbodyStr)) {
      throw new Error(
        `Expected content to contain ${subbodyStr}, but got ${contentStr}`,
      );
    }
    return this;
  }

  contentMatch(matcher: (content: Uint8Array) => void): this {
    if (this.#result.message === null) {
      throw new Error("Expected message, but message is null");
    }
    matcher(this.#result.message.content);
    return this;
  }

  propertyContains(subset: Partial<RabbitMqMessageProperties>): this {
    if (this.#result.message === null) {
      throw new Error("Expected message, but message is null");
    }

    const props = this.#result.message.properties;
    if (!containsSubset(props, subset)) {
      throw new Error(
        `Expected properties to contain ${JSON.stringify(subset)}, got ${
          JSON.stringify(props)
        }`,
      );
    }
    return this;
  }

  routingKey(expected: string): this {
    if (this.#result.message === null) {
      throw new Error("Expected message, but message is null");
    }

    if (this.#result.message.fields.routingKey !== expected) {
      throw new Error(
        `Expected routing key ${expected}, got ${this.#result.message.fields.routingKey}`,
      );
    }
    return this;
  }

  exchange(expected: string): this {
    if (this.#result.message === null) {
      throw new Error("Expected message, but message is null");
    }

    if (this.#result.message.fields.exchange !== expected) {
      throw new Error(
        `Expected exchange ${expected}, got ${this.#result.message.fields.exchange}`,
      );
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
 * Implementation for RabbitMQ queue result expectations.
 */
class RabbitMqQueueResultExpectationImpl
  implements RabbitMqQueueResultExpectation {
  readonly #result: RabbitMqQueueResult;

  constructor(result: RabbitMqQueueResult) {
    this.#result = result;
  }

  ok(): this {
    if (!this.#result.ok) {
      throw new Error("Expected ok result, but ok is false");
    }
    return this;
  }

  notOk(): this {
    if (this.#result.ok) {
      throw new Error("Expected not ok result, but ok is true");
    }
    return this;
  }

  messageCount(count: number): this {
    if (this.#result.messageCount !== count) {
      throw new Error(
        `Expected message count ${count}, got ${this.#result.messageCount}`,
      );
    }
    return this;
  }

  messageCountAtLeast(min: number): this {
    if (this.#result.messageCount < min) {
      throw new Error(
        `Expected message count >= ${min}, got ${this.#result.messageCount}`,
      );
    }
    return this;
  }

  consumerCount(count: number): this {
    if (this.#result.consumerCount !== count) {
      throw new Error(
        `Expected consumer count ${count}, got ${this.#result.consumerCount}`,
      );
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
 * Create a fluent expectation chain for RabbitMQ publish result validation.
 */
export function expectRabbitMqPublishResult(
  result: RabbitMqPublishResult,
): RabbitMqPublishResultExpectation {
  return new RabbitMqPublishResultExpectationImpl<RabbitMqPublishResult>(
    result,
  );
}

/**
 * Create a fluent expectation chain for RabbitMQ consume result validation.
 */
export function expectRabbitMqConsumeResult(
  result: RabbitMqConsumeResult,
): RabbitMqConsumeResultExpectation {
  return new RabbitMqConsumeResultExpectationImpl(result);
}

/**
 * Create a fluent expectation chain for RabbitMQ queue result validation.
 */
export function expectRabbitMqQueueResult(
  result: RabbitMqQueueResult,
): RabbitMqQueueResultExpectation {
  return new RabbitMqQueueResultExpectationImpl(result);
}

/**
 * Create a fluent expectation chain for RabbitMQ exchange result validation.
 */
export function expectRabbitMqExchangeResult(
  result: RabbitMqExchangeResult,
): RabbitMqExchangeResultExpectation {
  return new RabbitMqPublishResultExpectationImpl<RabbitMqExchangeResult>(
    result,
  );
}

/**
 * Create a fluent expectation chain for RabbitMQ ack result validation.
 */
export function expectRabbitMqAckResult(
  result: RabbitMqAckResult,
): RabbitMqAckResultExpectation {
  return new RabbitMqPublishResultExpectationImpl<RabbitMqAckResult>(result);
}
