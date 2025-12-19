import { MongoClient as NativeMongoClient } from "mongodb";
import type {
  ClientSession,
  Collection as NativeCollection,
  Db,
  MongoClientOptions,
} from "mongodb";
import { AbortError, TimeoutError } from "@probitas/client";
import { getLogger } from "@probitas/logger";
import { deadline } from "@std/async/deadline";
import type {
  Document,
  Filter,
  MongoClient,
  MongoClientConfig,
  MongoCollection,
  MongoConnectionConfig,
  MongoCountResult,
  MongoDeleteResult,
  MongoFindOneResult,
  MongoFindOptions,
  MongoFindResult,
  MongoInsertManyResult,
  MongoInsertOneResult,
  MongoOptions,
  MongoSession,
  MongoUpdateOptions,
  MongoUpdateResult,
  UpdateFilter,
} from "./types.ts";
import {
  MongoConnectionError,
  MongoDuplicateKeyError,
  MongoError,
  type MongoFailureError,
  type MongoOperationError,
  MongoQueryError,
  MongoWriteError,
} from "./errors.ts";
import {
  MongoCountResultErrorImpl,
  MongoCountResultFailureImpl,
  MongoCountResultSuccessImpl,
  MongoDeleteResultErrorImpl,
  MongoDeleteResultFailureImpl,
  MongoDeleteResultSuccessImpl,
  MongoFindOneResultErrorImpl,
  MongoFindOneResultFailureImpl,
  MongoFindOneResultSuccessImpl,
  MongoFindResultErrorImpl,
  MongoFindResultFailureImpl,
  MongoFindResultSuccessImpl,
  MongoInsertManyResultErrorImpl,
  MongoInsertManyResultFailureImpl,
  MongoInsertManyResultSuccessImpl,
  MongoInsertOneResultErrorImpl,
  MongoInsertOneResultFailureImpl,
  MongoInsertOneResultSuccessImpl,
  MongoUpdateResultErrorImpl,
  MongoUpdateResultFailureImpl,
  MongoUpdateResultSuccessImpl,
} from "./result.ts";

/**
 * Check if an error is a failure error (operation not processed).
 */
function isFailureError(error: unknown): error is MongoFailureError {
  return (
    error instanceof AbortError ||
    error instanceof TimeoutError ||
    error instanceof MongoConnectionError
  );
}

const logger = getLogger("probitas", "client", "mongodb");

/**
 * Resolve MongoDB connection URL from string or configuration object.
 */
function resolveMongoUrl(url: string | MongoConnectionConfig): string {
  if (typeof url === "string") {
    return url;
  }

  const host = url.host ?? "localhost";
  const port = url.port ?? 27017;

  let connectionUrl = "mongodb://";

  // Add credentials if provided
  if (url.username && url.password) {
    connectionUrl += `${encodeURIComponent(url.username)}:${
      encodeURIComponent(url.password)
    }@`;
  }

  connectionUrl += `${host}:${port}`;

  // Add database if provided
  if (url.database) {
    connectionUrl += `/${url.database}`;
  }

  // Add query parameters
  const params = new URLSearchParams();
  if (url.authSource) params.set("authSource", url.authSource);
  if (url.replicaSet) params.set("replicaSet", url.replicaSet);

  const queryString = params.toString();
  if (queryString) {
    connectionUrl += `?${queryString}`;
  }

  return connectionUrl;
}

/**
 * Sanitize MongoDB URL for logging (remove password and sensitive info).
 */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    // If parsing fails, return as-is
    return url;
  }
}

/**
 * Extract filter keys for logging (not values, to avoid logging sensitive data).
 */
function getFilterKeys(filter: unknown): string[] {
  if (typeof filter === "object" && filter !== null && !Array.isArray(filter)) {
    // deno-lint-ignore no-explicit-any
    return Object.keys(filter as any);
  }
  return [];
}

/**
 * Convert DOMException to TimeoutError or AbortError.
 * Uses name-based checking instead of instanceof for cross-realm compatibility.
 */
function convertDeadlineError(
  err: unknown,
  operation: string,
  timeoutMs: number,
): unknown {
  if (err instanceof Error) {
    if (err.name === "TimeoutError") {
      return new TimeoutError(`Operation timed out: ${operation}`, timeoutMs);
    }
    if (err.name === "AbortError") {
      return new AbortError(`Operation aborted: ${operation}`);
    }
  }
  return err;
}

