import { AbortError, ClientError, TimeoutError } from "@probitas/client";

/**
 * Options for MongoDB errors.
 */
export interface MongoErrorOptions extends ErrorOptions {
  readonly code?: number;
}

/**
 * Base error class for MongoDB client errors.
 */
export class MongoError extends ClientError {
  override readonly name: string = "MongoError";
  readonly code?: number;

  constructor(
    message: string,
    kind: string = "mongo",
    options?: MongoErrorOptions,
  ) {
    super(message, kind, options);
    this.code = options?.code;
  }
}

/**
 * Error thrown when a MongoDB connection cannot be established.
 */
export class MongoConnectionError extends MongoError {
  override readonly name = "MongoConnectionError";
  override readonly kind = "connection" as const;

  constructor(message: string, options?: MongoErrorOptions) {
    super(message, "connection", options);
  }
}

/**
 * Error thrown when a MongoDB query fails.
 */
export class MongoQueryError extends MongoError {
  override readonly name = "MongoQueryError";
  override readonly kind = "query" as const;
  readonly collection: string;

  constructor(
    message: string,
    collection: string,
    options?: MongoErrorOptions,
  ) {
    super(message, "query", options);
    this.collection = collection;
  }
}

/**
 * Error thrown when a duplicate key constraint is violated.
 */
export class MongoDuplicateKeyError extends MongoError {
  override readonly name = "MongoDuplicateKeyError";
  override readonly kind = "duplicate_key" as const;
  readonly keyPattern: Record<string, number>;
  readonly keyValue: Record<string, unknown>;

  constructor(
    message: string,
    keyPattern: Record<string, number>,
    keyValue: Record<string, unknown>,
    options?: MongoErrorOptions,
  ) {
    super(message, "duplicate_key", { ...options, code: 11000 });
    this.keyPattern = keyPattern;
    this.keyValue = keyValue;
  }
}

/**
 * Error thrown when document validation fails.
 */
export class MongoValidationError extends MongoError {
  override readonly name = "MongoValidationError";
  override readonly kind = "validation" as const;
  readonly validationErrors: readonly string[];

  constructor(
    message: string,
    validationErrors: readonly string[],
    options?: MongoErrorOptions,
  ) {
    super(message, "validation", options);
    this.validationErrors = validationErrors;
  }
}

/**
 * Error thrown when a write operation fails.
 */
export class MongoWriteError extends MongoError {
  override readonly name = "MongoWriteError";
  override readonly kind = "write" as const;
  readonly writeErrors: readonly {
    index: number;
    code: number;
    message: string;
  }[];

  constructor(
    message: string,
    writeErrors: readonly { index: number; code: number; message: string }[],
    options?: MongoErrorOptions,
  ) {
    super(message, "write", options);
    this.writeErrors = writeErrors;
  }
}

/**
 * Error thrown when a document is not found (for firstOrThrow, lastOrThrow).
 */
export class MongoNotFoundError extends MongoError {
  override readonly name = "MongoNotFoundError";
  override readonly kind = "not_found" as const;

  constructor(message: string, options?: MongoErrorOptions) {
    super(message, "not_found", options);
  }
}

/**
 * Error types that indicate a MongoDB operation error.
 * These are errors where the operation reached the server but failed.
 */
export type MongoOperationError =
  | MongoQueryError
  | MongoDuplicateKeyError
  | MongoValidationError
  | MongoWriteError
  | MongoNotFoundError
  | MongoError;

/**
 * Error types that indicate the operation was not processed.
 * These are errors that occur before the operation reaches the MongoDB server.
 */
export type MongoFailureError =
  | MongoConnectionError
  | AbortError
  | TimeoutError;
