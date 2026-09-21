import type { B2BData, DashboardProvenance, SalesData } from "@jewellery/types";
import type { ResolvedRange } from "./range";

/**
 * What the dashboard needs from the modules that will own sales and B2B data. Neither exists yet, so in
 * production no provider is registered and those sections report NOT_CONNECTED — never a made-up figure.
 * When the Orders module arrives it supplies a provider (facts → the aggregators below); a development
 * adapter under apps/api/dev-adapters supplies SAMPLE facts through the very same path.
 */
export interface DashboardContext {
  range: ResolvedRange;
  now: Date;
  branchId?: string;
  locationId?: string;
}

export interface Honours {
  dateRange: boolean;
  branch: boolean;
  location: boolean;
}

export interface SalesProvider {
  provenance: DashboardProvenance;
  honours: Honours;
  load(ctx: DashboardContext): Promise<SalesData>;
}
export interface B2BProvider {
  provenance: DashboardProvenance;
  honours: Honours;
  load(ctx: DashboardContext): Promise<B2BData>;
}
export interface DashboardProviders {
  sales?: SalesProvider;
  b2b?: B2BProvider;
}

/** One order line, normalised — the only shape the sales aggregator understands. Revenue is the taxable value (before GST). */
export interface SalesFact {
  orderId: string;
  at: Date;
  channel: "B2C" | "B2B";
  branchId: string;
  locationId?: string;
  revenue: number;
  cost: number;
  units: number;
  categoryKey: string;
  categoryName: string;
  productKey: string;
  productName: string;
}

export interface B2BFacts {
  purchaseOrders: { id: string; branchId: string; status: "PENDING" | "CONFIRMED" | "CANCELLED"; value: number }[];
  quotations: { id: string; branchId: string; status: "PENDING" | "ACCEPTED" | "EXPIRED"; value: number }[];
  invoices: { id: string; customerId: string; branchId: string; total: number; paid: number; dueDate: Date }[];
  creditAccounts: { customerId: string; branchId: string; limit: number; used: number }[];
}
