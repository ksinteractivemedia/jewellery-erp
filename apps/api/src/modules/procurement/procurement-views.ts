import type { Types } from "mongoose";
import type { GoodsReceipt, PurchaseHistoryEntry, PurchaseOrder, PurchaseRequisition, SupplierInvoice, SupplierPayment, SupplierPaymentAllocationView } from "@jewellery/types";
import { toDTO } from "../../shared/to-dto";
import type { GoodsReceiptAttrs, PurchaseLineAttrs, PurchaseOrderAttrs, PurchaseRequisitionAttrs, SupplierInvoiceAttrs, SupplierInvoiceLineAttrs, SupplierPaymentAttrs } from "./procurement.models";

const id = (v: unknown) => String(v);
/** A `.lean()` read gives `_id`; a `.toObject()` read (via `toDTO`) already renamed it to `id`. Handles either. */
const docId = (d: { _id?: unknown; id?: unknown }) => String(d.id ?? d._id);
export const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString());

type WithId<T> = T & { _id: Types.ObjectId; id?: string; createdAt: Date; updatedAt?: Date };

const historyView = (h: { status: string; at: Date; by: Types.ObjectId; byName?: string; note?: string }[]): PurchaseHistoryEntry[] =>
  h.map((e) => ({ status: e.status, at: iso(e.at), by: id(e.by), ...(e.byName ? { byName: e.byName } : {}), ...(e.note ? { note: e.note } : {}) }));

const lineView = (l: PurchaseLineAttrs) => ({
  purchaseType: l.purchaseType,
  description: l.description,
  ...(l.productId ? { productId: id(l.productId) } : {}),
  ...(l.variantId ? { variantId: id(l.variantId) } : {}),
  ...(l.metalId ? { metalId: id(l.metalId) } : {}),
  ...(l.purity ? { purity: l.purity } : {}),
  ...(l.fineness !== undefined ? { fineness: l.fineness } : {}),
  quantity: l.quantity,
  ...(l.grossWeight !== undefined ? { grossWeight: l.grossWeight } : {}),
  ...(l.ratePerGram !== undefined ? { ratePerGram: l.ratePerGram } : {}),
  ...(l.ratePerUnit !== undefined ? { ratePerUnit: l.ratePerUnit } : {}),
  value: l.value,
  ...(l.lotNumber ? { lotNumber: l.lotNumber } : {}),
  ...(l.notes ? { notes: l.notes } : {}),
  receivedQuantity: l.receivedQuantity,
  receivedGrossWeight: l.receivedGrossWeight,
});
const invoiceLineView = (l: SupplierInvoiceLineAttrs) => {
  const { receivedQuantity: _r, receivedGrossWeight: _g, ...rest } = lineView({ ...l, receivedQuantity: 0, receivedGrossWeight: 0 });
  void _r; void _g;
  return rest;
};

export function requisitionView(d: WithId<PurchaseRequisitionAttrs>): PurchaseRequisition {
  return {
    id: docId(d),
    prNo: d.prNo,
    status: d.status,
    requestedBy: { id: id(d.requestedById), name: d.requestedByName },
    ...(d.department ? { department: d.department } : {}),
    reason: d.reason,
    lines: d.lines.map(lineView),
    totals: d.totals,
    ...(d.purchaseOrderId ? { purchaseOrderId: id(d.purchaseOrderId) } : {}),
    ...(d.rejectedReason ? { rejectedReason: d.rejectedReason } : {}),
    history: historyView(d.history),
    createdAt: iso(d.createdAt),
  };
}

export function purchaseOrderView(d: WithId<PurchaseOrderAttrs>): PurchaseOrder {
  return {
    id: docId(d),
    poNo: d.poNo,
    status: d.status,
    supplier: { id: id(d.supplierId), name: d.supplierName, ...(d.supplierGstin ? { gstin: d.supplierGstin } : {}) },
    ...(d.requisitionId ? { requisitionId: id(d.requisitionId) } : {}),
    lines: d.lines.map(lineView),
    totals: d.totals,
    deliveryLocation: { id: id(d.deliveryLocationId), name: d.deliveryLocationName },
    ...(d.billingAddress ? { billingAddress: d.billingAddress as PurchaseOrder["billingAddress"] } : {}),
    ...(d.expectedDeliveryDate ? { expectedDeliveryDate: d.expectedDeliveryDate } : {}),
    ...(d.notes ? { notes: d.notes } : {}),
    ...(d.approvedAt ? { approvedAt: iso(d.approvedAt) } : {}),
    ...(d.approvedByName ? { approvedByName: d.approvedByName } : {}),
    ...(d.rejectedReason ? { rejectedReason: d.rejectedReason } : {}),
    ...(d.cancelledReason ? { cancelledReason: d.cancelledReason } : {}),
    goodsReceiptIds: d.goodsReceiptIds.map(id),
    supplierInvoiceIds: d.supplierInvoiceIds.map(id),
    history: historyView(d.history),
    createdAt: iso(d.createdAt),
  };
}

