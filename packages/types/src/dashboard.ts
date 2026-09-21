import type { Grams, Id, Paise } from "./common";
import type { LocationType } from "./location";
import type { MovementType } from "./transaction";

/**
 * The ERP dashboard's API contract. Every section is served by its own endpoint so it loads, fails and is
 * permissioned independently, and every section says honestly where its numbers came from:
 *
 *  - `OK` + `LIVE`          computed now from the database.
 *  - `OK` + `SAMPLE`        supplied by a development adapter (never present in production) — the UI must label it.
 *  - `NOT_CONNECTED`        the module that owns this data does not exist yet. Not an error, and never a zero.
 *
 * Money is integer paise, weight is grams, dates are ISO strings.
 */
export type DashboardProvenance = "LIVE" | "SAMPLE";

export interface DashboardScope {
  /** When the figures were computed. */
  asOf: string;
  /** The date range that was applied (YYYY-MM-DD, inclusive, business-day boundaries) — absent for point-in-time sections. */
  range?: { from: string; to: string };
  /** Which of the caller's filters this section actually applied, so the UI can say when a filter does not reach a section. */
  honours: { dateRange: boolean; branch: boolean; location: boolean };
}

export type DashboardSection<T> =
  | { status: "OK"; provenance: DashboardProvenance; scope: DashboardScope; data: T }
  | { status: "NOT_CONNECTED"; requires: string; explanation: string };

// ---- filters & reference data ----------------------------------------------------------------
export interface DashboardBranchOption {
  id: Id;
  name: string;
  code: string;
  locations: { id: Id; name: string; code: string; type: LocationType }[];
}
export interface DashboardMeta {
  /** Today's business day (YYYY-MM-DD) by the server's clock in the business timezone — the browser never guesses it. */
  today: string;
  branches: DashboardBranchOption[];
}

// ---- sales -----------------------------------------------------------------------------------
/** A figure for the selected range beside the same figure for the equally long period just before it (null when there is nothing to compare). */
export interface SalesKpi {
  value: number;
  previous: number | null;
}
export interface SalesSplitEntry {
  revenue: Paise;
  orders: number;
}
export interface SalesRankEntry {
  key: string;
  name: string;
  revenue: Paise;
  units: number;
}
export interface SalesData {
  /** Revenue = taxable value (before GST). */
  todayRevenue: Paise;
  revenue: SalesKpi;
  b2cRevenue: SalesKpi;
  b2bRevenue: SalesKpi;
  orders: SalesKpi;
  /** Cost-derived, so it is withheld (`restricted`) from callers without financial visibility — the server never sends it to them. */
  grossMargin: { restricted: true } | { restricted: false; value: Paise; previous: Paise | null; percentage: number | null };
  trend: { granularity: "day" | "week"; points: { date: string; b2c: Paise; b2b: Paise }[] };
  split: { b2c: SalesSplitEntry; b2b: SalesSplitEntry };
  topCategories: SalesRankEntry[];
  topProducts: SalesRankEntry[];
}

// ---- B2B -------------------------------------------------------------------------------------
export interface B2BData {
  pendingPurchaseOrders: { count: number; value: Paise };
  pendingQuotations: { count: number; value: Paise };
  /** Unpaid balance across B2B invoices. */
  outstanding: Paise;
  overdue: { amount: Paise; invoices: number; customers: number };
  creditUtilization: { used: Paise; limit: Paise; percentage: number | null };
}

// ---- inventory -------------------------------------------------------------------------------
export interface StockBreakdownRow {
  key: string;
  label: string;
  sublabel?: string;
  pieces: number;
  netWeight: Grams;
  fineWeight: Grams;
  cost: Paise;
  availablePieces: number;
}
export interface InventoryDashboard {
  /** Metals with stock in scope (owned stock: everything except SOLD and MELTING). The UI picks Gold / Silver by code. */
  metals: (StockBreakdownRow & { code: string })[];
  /** Sellable now: finished jewellery, AVAILABLE, not reserved. */
  availablePieces: number;
  reserved: { pieces: number; fineWeight: Grams };
  /** Book cost of owned stock, and — where a metal rate is on file — the indicative metal value at today's rate. */
  stockValue: { cost: Paise; metalValue: Paise | null; metalValueMissingFor: string[] };
  byLocation: StockBreakdownRow[];
  byMetal: StockBreakdownRow[];
  byPurity: StockBreakdownRow[];
}

// ---- operations ------------------------------------------------------------------------------
export interface QueueRow {
  itemId: Id;
  itemCode: string;
  productName?: string;
  /** Where the piece is (the job worker, hallmarking centre or repair centre). */
  location: string;
  since: string;
  days: number;
}
export interface OperationsQueue {
  pieces: number;
  /** Pieces that have been there longer than the attention threshold. */
  overdue: number;
  /** Longest-waiting first. */
  oldest: QueueRow[];
}
export interface TransferQueueRow {
  id: Id;
  transferNo: string;
  from: string;
  to: string;
  pieces: number;
  dispatchedAt: string;
  days: number;
}
export interface OperationsDashboard {
  jobWork: OperationsQueue;
  hallmarking: OperationsQueue;
  repairs: OperationsQueue;
  transfers: { inTransit: number; pieces: number; overdue: number; oldest: TransferQueueRow[] };
  /** The "needs attention" cut-offs used above, so the screen can state them. */
  thresholds: { transitDays: number; partnerDays: number };
}

export type DashboardAlertSeverity = "critical" | "warning" | "info";
export interface DashboardAlert {
  id: string;
  severity: DashboardAlertSeverity;
  title: string;
  detail: string;
  count: number;
  /** ERP path that resolves it. */
  href: string;
}

export interface ActivityRow {
  id: Id;
  at: string;
  movementType: MovementType;
  itemId: Id;
  itemCode: string;
  productName?: string;
  actor: string;
  from?: string;
  to?: string;
}
export interface ActivityData {
  rows: ActivityRow[];
  /** Movements in the selected range and scope (the list shows the latest few). */
  total: number;
}
