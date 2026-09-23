import type { Types } from "mongoose";
import type { Return, ReturnHistoryEntry, ReturnLine } from "@jewellery/types";
import type { ReturnAttrs, ReturnLineAttrs } from "./returns.models";

const id = (v: unknown) => String(v);
const docId = (d: { _id?: unknown; id?: unknown }) => String(d.id ?? d._id);
export const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString());

type WithId<T> = T & { _id: Types.ObjectId; id?: string; createdAt: Date };

const historyView = (h: { status: string; at: Date; by: Types.ObjectId; byName?: string; note?: string }[]): ReturnHistoryEntry[] =>
  h.map((e) => ({ status: e.status, at: iso(e.at), by: id(e.by), ...(e.byName ? { byName: e.byName } : {}), ...(e.note ? { note: e.note } : {}) }));

const lineView = (l: ReturnLineAttrs): ReturnLine => ({
  itemId: id(l.itemId),
  itemCode: l.itemCode,
  sku: l.sku,
  name: l.name,
  orderLineRef: l.orderLineRef,
  ...(l.huid ? { huid: l.huid } : {}),
  grossWeight: l.grossWeight,
  unitPrice: l.unitPrice,
  ...(l.weightDiscrepancyNote ? { weightDiscrepancyNote: l.weightDiscrepancyNote } : {}),
  ...(l.condition ? { condition: l.condition } : {}),
  ...(l.conditionNote ? { conditionNote: l.conditionNote } : {}),
});

/** REQUESTED/APPROVED only — once RECEIVED there is stock in flux and the return must be seen through. UX only; the API decides for real. */
const canCancel = (status: ReturnAttrs["status"]) => status === "REQUESTED" || status === "APPROVED";

export function returnView(d: WithId<ReturnAttrs>): Return {
  return {
    id: docId(d),
    returnNo: d.returnNo,
    channel: d.channel,
    status: d.status,
    orderId: id(d.orderId),
    orderNo: d.orderNo,
    customer: { ...(d.customer.id ? { id: id(d.customer.id) } : {}), name: d.customer.name, ...(d.customer.email ? { email: d.customer.email } : {}), ...(d.customer.phone ? { phone: d.customer.phone } : {}) },
    reason: d.reason,
    ...(d.reasonNote ? { reasonNote: d.reasonNote } : {}),
    lines: d.lines.map(lineView),
    ...(d.rejectedReason ? { rejectedReason: d.rejectedReason } : {}),
    ...(d.receivedAt ? { receivedAt: iso(d.receivedAt) } : {}),
    ...(d.inspectedAt ? { inspectedAt: iso(d.inspectedAt) } : {}),
    ...(d.settlement
      ? {
          settlement: {
            method: d.settlement.method,
            amount: d.settlement.amount,
            ...(d.settlement.reference ? { reference: d.settlement.reference } : {}),
            ...(d.settlement.note ? { note: d.settlement.note } : {}),
            recordedAt: iso(d.settlement.recordedAt),
            ...(d.settlement.recordedByName ? { recordedByName: d.settlement.recordedByName } : {}),
          },
        }
      : {}),
    refundableTotal: d.refundableTotal,
    history: historyView(d.history),
    createdAt: iso(d.createdAt),
    canCancel: canCancel(d.status),
  };
}
