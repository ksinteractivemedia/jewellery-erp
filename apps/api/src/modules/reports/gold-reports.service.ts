import { Types, type PipelineStage } from "mongoose";
import type { MovementType, ReportResult } from "@jewellery/types";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import { InventoryLedgerModel } from "../inventory/inventory-ledger.model";
import { OWNED_STATUSES } from "../inventory/movement-rules";
import { findMetalByCode } from "../metals/metal.repository";
import { TransactionModel } from "../inventory/transaction.model";
import { ProductionOrderModel, JobWorkOrderModel } from "../manufacturing/manufacturing.models";
import { itemScope } from "../dashboard/scope";
import type { ReportContext } from "./report-filters";
import { facetPage } from "./report-filters";

const weight3 = (n: number) => Number((n ?? 0).toFixed(3));

/**
 * Every "gold X" report shares this pipeline: match the ledger by movement type and date, `$lookup`
 * to `InventoryItem` to filter by metal — never pulled into Node as an id list first, so this stays
 * a real backend aggregation whatever the size of the gold book. `fromStatusFilter` distinguishes,
 * within one movement type, which leg of it counts (a RETURN's SOLD→RETURNED leg is a customer
 * return; its RETURNED→AVAILABLE/DAMAGED leg, inspection, is not).
 */
async function goldLedgerMovement(ctx: ReportContext, movementTypes: MovementType[], opts: { fromStatus?: string; noFromStatus?: boolean } = {}): Promise<ReportResult> {
  const gold = await findMetalByCode("GOLD");
  if (!gold) return { key: "gold-purchased", title: "", columns: [], rows: [], summary: [{ label: "Total fine weight", value: 0, format: "weight" }], page: ctx.page, pageSize: ctx.pageSize, total: 0, scope: {} };

  const match: Record<string, unknown> = { movementType: { $in: movementTypes }, createdAt: { $gte: ctx.range.start, $lt: ctx.range.end } };
  if (opts.fromStatus) match.fromStatus = opts.fromStatus;
  if (opts.noFromStatus) match.fromStatus = { $exists: false };
  if (ctx.scope.locationIds) match.$or = [{ sourceLocationId: { $in: ctx.scope.locationIds } }, { destinationLocationId: { $in: ctx.scope.locationIds } }];

  const pipeline: PipelineStage[] = [
    { $match: match },
    { $lookup: { from: InventoryItemModel.collection.name, localField: "itemId", foreignField: "_id", as: "item" } },
    { $unwind: "$item" },
    { $match: { "item.metalId": gold.id ? new Types.ObjectId(gold.id) : undefined } },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        // A whole-piece movement (issue, sale, return, receipt…) never splits a batch (business-rules.md §15.3), so
        // the ledger entry's own delta is 0 for any custody/status move that doesn't change the piece's weight —
        // `balanceAfter` is the piece's real weight at that event, creation or not, and is what "how much gold
        // moved" means here.
        data: [...facetPage(ctx.page, ctx.pageSize), { $project: { createdAt: 1, itemCode: "$item.itemCode", purity: "$item.purity", grossWeight: "$balanceAfter.grossWeight", fineWeight: "$balanceAfter.fineWeight", transactionId: 1 } }],
        count: [{ $count: "n" }],
        totalFine: [{ $group: { _id: null, sum: { $sum: "$balanceAfter.fineWeight" } } }],
      },
    },
  ];
  const [facet] = await InventoryLedgerModel.aggregate(pipeline);
  const data = (facet?.data ?? []) as { createdAt: Date; itemCode: string; purity: string; grossWeight: number; fineWeight: number; transactionId: Types.ObjectId }[];
  const total = facet?.count?.[0]?.n ?? 0;
  const totalFine = facet?.totalFine?.[0]?.sum ?? 0;

  const txs = await TransactionModel.find({ _id: { $in: data.map((d) => d.transactionId) } }).select("referenceType referenceId reason").lean();
  const txById = new Map(txs.map((t) => [String(t._id), t]));
  const rows = data.map((d) => {
    const tx = txById.get(String(d.transactionId));
    return {
      date: new Date(d.createdAt).toISOString().slice(0, 10),
      itemCode: d.itemCode,
      purity: d.purity,
      grossWeight: weight3(d.grossWeight),
      fineWeight: weight3(d.fineWeight),
      reference: tx?.reason ?? (tx?.referenceType ? `${tx.referenceType}` : "—"),
    };
  });
  return { key: "gold-purchased", title: "", columns: [], rows, summary: [{ label: "Total fine weight", value: weight3(totalFine), format: "weight" }], page: ctx.page, pageSize: ctx.pageSize, total, scope: { from: ctx.range.from, to: ctx.range.to } };
}

export const goldPurchased = (ctx: ReportContext) => goldLedgerMovement(ctx, ["PURCHASE_RECEIPT", "EXCHANGE_IN"]);
export const goldIssued = (ctx: ReportContext) => goldLedgerMovement(ctx, ["MANUFACTURING_ISSUE", "JOBWORK_ISSUE"]);
export const goldConsumed = (ctx: ReportContext) => goldLedgerMovement(ctx, ["MANUFACTURING_RECEIPT", "JOBWORK_RECEIPT"], { noFromStatus: true });
export const goldSold = (ctx: ReportContext) => goldLedgerMovement(ctx, ["SALE"]);
export const goldReturned = (ctx: ReportContext) => goldLedgerMovement(ctx, ["RETURN"], { fromStatus: "SOLD" });

