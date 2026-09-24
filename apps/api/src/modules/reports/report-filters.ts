import type { ReportQueryInput } from "@jewellery/validation";
import { resolveRange, type ResolvedRange } from "../dashboard/range";
import { resolveScope, type LocationScope } from "../dashboard/scope";

/** Every report's incoming request, resolved once: a real date range, a real location scope (never a raw, unchecked id), pagination. Reused by every report function so none of them re-derive this. */
export interface ReportContext {
  range: ResolvedRange;
  scope: LocationScope;
  customerType?: "B2C" | "B2B";
  categoryId?: string;
  groupBy?: string;
  page: number;
  pageSize: number;
}

export async function resolveReportContext(q: ReportQueryInput, now: Date): Promise<ReportContext> {
  const range = resolveRange({ from: q.from, to: q.to }, now);
  const scope = await resolveScope({ branchId: q.branchId, locationId: q.locationId });
  return { range, scope, customerType: q.customerType, categoryId: q.categoryId, groupBy: q.groupBy, page: q.page, pageSize: q.pageSize };
}

/** For reports whose row count is inherently small (grouped by day/status/category, not by document) — paginate in memory rather than round-tripping Mongo again. */
export function paginateArray<T>(rows: T[], page: number, pageSize: number): { rows: T[]; total: number } {
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total: rows.length };
}

/** For reports whose row count scales with real documents (by SKU, ledger movements…) — the $facet stage every such pipeline ends with. */
export const facetPage = (page: number, pageSize: number) => [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }];
