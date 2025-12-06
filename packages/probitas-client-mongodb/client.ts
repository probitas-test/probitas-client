import { MongoClient as NativeMongoClient } from "mongodb";
import type {
  ClientSession,
  Collection as NativeCollection,
  Db,
  MongoClientOptions,
} from "mongodb";
import { AbortError, TimeoutError } from "@probitas/client";
import type { CommonOptions } from "@probitas/client";
import { getLogger } from "@probitas/logger";
import type {
  Document,
  Filter,
  MongoClient,
  MongoClientConfig,
  MongoCollection,
  MongoCountResult,
  MongoDeleteResult,
  MongoFindOneResult,
  MongoFindOptions,
  MongoFindResult,
  MongoInsertManyResult,
  MongoInsertOneResult,
  MongoSession,
  MongoUpdateOptions,
  MongoUpdateResult,
  UpdateFilter,
} from "./types.ts";
import {
  MongoConnectionError,
  MongoDuplicateKeyError,
  MongoQueryError,
  MongoWriteError,
} from "./errors.ts";
import { createMongoDocs } from "./results.ts";

const logger = getLogger("probitas", "client", "mongodb");

/**
 * Sanitize MongoDB URI for logging (remove password and sensitive info).
 */
function sanitizeUri(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    // If parsing fails, return as-is
    return uri;
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
 * Format data for trace logging (with truncation to avoid log bloat).
 */
function formatData(data: unknown): string {
  try {
    const str = JSON.stringify(data);
    return str.length > 500 ? str.slice(0, 500) + "..." : str;
  } catch {
    return "<unserializable>";
  }
}

/**
 * Execute a promise with timeout and abort signal support.
 */
async function withOptions<T>(
  promise: Promise<T>,
  options: CommonOptions | undefined,
  operation: string,
): Promise<T> {
  if (!options?.timeout && !options?.signal) {
    return promise;
  }

  const controllers: { cleanup: () => void }[] = [];

  try {
    const racePromises: Promise<T>[] = [promise];

    if (options.timeout !== undefined) {
      const timeoutMs = options.timeout;
      let timeoutId: number;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new TimeoutError(`Operation timed out: ${operation}`, timeoutMs),
          );
        }, timeoutMs);
      });
      controllers.push({ cleanup: () => clearTimeout(timeoutId) });
      racePromises.push(timeoutPromise);
    }

    if (options.signal) {
      const signal = options.signal;
      if (signal.aborted) {
        throw new AbortError(`Operation aborted: ${operation}`);
      }

      const abortPromise = new Promise<never>((_, reject) => {
        const onAbort = () => {
          reject(new AbortError(`Operation aborted: ${operation}`));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        controllers.push({
          cleanup: () => signal.removeEventListener("abort", onAbort),
        });
      });
      racePromises.push(abortPromise);
    }

    return await Promise.race(racePromises);
  } finally {
    for (const controller of controllers) {
      controller.cleanup();
    }
  }
}

/**
 * Convert MongoDB error to appropriate error type.
 */
