import { z } from "zod";
import { loadConfig } from "./config/app-config";
import { connectDb } from "./db/connect";
import { createApp } from "./http/app";
import { ConsoleEmailSender, UnconfiguredEmailSender } from "./modules/auth/email";
import { syncRbac } from "./modules/auth/rbac/rbac-sync";

const dbEnv = z.object({ MONGODB_URI: z.string().min(1), MONGODB_DB: z.string().default("jewellery-erp") }).parse(process.env);
const config = loadConfig();

await connectDb(dbEnv.MONGODB_URI, dbEnv.MONGODB_DB);
const synced = await syncRbac();
console.log(`[api] rbac synced: ${synced.permissions} permissions, ${synced.roles} system roles`);

const emailSender = config.env === "production" ? new UnconfiguredEmailSender() : new ConsoleEmailSender();
createApp({ config, emailSender }).listen(config.port, () => console.log(`[api] listening on :${config.port} (${config.env})`));
