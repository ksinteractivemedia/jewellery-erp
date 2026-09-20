import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { ALL_ROLE_NAMES } from "@jewellery/types";
import { loadConfig } from "../src/config/app-config";
import { createApp } from "../src/http/app";
import { seedCatalog } from "../seed/catalog.seed";
import { seedInventory } from "../seed/inventory.seed";
import { createMediaService } from "../src/modules/media/media.service";
import { createMemoryStorage } from "../src/modules/media/storage";
import { ConsoleEmailSender } from "../src/modules/auth/email";
import { syncRbac } from "../src/modules/auth/rbac/rbac-sync";
import { RoleModel } from "../src/modules/auth/role.model";
import { createUser } from "../src/modules/auth/user.service";

/**
 * DEVELOPMENT ONLY. Boots the API against a throwaway in-memory MongoDB replica set and seeds
 * one demo user per role, so the ERP login/guards can be exercised without installing MongoDB.
 * Demo credentials below are public and worthless outside this process — refuses to run in production.
 */
if (process.env.NODE_ENV === "production") throw new Error("dev-memory must never run in production");

const PASSWORD = "Demo-Password-123";
const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await mongoose.connect(replSet.getUri(), { dbName: "jewellery-erp-dev" });
await syncRbac();

const demoUserIds = new Map<string, string>();
for (const name of ALL_ROLE_NAMES) {
  const role = await RoleModel.findOne({ name });
  const email = `${name.toLowerCase().replace(/_/g, ".")}@demo.test`;
  const user = await createUser({ email, name: name.replace(/_/g, " "), password: PASSWORD, userType: "STAFF", roleIds: [String(role!._id)] }, 4);
  demoUserIds.set(name, user.id);
}

const config = loadConfig({
  NODE_ENV: "development",
  JWT_ACCESS_SECRET: "dev-only-secret-dev-only-secret-dev-only!!",
  ALLOWED_ORIGINS: "http://localhost:3000",
  BCRYPT_ROUNDS: "4",
  RATE_LIMIT_ENABLED: "false",
  PORT: process.env.PORT ?? "4000",
});
// Media lives in memory too, so the throwaway database and its images disappear together.
const mediaStorage = createMemoryStorage();
const seeded = await seedCatalog(createMediaService(mediaStorage, config.media.publicBaseUrl));
console.log(`[dev-memory] seeded catalogue: ${seeded.products} products, ${seeded.variants} variants, ${seeded.categories} categories, ${seeded.collections} collections, ${seeded.images} images`);

const stock = await seedInventory({
  inventoryManager: demoUserIds.get("INVENTORY_MANAGER")!,
  storeManager: demoUserIds.get("STORE_MANAGER")!,
  warehouseManager: demoUserIds.get("WAREHOUSE_MANAGER"),
});
console.log(`[dev-memory] seeded inventory: ${stock.pieces} pieces across ${stock.locations} locations, with sales, returns, hallmarking, job work, transfers and adjustments`);

createApp({ config, emailSender: new ConsoleEmailSender(), mediaStorage }).listen(config.port, () => {
  console.log(`[dev-memory] API on :${config.port} — demo users (password "${PASSWORD}"):`);
  for (const name of ALL_ROLE_NAMES) console.log(`  ${name.toLowerCase().replace(/_/g, ".")}@demo.test  (${name})`);
});
