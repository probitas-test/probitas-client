/**
 * MongoDB client for [Probitas](https://github.com/probitas-test/probitas) scenario testing framework.
 *
 * This package provides a MongoDB client designed for integration testing of applications using MongoDB.
 *
 * ## Features
 *
 * - **CRUD Operations**: find, findOne, insertOne, insertMany, updateOne, updateMany, deleteOne, deleteMany
 * - **Aggregations**: Full aggregation pipeline support
 * - **Sessions**: Transaction support with sessions
 * - **Type Safety**: Generic type parameters for document types
 * - **Resource Management**: Implements `AsyncDisposable` for proper cleanup
 *
 * ## Installation
 *
 * ```bash
 * deno add jsr:@probitas/client-mongodb
 * ```
 *
 * ## Quick Start
 *
 * ```ts
 * import { createMongoClient } from "@probitas/client-mongodb";
 *
 * const client = await createMongoClient({
 *   url: "mongodb://localhost:27017",
 *   database: "testdb",
 * });
 *
 * // Get a collection
 * const users = client.collection<{ name: string; email: string }>("users");
 *
 * // Insert a document
 * const insertResult = await users.insertOne({ name: "Alice", email: "alice@example.com" });
 * if (insertResult.ok) {
 *   console.log("Inserted ID:", insertResult.insertedId);
 * } else {
 *   console.error("Insert failed:", insertResult.error.message);
 * }
 *
 * // Find documents
 * const findResult = await users.find({ name: "Alice" });
 * if (findResult.ok) {
 *   console.log("Found:", findResult.docs);
 * }
 *
 * // Find one document
 * const user = await users.findOne({ name: "Alice" });
 * if (user.ok) {
 *   console.log("User:", user.doc);
 * }
 *
 * await client.close();
 * ```
 *
 * ## Transactions
 *
 * ```ts
 * import { createMongoClient, type MongoSession } from "@probitas/client-mongodb";
 *
 * const client = await createMongoClient({
 *   url: "mongodb://localhost:27017",
 *   database: "testdb",
 * });
 *
 * await client.transaction(async (session: MongoSession) => {
 *   const accounts = client.collection("accounts");
 *   await accounts.updateOne(
 *     { _id: "from" },
 *     { $inc: { balance: -100 } },
 *   );
 *   await accounts.updateOne(
 *     { _id: "to" },
 *     { $inc: { balance: 100 } },
 *   );
 * });
 *
 * await client.close();
 * ```
 *
 * ## Using with `using` Statement
 *
 * ```ts
 * import { createMongoClient } from "@probitas/client-mongodb";
 *
 * await using client = await createMongoClient({
 *   url: "mongodb://localhost:27017",
 *   database: "testdb",
 * });
 *
 * const result = await client.collection("test").findOne({});
 * console.log(result?.doc);
 * // Client automatically closed when block exits
 * ```
 *
 * ## Related Packages
 *
 * | Package | Description |
 * |---------|-------------|
 * | [`@probitas/client`](https://jsr.io/@probitas/client) | Core utilities and types |
 *
 * ## Links
 *
 * - [GitHub Repository](https://github.com/probitas-test/probitas-client)
 * - [Probitas Framework](https://github.com/probitas-test/probitas)
 * - [MongoDB](https://www.mongodb.com/)
 *
 * @module
 */

export type * from "./types.ts";
export * from "./errors.ts";
export type * from "./result.ts";
export * from "./client.ts";
