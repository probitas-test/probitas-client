import type { CommonConnectionConfig, CommonOptions } from "@probitas/client";
import type {
  MongoCountResult,
  MongoDeleteResult,
  MongoFindOneResult,
  MongoFindResult,
  MongoInsertManyResult,
  MongoInsertOneResult,
  MongoResult,
  MongoUpdateResult,
} from "./results.ts";

export type {
  MongoCountResult,
  MongoDeleteResult,
  MongoFindOneResult,
  MongoFindResult,
  MongoInsertManyResult,
  MongoInsertOneResult,
  MongoResult,
  MongoUpdateResult,
};

/**
 * MongoDB connection configuration.
 *
 * Extends CommonConnectionConfig with MongoDB-specific options.
 */
export interface MongoConnectionConfig extends CommonConnectionConfig {
  /**
   * Database name to connect to.
   */
  readonly database?: string;

  /**
   * Authentication database.
   */
  readonly authSource?: string;

  /**
   * Replica set name.
   */
  readonly replicaSet?: string;
}

/**
 * MongoDB document type
 */
// deno-lint-ignore no-explicit-any
export type Document<T = any> = Record<string, T>;

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
 * MongoDB client configuration.
 *
 * @example Using a connection string
 * ```ts
 * const config: MongoClientConfig = {
 *   url: "mongodb://localhost:27017",
 *   database: "testdb",
 * };
 * ```
 *
 * @example Using a configuration object
 * ```ts
 * const config: MongoClientConfig = {
 *   url: {
 *     host: "localhost",
 *     port: 27017,
 *     username: "admin",
 *     password: "secret",
 *     authSource: "admin",
 *   },
 *   database: "testdb",
 * };
 * ```
 */
export interface MongoClientConfig extends CommonOptions {
  /**
   * MongoDB connection URL or configuration object.
   */
  readonly url: string | MongoConnectionConfig;

  /**
   * Database name to connect to.
   */
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
