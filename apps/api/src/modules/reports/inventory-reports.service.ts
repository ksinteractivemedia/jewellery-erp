import { Types } from "mongoose";
import type { ReportResult } from "@jewellery/types";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import { OWNED_STATUSES } from "../inventory/movement-rules";
import { LocationModel } from "../organization/location.model";
import { BranchModel } from "../organization/branch.model";
import { MetalModel } from "../metals/metal.model";
import { ProductModel } from "../catalog/product.model";
import { ProductVariantModel } from "../catalog/product-variant.model";
import { itemScope, type LocationScope } from "../dashboard/scope";
import type { ReportContext } from "./report-filters";
import { facetPage, paginateArray } from "./report-filters";

const money0 = (n: number) => Math.round(n);
const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: "Available", RESERVED: "Reserved", SOLD: "Sold", RETURNED: "Returned", DAMAGED: "Damaged", UNDER_REPAIR: "Under repair",
  IN_MANUFACTURING: "In manufacturing", WITH_JOB_WORKER: "With job worker", IN_TRANSIT: "In transit", HALLMARKING: "At hallmarking",
  SCRAP: "Scrap", MELTING: "Melting", RETURNED_TO_CUSTOMER: "Returned to customer",
};

const ownedMatch = (scope: LocationScope) => ({ status: { $in: OWNED_STATUSES }, ...itemScope(scope) });

export async function inventoryBySku(ctx: ReportContext): Promise<ReportResult> {
  const rows = await InventoryItemModel.aggregate<{ _id: { productId?: Types.ObjectId; variantId?: Types.ObjectId }; quantity: number; grossWeight: number; costValue: number }>([
    { $match: ownedMatch(ctx.scope) },
    { $group: { _id: { productId: "$productId", variantId: "$variantId" }, quantity: { $sum: "$quantity" }, grossWeight: { $sum: "$grossWeight" }, costValue: { $sum: "$cost" } } },
  ]);
  const productIds = [...new Set(rows.map((r) => r._id.productId).filter(Boolean).map(String))];
  const variantIds = [...new Set(rows.map((r) => r._id.variantId).filter(Boolean).map(String))];
  const [products, variants] = await Promise.all([
    ProductModel.find({ _id: { $in: productIds } }).select("sku name").lean(),
    ProductVariantModel.find({ _id: { $in: variantIds } }).select("sku").lean(),
  ]);
  const productById = new Map(products.map((p) => [String(p._id), p]));
  const variantById = new Map(variants.map((v) => [String(v._id), v]));

  const out = rows
    .map((r) => {
      const p = r._id.productId ? productById.get(String(r._id.productId)) : undefined;
      const v = r._id.variantId ? variantById.get(String(r._id.variantId)) : undefined;
      return { sku: v?.sku ?? p?.sku ?? "Raw material", name: p?.name ?? "—", quantity: r.quantity, grossWeight: Number(r.grossWeight.toFixed(3)), costValue: money0(r.costValue) };
    })
    .sort((a, b) => b.costValue - a.costValue);
  const page = paginateArray(out, ctx.page, ctx.pageSize);
  const grand = out.reduce((s, r) => s + r.costValue, 0);
  return { key: "inventory-by-sku", title: "", columns: [], rows: page.rows, summary: [{ label: "Total cost value", value: grand, format: "money" }], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: {} };
}

export async function inventoryByLocation(ctx: ReportContext): Promise<ReportResult> {
  const rows = await InventoryItemModel.aggregate<{ _id: Types.ObjectId; quantity: number; grossWeight: number; costValue: number }>([
    { $match: ownedMatch(ctx.scope) },
    { $group: { _id: "$locationId", quantity: { $sum: "$quantity" }, grossWeight: { $sum: "$grossWeight" }, costValue: { $sum: "$cost" } } },
  ]);
  const locations = await LocationModel.find({ _id: { $in: rows.map((r) => r._id) } }).select("name branchId").lean();
  const branches = await BranchModel.find({ _id: { $in: locations.map((l) => l.branchId) } }).select("name").lean();
  const branchName = new Map(branches.map((b) => [String(b._id), b.name]));
  const locById = new Map(locations.map((l) => [String(l._id), l]));

  const out = rows
    .map((r) => {
      const loc = locById.get(String(r._id));
      return { locationName: loc?.name ?? "Unknown", branchName: loc ? (branchName.get(String(loc.branchId)) ?? "Unknown") : "Unknown", quantity: r.quantity, grossWeight: Number(r.grossWeight.toFixed(3)), costValue: money0(r.costValue) };
    })
    .sort((a, b) => b.costValue - a.costValue);
  const page = paginateArray(out, ctx.page, ctx.pageSize);
  const grand = out.reduce((s, r) => s + r.costValue, 0);
  return { key: "inventory-by-location", title: "", columns: [], rows: page.rows, summary: [{ label: "Total cost value", value: grand, format: "money" }], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: {} };
}

