import type { Types } from "mongoose";
import type { RepairHistoryEntry, RepairOrder } from "@jewellery/types";
import type { RepairOrderAttrs } from "./repair.models";

const id = (v: unknown) => String(v);
const docId = (d: { _id?: unknown; id?: unknown }) => String(d.id ?? d._id);
export const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString());

type WithId<T> = T & { _id: Types.ObjectId; id?: string; createdAt: Date };

const historyView = (h: { status: string; at: Date; by: Types.ObjectId; byName?: string; note?: string }[]): RepairHistoryEntry[] =>
  h.map((e) => ({ status: e.status, at: iso(e.at), by: id(e.by), ...(e.byName ? { byName: e.byName } : {}), ...(e.note ? { note: e.note } : {}) }));

/** Before APPROVED (work hasn't started) or QC_FAILED (needs a decision) — UX only; the API decides for real. */
const canCancel = (status: RepairOrderAttrs["status"]) => !["READY", "DELIVERED", "DECLINED", "CANCELLED"].includes(status);

export function repairOrderView(d: WithId<RepairOrderAttrs>): RepairOrder {
  return {
    id: docId(d),
    repairNo: d.repairNo,
    status: d.status,
    customer: { ...(d.customer.id ? { id: id(d.customer.id) } : {}), name: d.customer.name, phone: d.customer.phone, ...(d.customer.email ? { email: d.customer.email } : {}) },
    itemId: id(d.itemId),
    itemCode: d.itemCode,
    itemDescription: d.itemDescription,
    ...(d.metalId ? { metalId: id(d.metalId) } : {}),
    ...(d.purity ? { purity: d.purity } : {}),
    ...(d.huid ? { huid: d.huid } : {}),
    ...(d.beforeWeight ? { beforeWeight: { grossWeight: d.beforeWeight.grossWeight, stoneWeight: d.beforeWeight.stoneWeight, netWeight: d.beforeWeight.netWeight, at: iso(d.beforeWeight.at) } } : {}),
    ...(d.afterWeight ? { afterWeight: { grossWeight: d.afterWeight.grossWeight, stoneWeight: d.afterWeight.stoneWeight, netWeight: d.afterWeight.netWeight, at: iso(d.afterWeight.at) } } : {}),
    ...(d.stoneWork ? { stoneWork: d.stoneWork } : {}),
    ...(d.inspectionNotes ? { inspectionNotes: d.inspectionNotes } : {}),
    ...(d.estimate
      ? { estimate: { labourCharge: d.estimate.labourCharge, materialsCharge: d.estimate.materialsCharge, otherCharges: d.estimate.otherCharges, total: d.estimate.total, ...(d.estimate.notes ? { notes: d.estimate.notes } : {}), estimatedAt: iso(d.estimate.estimatedAt), ...(d.estimate.estimatedByName ? { estimatedByName: d.estimate.estimatedByName } : {}) } }
      : {}),
    ...(d.approval ? { approval: { approved: d.approval.approved, at: iso(d.approval.at), ...(d.approval.byName ? { byName: d.approval.byName } : {}), ...(d.approval.note ? { note: d.approval.note } : {}) } } : {}),
    ...(d.finalCharges ? { finalCharges: { labourCharge: d.finalCharges.labourCharge, materialsCharge: d.finalCharges.materialsCharge, otherCharges: d.finalCharges.otherCharges, total: d.finalCharges.total } } : {}),
    ...(d.qc ? { qc: { result: d.qc.result, ...(d.qc.notes ? { notes: d.qc.notes } : {}), at: iso(d.qc.at), ...(d.qc.byName ? { byName: d.qc.byName } : {}) } } : {}),
    ...(d.dueDate ? { dueDate: d.dueDate } : {}),
    ...(d.readyAt ? { readyAt: iso(d.readyAt) } : {}),
    ...(d.deliveredAt ? { deliveredAt: iso(d.deliveredAt) } : {}),
    history: historyView(d.history),
    createdAt: iso(d.createdAt),
    canCancel: canCancel(d.status),
  };
}