/**
 * Execute a promise with abort signal support only.
 *
 * This function exists as a workaround for @std/async@1.0.15's `deadline` limitation.
 * In v1.0.15, `deadline(promise, Infinity, { signal })` throws:
 *   "TypeError: Failed to execute 'AbortSignal.timeout': Argument 1 is not a finite number"
 *
 * This is because v1.0.15 unconditionally calls `AbortSignal.timeout(ms)`:
 *   const signals = [AbortSignal.timeout(ms)];  // Always called, even when ms=Infinity
 *
 * The fix has been merged to main branch (adding `ms < Number.MAX_SAFE_INTEGER` check)
 * and is expected to be released in @std/async@1.0.16 or later.
 *
 * Once the fix is released, this function can be removed and `withOptions` can
 * simply use `deadline(promise, Infinity, { signal })` for signal-only cases.
 *
 * @see https://github.com/denoland/std/blob/main/async/deadline.ts
 */
function withSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  operation: string,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new AbortError(`Operation aborted: ${operation}`));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new AbortError(`Operation aborted: ${operation}`));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise
      .then((value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      })
      .catch((err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      });
  });
}

/**
 * Execute a promise with timeout and abort signal support.
 *
 * Routes to appropriate implementation based on options:
 * - No options: return promise as-is
 * - Signal only: use withSignal (workaround for @std/async@1.0.15)
 * - Timeout (±signal): use deadline from @std/async
 */
function withOptions<T>(
  promise: Promise<T>,
  options: MongoOptions | undefined,
  operation: string,
): Promise<T> {
  if (!options?.timeout && !options?.signal) {
    return promise;
  }
  // Signal-only: use withSignal workaround (see withSignal JSDoc for details)
  // TODO: Replace with `deadline(promise, Infinity, { signal })` after @std/async@1.0.16
  if (!options.timeout && options.signal) {
    return withSignal(promise, options.signal, operation);
  }
  // Timeout (with optional signal): use deadline
  const timeoutMs = options.timeout!;
  return deadline(promise, timeoutMs, { signal: options.signal })
    .catch((err: unknown) => {
      throw convertDeadlineError(err, operation, timeoutMs);
    });
}

/**
 * Check if an error is a connection error.
 */
