import { z } from "zod";
import { loadConfig } from "./config/app-config";
import { connectDb } from "./db/connect";
import { createApp } from "./http/app";
import { ConsoleEmailSender, UnconfiguredEmailSender } from "./modules/auth/email";
import { syncRbac } from "./modules/auth/rbac/rbac-sync";
import { syncChartOfAccounts } from "./modules/accounting/chart-of-accounts.service";
import type { B2BModule } from "./modules/b2b";
import { startOrderExpirySweep, type OrdersModule } from "./modules/orders";
import { reconcileAll, releaseExpiredReservations } from "./modules/inventory";

const dbEnv = z.object({ MONGODB_URI: z.string().min(1), MONGODB_DB: z.string().default("jewellery-erp") }).parse(process.env);
const config = loadConfig();

await connectDb(dbEnv.MONGODB_URI, dbEnv.MONGODB_DB);
const synced = await syncRbac();
console.log(`[api] rbac synced: ${synced.permissions} permissions, ${synced.roles} system roles`);
const coa = await syncChartOfAccounts();
console.log(`[api] chart of accounts synced: ${coa.created} account(s) created`);

const emailSender = config.env === "production" ? new UnconfiguredEmailSender() : new ConsoleEmailSender();
const app = createApp({ config, emailSender });
startOrderExpirySweep((app.locals.orders as OrdersModule).orders);
// Quotations whose validity has run out become EXPIRED (and so does the PO waiting on them) even if nobody is looking.
setInterval(() => (app.locals.b2b as B2BModule).procurement.expireStale().catch((e) => console.error("[b2b] quotation expiry sweep failed", e)), 60_000).unref();
// Reservations an abandoned checkout left behind go back on the shelf — same cadence as the sweeps above, idempotent.
setInterval(() => releaseExpiredReservations().catch((e) => console.error("[inventory] reservation expiry sweep failed", e)), 60_000).unref();
// Ledger/cache integrity check (architecture.md risk #3) — a full catalogue scan, so it runs far less often than the time-sensitive sweeps above.
setInterval(
  () =>
    reconcileAll()
      .then(({ checked, mismatches }) => {
        if (mismatches.length) console.error(`[inventory] reconciliation found ${mismatches.length}/${checked} item(s) out of sync`, mismatches);
      })
      .catch((e) => console.error("[inventory] reconciliation sweep failed", e)),
  15 * 60_000
).unref();
app.listen(config.port, () => console.log(`[api] listening on :${config.port} (${config.env})`));
