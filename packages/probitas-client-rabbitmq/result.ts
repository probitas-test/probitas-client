import type { ClientResult } from "@probitas/client";
import type { RabbitMqMessage } from "./types.ts";
import type { RabbitMqFailureError, RabbitMqOperationError } from "./errors.ts";

// ============================================================================
// RabbitMqPublishResult
// ============================================================================

/**
 * Base interface for publish result with common fields.
 */
interface RabbitMqPublishResultBase extends ClientResult {
  readonly kind: "rabbitmq:publish";
}

/**
 * Successful publish result.
 */
export interface RabbitMqPublishResultSuccess
  extends RabbitMqPublishResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
}

/**
 * Publish result with RabbitMQ error.
 */
export interface RabbitMqPublishResultError extends RabbitMqPublishResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RabbitMqOperationError;
}

/**
 * Publish result with connection failure.
 */
export interface RabbitMqPublishResultFailure
  extends RabbitMqPublishResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RabbitMqFailureError;
}

/**
 * Publish result.
 */
export type RabbitMqPublishResult =
  | RabbitMqPublishResultSuccess
  | RabbitMqPublishResultError
  | RabbitMqPublishResultFailure;

// ============================================================================
// RabbitMqConsumeResult
// ============================================================================

/**
 * Base interface for consume result with common fields.
 */
interface RabbitMqConsumeResultBase extends ClientResult {
  readonly kind: "rabbitmq:consume";
  readonly message: RabbitMqMessage | null;
}

/**
 * Successful consume result.
 */
export interface RabbitMqConsumeResultSuccess
  extends RabbitMqConsumeResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly message: RabbitMqMessage | null;
}

/**
 * Consume result with RabbitMQ error.
 */
export interface RabbitMqConsumeResultError extends RabbitMqConsumeResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RabbitMqOperationError;
  readonly message: null;
}

/**
 * Consume result with connection failure.
 */
export interface RabbitMqConsumeResultFailure
  extends RabbitMqConsumeResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RabbitMqFailureError;
  readonly message: null;
}

/**
 * Consume result (single message retrieval).
 */
export type RabbitMqConsumeResult =
  | RabbitMqConsumeResultSuccess
  | RabbitMqConsumeResultError
  | RabbitMqConsumeResultFailure;

// ============================================================================
// RabbitMqAckResult
// ============================================================================

/**
 * Base interface for ack result with common fields.
 */
interface RabbitMqAckResultBase extends ClientResult {
  readonly kind: "rabbitmq:ack";
}

/**
 * Successful ack result.
 */
export interface RabbitMqAckResultSuccess extends RabbitMqAckResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
}

/**
 * Ack result with RabbitMQ error.
 */
export interface RabbitMqAckResultError extends RabbitMqAckResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RabbitMqOperationError;
}

/**
 * Ack result with connection failure.
 */
export interface RabbitMqAckResultFailure extends RabbitMqAckResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RabbitMqFailureError;
}

/**
 * Ack/Nack result.
 */
export type RabbitMqAckResult =
  | RabbitMqAckResultSuccess
  | RabbitMqAckResultError
  | RabbitMqAckResultFailure;

// ============================================================================
// RabbitMqQueueResult
// ============================================================================

/**
 * Base interface for queue result with common fields.
 */
interface RabbitMqQueueResultBase extends ClientResult {
  readonly kind: "rabbitmq:queue";
  readonly queue: string | null;
  readonly messageCount: number | null;
  readonly consumerCount: number | null;
}

/**
 * Successful queue result.
 */
export interface RabbitMqQueueResultSuccess extends RabbitMqQueueResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
  readonly queue: string;
  readonly messageCount: number;
  readonly consumerCount: number;
}

/**
 * Queue result with RabbitMQ error.
 */
export interface RabbitMqQueueResultError extends RabbitMqQueueResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RabbitMqOperationError;
  readonly queue: null;
  readonly messageCount: null;
  readonly consumerCount: null;
}

