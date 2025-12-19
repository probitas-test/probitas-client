import {
  assert,
  assertEquals,
  assertExists,
  assertGreaterOrEqual,
} from "@std/assert";
import { createMongoClient } from "./mod.ts";
import type { MongoClient } from "./types.ts";

const MONGODB_URL = Deno.env.get("MONGODB_URL") ?? "mongodb://localhost:27017";
const MONGODB_DATABASE = Deno.env.get("MONGODB_DATABASE") ?? "testdb";

async function isServiceAvailable(): Promise<boolean> {
  try {
    const client = await createMongoClient({
      url: MONGODB_URL,
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
      url: MONGODB_URL,
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
        url: MONGODB_URL,
        database: MONGODB_DATABASE,
      });
      assertExists(client);
    });

    const testCollection = `test_users_${Date.now()}`;

    await t.step("insertOne: inserts a document", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.insertOne({ name: "Alice", age: 30 });
      assert(result.ok);
      assertExists(result.insertedId);
    });

    await t.step("insertMany: inserts multiple documents", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.insertMany([
        { name: "Bob", age: 25 },
        { name: "Charlie", age: 35 },
        { name: "Diana", age: 28 },
      ]);
      assert(result.ok);
      assertExists(result.insertedIds);
      assertEquals(result.insertedCount, 3);
    });

    await t.step("find: retrieves all documents", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.find();
      assert(result.ok);
      assert(result.docs.length > 0);
      assertEquals(result.docs.length, 4);
    });

    await t.step("find: with filter", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.find({ age: { $gte: 30 } });
      assert(result.ok);
      assert(result.docs.length > 0);
      assertEquals(result.docs.length, 2);
      assert(result.docs.some((d) => d.name === "Alice"));
      assert(result.docs.some((d) => d.name === "Charlie"));
    });

    await t.step("find: with sort and limit", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.find({}, { sort: { age: 1 }, limit: 2 });
      assert(result.ok);
      assertEquals(result.docs.length, 2);
      assertEquals(result.docs[0]?.name, "Bob");
      assertEquals(result.docs.at(-1)?.name, "Diana");
    });

    await t.step("findOne: retrieves single document", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.findOne({ name: "Alice" });
      assert(result.ok);
      assertExists(result.doc);
      assertEquals(result.doc.name, "Alice");
      assertEquals(result.doc.age, 30);
    });

    await t.step("findOne: returns null when not found", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.findOne({ name: "NonExistent" });
      assert(result.ok);
      assertEquals(result.doc, null);
    });

    await t.step("updateOne: updates a document", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.updateOne(
        { name: "Alice" },
        { $set: { age: 31 } },
      );
      assert(result.ok);
      assertEquals(result.matchedCount, 1);
      assertEquals(result.modifiedCount, 1);
    });

    await t.step("updateOne: with upsert", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.updateOne(
        { name: "Eve" },
        { $set: { name: "Eve", age: 22 } },
        { upsert: true },
      );
      assert(result.ok);
      assertExists(result.upsertedId);
    });

    await t.step("updateMany: updates multiple documents", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.updateMany(
        { age: { $lt: 30 } },
        { $inc: { age: 1 } },
      );
      assert(result.ok);
      assertEquals(result.matchedCount, 3);
      assertEquals(result.modifiedCount, 3);
    });

    await t.step("countDocuments: counts documents", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.countDocuments();
      assert(result.ok);
      assertEquals(result.count, 5);
    });

    await t.step("countDocuments: with filter", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.countDocuments({ age: { $gte: 30 } });
      assert(result.ok);
      assertEquals(result.count, 2);
    });

    await t.step("aggregate: runs aggregation pipeline", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.aggregate<{ _id: null; avgAge: number }>([
        { $group: { _id: null, avgAge: { $avg: "$age" } } },
      ]);
      assert(result.ok);
      assert(result.docs.length > 0);
      assertEquals(result.docs.length, 1);
      assertExists(result.docs[0]?.avgAge);
    });

    await t.step("deleteOne: deletes a document", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.deleteOne({ name: "Eve" });
      assert(result.ok);
      assertEquals(result.deletedCount, 1);
    });

    await t.step("deleteMany: deletes multiple documents", async () => {
      const users = client.collection<User>(testCollection);
      const result = await users.deleteMany({ age: { $lt: 30 } });
      assert(result.ok);
      assertGreaterOrEqual(result.deletedCount, 1);
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
      url: MONGODB_URL,
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
      assert(result.ok);
      assertEquals(result.count, 2);
    });

    await t.step("cleanup", async () => {
      const users = client.collection<User>(testCollection);
      await users.deleteMany({});
      await client.close();
    });
  },
});
