import { assertEquals, assertExists } from "@std/assert";
import {
  createMongoClient,
  expectMongoCountResult,
  expectMongoDeleteResult,
  expectMongoFindOneResult,
  expectMongoFindResult,
  expectMongoInsertResult,
  expectMongoUpdateResult,
} from "./mod.ts";
import type { MongoClient } from "./types.ts";

const MONGODB_URI = Deno.env.get("MONGODB_URI") ?? "mongodb://localhost:27017";
const MONGODB_DATABASE = Deno.env.get("MONGODB_DATABASE") ?? "testdb";

async function isServiceAvailable(): Promise<boolean> {
  try {
    const client = await createMongoClient({
      uri: MONGODB_URI,
      database: MONGODB_DATABASE,
      timeout: 2000,
    });
    await client.close();
    return true;
  } catch {
    return false;
  }
}

async function isReplicaSet(): Promise<boolean> {
  try {
    const client = await createMongoClient({
      uri: MONGODB_URI,
      database: MONGODB_DATABASE,
      timeout: 2000,
    });
    // Try to start a transaction with actual operation - only works on replica set
    const testCol = `_tx_test_${Date.now()}`;
    try {
      await client.transaction(async (session) => {
        const col = session.collection(testCol);
        await col.insertOne({ test: true });
      });
      // Clean up
      await client.collection(testCol).deleteMany({});
      await client.close();
      return true;
    } catch {
      await client.close();
      return false;
    }
  } catch {
    return false;
  }
}

interface User {
  _id?: string;
  name: string;
  age: number;
  email?: string;
}

Deno.test({
  name: "Integration: MongoDB Client",
  ignore: !(await isServiceAvailable()),
  async fn(t) {
    let client: MongoClient;

    await t.step("setup: create client", async () => {
      client = await createMongoClient({
        uri: MONGODB_URI,
        database: MONGODB_DATABASE,
      });
      assertExists(client);
    });

    const testCollection = `test_users_${Date.now()}`;

    await t.step("insertOne: inserts a document", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.insertOne({ name: "Alice", age: 30 });
      expectMongoInsertResult(result)
        .ok()
        .hasInsertedId()
        .insertedCount(1);
    });

    await t.step("insertMany: inserts multiple documents", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.insertMany([
        { name: "Bob", age: 25 },
        { name: "Charlie", age: 35 },
        { name: "Diana", age: 28 },
      ]);
      expectMongoInsertResult(result)
        .ok()
        .hasInsertedId()
        .insertedCount(3);
    });

    await t.step("find: retrieves all documents", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.find();
      expectMongoFindResult(result)
        .ok()
        .hasContent()
        .docs(4);
    });

    await t.step("find: with filter", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.find({ age: { $gte: 30 } });
      expectMongoFindResult(result)
        .ok()
        .hasContent()
        .docs(2)
        .docContains({ name: "Alice" })
        .docContains({ name: "Charlie" });
    });

    await t.step("find: with sort and limit", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.find({}, { sort: { age: 1 }, limit: 2 });
      expectMongoFindResult(result)
        .ok()
        .docs(2);
      assertEquals(result.docs.first()?.name, "Bob");
      assertEquals(result.docs.last()?.name, "Diana");
    });

    await t.step("findOne: retrieves single document", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.findOne({ name: "Alice" });
      expectMongoFindOneResult(result).ok().found();
      assertExists(result.doc);
      assertEquals(result.doc.name, "Alice");
      assertEquals(result.doc.age, 30);
    });

    await t.step("findOne: returns undefined when not found", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.findOne({ name: "NonExistent" });
      expectMongoFindOneResult(result).ok().notFound();
    });

    await t.step("updateOne: updates a document", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.updateOne(
        { name: "Alice" },
        { $set: { age: 31 } },
      );
      expectMongoUpdateResult(result)
        .ok()
        .matchedCount(1)
        .modifiedCount(1);
    });

    await t.step("updateOne: with upsert", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.updateOne(
        { name: "Eve" },
        { $set: { name: "Eve", age: 22 } },
        { upsert: true },
      );
      expectMongoUpdateResult(result)
        .ok()
        .wasUpserted();
    });

    await t.step("updateMany: updates multiple documents", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.updateMany(
        { age: { $lt: 30 } },
        { $inc: { age: 1 } },
      );
      expectMongoUpdateResult(result)
        .ok()
        .matchedCount(3)
        .modifiedCount(3);
    });

    await t.step("countDocuments: counts documents", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.countDocuments();
      expectMongoCountResult(result).ok().count(5);
    });

    await t.step("countDocuments: with filter", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.countDocuments({ age: { $gte: 30 } });
      expectMongoCountResult(result).ok().count(2);
    });

    await t.step("aggregate: runs aggregation pipeline", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.aggregate<{ _id: null; avgAge: number }>([
        { $group: { _id: null, avgAge: { $avg: "$age" } } },
      ]);
      expectMongoFindResult(result)
        .ok()
        .hasContent()
        .docs(1);
      assertExists(result.docs.first()?.avgAge);
    });

    await t.step("deleteOne: deletes a document", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.deleteOne({ name: "Eve" });
      expectMongoDeleteResult(result)
        .ok()
        .deletedCount(1);
    });

    await t.step("deleteMany: deletes multiple documents", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.deleteMany({ age: { $lt: 30 } });
      expectMongoDeleteResult(result)
        .ok()
        .deletedAtLeast(1);
    });

    await t.step("db: switches database", () => {
      const otherDb = client.db("other_db");
      assertExists(otherDb);
      assertEquals(otherDb.config.database, "other_db");
    });

    await t.step("cleanup: delete test collection and close", async () => {
      const users = client.collection<User>(testCollection);
      await users.deleteMany({});
      await client.close();
    });
  },
});

