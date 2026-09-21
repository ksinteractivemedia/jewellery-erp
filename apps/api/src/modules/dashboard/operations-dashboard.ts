import type { DashboardAlert, InventoryStatus, OperationsDashboard, OperationsQueue, QueueRow, TransferQueueRow } from "@jewellery/types";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import { InventoryLedgerModel } from "../inventory/inventory-ledger.model";
import { StockAdjustmentModel } from "../inventory/stock-adjustment.model";
import { StockTransferModel } from "../inventory/stock-transfer.model";
import { ProductModel } from "../catalog/product.model";
import { LocationModel } from "../organization/location.model";
import { itemScope, type LocationScope } from "./scope";

/**
 * When something has been waiting long enough to deserve attention. Operational judgement calls rather than
 * compliance data, so they live here in one place — and the response carries them, so the screen states the
 * rule it is applying instead of implying one.
 */
export const ATTENTION_THRESHOLDS = { transitDays: 3, partnerDays: 14 } as const;

const DAY_MS = 86_400_000;
const id = (v: unknown) => String(v);
const daysSince = (at: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - at.getTime()) / DAY_MS));
const QUEUE_ROWS = 5;

async function queue(status: InventoryStatus, scope: LocationScope, now: Date): Promise<OperationsQueue> {
  const cutoff = new Date(now.getTime() - ATTENTION_THRESHOLDS.partnerDays * DAY_MS);
  const [result] = await InventoryItemModel.aggregate<{ total: { n: number }[]; overdue: { n: number }[]; oldest: { _id: unknown; itemCode: string; productId?: unknown; locationId: unknown; since: Date }[] }>([
    { $match: { status, ...itemScope(scope) } },
    // "Since when": the ledger entry that put the piece into this status is its latest one (sequence == ledgerSeq).
    { $lookup: { from: InventoryLedgerModel.collection.name, let: { itemId: "$_id", seq: "$ledgerSeq" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$itemId", "$$itemId"] }, { $eq: ["$sequence", "$$seq"] }] } } }, { $project: { createdAt: 1 } }], as: "last" } },
    { $addFields: { since: { $ifNull: [{ $arrayElemAt: ["$last.createdAt", 0] }, "$updatedAt"] } } },
    { $sort: { since: 1 } },
    { $facet: { total: [{ $count: "n" }], overdue: [{ $match: { since: { $lt: cutoff } } }, { $count: "n" }], oldest: [{ $limit: QUEUE_ROWS }, { $project: { itemCode: 1, productId: 1, locationId: 1, since: 1 } }] } },
  ]);
  const rows = result?.oldest ?? [];
  const [products, locations] = await Promise.all([
    ProductModel.find({ _id: { $in: rows.map((r) => r.productId).filter(Boolean) } }).select("name").lean(),
    LocationModel.find({ _id: { $in: rows.map((r) => r.locationId) } }).select("name").lean(),
  ]);
  const productName = new Map(products.map((p) => [id(p._id), p.name]));
  const locationName = new Map(locations.map((l) => [id(l._id), l.name]));
  return {
    pieces: result?.total[0]?.n ?? 0,
    overdue: result?.overdue[0]?.n ?? 0,
    oldest: rows.map((r): QueueRow => ({ itemId: id(r._id), itemCode: r.itemCode, ...(r.productId ? { productName: productName.get(id(r.productId)) } : {}), location: locationName.get(id(r.locationId)) ?? "Unknown", since: r.since.toISOString(), days: daysSince(r.since, now) })),
  };
}

/** Pieces waiting with job workers, at hallmarking and under repair, and transfers on the road — with how long each has waited. */
export async function loadOperations(scope: LocationScope, now: Date): Promise<OperationsDashboard> {
  const [jobWork, hallmarking, repairs, transfers] = await Promise.all([
    queue("WITH_JOB_WORKER", scope, now),
    queue("HALLMARKING", scope, now),
    queue("UNDER_REPAIR", scope, now),
    StockTransferModel.find({ status: "IN_TRANSIT", ...(scope.locationIds ? { $or: [{ fromLocationId: { $in: scope.locationIds } }, { toLocationId: { $in: scope.locationIds } }] } : {}) }).sort({ dispatchedAt: 1 }).lean(),
  ]);

  const locations = await LocationModel.find({ _id: { $in: transfers.flatMap((t) => [t.fromLocationId, t.toLocationId]) } }).select("name").lean();
  const locationName = new Map(locations.map((l) => [id(l._id), l.name]));
  const cutoff = new Date(now.getTime() - ATTENTION_THRESHOLDS.transitDays * DAY_MS);
  const rows = transfers.map((t): TransferQueueRow => ({
    id: id(t._id),
    transferNo: t.transferNo,
    from: locationName.get(id(t.fromLocationId)) ?? "Unknown",
    to: locationName.get(id(t.toLocationId)) ?? "Unknown",
    pieces: t.lines.filter((l) => l.state === "PENDING").length,
    dispatchedAt: t.dispatchedAt.toISOString(),
    days: daysSince(t.dispatchedAt, now),
  }));

  return {
    jobWork,
    hallmarking,
    repairs,
    transfers: { inTransit: rows.length, pieces: rows.reduce((n, r) => n + r.pieces, 0), overdue: transfers.filter((t) => t.dispatchedAt < cutoff).length, oldest: rows.slice(0, QUEUE_ROWS) },
    thresholds: { ...ATTENTION_THRESHOLDS },
  };
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;

/**
 * What needs a person, drawn from real state: stock corrections waiting on a second approver (some of which
 * can no longer be approved), transfers and partner work that have overrun, reservations that lapsed but still
 * hold stock (no sweep is scheduled yet), returns waiting for inspection and damaged pieces waiting for a decision.
 * An empty list is a real answer — nothing needs attention.
 */
export async function loadAlerts(scope: LocationScope, now: Date): Promise<DashboardAlert[]> {
  const [ops, pendingAdjustments, lapsed, returned, damaged] = await Promise.all([
    loadOperations(scope, now),
    StockAdjustmentModel.find({ status: "PENDING" }).select("itemId expectedLedgerSeq").lean(),
    InventoryItemModel.countDocuments({ status: "RESERVED", "reservation.expiresAt": { $lt: now }, ...itemScope(scope) }),
    InventoryItemModel.countDocuments({ status: "RETURNED", ...itemScope(scope) }),
    InventoryItemModel.countDocuments({ status: "DAMAGED", ...itemScope(scope) }),
  ]);

  // An adjustment belongs to wherever its piece is now; stale = the piece has moved since it was requested.
  const items = await InventoryItemModel.find({ _id: { $in: pendingAdjustments.map((a) => a.itemId) }, ...itemScope(scope) }).select("ledgerSeq").lean();
  const seq = new Map(items.map((i) => [id(i._id), i.ledgerSeq]));
  const inScope = pendingAdjustments.filter((a) => seq.has(id(a.itemId)));
  const stale = inScope.filter((a) => seq.get(id(a.itemId)) !== a.expectedLedgerSeq).length;

  const alerts: DashboardAlert[] = [];
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  if (inScope.length) {
    alerts.push({
      id: "adjustments-pending", severity: stale ? "warning" : "info", count: inScope.length, href: "/inventory/adjustments",
      title: `${plural(inScope.length, "stock adjustment")} awaiting approval`,
      detail: stale ? `${plural(stale, "request")} can no longer be approved — the piece has moved. Reject and raise a new one.` : "A second person must approve before the ledger changes.",
    });
  }
  if (ops.transfers.overdue) {
    alerts.push({ id: "transfers-overdue", severity: "warning", count: ops.transfers.overdue, href: "/inventory/transfers", title: `${plural(ops.transfers.overdue, "transfer")} in transit for over ${ATTENTION_THRESHOLDS.transitDays} days`, detail: "Confirm it arrived and receive it, or find out where it is." });
  }
  const partnerOverdue = ops.jobWork.overdue + ops.hallmarking.overdue + ops.repairs.overdue;
  if (partnerOverdue) {
    const parts = [["job work", ops.jobWork.overdue], ["hallmarking", ops.hallmarking.overdue], ["repair", ops.repairs.overdue]].filter(([, n]) => n) as [string, number][];
    alerts.push({ id: "partner-overdue", severity: "warning", count: partnerOverdue, href: "/inventory/stock?status=WITH_JOB_WORKER,HALLMARKING,UNDER_REPAIR", title: `${plural(partnerOverdue, "piece")} away for over ${ATTENTION_THRESHOLDS.partnerDays} days`, detail: parts.map(([label, n]) => `${label} ${n}`).join(" · ") });
  }
  if (lapsed) {
    alerts.push({ id: "reservations-lapsed", severity: "warning", count: lapsed, href: "/inventory/stock?status=RESERVED", title: `${plural(lapsed, "reservation")} lapsed but still holding stock`, detail: "Release them so the pieces can be sold again." });
  }
  if (returned) {
    alerts.push({ id: "returns-uninspected", severity: "info", count: returned, href: "/inventory/stock?status=RETURNED", title: `${plural(returned, "returned piece")} awaiting inspection`, detail: "Inspect and return them to stock, or mark them damaged." });
  }
  if (damaged) {
    alerts.push({ id: "damaged-pending", severity: "info", count: damaged, href: "/inventory/stock?status=DAMAGED", title: `${plural(damaged, "damaged piece")} awaiting a decision`, detail: "Repair, scrap or melt." });
  }
  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count);
}
