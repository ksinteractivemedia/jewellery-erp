import http from "node:http";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll } from "vitest";

/**
 * supertest starts a server per request with `app.listen(0)` — which binds the WILDCARD address, dual-stack — and then connects to
 * 127.0.0.1. On macOS a wildcard bind does not conflict with another process already listening on 127.0.0.1:<the same port> (an
 * IDE helper, a dev server …), so the kernel can hand out such a port and the request is then answered by that OTHER process: a
 * stray 401/404/400 carrying someone else's body. That is the long-unexplained "intermittent 401 where a 403 was expected"
 * failure — it never reproduced in isolation because it needs a port collision. Our servers listen on `::` too, and nothing else
 * listens on IPv6 loopback, so test HTTP requests go to `[::1]` instead of `127.0.0.1` (MongoDB, which speaks its own protocol
 * over `net`, is untouched).
 */
const nativeRequest = http.request;
http.request = function patched(this: unknown, ...args: unknown[]) {
  const first = args[0] as { host?: string; hostname?: string } | string | URL | undefined;
  if (first && typeof first === "object" && !(first instanceof URL) && (first.hostname === "127.0.0.1" || first.host === "127.0.0.1")) {
    args[0] = { ...first, host: "::1", hostname: "::1" };
  }
  return (nativeRequest as (...a: unknown[]) => http.ClientRequest).apply(this, args);
} as typeof http.request;

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