/** Wastage isn't a ledger movement (business-rules.md §15.5: it's a reconciliation field on a production/job-work order, computed once the order closes) — so this report reads Manufacturing's own data, not the ledger. Gold-only, via each order's BOM metal. */
export async function goldWastage(ctx: ReportContext): Promise<ReportResult> {
  const gold = await findMetalByCode("GOLD");
  if (!gold) return { key: "gold-wastage", title: "", columns: [], rows: [], summary: [], page: ctx.page, pageSize: ctx.pageSize, total: 0, scope: {} };
  const goldId = new Types.ObjectId(gold.id);
  const match = { "bom.metalId": goldId, reconciliation: { $exists: true }, updatedAt: { $gte: ctx.range.start, $lt: ctx.range.end } };
  // `baseSchemaOptions` sets `timestamps: true` at the schema level, so `updatedAt` is a real field at
  // runtime and is selected above — but neither Attrs interface declares it, so `.lean()` doesn't type it.
  const [productionOrders, jobWorkOrders] = (await Promise.all([
    ProductionOrderModel.find(match).select("productionOrderNo reconciliation updatedAt").sort({ updatedAt: -1 }).limit(500).lean(),
    JobWorkOrderModel.find(match).select("jobWorkOrderNo reconciliation updatedAt").sort({ updatedAt: -1 }).limit(500).lean(),
  ])) as unknown as [{ productionOrderNo: string; reconciliation: { wastageGrossWeight: number; discrepancyGrossWeight: number }; updatedAt: Date }[], { jobWorkOrderNo: string; reconciliation: { wastageGrossWeight: number; discrepancyGrossWeight: number }; updatedAt: Date }[]];
  const rows = [
    ...productionOrders.map((o) => ({ orderNo: o.productionOrderNo, kind: "Production", completedAt: o.updatedAt.toISOString().slice(0, 10), wastageGrossWeight: weight3(o.reconciliation!.wastageGrossWeight), discrepancyGrossWeight: weight3(o.reconciliation!.discrepancyGrossWeight) })),
    ...jobWorkOrders.map((o) => ({ orderNo: o.jobWorkOrderNo, kind: "Job work", completedAt: o.updatedAt.toISOString().slice(0, 10), wastageGrossWeight: weight3(o.reconciliation!.wastageGrossWeight), discrepancyGrossWeight: weight3(o.reconciliation!.discrepancyGrossWeight) })),
  ].sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));
  const start = (ctx.page - 1) * ctx.pageSize;
  const page = rows.slice(start, start + ctx.pageSize);
  const totalWastage = rows.reduce((s, r) => s + r.wastageGrossWeight, 0);
  return { key: "gold-wastage", title: "", columns: [], rows: page, summary: [{ label: "Total wastage", value: weight3(totalWastage), format: "weight" }], page: ctx.page, pageSize: ctx.pageSize, total: rows.length, scope: { from: ctx.range.from, to: ctx.range.to } };
}

/** A snapshot — current fine gold held, by status. The same "owned stock" definition the ERP dashboard's own stock position uses (business-rules.md §9.6). */
export async function goldFineBalance(ctx: ReportContext): Promise<ReportResult> {
  const gold = await findMetalByCode("GOLD");
  if (!gold) return { key: "gold-fine-balance", title: "", columns: [], rows: [], summary: [], page: ctx.page, pageSize: ctx.pageSize, total: 0, scope: {} };
  const rows = await InventoryItemModel.aggregate<{ _id: string; quantity: number; grossWeight: number; fineWeight: number }>([
    { $match: { metalId: new Types.ObjectId(gold.id), status: { $in: OWNED_STATUSES }, ...itemScope(ctx.scope) } },
    { $group: { _id: "$status", quantity: { $sum: "$quantity" }, grossWeight: { $sum: "$grossWeight" }, fineWeight: { $sum: "$fineWeight" } } },
  ]);
  const STATUS_LABELS: Record<string, string> = { AVAILABLE: "Available", RESERVED: "Reserved", RETURNED: "Returned", DAMAGED: "Damaged", UNDER_REPAIR: "Under repair", IN_MANUFACTURING: "In manufacturing", WITH_JOB_WORKER: "With job worker", IN_TRANSIT: "In transit", HALLMARKING: "At hallmarking", SCRAP: "Scrap" };
  const out = rows.map((r) => ({ statusLabel: STATUS_LABELS[r._id] ?? r._id, quantity: r.quantity, grossWeight: weight3(r.grossWeight), fineWeight: weight3(r.fineWeight) })).sort((a, b) => b.fineWeight - a.fineWeight);
  const totalFine = out.reduce((s, r) => s + r.fineWeight, 0);
  const start = (ctx.page - 1) * ctx.pageSize;
  return { key: "gold-fine-balance", title: "", columns: [], rows: out.slice(start, start + ctx.pageSize), summary: [{ label: "Total fine gold", value: weight3(totalFine), format: "weight" }], page: ctx.page, pageSize: ctx.pageSize, total: out.length, scope: {} };
}
