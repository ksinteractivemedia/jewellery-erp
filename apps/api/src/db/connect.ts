import mongoose from "mongoose";

/**
 * Connects to MongoDB. Requires a replica set (even a single-node one in dev) —
 * the inventory transaction service relies on multi-document sessions
 * (architecture.md §6, §9 risk #1). Not used by tests — see apps/api/test/setup.ts.
 */
export async function connectDb(uri: string, dbName: string) {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { dbName });
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
