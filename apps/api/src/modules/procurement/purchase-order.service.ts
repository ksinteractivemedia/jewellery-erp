import type { PurchaseOrder } from "@jewellery/types";
import type { CreateSupplierPurchaseOrderInput } from "@jewellery/validation";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { requireLocationById } from "../organization/location.repository";
import { requireSupplierById } from "../suppliers/supplier.repository";
import { buildPurchaseLine, totalsOf } from "./procurement-core";
import { purchaseOrderView } from "./procurement-views";
import { applyPo, audit, nextNo, oid, type Actor } from "./procurement-store";
import { PurchaseOrderModel, type PurchaseOrderDocument } from "./procurement.models";
import { markRequisitionConverted, requireRequisition } from "./requisition.service";

async function buildLines(input: CreateSupplierPurchaseOrderInput["lines"]) {
  return Promise.all(input.map((l) => buildPurchaseLine(l)));
}

/** Creates a purchase order, optionally against an APPROVED requisition (which it then marks CONVERTED). */
export async function createPurchaseOrder(actor: Actor, input: CreateSupplierPurchaseOrderInput): Promise<PurchaseOrder> {
  const supplier = await requireSupplierById(input.supplierId);
  const location = await requireLocationById(input.deliveryLocationId);
  if (input.requisitionId) {
    const pr = await requireRequisition(input.requisitionId);
    if (pr.status !== "APPROVED") throw new ConflictError(`Requisition ${pr.prNo} must be approved before it can become a purchase order (it is ${pr.status.toLowerCase()}).`);
  }
  const lines = await buildLines(input.lines);
  const now = new Date();
  const status = input.submit ? "SUBMITTED" : "DRAFT";
  const doc = await PurchaseOrderModel.create({
    poNo: await nextNo("SPO"),
    status,
    supplierId: oid(input.supplierId),
    supplierName: supplier.name,
    ...(supplier.gstin ? { supplierGstin: supplier.gstin } : {}),
    ...(input.requisitionId ? { requisitionId: oid(input.requisitionId) } : {}),
    lines,
    totals: totalsOf(lines),
    deliveryLocationId: oid(input.deliveryLocationId),
    deliveryLocationName: location.name,
    ...(input.billingAddress ? { billingAddress: input.billingAddress } : {}),
    ...(input.expectedDeliveryDate ? { expectedDeliveryDate: input.expectedDeliveryDate } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    history: [{ status, at: now, by: oid(actor.id), byName: actor.name }],
  });
  if (input.requisitionId) await markRequisitionConverted(input.requisitionId, actor, doc.id);
  return purchaseOrderView(doc.toObject());
}

/** Replaces a DRAFT PO's lines/terms wholesale, re-priced. Refused once submitted. */
export async function updateDraftPurchaseOrder(poId: string, actor: Actor, input: CreateSupplierPurchaseOrderInput): Promise<PurchaseOrder> {
  const po = await PurchaseOrderModel.findById(poId);
  if (!po) throw new NotFoundError("Purchase order", poId);
  if (po.status !== "DRAFT") throw new ConflictError("Only a draft purchase order can be edited.");
  const supplier = await requireSupplierById(input.supplierId);
  const location = await requireLocationById(input.deliveryLocationId);
  const lines = await buildLines(input.lines);
  po.set({
    supplierId: oid(input.supplierId),
    supplierName: supplier.name,
    supplierGstin: supplier.gstin,
    lines,
    totals: totalsOf(lines),
    deliveryLocationId: oid(input.deliveryLocationId),
    deliveryLocationName: location.name,
    billingAddress: input.billingAddress,
    expectedDeliveryDate: input.expectedDeliveryDate,
    notes: input.notes,
    ...(input.submit ? { status: "SUBMITTED" } : {}),
  });
  if (input.submit) po.history.push({ status: "SUBMITTED", at: new Date(), by: oid(actor.id), byName: actor.name });
  await po.save();
  return purchaseOrderView(po.toObject());
}

export async function submitPurchaseOrder(poId: string, actor: Actor): Promise<PurchaseOrder> {
  const updated = await applyPo(poId, "submit", actor);
  if (!updated) throw new NotFoundError("Purchase order", poId);
  return purchaseOrderView(updated.toObject());
}

export async function approvePurchaseOrder(poId: string, actor: Actor, note?: string): Promise<PurchaseOrder> {
  const updated = await applyPo(poId, "approve", actor, { note, set: { approvedAt: new Date(), approvedByName: actor.name } });
  if (!updated) throw new NotFoundError("Purchase order", poId);
  await audit(actor, AUDIT_ACTIONS.PROCUREMENT_PO_APPROVED, "PurchaseOrder", updated.id, { poNo: updated.poNo, total: updated.totals.total, supplier: updated.supplierName });
  return purchaseOrderView(updated.toObject());
}

/** Withdraws a PO before receipt, or closes out what remains of a partially-received one — what already arrived stands (its goods receipts and inventory are not touched). */
export async function cancelPurchaseOrder(poId: string, actor: Actor, reason?: string): Promise<PurchaseOrder> {
  const from = (await requirePurchaseOrder(poId)).status;
  const updated = await applyPo(poId, "cancel", actor, { note: reason, set: reason ? { cancelledReason: reason } : {} });
  if (!updated) throw new NotFoundError("Purchase order", poId);
  await audit(actor, AUDIT_ACTIONS.PROCUREMENT_PO_CANCELLED, "PurchaseOrder", updated.id, { poNo: updated.poNo, reason, from });
  return purchaseOrderView(updated.toObject());
}

export async function requirePurchaseOrder(poId: string): Promise<PurchaseOrderDocument> {
  const doc = await PurchaseOrderModel.findById(poId);
  if (!doc) throw new NotFoundError("Purchase order", poId);
  return doc;
}

export async function getPurchaseOrder(poId: string): Promise<PurchaseOrder> {
  return purchaseOrderView((await requirePurchaseOrder(poId)).toObject());
}

export async function listPurchaseOrders(filter: { status?: string; supplierId?: string; q?: string } = {}): Promise<PurchaseOrder[]> {
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = { $in: filter.status.split(",") };
  if (filter.supplierId) query.supplierId = oid(filter.supplierId);
  if (filter.q) query.$or = [{ poNo: new RegExp(filter.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, { supplierName: new RegExp(filter.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }];
  const docs = await PurchaseOrderModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
  return docs.map((d) => purchaseOrderView(d as never));
}