/**
 * Queue result with connection failure.
 */
export interface RabbitMqQueueResultFailure extends RabbitMqQueueResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RabbitMqFailureError;
  readonly queue: null;
  readonly messageCount: null;
  readonly consumerCount: null;
}

/**
 * Queue declaration result.
 */
export type RabbitMqQueueResult =
  | RabbitMqQueueResultSuccess
  | RabbitMqQueueResultError
  | RabbitMqQueueResultFailure;

// ============================================================================
// RabbitMqExchangeResult
// ============================================================================

/**
 * Base interface for exchange result with common fields.
 */
interface RabbitMqExchangeResultBase extends ClientResult {
  readonly kind: "rabbitmq:exchange";
}

/**
 * Successful exchange result.
 */
export interface RabbitMqExchangeResultSuccess
  extends RabbitMqExchangeResultBase {
  readonly processed: true;
  readonly ok: true;
  readonly error: null;
}

/**
 * Exchange result with RabbitMQ error.
 */
export interface RabbitMqExchangeResultError
  extends RabbitMqExchangeResultBase {
  readonly processed: true;
  readonly ok: false;
  readonly error: RabbitMqOperationError;
}

/**
 * Exchange result with connection failure.
 */
export interface RabbitMqExchangeResultFailure
  extends RabbitMqExchangeResultBase {
  readonly processed: false;
  readonly ok: false;
  readonly error: RabbitMqFailureError;
}

/**
 * Exchange declaration result.
 */
export type RabbitMqExchangeResult =
  | RabbitMqExchangeResultSuccess
  | RabbitMqExchangeResultError
  | RabbitMqExchangeResultFailure;

// ============================================================================
// Union Type
// ============================================================================

/**
 * Union of all RabbitMQ result types.
 */
export type RabbitMqResult =
  | RabbitMqPublishResult
  | RabbitMqConsumeResult
  | RabbitMqAckResult
  | RabbitMqQueueResult
  | RabbitMqExchangeResult;

// ============================================================================
// RabbitMqPublishResult Factory Functions
// ============================================================================

/**
 * Create a successful publish result.
 */
export function createRabbitMqPublishResultSuccess(params: {
  duration: number;
}): RabbitMqPublishResultSuccess {
  return {
    kind: "rabbitmq:publish",
    processed: true,
    ok: true,
    error: null,
    duration: params.duration,
  };
}

/**
 * Create an error publish result.
 */
export function createRabbitMqPublishResultError(params: {
  error: RabbitMqOperationError;
  duration: number;
}): RabbitMqPublishResultError {
  return {
    kind: "rabbitmq:publish",
    processed: true,
    ok: false,
    error: params.error,
    duration: params.duration,
  };
}

/**
 * Create a failure publish result.
 */
export function createRabbitMqPublishResultFailure(params: {
  error: RabbitMqFailureError;
  duration: number;
}): RabbitMqPublishResultFailure {
  return {
    kind: "rabbitmq:publish",
    processed: false,
    ok: false,
    error: params.error,
    duration: params.duration,
  };
}

// ============================================================================
// RabbitMqConsumeResult Factory Functions
// ============================================================================

/**
 * Create a successful consume result.
 */
export function createRabbitMqConsumeResultSuccess(params: {
  message: RabbitMqMessage | null;
  duration: number;
}): RabbitMqConsumeResultSuccess {
  return {
    kind: "rabbitmq:consume",
    processed: true,
    ok: true,
    error: null,
    message: params.message,
    duration: params.duration,
  };
}

/**
 * Create an error consume result.
 */
export function createRabbitMqConsumeResultError(params: {
  error: RabbitMqOperationError;
  duration: number;
}): RabbitMqConsumeResultError {
  return {
    kind: "rabbitmq:consume",
    processed: true,
    ok: false,
    error: params.error,
    message: null,
    duration: params.duration,
  };
}