Deno.test({
  name: "Integration: MongoDB Transaction",
  ignore: !(await isReplicaSet()),
  async fn(t) {
    const client = await createMongoClient({
      uri: MONGODB_URI,
      database: MONGODB_DATABASE,
    });

    const testCollection = `test_tx_${Date.now()}`;

    await t.step("transaction: executes operations atomically", async () => {
      await client.transaction(async (session) => {
        const users = session.collection<User>(testCollection);
        await users.insertOne({ name: "TxUser1", age: 25 });
        await users.insertOne({ name: "TxUser2", age: 30 });
      });

      const users = client.collection<User>(testCollection);
      const result = await users.countDocuments();
      expectMongoCountResult(result).ok().count(2);
    });

    await t.step("cleanup", async () => {
      const users = client.collection<User>(testCollection);
      await users.deleteMany({});
      await client.close();
    });
  },
});

Deno.test({
  name: "Integration: MongoDB MongoDocs methods",
  ignore: !(await isServiceAvailable()),
  async fn(t) {
    const client = await createMongoClient({
      uri: MONGODB_URI,
      database: MONGODB_DATABASE,
    });

    const testCollection = `test_docs_${Date.now()}`;

    await t.step("setup", async () => {
      const users = client.collection<User>(testCollection);
      await users.insertMany([
        { name: "First", age: 20 },
        { name: "Middle", age: 25 },
        { name: "Last", age: 30 },
      ]);
    });

    await t.step("first() returns first document", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.find({}, { sort: { age: 1 } });
      assertEquals(result.docs.first()?.name, "First");
    });

    await t.step("last() returns last document", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.find({}, { sort: { age: 1 } });
      assertEquals(result.docs.last()?.name, "Last");
    });

    await t.step("firstOrThrow() returns first document", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.find({}, { sort: { age: 1 } });
      assertEquals(result.docs.firstOrThrow().name, "First");
    });

    await t.step("lastOrThrow() returns last document", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.find({}, { sort: { age: 1 } });
      assertEquals(result.docs.lastOrThrow().name, "Last");
    });

    await t.step("cleanup", async () => {
      const users = client.collection<User>(testCollection);
      await users.deleteMany({});
      await client.close();
    });
  },
});
