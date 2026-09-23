import type { PurchaseRequisition } from "@jewellery/types";
import type { CreateRequisitionInput } from "@jewellery/validation";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { buildPurchaseLine, totalsOf } from "./procurement-core";
import { requisitionView } from "./procurement-views";
import { applyRequisition, audit, nextNo, oid, type Actor } from "./procurement-store";
import { PurchaseRequisitionModel, type PurchaseRequisitionDocument } from "./procurement.models";

async function buildLines(input: CreateRequisitionInput["lines"]) {
  return Promise.all(input.map((l) => buildPurchaseLine(l)));
}

/** Saves a new requisition. `submit: false` leaves it as an editable DRAFT; `submit: true` sends it straight for approval. */
export async function createRequisition(actor: Actor, input: CreateRequisitionInput): Promise<PurchaseRequisition> {
  const lines = await buildLines(input.lines);
  const now = new Date();
  const doc = await PurchaseRequisitionModel.create({
    prNo: await nextNo("PR"),
    status: input.submit ? "SUBMITTED" : "DRAFT",
    requestedById: oid(actor.id),
    requestedByName: actor.name,
    ...(input.department ? { department: input.department } : {}),
    reason: input.reason,
    lines,
    totals: totalsOf(lines),
    history: [{ status: input.submit ? "SUBMITTED" : "DRAFT", at: now, by: oid(actor.id), byName: actor.name }],
  });
  return requisitionView(doc.toObject());
}

/** Replaces a DRAFT requisition's lines/reason wholesale — the same shape as a create, re-priced. Refused once submitted. */
export async function updateDraftRequisition(prId: string, actor: Actor, input: CreateRequisitionInput): Promise<PurchaseRequisition> {
  const pr = await PurchaseRequisitionModel.findById(prId);
  if (!pr) throw new NotFoundError("Purchase requisition", prId);
  if (pr.status !== "DRAFT") throw new ConflictError("Only a draft requisition can be edited.");
  const lines = await buildLines(input.lines);
  pr.set({ department: input.department, reason: input.reason, lines, totals: totalsOf(lines), ...(input.submit ? { status: "SUBMITTED" } : {}) });
  if (input.submit) pr.history.push({ status: "SUBMITTED", at: new Date(), by: oid(actor.id), byName: actor.name });
  await pr.save();
  return requisitionView(pr.toObject());
}

export async function submitRequisition(prId: string, actor: Actor): Promise<PurchaseRequisition> {
  const updated = await applyRequisition(prId, "submit", actor);
  if (!updated) throw new NotFoundError("Purchase requisition", prId);
  return requisitionView(updated.toObject());
}

export async function approveRequisition(prId: string, actor: Actor, note?: string): Promise<PurchaseRequisition> {
  const updated = await applyRequisition(prId, "approve", actor, { note });
  if (!updated) throw new NotFoundError("Purchase requisition", prId);
  await audit(actor, AUDIT_ACTIONS.PROCUREMENT_REQUISITION_APPROVED, "PurchaseRequisition", updated.id, { prNo: updated.prNo, total: updated.totals.total });
  return requisitionView(updated.toObject());
}

export async function rejectRequisition(prId: string, actor: Actor, reason: string): Promise<PurchaseRequisition> {
  const updated = await applyRequisition(prId, "reject", actor, { note: reason, set: { rejectedReason: reason } });
  if (!updated) throw new NotFoundError("Purchase requisition", prId);
  await audit(actor, AUDIT_ACTIONS.PROCUREMENT_REQUISITION_REJECTED, "PurchaseRequisition", updated.id, { prNo: updated.prNo, reason });
  return requisitionView(updated.toObject());
}

export async function cancelRequisition(prId: string, actor: Actor, reason?: string): Promise<PurchaseRequisition> {
  const updated = await applyRequisition(prId, "cancel", actor, { note: reason });
  if (!updated) throw new NotFoundError("Purchase requisition", prId);
  await audit(actor, AUDIT_ACTIONS.PROCUREMENT_REQUISITION_CANCELLED, "PurchaseRequisition", updated.id, { prNo: updated.prNo, reason });
  return requisitionView(updated.toObject());
}

/** Marks a requisition CONVERTED and links it to the purchase order made from it. Called by purchase-order.service when a PO names a requisitionId. */
export async function markRequisitionConverted(prId: string, actor: Actor, purchaseOrderId: string): Promise<void> {
  const updated = await applyRequisition(prId, "convert", actor, { set: { purchaseOrderId: oid(purchaseOrderId) } });
  if (!updated) throw new NotFoundError("Purchase requisition", prId);
}

export async function requireRequisition(prId: string): Promise<PurchaseRequisitionDocument> {
  const doc = await PurchaseRequisitionModel.findById(prId);
  if (!doc) throw new NotFoundError("Purchase requisition", prId);
  return doc;
}

export async function getRequisition(prId: string): Promise<PurchaseRequisition> {
  return requisitionView((await requireRequisition(prId)).toObject());
}

export async function listRequisitions(filter: { status?: string } = {}): Promise<PurchaseRequisition[]> {
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = { $in: filter.status.split(",") };
  const docs = await PurchaseRequisitionModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
  return docs.map((d) => requisitionView(d as never));
}
