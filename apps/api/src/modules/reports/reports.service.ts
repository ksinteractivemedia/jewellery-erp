import type { ReportKey, ReportResult } from "@jewellery/types";
import type { ReportQueryInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { reportDefinition } from "./report-registry";
import { resolveReportContext, type ReportContext } from "./report-filters";
import * as sales from "./sales-reports.service";
import * as inventory from "./inventory-reports.service";
import * as gold from "./gold-reports.service";
import * as b2b from "./b2b-reports.service";
import { profitabilitySummary } from "./profitability-reports.service";

type ReportFn = (ctx: ReportContext) => Promise<ReportResult>;

/** The dispatch table — the only place a report key is wired to the function that computes it. */
const RUNNERS: Record<ReportKey, ReportFn> = {
  "sales-daily": sales.salesDaily,
  "sales-monthly": sales.salesMonthly,
  "sales-b2c": sales.salesB2c,
  "sales-b2b": sales.salesB2b,
  "sales-by-category": sales.salesByCategory,
  "sales-by-product": sales.salesByProduct,
  "sales-by-salesperson": sales.salesBySalesperson,
  "sales-by-branch": sales.salesByBranch,

  "inventory-by-sku": inventory.inventoryBySku,
  "inventory-by-location": inventory.inventoryByLocation,
  "inventory-by-metal": inventory.inventoryByMetal,
  "inventory-by-purity": inventory.inventoryByPurity,
  "inventory-value": inventory.inventoryValue,
  "inventory-reserved": inventory.inventoryReserved,
  "inventory-dead-stock": inventory.inventoryDeadStock,

  "gold-purchased": gold.goldPurchased,
  "gold-issued": gold.goldIssued,
  "gold-consumed": gold.goldConsumed,
  "gold-sold": gold.goldSold,
  "gold-returned": gold.goldReturned,
  "gold-wastage": gold.goldWastage,
  "gold-fine-balance": gold.goldFineBalance,

  "b2b-customer-sales": b2b.b2bCustomerSales,
  "b2b-outstanding": b2b.b2bOutstanding,
  "b2b-ageing": b2b.b2bAgeing,
  "b2b-credit-utilization": b2b.b2bCreditUtilization,
  "b2b-po-pipeline": b2b.b2bPoPipeline,

  "profitability-summary": profitabilitySummary,
};

/** Every report call goes through here: resolve the shared context once, run the report's own function, then stamp the registry's own key/title/columns onto whatever it returns — so a report function never has to know its own display metadata. */
export async function runReport(key: string, query: ReportQueryInput, now: Date = new Date()): Promise<ReportResult> {
  const def = reportDefinition(key);
  if (!def) throw new NotFoundError("Report", key);
  const ctx = await resolveReportContext(query, now);
  const raw = await RUNNERS[def.key](ctx);
  return { ...raw, key: def.key, title: def.title, columns: def.columns };
}

/** Export ignores on-screen pagination and returns up to a large, still-bounded number of rows — a real cap, not silent truncation, and never the whole collection streamed unbounded (the reporting module's own aggregations already keep this small: a report is grouped/aggregated, or is itself the point-in-time position). */
export const EXPORT_MAX_ROWS = 10_000;
export async function runReportForExport(key: string, query: ReportQueryInput, now: Date = new Date()): Promise<ReportResult> {
  return runReport(key, { ...query, page: 1, pageSize: EXPORT_MAX_ROWS }, now);
}