export function goodsReceiptView(d: WithId<GoodsReceiptAttrs>): GoodsReceipt {
  return {
    id: docId(d),
    grnNo: d.grnNo,
    purchaseOrderId: id(d.purchaseOrderId),
    poNo: d.poNo,
    supplier: { id: id(d.supplierId), name: d.supplierName },
    receivedDate: d.receivedDate,
    lines: d.lines.map((l) => ({
      purchaseOrderLineIndex: l.purchaseOrderLineIndex,
      purchaseType: l.purchaseType,
      description: l.description,
      ...(l.metalId ? { metalId: id(l.metalId) } : {}),
      ...(l.purity ? { purity: l.purity } : {}),
      ...(l.fineness !== undefined ? { fineness: l.fineness } : {}),
      quantity: l.quantity,
      ...(l.grossWeight !== undefined ? { grossWeight: l.grossWeight } : {}),
      ...(l.expectedGrossWeight !== undefined ? { expectedGrossWeight: l.expectedGrossWeight } : {}),
      ...(l.fineWeight !== undefined ? { fineWeight: l.fineWeight } : {}),
      ...(l.ratePerGram !== undefined ? { ratePerGram: l.ratePerGram } : {}),
      ...(l.ratePerUnit !== undefined ? { ratePerUnit: l.ratePerUnit } : {}),
      value: l.value,
      ...(l.lotNumber ? { lotNumber: l.lotNumber } : {}),
      locationId: id(l.locationId),
      hasWeightDiscrepancy: l.hasWeightDiscrepancy,
      ...(l.variancePercent !== undefined ? { variancePercent: l.variancePercent } : {}),
      ...(l.discrepancyNote ? { discrepancyNote: l.discrepancyNote } : {}),
      inventoryItemIds: l.inventoryItemIds.map(id),
    })),
    ...(d.notes ? { notes: d.notes } : {}),
    ...(d.receivedByName ? { receivedByName: d.receivedByName } : {}),
    createdAt: iso(d.createdAt),
  };
}

export function supplierInvoiceView(d: WithId<SupplierInvoiceAttrs>, paid = 0): SupplierInvoice {
  const total = d.totals.total;
  const status = d.cancelledAt ? "CANCELLED" : paid <= 0 ? "UNPAID" : paid < total ? "PARTIALLY_PAID" : "PAID";
  return {
    id: docId(d),
    supplierInvoiceNo: d.supplierInvoiceNo,
    status,
    supplier: { id: id(d.supplierId), name: d.supplierName, ...(d.supplierGstin ? { gstin: d.supplierGstin } : {}) },
    ...(d.purchaseOrderId ? { purchaseOrderId: id(d.purchaseOrderId) } : {}),
    ...(d.poNo ? { poNo: d.poNo } : {}),
    goodsReceiptIds: d.goodsReceiptIds.map(id),
    invoiceDate: d.invoiceDate,
    dueDate: d.dueDate,
    lines: d.lines.map(invoiceLineView),
    totals: d.totals,
    paid,
    balance: Math.max(total - paid, 0),
    ...(d.cancelledReason ? { cancelledReason: d.cancelledReason } : {}),
    history: historyView(d.history),
    createdAt: iso(d.createdAt),
  };
}

export function supplierPaymentView(d: WithId<SupplierPaymentAttrs>, allocations: SupplierPaymentAllocationView[]): SupplierPayment {
  const allocated = allocations.reduce((s, a) => s + a.amount, 0);
  return {
    id: docId(d),
    paymentNo: d.paymentNo,
    status: d.status,
    supplier: { id: id(d.supplierId), name: d.supplierName },
    method: d.method,
    amount: d.amount,
    unallocated: d.status === "REVERSED" ? 0 : d.amount - allocated,
    paidDate: d.paidDate,
    ...(d.reference ? { reference: d.reference } : {}),
    ...(d.bankName ? { bankName: d.bankName } : {}),
    ...(d.notes ? { notes: d.notes } : {}),
    ...(d.recordedByName ? { recordedByName: d.recordedByName } : {}),
    ...(d.reversedReason ? { reversedReason: d.reversedReason } : {}),
    allocations,
    createdAt: iso(d.createdAt),
  };
}

export { toDTO };