/**
 * Create a failure consume result.
 */
export function createRabbitMqConsumeResultFailure(params: {
  error: RabbitMqFailureError;
  duration: number;
}): RabbitMqConsumeResultFailure {
  return {
    kind: "rabbitmq:consume",
    processed: false,
    ok: false,
    error: params.error,
    message: null,
    duration: params.duration,
  };
}

// ============================================================================
// RabbitMqAckResult Factory Functions
// ============================================================================

/**
 * Create a successful ack result.
 */
export function createRabbitMqAckResultSuccess(params: {
  duration: number;
}): RabbitMqAckResultSuccess {
  return {
    kind: "rabbitmq:ack",
    processed: true,
    ok: true,
    error: null,
    duration: params.duration,
  };
}

/**
 * Create an error ack result.
 */
export function createRabbitMqAckResultError(params: {
  error: RabbitMqOperationError;
  duration: number;
}): RabbitMqAckResultError {
  return {
    kind: "rabbitmq:ack",
    processed: true,
    ok: false,
    error: params.error,
    duration: params.duration,
  };
}

/**
 * Create a failure ack result.
 */
export function createRabbitMqAckResultFailure(params: {
  error: RabbitMqFailureError;
  duration: number;
}): RabbitMqAckResultFailure {
  return {
    kind: "rabbitmq:ack",
    processed: false,
    ok: false,
    error: params.error,
    duration: params.duration,
  };
}

// ============================================================================
// RabbitMqQueueResult Factory Functions
// ============================================================================

/**
 * Create a successful queue result.
 */
export function createRabbitMqQueueResultSuccess(params: {
  queue: string;
  messageCount: number;
  consumerCount: number;
  duration: number;
}): RabbitMqQueueResultSuccess {
  return {
    kind: "rabbitmq:queue",
    processed: true,
    ok: true,
    error: null,
    queue: params.queue,
    messageCount: params.messageCount,
    consumerCount: params.consumerCount,
    duration: params.duration,
  };
}

/**
 * Create an error queue result.
 */
export function createRabbitMqQueueResultError(params: {
  error: RabbitMqOperationError;
  duration: number;
}): RabbitMqQueueResultError {
  return {
    kind: "rabbitmq:queue",
    processed: true,
    ok: false,
    error: params.error,
    queue: null,
    messageCount: null,
    consumerCount: null,
    duration: params.duration,
  };
}

/**
 * Create a failure queue result.
 */
export function createRabbitMqQueueResultFailure(params: {
  error: RabbitMqFailureError;
  duration: number;
}): RabbitMqQueueResultFailure {
  return {
    kind: "rabbitmq:queue",
    processed: false,
    ok: false,
    error: params.error,
    queue: null,
    messageCount: null,
    consumerCount: null,
    duration: params.duration,
  };
}

// ============================================================================
// RabbitMqExchangeResult Factory Functions
// ============================================================================

/**
 * Create a successful exchange result.
 */
export function createRabbitMqExchangeResultSuccess(params: {
  duration: number;
}): RabbitMqExchangeResultSuccess {
  return {
    kind: "rabbitmq:exchange",
    processed: true,
    ok: true,
    error: null,
    duration: params.duration,
  };
}

/**
 * Create an error exchange result.
 */
export function createRabbitMqExchangeResultError(params: {
  error: RabbitMqOperationError;
  duration: number;
}): RabbitMqExchangeResultError {
  return {
    kind: "rabbitmq:exchange",
    processed: true,
    ok: false,
    error: params.error,
    duration: params.duration,
  };
}

/**
 * Create a failure exchange result.
 */
export function createRabbitMqExchangeResultFailure(params: {
  error: RabbitMqFailureError;
  duration: number;
}): RabbitMqExchangeResultFailure {
  return {
    kind: "rabbitmq:exchange",
    processed: false,
    ok: false,
    error: params.error,
    duration: params.duration,
  };
}