function isConnectionError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    return (
      message.includes("network") ||
      message.includes("connection") ||
      message.includes("fetch") ||
      message.includes("dns") ||
      message.includes("timeout") ||
      message.includes("econnrefused") ||
      message.includes("enotfound")
    );
  }
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    if (
      name.includes("network") ||
      name.includes("connection")
    ) {
      return true;
    }
    // Check for MongoDB network error patterns
    const message = error.message.toLowerCase();
    if (
      message.includes("failed to connect") ||
      message.includes("server selection") ||
      message.includes("topology was destroyed") ||
      message.includes("connection closed") ||
      message.includes("connection reset")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Convert MongoDB error to appropriate error type.
 * Returns the error instead of throwing it.
 */
function convertMongoError(
  error: unknown,
  collection: string,
): MongoOperationError | MongoFailureError {
  if (error instanceof MongoError) {
    return error;
  }

  // AbortError and TimeoutError should not be converted
  if (error instanceof AbortError || error instanceof TimeoutError) {
    return error;
  }

  if (error instanceof Error) {
    // deno-lint-ignore no-explicit-any
    const mongoError = error as any;

    // Check if it's a connection error first
    if (isConnectionError(error)) {
      return new MongoConnectionError(error.message, {
        cause: error,
        code: mongoError.code,
      });
    }

    // Duplicate key error (code 11000)
    if (mongoError.code === 11000) {
      return new MongoDuplicateKeyError(
        error.message,
        mongoError.keyPattern ?? {},
        mongoError.keyValue ?? {},
        { cause: error, code: 11000 },
      );
    }

    // Write errors
    if (mongoError.writeErrors?.length > 0) {
      return new MongoWriteError(
        error.message,
        mongoError.writeErrors.map((
          e: { index: number; code: number; errmsg: string },
        ) => ({
          index: e.index,
          code: e.code,
          message: e.errmsg,
        })),
        { cause: error, code: mongoError.code },
      );
    }

    return new MongoQueryError(error.message, collection, {
      cause: error,
      code: mongoError.code,
    });
  }

  return new MongoQueryError(String(error), collection);
}

/**
 * Create a new MongoDB client instance.
 *
 * The client provides typed collection access, aggregation pipelines,
 * transaction support, and comprehensive CRUD operations.
 *
 * @param config - MongoDB client configuration
 * @returns A promise resolving to a new MongoDB client instance
 *
 * @example Basic usage with connection string
 * ```ts
 * import { createMongoClient } from "@probitas/client-mongodb";
 *
 * const mongo = await createMongoClient({
 *   url: "mongodb://localhost:27017",
 *   database: "testdb",
 * });
 *
 * const users = mongo.collection<{ name: string; age: number }>("users");
 * const result = await users.find({ age: { $gte: 18 } });
 *
 * if (result.ok) {
 *   console.log(result.docs[0]);
 * } else {
 *   console.error("Error:", result.error.message);
 * }
 *
 * await mongo.close();
 * ```
 *
 * @example Using connection config object
 * ```ts
 * import { createMongoClient } from "@probitas/client-mongodb";
 *
 * const mongo = await createMongoClient({
 *   url: {
 *     host: "localhost",
 *     port: 27017,
 *     username: "admin",
 *     password: "secret",
 *     authSource: "admin",
 *   },
 *   database: "testdb",
 * });
 *
 * await mongo.close();
 * ```
 *
 * @example Insert and query documents
 * ```ts
 * import { createMongoClient } from "@probitas/client-mongodb";
 *
 * interface User { name: string; age: number }
 *
 * const mongo = await createMongoClient({
 *   url: "mongodb://localhost:27017",
 *   database: "testdb",
 * });
 * const users = mongo.collection<User>("users");
 *
 * // Insert a document
 * const insertResult = await users.insertOne({ name: "Alice", age: 30 });
 * if (insertResult.ok) {
 *   console.log("Inserted ID:", insertResult.insertedId);
 * }
 *
 * // Find documents with projection and sorting
 * const findResult = await users.find(
 *   { age: { $gte: 25 } },
 *   { sort: { name: 1 }, limit: 10 }
 * );
 * if (findResult.ok) {
 *   console.log("Found:", findResult.docs.length);
 * }
 *
 * await mongo.close();
 * ```
 *
 * @example Transaction with auto-commit/rollback
 * ```ts
 * import { createMongoClient } from "@probitas/client-mongodb";
 *
 * interface User { _id?: unknown; name: string; age: number }
 *
 * const mongo = await createMongoClient({
 *   url: "mongodb://localhost:27017",
 *   database: "testdb",
 * });
 *
 * await mongo.transaction(async (session) => {
 *   const users = session.collection<User>("users");
 *   const insertResult = await users.insertOne({ name: "Bob", age: 25 });
 *   if (!insertResult.ok) throw insertResult.error;
 *
 *   const updateResult = await users.updateOne(
 *     { name: "Alice" },
 *     { $inc: { age: 1 } }
 *   );
 *   if (!updateResult.ok) throw updateResult.error;
 * });
 *
 * await mongo.close();
 * ```
 *
 * @example Aggregation pipeline
 * ```ts
 * import { createMongoClient } from "@probitas/client-mongodb";
 *
 * interface User { name: string; age: number; department: string }
 *
 * const mongo = await createMongoClient({
 *   url: "mongodb://localhost:27017",
 *   database: "testdb",
 * });
 * const users = mongo.collection<User>("users");
 *
 * const result = await users.aggregate<{ _id: string; avgAge: number }>([
 *   { $group: { _id: "$department", avgAge: { $avg: "$age" } } },
 *   { $sort: { avgAge: -1 } },
 * ]);
 * if (result.ok) {
 *   console.log(result.docs);
 * }
 *
 * await mongo.close();
 * ```
 *
 * @example Using `await using` for automatic cleanup
 * ```ts
 * import { createMongoClient } from "@probitas/client-mongodb";
 *
 * await using mongo = await createMongoClient({
 *   url: "mongodb://localhost:27017",
 *   database: "testdb",
 * });
 *
 * const result = await mongo.collection("users").find({});
 * if (result.ok) {
 *   console.log(result.docs);
 * }
 * // Client automatically closed when scope exits
 * ```
 */
export async function createMongoClient(
  config: MongoClientConfig,
): Promise<MongoClient> {
  let client: NativeMongoClient;
  const connectionUrl = resolveMongoUrl(config.url);

  logger.debug("MongoDB client creation starting", {
    url: sanitizeUrl(connectionUrl),
    database: config.database,
    timeout: config.timeout,
  });

  try {
    // MongoClientOptions type requires many properties that are optional at runtime
    const options = {
      connectTimeoutMS: config.timeout ?? 10000,
      serverSelectionTimeoutMS: config.timeout ?? 10000,
    } as MongoClientOptions;
    client = new NativeMongoClient(connectionUrl, options);

    await client.connect();
    logger.debug("MongoDB client connected successfully", {
      database: config.database,
    });
  } catch (error) {
    throw new MongoConnectionError(
      `Failed to connect to MongoDB: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error instanceof Error ? error : undefined },
    );
  }

  return new MongoClientImpl(
    config,
    client,
    client.db(config.database),
  );
}

class MongoClientImpl implements MongoClient {
  readonly config: MongoClientConfig;
  readonly #client: NativeMongoClient;
  readonly #db: Db;
  #closed = false;

  constructor(
    config: MongoClientConfig,
    client: NativeMongoClient,
    db: Db,
  ) {
    this.config = config;
    this.#client = client;
    this.#db = db;
  }

  collection<T extends Document = Document>(name: string): MongoCollection<T> {
    this.#ensureOpen();
    return new MongoCollectionImpl<T>(
      this.#db.collection(name),
      name,
      this.config,
      undefined,
    );
  }

  db(name: string): MongoClient {
    this.#ensureOpen();
    return new MongoClientImpl(
      { ...this.config, database: name },
      this.#client,
      this.#client.db(name),
    );
  }

  async transaction<T>(fn: (session: MongoSession) => Promise<T>): Promise<T> {
    this.#ensureOpen();
    const startTime = performance.now();
    logger.debug("Transaction starting");

    const session = this.#client.startSession();

    try {
      const result = await session.withTransaction(async () => {
        const mongoSession = new MongoSessionImpl(
          this.#db,
          this.config,
          session,
        );
        return await fn(mongoSession);
      });
      const duration = performance.now() - startTime;
      logger.debug("Transaction completed", {
        duration: `${duration.toFixed(2)}ms`,
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    logger.debug("MongoDB client closing");
    await this.#client.close();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }

  #ensureOpen(): void {
    if (this.#closed) {
      throw new MongoConnectionError("Client is closed");
    }
  }
}

class MongoSessionImpl implements MongoSession {
  readonly #db: Db;
  readonly #config: MongoClientConfig;
  readonly #session: ClientSession;

  constructor(db: Db, config: MongoClientConfig, session: ClientSession) {
    this.#db = db;
    this.#config = config;
    this.#session = session;
  }

  collection<T extends Document = Document>(name: string): MongoCollection<T> {
    return new MongoCollectionImpl<T>(
      this.#db.collection(name),
      name,
      this.#config,
      this.#session,
    );
  }
}

class MongoCollectionImpl<T extends Document> implements MongoCollection<T> {
  readonly #collection: NativeCollection;
  readonly #name: string;
  readonly #config: MongoClientConfig;
  readonly #session?: ClientSession;

  constructor(
    collection: NativeCollection,
    name: string,
    config: MongoClientConfig,
    session?: ClientSession,
  ) {
    this.#collection = collection;
    this.#name = name;
    this.#config = config;
    this.#session = session;
  }

  #shouldThrow(options?: MongoOptions): boolean {
    return options?.throwOnError ?? this.#config.throwOnError ?? false;
  }

  async find(
    filter: Filter = {},
    options?: MongoFindOptions,
  ): Promise<MongoFindResult<T>> {
    const startTime = performance.now();
    const operation = `find(${this.#name})`;

    logger.info("MongoDB find operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
      limit: options?.limit,
      skip: options?.skip,
      hasProjection: !!options?.projection,
      hasSort: !!options?.sort,
    });
    logger.trace("MongoDB find filter", { filter });

    try {
      const findOptions: Record<string, unknown> = {};
      if (options?.sort) findOptions.sort = options.sort;
      if (options?.limit) findOptions.limit = options.limit;
      if (options?.skip) findOptions.skip = options.skip;
      if (options?.projection) findOptions.projection = options.projection;
      if (this.#session) findOptions.session = this.#session;

      const cursor = this.#collection.find(filter, findOptions);
      const docsPromise = cursor.toArray();
      const docs = await withOptions(
        docsPromise,
        options,
        operation,
      ) as unknown as T[];

      const duration = performance.now() - startTime;
      logger.info("MongoDB find operation completed", {
        collection: this.#name,
        documentCount: docs.length,
        duration: `${duration.toFixed(2)}ms`,
      });
      if (docs.length > 0) {
        logger.trace("MongoDB find results", { docs });
      }

      return new MongoFindResultSuccessImpl<T>({
        docs,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("MongoDB find operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const mongoError = convertMongoError(error, this.#name);
      if (this.#shouldThrow(options)) throw mongoError;

      if (isFailureError(mongoError)) {
        return new MongoFindResultFailureImpl<T>({
          error: mongoError,
          duration,
        });
      }
      return new MongoFindResultErrorImpl<T>({ error: mongoError, duration });
    }
  }

  async findOne(
    filter: Filter,
    options?: MongoOptions,
  ): Promise<MongoFindOneResult<T>> {
    const startTime = performance.now();
    const operation = `findOne(${this.#name})`;

    logger.info("MongoDB findOne operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
    });
    logger.trace("MongoDB findOne filter", { filter });

    try {
      const findOptions: Record<string, unknown> = {};
      if (this.#session) findOptions.session = this.#session;

      const promise = this.#collection.findOne(filter, findOptions);
      const doc = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.info("MongoDB findOne operation completed", {
        collection: this.#name,
        found: doc !== null,
        duration: `${duration.toFixed(2)}ms`,
      });
      if (doc) {
        logger.trace("MongoDB findOne result", { doc });
      }

      return new MongoFindOneResultSuccessImpl<T>({
        doc: (doc as T | null) ?? null,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("MongoDB findOne operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const mongoError = convertMongoError(error, this.#name);
      if (this.#shouldThrow(options)) throw mongoError;

      if (isFailureError(mongoError)) {
        return new MongoFindOneResultFailureImpl<T>({
          error: mongoError,
          duration,
        });
      }
      return new MongoFindOneResultErrorImpl<T>({
        error: mongoError,
        duration,
      });
    }
  }

  async insertOne(
    doc: Omit<T, "_id">,
    options?: MongoOptions,
  ): Promise<MongoInsertOneResult> {
    const startTime = performance.now();
    const operation = `insertOne(${this.#name})`;

    logger.info("MongoDB insertOne operation starting", {
      collection: this.#name,
    });
    logger.trace("MongoDB insertOne document", { doc });

    try {
      const insertOptions: Record<string, unknown> = {};
      if (this.#session) insertOptions.session = this.#session;

      const promise = this.#collection.insertOne(doc, insertOptions);
      const result = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.info("MongoDB insertOne operation completed", {
        collection: this.#name,
        insertedId: String(result.insertedId),
        acknowledged: result.acknowledged,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB insertOne result", { result });

      return new MongoInsertOneResultSuccessImpl({
        insertedId: String(result.insertedId),
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("MongoDB insertOne operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const mongoError = convertMongoError(error, this.#name);
      if (this.#shouldThrow(options)) throw mongoError;

      if (isFailureError(mongoError)) {
        return new MongoInsertOneResultFailureImpl({
          error: mongoError,
          duration,
        });
      }
      return new MongoInsertOneResultErrorImpl({ error: mongoError, duration });
    }
  }

  async insertMany(
    docs: Omit<T, "_id">[],
    options?: MongoOptions,
  ): Promise<MongoInsertManyResult> {
    const startTime = performance.now();
    const operation = `insertMany(${this.#name})`;

    logger.info("MongoDB insertMany operation starting", {
      collection: this.#name,
      documentCount: docs.length,
    });
    logger.trace("MongoDB insertMany documents", { docs });

    try {
      const insertOptions: Record<string, unknown> = {};
      if (this.#session) insertOptions.session = this.#session;

      const promise = this.#collection.insertMany(docs, insertOptions);
      const result = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.info("MongoDB insertMany operation completed", {
        collection: this.#name,
        insertedCount: result.insertedCount,
        acknowledged: result.acknowledged,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB insertMany result", { result });

      return new MongoInsertManyResultSuccessImpl({
        insertedIds: Object.values(result.insertedIds).map(String),
        insertedCount: result.insertedCount,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("MongoDB insertMany operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const mongoError = convertMongoError(error, this.#name);
      if (this.#shouldThrow(options)) throw mongoError;

      if (isFailureError(mongoError)) {
        return new MongoInsertManyResultFailureImpl({
          error: mongoError,
          duration,
        });
      }
      return new MongoInsertManyResultErrorImpl({
        error: mongoError,
        duration,
      });
    }
  }

  async updateOne(
    filter: Filter,
    update: UpdateFilter,
    options?: MongoUpdateOptions,
  ): Promise<MongoUpdateResult> {
    const startTime = performance.now();
    const operation = `updateOne(${this.#name})`;

    logger.info("MongoDB updateOne operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
      upsert: options?.upsert ?? false,
    });
    logger.trace("MongoDB updateOne filter and update", { filter, update });

    try {
      const updateOptions: Record<string, unknown> = {};
      if (options?.upsert) updateOptions.upsert = true;
      if (this.#session) updateOptions.session = this.#session;

      const promise = this.#collection.updateOne(filter, update, updateOptions);
      const result = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.info("MongoDB updateOne operation completed", {
        collection: this.#name,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: result.upsertedId ? String(result.upsertedId) : null,
        acknowledged: result.acknowledged,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB updateOne result", { result });

      return new MongoUpdateResultSuccessImpl({
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: result.upsertedId ? String(result.upsertedId) : null,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("MongoDB updateOne operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const mongoError = convertMongoError(error, this.#name);
      if (this.#shouldThrow(options)) throw mongoError;

      if (isFailureError(mongoError)) {
        return new MongoUpdateResultFailureImpl({
          error: mongoError,
          duration,
        });
      }
      return new MongoUpdateResultErrorImpl({ error: mongoError, duration });
    }
  }

  async updateMany(
    filter: Filter,
    update: UpdateFilter,
    options?: MongoUpdateOptions,
  ): Promise<MongoUpdateResult> {
    const startTime = performance.now();
    const operation = `updateMany(${this.#name})`;

    logger.info("MongoDB updateMany operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
      upsert: options?.upsert ?? false,
    });
    logger.trace("MongoDB updateMany filter and update", { filter, update });

    try {
      const updateOptions: Record<string, unknown> = {};
      if (options?.upsert) updateOptions.upsert = true;
      if (this.#session) updateOptions.session = this.#session;

      const promise = this.#collection.updateMany(
        filter,
        update,
        updateOptions,
      );
      const result = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.info("MongoDB updateMany operation completed", {
        collection: this.#name,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: result.upsertedId ? String(result.upsertedId) : null,
        acknowledged: result.acknowledged,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB updateMany result", { result });

      return new MongoUpdateResultSuccessImpl({
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: result.upsertedId ? String(result.upsertedId) : null,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("MongoDB updateMany operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const mongoError = convertMongoError(error, this.#name);
      if (this.#shouldThrow(options)) throw mongoError;

      if (isFailureError(mongoError)) {
        return new MongoUpdateResultFailureImpl({
          error: mongoError,
          duration,
        });
      }
      return new MongoUpdateResultErrorImpl({ error: mongoError, duration });
    }
  }

  async deleteOne(
    filter: Filter,
    options?: MongoOptions,
  ): Promise<MongoDeleteResult> {
    const startTime = performance.now();
    const operation = `deleteOne(${this.#name})`;

    logger.info("MongoDB deleteOne operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
    });
    logger.trace("MongoDB deleteOne filter", { filter });

    try {
      const deleteOptions: Record<string, unknown> = {};
      if (this.#session) deleteOptions.session = this.#session;

      const promise = this.#collection.deleteOne(filter, deleteOptions);
      const result = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.info("MongoDB deleteOne operation completed", {
        collection: this.#name,
        deletedCount: result.deletedCount,
        acknowledged: result.acknowledged,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB deleteOne result", { result });

      return new MongoDeleteResultSuccessImpl({
        deletedCount: result.deletedCount,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("MongoDB deleteOne operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const mongoError = convertMongoError(error, this.#name);
      if (this.#shouldThrow(options)) throw mongoError;

      if (isFailureError(mongoError)) {
        return new MongoDeleteResultFailureImpl({
          error: mongoError,
          duration,
        });
      }
      return new MongoDeleteResultErrorImpl({ error: mongoError, duration });
    }
  }

  async deleteMany(
    filter: Filter,
    options?: MongoOptions,
  ): Promise<MongoDeleteResult> {
    const startTime = performance.now();
    const operation = `deleteMany(${this.#name})`;

    logger.info("MongoDB deleteMany operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
    });
    logger.trace("MongoDB deleteMany filter", { filter });

    try {
      const deleteOptions: Record<string, unknown> = {};
      if (this.#session) deleteOptions.session = this.#session;

      const promise = this.#collection.deleteMany(filter, deleteOptions);
      const result = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.info("MongoDB deleteMany operation completed", {
        collection: this.#name,
        deletedCount: result.deletedCount,
        acknowledged: result.acknowledged,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB deleteMany result", { result });

      return new MongoDeleteResultSuccessImpl({
        deletedCount: result.deletedCount,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("MongoDB deleteMany operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const mongoError = convertMongoError(error, this.#name);
      if (this.#shouldThrow(options)) throw mongoError;

      if (isFailureError(mongoError)) {
        return new MongoDeleteResultFailureImpl({
          error: mongoError,
          duration,
        });
      }
      return new MongoDeleteResultErrorImpl({ error: mongoError, duration });
    }
  }

  async aggregate<R = T>(
    pipeline: Document[],
    options?: MongoOptions,
  ): Promise<MongoFindResult<R>> {
    const startTime = performance.now();
    const operation = `aggregate(${this.#name})`;

    logger.info("MongoDB aggregate operation starting", {
      collection: this.#name,
      pipelineStages: pipeline.length,
    });
    logger.trace("MongoDB aggregate pipeline", { pipeline });

    try {
      const aggOptions: Record<string, unknown> = {};
      if (this.#session) aggOptions.session = this.#session;

      const cursor = this.#collection.aggregate(pipeline, aggOptions);
      const docsPromise = cursor.toArray();
      const docs = await withOptions(docsPromise, options, operation) as R[];

      const duration = performance.now() - startTime;
      logger.info("MongoDB aggregate operation completed", {
        collection: this.#name,
        pipelineStages: pipeline.length,
        documentCount: docs.length,
        duration: `${duration.toFixed(2)}ms`,
      });
      if (docs.length > 0) {
        logger.trace("MongoDB aggregate results", { docs });
      }

      return new MongoFindResultSuccessImpl<R>({
        docs,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("MongoDB aggregate operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const mongoError = convertMongoError(error, this.#name);
      if (this.#shouldThrow(options)) throw mongoError;

      if (isFailureError(mongoError)) {
        return new MongoFindResultFailureImpl<R>({
          error: mongoError,
          duration,
        });
      }
      return new MongoFindResultErrorImpl<R>({ error: mongoError, duration });
    }
  }

  async countDocuments(
    filter: Filter = {},
    options?: MongoOptions,
  ): Promise<MongoCountResult> {
    const startTime = performance.now();
    const operation = `countDocuments(${this.#name})`;

    logger.info("MongoDB countDocuments operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
    });
    logger.trace("MongoDB countDocuments filter", { filter });

    try {
      const countOptions: Record<string, unknown> = {};
      if (this.#session) countOptions.session = this.#session;

      const promise = this.#collection.countDocuments(filter, countOptions);
      const count = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.info("MongoDB countDocuments operation completed", {
        collection: this.#name,
        count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB countDocuments result", { count });

      return new MongoCountResultSuccessImpl({
        count,
        duration,
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.debug("MongoDB countDocuments operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });

      const mongoError = convertMongoError(error, this.#name);
      if (this.#shouldThrow(options)) throw mongoError;

      if (isFailureError(mongoError)) {
        return new MongoCountResultFailureImpl({ error: mongoError, duration });
      }
      return new MongoCountResultErrorImpl({ error: mongoError, duration });
    }
  }
}
