import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { ALL_ROLE_NAMES } from "@jewellery/types";
import { loadConfig } from "../src/config/app-config";
import { createApp } from "../src/http/app";
import { seedCatalog } from "../seed/catalog.seed";
import { seedInventory } from "../seed/inventory.seed";
import { seedPricingRules } from "../seed/pricing.seed";
import { seedStorefront } from "../seed/storefront.seed";
import { createSampleDashboardProviders } from "../dev-adapters/dashboard-sample";
import { createSandboxProvider, startSandboxPaymentPage } from "../dev-adapters/payment-sandbox";
import { startOrderExpirySweep, type OrdersModule } from "../src/modules/orders";
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
  ALLOWED_ORIGINS: "http://localhost:3000,http://localhost:3001",
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

const pricing = await seedPricingRules();
console.log(`[dev-memory] seeded pricing: ${pricing.rules} rules (retail/wholesale gold defaults, studded 18K, silver, a festive making-charge offer)`);

const storefront = await seedStorefront();
console.log(`[dev-memory] seeded storefront: GST rule, sample content and curation, stones on ${storefront.stoneDesigns} designs (one with no stone value, so "price on request" shows)`);

// Orders, invoicing and credit do not exist yet, so the dashboard's Sales and B2B sections would say "not connected".
// In dev only, a sample adapter feeds them — labelled SAMPLE on screen. Production registers no providers.
const dashboardProviders = await createSampleDashboardProviders();
console.log("[dev-memory] dashboard: Sales and B2B sections are fed by the SAMPLE development adapter (apps/api/dev-adapters)");

// Payments: a sandbox gateway with its own hosted payment page, so checkout can be walked end to end. It moves no money.
const SANDBOX_PAY_PORT = 4100;
const sandbox = createSandboxProvider({ payPageBaseUrl: `http://localhost:${SANDBOX_PAY_PORT}` });
startSandboxPaymentPage(sandbox, { port: SANDBOX_PAY_PORT, webhookUrl: `http://localhost:${config.port}/api/store/payments/webhooks/sandbox` });
console.log(`[dev-memory] payments: SANDBOX gateway (hosted page on :${SANDBOX_PAY_PORT}) — no money moves`);

const app = createApp({ config, emailSender: new ConsoleEmailSender(), mediaStorage, dashboardProviders, paymentProviders: [sandbox] });
startOrderExpirySweep((app.locals.orders as OrdersModule).orders, 15_000);
app.listen(config.port, () => {
  console.log(`[dev-memory] API on :${config.port} — demo users (password "${PASSWORD}"):`);
  for (const name of ALL_ROLE_NAMES) console.log(`  ${name.toLowerCase().replace(/_/g, ".")}@demo.test  (${name})`);
});
