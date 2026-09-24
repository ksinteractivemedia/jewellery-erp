import type { PipelineStage } from "mongoose";
import type { ReportResult } from "@jewellery/types";
import { OrderModel } from "../orders/order.model";
import { InvoiceModel } from "../b2b/b2b.models";
import { InventoryLedgerModel } from "../inventory/inventory-ledger.model";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import { businessDay, type Granularity } from "../dashboard/range";
import type { ReportContext } from "./report-filters";
import { paginateArray } from "./report-filters";
import { periodKeys, periodOf } from "./sales-reports.service";

const money0 = (n: number) => Math.round(n);
const SOLD_ORDER_STATUSES = ["PAID", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"];

interface PeriodTotals {
  grossRevenue: number;
  discount: number;
  netRevenue: number;
  cost: number;
}
const empty = (): PeriodTotals => ({ grossRevenue: 0, discount: 0, netRevenue: 0, cost: 0 });

/**
 * Revenue and discount come straight from the frozen order/invoice totals (the same figures a
 * customer was actually charged — never recomputed). Cost is the sold pieces' own book cost, read
 * from the `SALE` ledger via one aggregation, never a second cost model. Gross profit and margin
 * are then just arithmetic on numbers that are each already real.
 */
export async function profitabilitySummary(ctx: ReportContext): Promise<ReportResult> {
  const granularity: Granularity | "month" = ctx.groupBy === "month" ? "month" : "day";
  const byPeriod = new Map<string, PeriodTotals>();
  const bump = (period: string, patch: Partial<PeriodTotals>) => {
    const cur = byPeriod.get(period) ?? empty();
    cur.grossRevenue += patch.grossRevenue ?? 0;
    cur.discount += patch.discount ?? 0;
    cur.netRevenue += patch.netRevenue ?? 0;
    cur.cost += patch.cost ?? 0;
    byPeriod.set(period, cur);
  };

  if (ctx.customerType !== "B2B") {
    const orders = await OrderModel.find({ status: { $in: SOLD_ORDER_STATUSES }, placedAt: { $gte: ctx.range.start, $lt: ctx.range.end } }).select("placedAt totals").lean();
    for (const o of orders) {
      const period = periodOf(businessDay(o.placedAt), granularity);
      bump(period, { grossRevenue: o.totals.taxableValue, netRevenue: o.totals.taxableValue });
    }
  }
  if (ctx.customerType !== "B2C") {
    const invoices = await InvoiceModel.find({ status: "ISSUED", issueDate: { $gte: ctx.range.from, $lte: ctx.range.to } }).select("issueDate totals lines").lean();
    for (const inv of invoices) {
      const period = periodOf(inv.issueDate, granularity);
      const discount = inv.lines.reduce((s, l) => s + l.lineDiscount, 0);
      bump(period, { grossRevenue: inv.totals.taxable + discount, discount, netRevenue: inv.totals.taxable });
    }
  }

  // Cost of goods sold: one aggregation over the SALE ledger, joined to each item's own book cost — channel-agnostic by design (an item's cost doesn't care who bought it).
  const match: Record<string, unknown> = { movementType: "SALE", createdAt: { $gte: ctx.range.start, $lt: ctx.range.end } };
  const pipeline: PipelineStage[] = [
    { $match: match },
    { $lookup: { from: InventoryItemModel.collection.name, localField: "itemId", foreignField: "_id", as: "item" } },
    { $unwind: "$item" },
    { $project: { createdAt: 1, cost: "$item.cost" } },
  ];
  const costRows = await InventoryLedgerModel.aggregate<{ createdAt: Date; cost: number }>(pipeline);
  for (const r of costRows) bump(periodOf(businessDay(r.createdAt), granularity), { cost: r.cost });

  const keys = periodKeys(ctx.range, granularity);
  const rows = keys.map((period) => {
    const t = byPeriod.get(period) ?? empty();
    const grossProfit = t.netRevenue - t.cost;
    return {
      period,
      grossRevenue: money0(t.grossRevenue),
      discount: money0(t.discount),
      netRevenue: money0(t.netRevenue),
      cost: money0(t.cost),
      grossProfit: money0(grossProfit),
      marginPercent: t.netRevenue > 0 ? Math.round((grossProfit * 1000) / t.netRevenue) / 10 : 0,
    };
  });
  const page = paginateArray(rows, ctx.page, ctx.pageSize);
  const grand = [...byPeriod.values()].reduce((s, t) => ({ grossRevenue: s.grossRevenue + t.grossRevenue, discount: s.discount + t.discount, netRevenue: s.netRevenue + t.netRevenue, cost: s.cost + t.cost }), empty());
  const grandProfit = grand.netRevenue - grand.cost;
  return {
    key: "profitability-summary",
    title: "",
    columns: [],
    rows: page.rows,
    summary: [
      { label: "Net revenue", value: money0(grand.netRevenue), format: "money" },
      { label: "Cost of goods sold", value: money0(grand.cost), format: "money" },
      { label: "Gross profit", value: money0(grandProfit), format: "money" },
      { label: "Margin", value: grand.netRevenue > 0 ? Math.round((grandProfit * 1000) / grand.netRevenue) / 10 : 0, format: "percent" },
    ],
    page: ctx.page,
    pageSize: ctx.pageSize,
    total: page.total,
    scope: { from: ctx.range.from, to: ctx.range.to, groupBy: granularity },
  };
}
