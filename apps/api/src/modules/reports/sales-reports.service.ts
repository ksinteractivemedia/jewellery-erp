import { Types } from "mongoose";
import type { ReportResult } from "@jewellery/types";
import { UserModel } from "../auth/user.model";
import { OrderModel } from "../orders/order.model";
import { InvoiceModel, SalesOrderModel } from "../b2b/b2b.models";
import { CustomerModel } from "../customers/customer.model";
import { InventoryLedgerModel } from "../inventory/inventory-ledger.model";
import { TransactionModel } from "../inventory/transaction.model";
import { LocationModel } from "../organization/location.model";
import { BranchModel } from "../organization/branch.model";
import { ProductModel } from "../catalog/product.model";
import { ProductCategoryModel } from "../catalog/product-category.model";
import { bucketKeys, bucketOf, businessDay, type Granularity } from "../dashboard/range";
import type { ReportContext } from "./report-filters";
import { paginateArray } from "./report-filters";

const money0 = (n: number) => Math.round(n);

/** B2C statuses that mean a sale actually happened — matches the dashboard's own "revenue" definition (business-rules.md §9.3). */
const SOLD_ORDER_STATUSES = ["PAID", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"];

/**
 * The one derivation every branch/location-scoped sales report shares: which orders (B2C) and
 * sales orders (B2B — an invoice's own `salesOrderId`) actually sold a piece FROM a location in
 * scope, read from the real `SALE` ledger entries — never a location field typed onto an order,
 * which doesn't exist. `null` means "no scoping requested", so callers skip the extra query.
 */
async function soldReferenceIdsInScope(range: ReportContext["range"], scope: ReportContext["scope"]): Promise<Set<string> | null> {
  if (!scope.locationIds) return null;
  const entries = await InventoryLedgerModel.find({ movementType: "SALE", createdAt: { $gte: range.start, $lt: range.end }, sourceLocationId: { $in: scope.locationIds } })
    .select("transactionId")
    .lean();
  if (!entries.length) return new Set();
  const txIds = [...new Set(entries.map((e) => String(e.transactionId)))];
  const txs = await TransactionModel.find({ _id: { $in: txIds }, referenceType: "ORDER" }).select("referenceId").lean();
  return new Set(txs.map((t) => String(t.referenceId)));
}

/** Shared with `profitability-reports.service.ts` — one "which bucket does this day belong to" rule for every time-grouped report. */
export function periodOf(day: string, granularity: Granularity | "month"): string {
  if (granularity === "month") return day.slice(0, 7);
  return bucketOf(day, granularity);
}
export function periodKeys(range: ReportContext["range"], granularity: Granularity | "month"): string[] {
  if (granularity !== "month") return bucketKeys(range, granularity);
  const keys: string[] = [];
  for (let m = range.from.slice(0, 7); m <= range.to.slice(0, 7); ) {
    keys.push(m);
    const [y, mo] = m.split("-").map(Number);
    const next = mo! === 12 ? `${y! + 1}-01` : `${y}-${String(mo! + 1).padStart(2, "0")}`;
    m = next;
  }
  return keys;
}

interface DayTotals {
  orders: number;
  taxableValue: number;
  discount: number;
  gst: number;
  total: number;
}
const emptyTotals = (): DayTotals => ({ orders: 0, taxableValue: 0, discount: 0, gst: 0, total: 0 });

async function b2cDayTotals(range: ReportContext["range"], inScope: Set<string> | null): Promise<Map<string, DayTotals>> {
  const match: Record<string, unknown> = { status: { $in: SOLD_ORDER_STATUSES }, placedAt: { $gte: range.start, $lt: range.end } };
  const docs = await OrderModel.find(match).select("placedAt totals").lean();
  const byDay = new Map<string, DayTotals>();
  for (const o of docs) {
    if (inScope && !inScope.has(String(o._id))) continue;
    const day = businessDay(o.placedAt);
    const t = byDay.get(day) ?? emptyTotals();
    t.orders++;
    t.taxableValue += o.totals.taxableValue;
    t.gst += o.totals.gst;
    t.total += o.totals.total;
    byDay.set(day, t);
  }
  return byDay;
}

async function b2bDayTotals(range: ReportContext["range"], inScope: Set<string> | null): Promise<Map<string, DayTotals>> {
  const docs = await InvoiceModel.find({ status: "ISSUED", issueDate: { $gte: range.from, $lte: range.to } }).select("issueDate totals salesOrderId lines").lean();
  const byDay = new Map<string, DayTotals>();
  for (const inv of docs) {
    if (inScope && !inScope.has(String(inv.salesOrderId))) continue;
    const day = inv.issueDate;
    const t = byDay.get(day) ?? emptyTotals();
    t.orders++;
    t.taxableValue += inv.totals.taxable;
    t.discount += inv.lines.reduce((s, l) => s + l.lineDiscount, 0);
    t.gst += inv.totals.gst;
    t.total += inv.totals.total;
    byDay.set(day, t);
  }
  return byDay;
}

/** Shared by sales-daily / sales-monthly / sales-b2c / sales-b2b — one function, four registry entries. */
async function salesOverTime(ctx: ReportContext, opts: { channel: "BOTH" | "B2C" | "B2B"; granularity: Granularity | "month" }): Promise<ReportResult> {
  const inScope = await soldReferenceIdsInScope(ctx.range, ctx.scope);
  const wantB2c = opts.channel !== "B2B" && ctx.customerType !== "B2B";
  const wantB2b = opts.channel !== "B2C" && ctx.customerType !== "B2C";
  const [b2c, b2b] = await Promise.all([wantB2c ? b2cDayTotals(ctx.range, inScope) : new Map<string, DayTotals>(), wantB2b ? b2bDayTotals(ctx.range, inScope) : new Map<string, DayTotals>()]);

  const byPeriod = new Map<string, DayTotals>();
  for (const [day, t] of [...b2c, ...b2b]) {
    const p = periodOf(day, opts.granularity);
    const cur = byPeriod.get(p) ?? emptyTotals();
    cur.orders += t.orders;
    cur.taxableValue += t.taxableValue;
    cur.discount += t.discount;
    cur.gst += t.gst;
    cur.total += t.total;
    byPeriod.set(p, cur);
  }

  const keys = periodKeys(ctx.range, opts.granularity);
  const isB2b = opts.channel === "B2B";
  const rows = keys.map((p) => {
    const t = byPeriod.get(p) ?? emptyTotals();
    return {
      date: p,
      month: p,
      orders: t.orders,
      invoices: t.orders,
      taxableValue: money0(t.taxableValue),
      ...(isB2b ? { discount: money0(t.discount) } : {}),
      gst: money0(t.gst),
      total: money0(t.total),
    };
  });
  const grand = [...byPeriod.values()].reduce((s, t) => ({ orders: s.orders + t.orders, taxableValue: s.taxableValue + t.taxableValue, discount: s.discount + t.discount, gst: s.gst + t.gst, total: s.total + t.total }), emptyTotals());
  const page = paginateArray(rows, ctx.page, ctx.pageSize);
  return {
    key: "sales-daily",
    title: "",
    columns: [],
    rows: page.rows,
    summary: [
      { label: "Orders", value: grand.orders, format: "number" },
      { label: "Taxable value", value: money0(grand.taxableValue), format: "money" },
      { label: "Total", value: money0(grand.total), format: "money" },
    ],
    page: ctx.page,
    pageSize: ctx.pageSize,
    total: page.total,
    scope: { from: ctx.range.from, to: ctx.range.to },
  };
}

export const salesDaily = (ctx: ReportContext) => salesOverTime(ctx, { channel: "BOTH", granularity: "day" });
export const salesMonthly = (ctx: ReportContext) => salesOverTime(ctx, { channel: "BOTH", granularity: "month" });
export const salesB2c = (ctx: ReportContext) => salesOverTime(ctx, { channel: "B2C", granularity: "day" });
export const salesB2b = (ctx: ReportContext) => salesOverTime(ctx, { channel: "B2B", granularity: "day" });

/** Product/category rollups: order lines (B2C) + invoice lines (B2B) grouped by SKU, then optionally rolled up to a category via a small in-memory Product lookup (the catalogue is hundreds of rows, not millions — a $lookup would cost more than it saves). */
async function productTotals(ctx: ReportContext): Promise<Map<string, { sku: string; name: string; productId?: string; quantity: number; taxableValue: number; total: number }>> {
  const inScope = await soldReferenceIdsInScope(ctx.range, ctx.scope);
  const rows = new Map<string, { sku: string; name: string; productId?: string; quantity: number; taxableValue: number; total: number }>();
  const bump = (sku: string, name: string, productId: string | undefined, quantity: number, taxableValue: number, total: number) => {
    const cur = rows.get(sku) ?? { sku, name, productId, quantity: 0, taxableValue: 0, total: 0 };
    cur.quantity += quantity;
    cur.taxableValue += taxableValue;
    cur.total += total;
    rows.set(sku, cur);
  };
  if (ctx.customerType !== "B2B") {
    const orders = await OrderModel.find({ status: { $in: SOLD_ORDER_STATUSES }, placedAt: { $gte: ctx.range.start, $lt: ctx.range.end } }).select("items").lean();
    for (const o of orders) {
      if (inScope && !inScope.has(String(o._id))) continue;
      for (const l of o.items) bump(l.sku, l.name, String(l.productId), l.quantity, l.taxableValue, l.lineTotal);
    }
  }
  if (ctx.customerType !== "B2C") {
    const invoices = await InvoiceModel.find({ status: "ISSUED", issueDate: { $gte: ctx.range.from, $lte: ctx.range.to } }).select("lines salesOrderId").lean();
    for (const inv of invoices) {
      if (inScope && !inScope.has(String(inv.salesOrderId))) continue;
      for (const l of inv.lines) bump(l.sku, l.name, String(l.productId), l.quantity, l.lineTaxable, l.lineTotal);
    }
  }
  return rows;
}

export async function salesByProduct(ctx: ReportContext): Promise<ReportResult> {
  const byProduct = await productTotals(ctx);
  let rows = [...byProduct.values()];
  if (ctx.categoryId) {
    const ids = rows.map((r) => r.productId).filter((x): x is string => !!x && Types.ObjectId.isValid(x));
    const products = await ProductModel.find({ _id: { $in: ids }, categoryId: ctx.categoryId }).select("_id").lean();
    const allowed = new Set(products.map((p) => String(p._id)));
    rows = rows.filter((r) => r.productId && allowed.has(r.productId));
  }
  rows.sort((a, b) => b.total - a.total);
  const page = paginateArray(
    rows.map((r) => ({ sku: r.sku, name: r.name, quantity: r.quantity, taxableValue: money0(r.taxableValue), total: money0(r.total) })),
    ctx.page,
    ctx.pageSize
  );
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return { key: "sales-by-product", title: "", columns: [], rows: page.rows, summary: [{ label: "Total", value: money0(grandTotal), format: "money" }], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: { from: ctx.range.from, to: ctx.range.to } };
}

export async function salesByCategory(ctx: ReportContext): Promise<ReportResult> {
  const byProduct = await productTotals(ctx);
  const productIds = [...byProduct.values()].map((r) => r.productId).filter((x): x is string => !!x && Types.ObjectId.isValid(x));
  const products = await ProductModel.find({ _id: { $in: productIds } }).select("categoryId").lean();
  const categoryOfProduct = new Map(products.map((p) => [String(p._id), p.categoryId ? String(p.categoryId) : undefined]));
  const categories = await ProductCategoryModel.find().select("name").lean();
  const nameOfCategory = new Map(categories.map((c) => [String(c._id), c.name]));

  const byCategory = new Map<string, { quantity: number; taxableValue: number; total: number }>();
  for (const r of byProduct.values()) {
    const categoryId = r.productId ? categoryOfProduct.get(r.productId) : undefined;
    const key = categoryId ?? "uncategorised";
    const cur = byCategory.get(key) ?? { quantity: 0, taxableValue: 0, total: 0 };
    cur.quantity += r.quantity;
    cur.taxableValue += r.taxableValue;
    cur.total += r.total;
    byCategory.set(key, cur);
  }
  const rows = [...byCategory.entries()]
    .map(([categoryId, t]) => ({ categoryName: categoryId === "uncategorised" ? "Uncategorised" : (nameOfCategory.get(categoryId) ?? "Unknown"), quantity: t.quantity, taxableValue: money0(t.taxableValue), total: money0(t.total) }))
    .sort((a, b) => b.total - a.total);
  const page = paginateArray(rows, ctx.page, ctx.pageSize);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return { key: "sales-by-category", title: "", columns: [], rows: page.rows, summary: [{ label: "Total", value: money0(grandTotal), format: "money" }], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: { from: ctx.range.from, to: ctx.range.to } };
}

/** B2B only — a salesperson is `Customer.b2b.salespersonId`, resolved per invoice via its customer. */
export async function salesBySalesperson(ctx: ReportContext): Promise<ReportResult> {
  const invoices = await InvoiceModel.find({ status: "ISSUED", issueDate: { $gte: ctx.range.from, $lte: ctx.range.to } }).select("customerId totals").lean();
  const customerIds = [...new Set(invoices.map((i) => String(i.customerId)))];
  const customers = await CustomerModel.find({ _id: { $in: customerIds } }).select("b2b.salespersonId").lean();
  const salespersonOfCustomer = new Map(customers.map((c) => [String(c._id), c.b2b?.salespersonId ? String(c.b2b.salespersonId) : undefined]));
  const spIds = [...new Set([...salespersonOfCustomer.values()].filter((x): x is string => !!x))];
  const users = await UserModel.find({ _id: { $in: spIds } }).select("name").lean();
  const nameOfUser = new Map(users.map((u) => [String(u._id), u.name]));

  const byPerson = new Map<string, { invoices: number; taxableValue: number; total: number }>();
  for (const inv of invoices) {
    const sp = salespersonOfCustomer.get(String(inv.customerId));
    const key = sp ?? "unassigned";
    const cur = byPerson.get(key) ?? { invoices: 0, taxableValue: 0, total: 0 };
    cur.invoices++;
    cur.taxableValue += inv.totals.taxable;
    cur.total += inv.totals.total;
    byPerson.set(key, cur);
  }
  const rows = [...byPerson.entries()]
    .map(([sp, t]) => ({ salespersonName: sp === "unassigned" ? "Unassigned" : (nameOfUser.get(sp) ?? "Unknown"), invoices: t.invoices, taxableValue: money0(t.taxableValue), total: money0(t.total) }))
    .sort((a, b) => b.total - a.total);
  const page = paginateArray(rows, ctx.page, ctx.pageSize);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return { key: "sales-by-salesperson", title: "", columns: [], rows: page.rows, summary: [{ label: "Total", value: money0(grandTotal), format: "money" }], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: { from: ctx.range.from, to: ctx.range.to } };
}

/**
 * Revenue attributed to the branch a sold piece actually shipped from, read off the `SALE` ledger
 * (`sourceLocationId`) — never a field typed onto an order. An order fulfilled from more than one
 * location (rare — most orders draw from one) is attributed whole to the *first* location its
 * pieces were sold from; a documented simplification rather than a per-line split.
 */
export async function salesByBranch(ctx: ReportContext): Promise<ReportResult> {
  const entries = await InventoryLedgerModel.find({ movementType: "SALE", createdAt: { $gte: ctx.range.start, $lt: ctx.range.end } })
    .select("transactionId sourceLocationId createdAt")
    .sort({ createdAt: 1 })
    .lean();
  const txIds = [...new Set(entries.map((e) => String(e.transactionId)))];
  const txs = await TransactionModel.find({ _id: { $in: txIds }, referenceType: "ORDER" }).select("referenceId channel").lean();
  const txById = new Map(txs.map((t) => [String(t._id), t]));

  const locationOfOrder = new Map<string, Types.ObjectId>();
  const channelOfOrder = new Map<string, string>();
  for (const e of entries) {
    const tx = txById.get(String(e.transactionId));
    if (!tx?.referenceId) continue;
    if (!e.sourceLocationId) continue;
    const orderId = String(tx.referenceId);
    if (!locationOfOrder.has(orderId)) {
      locationOfOrder.set(orderId, e.sourceLocationId);
      channelOfOrder.set(orderId, tx.channel);
    }
  }

  const b2cIds = [...locationOfOrder.keys()].filter((id) => channelOfOrder.get(id) === "B2C" && (!ctx.customerType || ctx.customerType === "B2C"));
  const b2bIds = [...locationOfOrder.keys()].filter((id) => channelOfOrder.get(id) === "B2B" && (!ctx.customerType || ctx.customerType === "B2B"));
  const [orders, invoices] = await Promise.all([
    b2cIds.length ? OrderModel.find({ _id: { $in: b2cIds } }).select("totals.total").lean() : [],
    b2bIds.length ? InvoiceModel.find({ salesOrderId: { $in: b2bIds }, status: "ISSUED" }).select("salesOrderId totals.total").lean() : [],
  ]);

  const byLocation = new Map<string, { pieces: number; total: number }>();
  for (const o of orders) {
    const loc = String(locationOfOrder.get(String(o._id)));
    const cur = byLocation.get(loc) ?? { pieces: 0, total: 0 };
    cur.total += o.totals.total;
    byLocation.set(loc, cur);
  }
  for (const inv of invoices) {
    const loc = String(locationOfOrder.get(String(inv.salesOrderId)));
    const cur = byLocation.get(loc) ?? { pieces: 0, total: 0 };
    cur.total += inv.totals.total;
    byLocation.set(loc, cur);
  }
  for (const e of entries) {
    const tx = txById.get(String(e.transactionId));
    if (!tx?.referenceId) continue;
    const assigned = locationOfOrder.get(String(tx.referenceId));
    if (!assigned) continue;
    const cur = byLocation.get(String(assigned));
    if (cur) cur.pieces++;
  }

  const locations = await LocationModel.find({ _id: { $in: [...byLocation.keys()] } }).select("name branchId").lean();
  const branches = await BranchModel.find({ _id: { $in: locations.map((l) => l.branchId) } }).select("name").lean();
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));
  const locMeta = new Map(locations.map((l) => [String(l._id), { name: l.name, branchId: String(l.branchId) }]));

  const rows = [...byLocation.entries()]
    .map(([locId, t]) => ({ branchName: `${branchName.get(locMeta.get(locId)?.branchId ?? "") ?? "Unknown"} (${locMeta.get(locId)?.name ?? locId})`, pieces: t.pieces, total: money0(t.total) }))
    .sort((a, b) => b.total - a.total);
  const page = paginateArray(rows, ctx.page, ctx.pageSize);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return { key: "sales-by-branch", title: "", columns: [], rows: page.rows, summary: [{ label: "Total", value: money0(grandTotal), format: "money" }], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: { from: ctx.range.from, to: ctx.range.to } };
}
