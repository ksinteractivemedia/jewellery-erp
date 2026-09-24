/**
 * The reporting module: one consistent framework (a registry of report definitions, one dispatcher,
 * one generic ERP screen) rather than ~30 bespoke report implementations. Every report is computed
 * by a backend aggregation pipeline — nothing here is ever a full collection dump handed to the
 * browser (the task's own instruction): on-screen results are paginated, and "download everything"
 * streams a CSV from the server instead.
 */
export const REPORT_CATEGORIES = ["SALES", "INVENTORY", "GOLD", "B2B", "PROFITABILITY"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_KEYS = [
  "sales-daily",
  "sales-monthly",
  "sales-b2b",
  "sales-b2c",
  "sales-by-category",
  "sales-by-product",
  "sales-by-salesperson",
  "sales-by-branch",
  "inventory-by-sku",
  "inventory-by-location",
  "inventory-by-metal",
  "inventory-by-purity",
  "inventory-value",
  "inventory-reserved",
  "inventory-dead-stock",
  "gold-purchased",
  "gold-issued",
  "gold-consumed",
  "gold-sold",
  "gold-returned",
  "gold-wastage",
  "gold-fine-balance",
  "b2b-customer-sales",
  "b2b-outstanding",
  "b2b-ageing",
  "b2b-credit-utilization",
  "b2b-po-pipeline",
  "profitability-summary",
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

/** Which of the shared filter controls a given report actually uses — the generic screen shows only these. */
export const REPORT_FILTER_KINDS = ["dateRange", "branch", "location", "customerType", "category", "groupBy"] as const;
export type ReportFilterKind = (typeof REPORT_FILTER_KINDS)[number];

export type ReportColumnFormat = "text" | "number" | "money" | "weight" | "percent" | "date";
export interface ReportColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: ReportColumnFormat;
}

/** Static metadata — what the registry serves, and what drives the ERP's one generic report screen. */
export interface ReportDefinition {
  key: ReportKey;
  category: ReportCategory;
  title: string;
  description: string;
  filters: ReportFilterKind[];
  columns: ReportColumn[];
  /** A point-in-time position (e.g. current stock) rather than a range of activity — the date-range filter is hidden and ignored. */
  snapshot?: boolean;
  /** Offered values for the groupBy filter, when this report supports one. */
  groupByOptions?: { value: string; label: string }[];
}

export interface ReportSummaryFigure {
  label: string;
  value: number;
  format?: ReportColumnFormat;
}

export interface ReportResult<Row = Record<string, unknown>> {
  key: ReportKey;
  title: string;
  columns: ReportColumn[];
  rows: Row[];
  summary: ReportSummaryFigure[];
  page: number;
  pageSize: number;
  /** Total matching rows — may exceed what's on this page; the browser never receives more than `pageSize` rows at once. */
  total: number;
  scope: { from?: string; to?: string; branchId?: string; locationId?: string; customerType?: string; categoryId?: string; groupBy?: string };
}
