import type { CommonOptions } from "@probitas/client";

/**
 * MongoDB document type
 */
// deno-lint-ignore no-explicit-any
export type Document<T = any> = Record<string, T>;

/**
 * MongoDB filter type (simplified for compatibility with mongodb driver)
 * Allows query operators like $gte, $lt, $in, etc.
 */
// deno-lint-ignore no-explicit-any
export type Filter = Record<string, any>;

/**
 * MongoDB update filter type (simplified for compatibility with mongodb driver)
 * Allows update operators like $set, $inc, $unset, etc.
 */
// deno-lint-ignore no-explicit-any
export type UpdateFilter = Record<string, any>;

/**
 * Document array with first/last methods
 */
export interface MongoDocs<T> extends ReadonlyArray<T> {
  first(): T | undefined;
  firstOrThrow(): T;
  last(): T | undefined;
  lastOrThrow(): T;
}

/**
 * Query result (find, aggregate)
 */
export interface MongoFindResult<T = Document> {
  readonly type: "mongo:find";
  readonly ok: boolean;
  readonly docs: MongoDocs<T>;
  readonly duration: number;
}

/**
 * Insert one result
 */
export interface MongoInsertOneResult {
  readonly type: "mongo:insert";
  readonly ok: boolean;
  readonly insertedId: string;
  readonly duration: number;
}

/**
 * Insert many result
 */
export interface MongoInsertManyResult {
  readonly type: "mongo:insert";
  readonly ok: boolean;
  readonly insertedIds: readonly string[];
  readonly insertedCount: number;
  readonly duration: number;
}

/**
 * Update result
 */
export interface MongoUpdateResult {
  readonly type: "mongo:update";
  readonly ok: boolean;
  readonly matchedCount: number;
  readonly modifiedCount: number;
  readonly upsertedId?: string;
  readonly duration: number;
}

/**
 * Delete result
 */
export interface MongoDeleteResult {
  readonly type: "mongo:delete";
  readonly ok: boolean;
  readonly deletedCount: number;
  readonly duration: number;
}

/**
 * FindOne result
 */
export interface MongoFindOneResult<T = Document> {
  readonly type: "mongo:find-one";
  readonly ok: boolean;
  readonly doc: T | undefined;
  readonly duration: number;
}

/**
 * Count result
 */
export interface MongoCountResult {
  readonly type: "mongo:count";
  readonly ok: boolean;
  readonly count: number;
  readonly duration: number;
}

/**
 * MongoDB find options
 */
export interface MongoFindOptions extends CommonOptions {
  readonly sort?: Record<string, 1 | -1>;
  readonly limit?: number;
  readonly skip?: number;
  readonly projection?: Record<string, 0 | 1>;
}

/**
 * MongoDB update options
 */
export interface MongoUpdateOptions extends CommonOptions {
  readonly upsert?: boolean;
}

/**
 * MongoDB client configuration
 */
export interface MongoClientConfig extends CommonOptions {
  readonly uri: string;
  readonly database: string;
}

/**
 * MongoDB session interface (for transactions)
 */
export interface MongoSession {
  collection<T extends Document = Document>(name: string): MongoCollection<T>;
}

/**
 * MongoDB collection interface
 */
export interface MongoCollection<T extends Document> {
  find(
    filter?: Filter,
    options?: MongoFindOptions,
  ): Promise<MongoFindResult<T>>;
  findOne(
    filter: Filter,
    options?: CommonOptions,
  ): Promise<MongoFindOneResult<T>>;
  insertOne(
    doc: Omit<T, "_id">,
    options?: CommonOptions,
  ): Promise<MongoInsertOneResult>;
  insertMany(
    docs: Omit<T, "_id">[],
    options?: CommonOptions,
  ): Promise<MongoInsertManyResult>;
  updateOne(
    filter: Filter,
    update: UpdateFilter,
    options?: MongoUpdateOptions,
  ): Promise<MongoUpdateResult>;
  updateMany(
    filter: Filter,
    update: UpdateFilter,
    options?: MongoUpdateOptions,
  ): Promise<MongoUpdateResult>;
  deleteOne(
    filter: Filter,
    options?: CommonOptions,
  ): Promise<MongoDeleteResult>;
  deleteMany(
    filter: Filter,
    options?: CommonOptions,
  ): Promise<MongoDeleteResult>;
  aggregate<R = T>(
    pipeline: Document[],
    options?: CommonOptions,
  ): Promise<MongoFindResult<R>>;
  countDocuments(
    filter?: Filter,
    options?: CommonOptions,
  ): Promise<MongoCountResult>;
}

/**
 * MongoDB client interface
 */
export interface MongoClient extends AsyncDisposable {
  readonly config: MongoClientConfig;

  collection<T extends Document = Document>(name: string): MongoCollection<T>;
  db(name: string): MongoClient;
  transaction<T>(fn: (session: MongoSession) => Promise<T>): Promise<T>;

  close(): Promise<void>;
}
