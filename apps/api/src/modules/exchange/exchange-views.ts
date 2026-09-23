import type { Types } from "mongoose";
import type { Exchange, ExchangeHistoryEntry, OldJewelleryAssessment } from "@jewellery/types";
import type { ExchangeAttrs, NewProductAttrs, OldJewelleryAssessmentAttrs } from "./exchange.models";

const id = (v: unknown) => String(v);
const docId = (d: { _id?: unknown; id?: unknown }) => String(d.id ?? d._id);
export const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString());

type WithId<T> = T & { _id: Types.ObjectId; id?: string; createdAt: Date };

const historyView = (h: { status: string; at: Date; by: Types.ObjectId; byName?: string; note?: string }[]): ExchangeHistoryEntry[] =>
  h.map((e) => ({ status: e.status, at: iso(e.at), by: id(e.by), ...(e.byName ? { byName: e.byName } : {}), ...(e.note ? { note: e.note } : {}) }));

const assessmentView = (a: OldJewelleryAssessmentAttrs): OldJewelleryAssessment => ({
  description: a.description,
  metalId: id(a.metalId),
  metalName: a.metalName,
  ...(a.claimedPurity ? { claimedPurity: a.claimedPurity } : {}),
  grossWeight: a.grossWeight,
  stoneWeight: a.stoneWeight,
  netWeight: a.netWeight,
  assessedPurity: a.assessedPurity,
  assessedFineness: a.assessedFineness,
  fineWeight: a.fineWeight,
  ratePerGram: a.ratePerGram,
  deduction: a.deduction,
  valuation: a.valuation,
  ...(a.notes ? { notes: a.notes } : {}),
});

const newProductView = (n: NewProductAttrs): NonNullable<Exchange["newProduct"]> => ({
  productId: id(n.productId),
  ...(n.variantId ? { variantId: id(n.variantId) } : {}),
  sku: n.sku,
  name: n.name,
  quantity: n.quantity,
  unitPrice: n.unitPrice,
  lineTotal: n.lineTotal,
});

export function exchangeView(d: WithId<ExchangeAttrs>): Exchange {
  return {
    id: docId(d),
    exchangeNo: d.exchangeNo,
    status: d.status,
    customer: { ...(d.customer.id ? { id: id(d.customer.id) } : {}), name: d.customer.name, ...(d.customer.phone ? { phone: d.customer.phone } : {}), ...(d.customer.email ? { email: d.customer.email } : {}) },
    oldJewellery: assessmentView(d.oldJewellery),
    ...(d.newProduct ? { newProduct: newProductView(d.newProduct) } : {}),
    ...(d.oldItemId ? { oldItemId: id(d.oldItemId) } : {}),
    ...(d.orderId ? { orderId: id(d.orderId) } : {}),
    ...(d.orderNo ? { orderNo: d.orderNo } : {}),
    ...(d.settlement
      ? {
          settlement: {
            difference: d.settlement.difference,
            ...(d.settlement.method ? { method: d.settlement.method } : {}),
            ...(d.settlement.reference ? { reference: d.settlement.reference } : {}),
            ...(d.settlement.note ? { note: d.settlement.note } : {}),
            recordedAt: iso(d.settlement.recordedAt),
            ...(d.settlement.recordedByName ? { recordedByName: d.settlement.recordedByName } : {}),
          },
        }
      : {}),
    ...(d.notes ? { notes: d.notes } : {}),
    history: historyView(d.history),
    createdAt: iso(d.createdAt),
  };
}