function convertMongoError(
  error: unknown,
  collection: string,
): never {
  if (error instanceof TimeoutError || error instanceof AbortError) {
    throw error;
  }

  if (error instanceof Error) {
    // deno-lint-ignore no-explicit-any
    const mongoError = error as any;

    // Duplicate key error (code 11000)
    if (mongoError.code === 11000) {
      throw new MongoDuplicateKeyError(
        error.message,
        mongoError.keyPattern ?? {},
        mongoError.keyValue ?? {},
        { cause: error, code: 11000 },
      );
    }

    // Write errors
    if (mongoError.writeErrors?.length > 0) {
      throw new MongoWriteError(
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

    throw new MongoQueryError(error.message, collection, {
      cause: error,
      code: mongoError.code,
    });
  }

  throw new MongoQueryError(String(error), collection);
}

/**
 * Create a MongoDB client.
 *
 * @example
 * ```typescript
 * const mongo = await createMongoClient({
 *   uri: "mongodb://localhost:27017",
 *   database: "testdb",
 * });
 *
 * const users = mongo.collection<{ name: string; age: number }>("users");
 * const result = await users.find({ age: { $gte: 18 } });
 * console.log(result.docs.first());
 *
 * await mongo.close();
 * ```
 */
export async function createMongoClient(
  config: MongoClientConfig,
): Promise<MongoClient> {
  let client: NativeMongoClient;

  logger.debug("MongoDB client creation starting", {
    uri: sanitizeUri(config.uri),
    database: config.database,
    timeout: config.timeout,
  });

  try {
    // MongoClientOptions type requires many properties that are optional at runtime
    const options = {
      connectTimeoutMS: config.timeout ?? 10000,
      serverSelectionTimeoutMS: config.timeout ?? 10000,
    } as MongoClientOptions;
    client = new NativeMongoClient(config.uri, options);

    await client.connect();
    logger.debug("MongoDB client connected successfully", {
      database: config.database,
    });
  } catch (error) {
    logger.error("MongoDB connection failed", {
      database: config.database,
      timeout: config.timeout,
      error: error instanceof Error ? error.message : String(error),
    });
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
          session,
        );
        return await fn(mongoSession);
      });
      const duration = performance.now() - startTime;
      logger.debug("Transaction completed", {
        duration: `${duration.toFixed(2)}ms`,
      });
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("Transaction failed", {
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
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
  readonly #session: ClientSession;

  constructor(db: Db, session: ClientSession) {
    this.#db = db;
    this.#session = session;
  }

  collection<T extends Document = Document>(name: string): MongoCollection<T> {
    return new MongoCollectionImpl<T>(
      this.#db.collection(name),
      name,
      this.#session,
    );
  }
}

class MongoCollectionImpl<T extends Document> implements MongoCollection<T> {
  readonly #collection: NativeCollection;
  readonly #name: string;
  readonly #session?: ClientSession;

  constructor(
    collection: NativeCollection,
    name: string,
    session?: ClientSession,
  ) {
    this.#collection = collection;
    this.#name = name;
    this.#session = session;
  }

  async find(
    filter: Filter = {},
    options?: MongoFindOptions,
  ): Promise<MongoFindResult<T>> {
    const startTime = performance.now();
    const operation = `find(${this.#name})`;

    logger.debug("MongoDB find operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
      limit: options?.limit,
      skip: options?.skip,
      hasProjection: !!options?.projection,
      hasSort: !!options?.sort,
    });
    logger.trace("MongoDB find filter", {
      filter: formatData(filter),
    });

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
      logger.debug("MongoDB find operation completed", {
        collection: this.#name,
        documentCount: docs.length,
        duration: `${duration.toFixed(2)}ms`,
      });
      if (docs.length > 0) {
        logger.trace("MongoDB find results", {
          results: formatData(docs),
        });
      }

      return {
        type: "mongo:find",
        ok: true,
        docs: createMongoDocs(docs),
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("MongoDB find operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertMongoError(error, this.#name);
    }
  }

  async findOne(
    filter: Filter,
    options?: CommonOptions,
  ): Promise<MongoFindOneResult<T>> {
    const startTime = performance.now();
    const operation = `findOne(${this.#name})`;

    logger.debug("MongoDB findOne operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
    });
    logger.trace("MongoDB findOne filter", {
      filter: formatData(filter),
    });

    try {
      const findOptions: Record<string, unknown> = {};
      if (this.#session) findOptions.session = this.#session;

      const promise = this.#collection.findOne(filter, findOptions);
      const doc = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.debug("MongoDB findOne operation completed", {
        collection: this.#name,
        found: doc !== null,
        duration: `${duration.toFixed(2)}ms`,
      });
      if (doc) {
        logger.trace("MongoDB findOne result", {
          result: formatData(doc),
        });
      }

      return {
        type: "mongo:find-one",
        ok: true,
        doc: (doc ?? undefined) as T | undefined,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("MongoDB findOne operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertMongoError(error, this.#name);
    }
  }

  async insertOne(
    doc: Omit<T, "_id">,
    options?: CommonOptions,
  ): Promise<MongoInsertOneResult> {
    const startTime = performance.now();
    const operation = `insertOne(${this.#name})`;

    logger.debug("MongoDB insertOne operation starting", {
      collection: this.#name,
    });
    logger.trace("MongoDB insertOne document", {
      document: formatData(doc),
    });

    try {
      const insertOptions: Record<string, unknown> = {};
      if (this.#session) insertOptions.session = this.#session;

      const promise = this.#collection.insertOne(doc, insertOptions);
      const result = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.debug("MongoDB insertOne operation completed", {
        collection: this.#name,
        insertedId: String(result.insertedId),
        acknowledged: result.acknowledged,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB insertOne result", {
        result: formatData(result),
      });

      return {
        type: "mongo:insert",
        ok: result.acknowledged,
        insertedId: String(result.insertedId),
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("MongoDB insertOne operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertMongoError(error, this.#name);
    }
  }

  async insertMany(
    docs: Omit<T, "_id">[],
    options?: CommonOptions,
  ): Promise<MongoInsertManyResult> {
    const startTime = performance.now();
    const operation = `insertMany(${this.#name})`;

    logger.debug("MongoDB insertMany operation starting", {
      collection: this.#name,
      documentCount: docs.length,
    });
    logger.trace("MongoDB insertMany documents", {
      documents: formatData(docs),
    });

    try {
      const insertOptions: Record<string, unknown> = {};
      if (this.#session) insertOptions.session = this.#session;

      const promise = this.#collection.insertMany(docs, insertOptions);
      const result = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.debug("MongoDB insertMany operation completed", {
        collection: this.#name,
        insertedCount: result.insertedCount,
        acknowledged: result.acknowledged,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB insertMany result", {
        result: formatData(result),
      });

      return {
        type: "mongo:insert",
        ok: result.acknowledged,
        insertedIds: Object.values(result.insertedIds).map(String),
        insertedCount: result.insertedCount,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("MongoDB insertMany operation failed", {
        collection: this.#name,
        documentCount: docs.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertMongoError(error, this.#name);
    }
  }

  async updateOne(
    filter: Filter,
    update: UpdateFilter,
    options?: MongoUpdateOptions,
  ): Promise<MongoUpdateResult> {
    const startTime = performance.now();
    const operation = `updateOne(${this.#name})`;

    logger.debug("MongoDB updateOne operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
      upsert: options?.upsert ?? false,
    });
    logger.trace("MongoDB updateOne filter and update", {
      filter: formatData(filter),
      update: formatData(update),
    });

    try {
      const updateOptions: Record<string, unknown> = {};
      if (options?.upsert) updateOptions.upsert = true;
      if (this.#session) updateOptions.session = this.#session;

      const promise = this.#collection.updateOne(filter, update, updateOptions);
      const result = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.debug("MongoDB updateOne operation completed", {
        collection: this.#name,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: result.upsertedId ? String(result.upsertedId) : undefined,
        acknowledged: result.acknowledged,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB updateOne result", {
        result: formatData(result),
      });

      return {
        type: "mongo:update",
        ok: result.acknowledged,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: result.upsertedId ? String(result.upsertedId) : undefined,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("MongoDB updateOne operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertMongoError(error, this.#name);
    }
  }

  async updateMany(
    filter: Filter,
    update: UpdateFilter,
    options?: MongoUpdateOptions,
  ): Promise<MongoUpdateResult> {
    const startTime = performance.now();
    const operation = `updateMany(${this.#name})`;

    logger.debug("MongoDB updateMany operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
      upsert: options?.upsert ?? false,
    });
    logger.trace("MongoDB updateMany filter and update", {
      filter: formatData(filter),
      update: formatData(update),
    });

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
      logger.debug("MongoDB updateMany operation completed", {
        collection: this.#name,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: result.upsertedId ? String(result.upsertedId) : undefined,
        acknowledged: result.acknowledged,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB updateMany result", {
        result: formatData(result),
      });

      return {
        type: "mongo:update",
        ok: result.acknowledged,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: result.upsertedId ? String(result.upsertedId) : undefined,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("MongoDB updateMany operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertMongoError(error, this.#name);
    }
  }

  async deleteOne(
    filter: Filter,
    options?: CommonOptions,
  ): Promise<MongoDeleteResult> {
    const startTime = performance.now();
    const operation = `deleteOne(${this.#name})`;

    logger.debug("MongoDB deleteOne operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
    });
    logger.trace("MongoDB deleteOne filter", {
      filter: formatData(filter),
    });

    try {
      const deleteOptions: Record<string, unknown> = {};
      if (this.#session) deleteOptions.session = this.#session;

      const promise = this.#collection.deleteOne(filter, deleteOptions);
      const result = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.debug("MongoDB deleteOne operation completed", {
        collection: this.#name,
        deletedCount: result.deletedCount,
        acknowledged: result.acknowledged,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB deleteOne result", {
        result: formatData(result),
      });

      return {
        type: "mongo:delete",
        ok: result.acknowledged,
        deletedCount: result.deletedCount,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("MongoDB deleteOne operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertMongoError(error, this.#name);
    }
  }

  async deleteMany(
    filter: Filter,
    options?: CommonOptions,
  ): Promise<MongoDeleteResult> {
    const startTime = performance.now();
    const operation = `deleteMany(${this.#name})`;

    logger.debug("MongoDB deleteMany operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
    });
    logger.trace("MongoDB deleteMany filter", {
      filter: formatData(filter),
    });

    try {
      const deleteOptions: Record<string, unknown> = {};
      if (this.#session) deleteOptions.session = this.#session;

      const promise = this.#collection.deleteMany(filter, deleteOptions);
      const result = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.debug("MongoDB deleteMany operation completed", {
        collection: this.#name,
        deletedCount: result.deletedCount,
        acknowledged: result.acknowledged,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB deleteMany result", {
        result: formatData(result),
      });

      return {
        type: "mongo:delete",
        ok: result.acknowledged,
        deletedCount: result.deletedCount,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("MongoDB deleteMany operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertMongoError(error, this.#name);
    }
  }

  async aggregate<R = T>(
    pipeline: Document[],
    options?: CommonOptions,
  ): Promise<MongoFindResult<R>> {
    const startTime = performance.now();
    const operation = `aggregate(${this.#name})`;

    logger.debug("MongoDB aggregate operation starting", {
      collection: this.#name,
      pipelineStages: pipeline.length,
    });
    logger.trace("MongoDB aggregate pipeline", {
      pipeline: formatData(pipeline),
    });

    try {
      const aggOptions: Record<string, unknown> = {};
      if (this.#session) aggOptions.session = this.#session;

      const cursor = this.#collection.aggregate(pipeline, aggOptions);
      const docsPromise = cursor.toArray();
      const docs = await withOptions(docsPromise, options, operation) as R[];

      const duration = performance.now() - startTime;
      logger.debug("MongoDB aggregate operation completed", {
        collection: this.#name,
        pipelineStages: pipeline.length,
        documentCount: docs.length,
        duration: `${duration.toFixed(2)}ms`,
      });
      if (docs.length > 0) {
        logger.trace("MongoDB aggregate results", {
          results: formatData(docs),
        });
      }

      return {
        type: "mongo:find",
        ok: true,
        docs: createMongoDocs(docs),
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("MongoDB aggregate operation failed", {
        collection: this.#name,
        pipelineStages: pipeline.length,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertMongoError(error, this.#name);
    }
  }

  async countDocuments(
    filter: Filter = {},
    options?: CommonOptions,
  ): Promise<MongoCountResult> {
    const startTime = performance.now();
    const operation = `countDocuments(${this.#name})`;

    logger.debug("MongoDB countDocuments operation starting", {
      collection: this.#name,
      filterKeys: getFilterKeys(filter),
    });
    logger.trace("MongoDB countDocuments filter", {
      filter: formatData(filter),
    });

    try {
      const countOptions: Record<string, unknown> = {};
      if (this.#session) countOptions.session = this.#session;

      const promise = this.#collection.countDocuments(filter, countOptions);
      const count = await withOptions(promise, options, operation);

      const duration = performance.now() - startTime;
      logger.debug("MongoDB countDocuments operation completed", {
        collection: this.#name,
        count,
        duration: `${duration.toFixed(2)}ms`,
      });
      logger.trace("MongoDB countDocuments result", {
        count,
      });

      return {
        type: "mongo:count",
        ok: true,
        count,
        duration,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      logger.error("MongoDB countDocuments operation failed", {
        collection: this.#name,
        duration: `${duration.toFixed(2)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      convertMongoError(error, this.#name);
    }
  }
}
