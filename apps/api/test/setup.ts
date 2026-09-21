import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll } from "vitest";

// bcrypt at production cost (12) makes a suite that creates dozens of users crawl; 4 is the minimum.
process.env.BCRYPT_ROUNDS = "4";

/**
 * One in-memory MongoDB replica set for the whole test run — a real replica set
 * (not a standalone) because the inventory transaction service uses multi-document
 * sessions (architecture.md §6), which standalone `mongodb-memory-server` can't run.
 */
let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  // Cap WiredTiger's cache: by default it is sized from total RAM, and a fresh mongod per test file on a busy
  // laptop can balloon, swap, and stall a request long enough to time a test out (a hang in a random place).
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 }, instanceOpts: [{ args: ["--wiredTigerCacheSizeGB", "0.25"] }] });
  const uri = replSet.getUri();
  await mongoose.connect(uri, { dbName: "jewellery-erp-test" });
  // Unique indexes are built asynchronously after connect. Without this wait, the first test in a
  // file can run before (say) the users.email index exists and see a duplicate "succeed".
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});