export async function inventoryByMetal(ctx: ReportContext): Promise<ReportResult> {
  const rows = await InventoryItemModel.aggregate<{ _id: Types.ObjectId; quantity: number; grossWeight: number; fineWeight: number; costValue: number }>([
    { $match: ownedMatch(ctx.scope) },
    { $group: { _id: "$metalId", quantity: { $sum: "$quantity" }, grossWeight: { $sum: "$grossWeight" }, fineWeight: { $sum: "$fineWeight" }, costValue: { $sum: "$cost" } } },
  ]);
  const metals = await MetalModel.find({ _id: { $in: rows.map((r) => r._id) } }).select("name").lean();
  const nameOf = new Map(metals.map((m) => [String(m._id), m.name]));
  const out = rows
    .map((r) => ({ metalName: nameOf.get(String(r._id)) ?? "Unknown", quantity: r.quantity, grossWeight: Number(r.grossWeight.toFixed(3)), fineWeight: Number(r.fineWeight.toFixed(3)), costValue: money0(r.costValue) }))
    .sort((a, b) => b.costValue - a.costValue);
  const page = paginateArray(out, ctx.page, ctx.pageSize);
  const grand = out.reduce((s, r) => s + r.costValue, 0);
  return { key: "inventory-by-metal", title: "", columns: [], rows: page.rows, summary: [{ label: "Total cost value", value: grand, format: "money" }], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: {} };
}

export async function inventoryByPurity(ctx: ReportContext): Promise<ReportResult> {
  const rows = await InventoryItemModel.aggregate<{ _id: { metalId: Types.ObjectId; purity: string }; quantity: number; grossWeight: number; fineWeight: number }>([
    { $match: ownedMatch(ctx.scope) },
    { $group: { _id: { metalId: "$metalId", purity: "$purity" }, quantity: { $sum: "$quantity" }, grossWeight: { $sum: "$grossWeight" }, fineWeight: { $sum: "$fineWeight" } } },
  ]);
  const metals = await MetalModel.find({ _id: { $in: rows.map((r) => r._id.metalId) } }).select("name").lean();
  const nameOf = new Map(metals.map((m) => [String(m._id), m.name]));
  const out = rows
    .map((r) => ({ metalName: nameOf.get(String(r._id.metalId)) ?? "Unknown", purity: r._id.purity, quantity: r.quantity, grossWeight: Number(r.grossWeight.toFixed(3)), fineWeight: Number(r.fineWeight.toFixed(3)) }))
    .sort((a, b) => b.fineWeight - a.fineWeight);
  const page = paginateArray(out, ctx.page, ctx.pageSize);
  return { key: "inventory-by-purity", title: "", columns: [], rows: page.rows, summary: [], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: {} };
}

export async function inventoryValue(ctx: ReportContext): Promise<ReportResult> {
  const rows = await InventoryItemModel.aggregate<{ _id: string; quantity: number; grossWeight: number; costValue: number }>([
    { $match: ownedMatch(ctx.scope) },
    { $group: { _id: "$status", quantity: { $sum: "$quantity" }, grossWeight: { $sum: "$grossWeight" }, costValue: { $sum: "$cost" } } },
  ]);
  const out = rows.map((r) => ({ statusLabel: STATUS_LABELS[r._id] ?? r._id, quantity: r.quantity, grossWeight: Number(r.grossWeight.toFixed(3)), costValue: money0(r.costValue) })).sort((a, b) => b.costValue - a.costValue);
  const page = paginateArray(out, ctx.page, ctx.pageSize);
  const grand = out.reduce((s, r) => s + r.costValue, 0);
  return { key: "inventory-value", title: "", columns: [], rows: page.rows, summary: [{ label: "Total cost value", value: grand, format: "money" }], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: {} };
}

