import type { B2BPaymentStatus, PurchaseOrderStatus, SalesOrderStatus } from "@jewellery/types";
import { ConflictError } from "../../shared/errors";

/**
 * Lifecycles as data (business-rules.md §12). PO: the customer's request; SALES ORDER: the seller's commitment, which is
 * where credit is enforced and stock is allocated; invoice/payment states are derived from money actually verified.
 */
export const PO_TRANSITIONS: Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["UNDER_REVIEW", "QUOTED", "APPROVED", "REJECTED", "CANCELLED"],
  UNDER_REVIEW: ["QUOTED", "APPROVED", "REJECTED", "CANCELLED"],
  QUOTED: ["QUOTED", "NEGOTIATING", "APPROVED", "REJECTED", "CANCELLED"], // QUOTED→QUOTED: the seller revises
  NEGOTIATING: ["QUOTED", "REJECTED", "CANCELLED"],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};
export const SO_TRANSITIONS: Record<SalesOrderStatus, readonly SalesOrderStatus[]> = {
  PENDING_CREDIT_APPROVAL: ["APPROVED", "CANCELLED"],
  APPROVED: ["ALLOCATED", "CANCELLED"],
  ALLOCATED: ["INVOICED", "APPROVED", "CANCELLED"], // ALLOCATED→APPROVED: stock released to be re-allocated
  INVOICED: [],
  CANCELLED: [],
};
/** A payment is verified once; a verified one can later be reversed (a cheque that bounced). */
export const PAYMENT_TRANSITIONS: Record<B2BPaymentStatus, readonly B2BPaymentStatus[]> = {
  PENDING_VERIFICATION: ["VERIFIED", "REJECTED"],
  VERIFIED: ["REVERSED"],
  REJECTED: [],
  REVERSED: [],
};

export class IllegalB2BTransitionError extends ConflictError {
  constructor(kind: string, from: string, to: string) {
    super(`a ${kind} cannot go from ${from} to ${to}`);
  }
}
const check = <S extends string>(kind: string, graph: Record<S, readonly S[]>, from: S, to: S) => {
  if (!graph[from].includes(to)) throw new IllegalB2BTransitionError(kind, from, to);
};
export const assertPoTransition = (from: PurchaseOrderStatus, to: PurchaseOrderStatus) => check("purchase order", PO_TRANSITIONS, from, to);
export const assertSoTransition = (from: SalesOrderStatus, to: SalesOrderStatus) => check("sales order", SO_TRANSITIONS, from, to);
export const assertPaymentTransition = (from: B2BPaymentStatus, to: B2BPaymentStatus) => check("payment", PAYMENT_TRANSITIONS, from, to);
