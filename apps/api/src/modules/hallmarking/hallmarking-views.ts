import type { Types } from "mongoose";
import type { AssayingCentre, HallmarkingBatch, HallmarkingHistoryEntry, HallmarkingLine } from "@jewellery/types";
import type { AssayingCentreAttrs, HallmarkingBatchAttrs, HallmarkingLineAttrs } from "./hallmarking.models";

const id = (v: unknown) => String(v);
const docId = (d: { _id?: unknown; id?: unknown }) => String(d.id ?? d._id);
export const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString());

type WithId<T> = T & { _id: Types.ObjectId; id?: string; createdAt: Date };

export function assayingCentreView(d: WithId<AssayingCentreAttrs>): AssayingCentre {
  return {
    id: docId(d),
    name: d.name,
    code: d.code,
    ...(d.bisRegistrationNumber ? { bisRegistrationNumber: d.bisRegistrationNumber } : {}),
    locationId: id(d.locationId),
    locationName: d.locationName,
    ...(d.address ? { address: d.address as AssayingCentre["address"] } : {}),
    ...(d.contactPhone ? { contactPhone: d.contactPhone } : {}),
    ...(d.contactEmail ? { contactEmail: d.contactEmail } : {}),
    isActive: d.isActive,
  };
}

const historyView = (h: { status: string; at: Date; by: Types.ObjectId; byName?: string; note?: string }[]): HallmarkingHistoryEntry[] =>
  h.map((e) => ({ status: e.status, at: iso(e.at), by: id(e.by), ...(e.byName ? { byName: e.byName } : {}), ...(e.note ? { note: e.note } : {}) }));

const lineView = (l: HallmarkingLineAttrs, batchStatus: HallmarkingBatchAttrs["status"]): HallmarkingLine => ({
  itemId: id(l.itemId),
  itemCode: l.itemCode,
  purity: l.purity,
  grossWeight: l.grossWeight,
  fromLocationId: id(l.fromLocationId),
  ...(l.huid ? { huid: l.huid } : {}),
  ...(l.certificateNumber ? { certificateNumber: l.certificateNumber } : {}),
  ...(l.hallmarkDate ? { hallmarkDate: l.hallmarkDate } : {}),
  ...(l.outcome ? { outcome: l.outcome } : {}),
  ...(l.failureReason ? { failureReason: l.failureReason } : {}),
  // Where the piece actually stands: its own outcome once it has one, otherwise the shipment's shared stage.
  effectiveStatus: l.outcome ?? batchStatus,
});

export function hallmarkingBatchView(d: WithId<HallmarkingBatchAttrs>): HallmarkingBatch {
  return {
    id: docId(d),
    hallmarkingNo: d.hallmarkingNo,
    status: d.status,
    assayingCentre: { id: id(d.assayingCentreId), name: d.assayingCentreName },
    ...(d.sentDate ? { sentDate: d.sentDate } : {}),
    ...(d.expectedReturnDate ? { expectedReturnDate: d.expectedReturnDate } : {}),
    ...(d.notes ? { notes: d.notes } : {}),
    lines: d.lines.map((l) => lineView(l, d.status)),
    history: historyView(d.history),
    createdAt: iso(d.createdAt),
  };
}