export async function inventoryReserved(ctx: ReportContext): Promise<ReportResult> {
  const match = { status: "RESERVED", ...itemScope(ctx.scope) };
  const [facet] = await InventoryItemModel.aggregate([
    { $match: match },
    { $sort: { "reservation.reservedAt": 1 } },
    {
      $facet: {
        data: [...facetPage(ctx.page, ctx.pageSize), { $project: { itemCode: 1, productId: 1, locationId: 1, reservation: 1 } }],
        count: [{ $count: "n" }],
      },
    },
  ]);
  const total = facet?.count?.[0]?.n ?? 0;
  const data = (facet?.data ?? []) as { itemCode: string; productId?: Types.ObjectId; locationId: Types.ObjectId; reservation?: { referenceType: string; reservedAt: Date } }[];
  const [products, locations] = await Promise.all([
    ProductModel.find({ _id: { $in: data.map((d) => d.productId).filter(Boolean) } }).select("sku").lean(),
    LocationModel.find({ _id: { $in: data.map((d) => d.locationId) } }).select("name").lean(),
  ]);
  const skuOf = new Map(products.map((p) => [String(p._id), p.sku]));
  const locOf = new Map(locations.map((l) => [String(l._id), l.name]));
  const rows = data.map((d) => ({
    itemCode: d.itemCode,
    sku: d.productId ? (skuOf.get(String(d.productId)) ?? "—") : "—",
    locationName: locOf.get(String(d.locationId)) ?? "Unknown",
    reservedForType: d.reservation?.referenceType ?? "—",
    reservedSince: d.reservation?.reservedAt ? new Date(d.reservation.reservedAt).toISOString().slice(0, 10) : "—",
  }));
  return { key: "inventory-reserved", title: "", columns: [], rows, summary: [{ label: "Reserved pieces", value: total, format: "number" }], page: ctx.page, pageSize: ctx.pageSize, total, scope: {} };
}

/** Available finished jewellery whose cached state (only ever updated by a real ledger movement) hasn't changed in `daysThreshold` days — the honest, derived definition of "hasn't sold." */
export async function inventoryDeadStock(ctx: ReportContext, daysThreshold = 180): Promise<ReportResult> {
  const cutoff = new Date(Date.now() - daysThreshold * 86_400_000);
  const match = { status: "AVAILABLE", type: "FINISHED_JEWELLERY", updatedAt: { $lt: cutoff }, ...itemScope(ctx.scope) };
  const [facet] = await InventoryItemModel.aggregate([
    { $match: match },
    { $sort: { updatedAt: 1 } },
    { $facet: { data: [...facetPage(ctx.page, ctx.pageSize), { $project: { itemCode: 1, productId: 1, locationId: 1, updatedAt: 1, cost: 1 } }], count: [{ $count: "n" }] } },
  ]);
  const total = facet?.count?.[0]?.n ?? 0;
  const data = (facet?.data ?? []) as { itemCode: string; productId?: Types.ObjectId; locationId: Types.ObjectId; updatedAt: Date; cost: number }[];
  const [products, locations] = await Promise.all([
    ProductModel.find({ _id: { $in: data.map((d) => d.productId).filter(Boolean) } }).select("sku name").lean(),
    LocationModel.find({ _id: { $in: data.map((d) => d.locationId) } }).select("name").lean(),
  ]);
  const productOf = new Map(products.map((p) => [String(p._id), p]));
  const locOf = new Map(locations.map((l) => [String(l._id), l.name]));
  const now = Date.now();
  const rows = data.map((d) => ({
    itemCode: d.itemCode,
    sku: d.productId ? (productOf.get(String(d.productId))?.sku ?? "—") : "—",
    name: d.productId ? (productOf.get(String(d.productId))?.name ?? "—") : "—",
    locationName: locOf.get(String(d.locationId)) ?? "Unknown",
    daysIdle: Math.floor((now - new Date(d.updatedAt).getTime()) / 86_400_000),
    costValue: money0(d.cost),
  }));
  return { key: "inventory-dead-stock", title: "", columns: [], rows, summary: [{ label: "Dead-stock pieces", value: total, format: "number" }], page: ctx.page, pageSize: ctx.pageSize, total, scope: {} };
}
