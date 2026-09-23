import { SUPPLIER_PURCHASE_ORDER_STATUSES, PURCHASE_REQUISITION_STATUSES, SUPPLIER_INVOICE_STATUSES, SUPPLIER_PAYMENT_STATUSES, type SupplierPurchaseOrderStatus, type PurchaseRequisitionStatus, type SupplierInvoiceStatus, type SupplierPaymentStatus } from "@jewellery/types";
import { ConflictError } from "../../shared/errors";

/**
 * The purchasing workflow as EXPLICIT BUSINESS RULES, exactly the discipline the B2B workflow uses
 * (apps/api/src/modules/b2b/b2b-status.ts): every change of status is a named ACTION with the
 * statuses it may start from and the one it ends in. Nothing sets a status directly, and an action
 * attempted from any other status is refused with a 409. These tables are the only place the rules
 * live — the services, the API and the tests all read them.
 */
export interface Rule<S extends string> {
  readonly from: readonly S[];
  readonly to: S;
}

// ---- purchase requisition --------------------------------------------------------------------------
export const REQUISITION_RULES = {
  submit: { from: ["DRAFT"], to: "SUBMITTED" },
  approve: { from: ["SUBMITTED"], to: "APPROVED" },
  reject: { from: ["SUBMITTED"], to: "REJECTED" },
  /** A purchase order is created from its lines. */
  convert: { from: ["APPROVED"], to: "CONVERTED" },
  cancel: { from: ["DRAFT", "SUBMITTED", "APPROVED"], to: "CANCELLED" },
} as const satisfies Record<string, Rule<PurchaseRequisitionStatus>>;
export type RequisitionAction = keyof typeof REQUISITION_RULES;

// ---- purchase order --------------------------------------------------------------------------------
export const PO_RULES = {
  submit: { from: ["DRAFT"], to: "SUBMITTED" },
  approve: { from: ["SUBMITTED"], to: "APPROVED" },
  /**
   * A goods receipt is posted against it. The target (PARTIALLY_RECEIVED or RECEIVED) is DERIVED
   * from the numbers by `purchaseOrderStatusFor` — but every derived move is still checked against
   * the graph (assertPoMove), so an impossible one is refused.
   */
  receive: { from: ["APPROVED", "PARTIALLY_RECEIVED"], to: "PARTIALLY_RECEIVED" /* or RECEIVED — derived */ },
  /** Withdraw it before receipt, or close out what remains of a partially-received one — what already arrived stands. */
  cancel: { from: ["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED"], to: "CANCELLED" },
} as const satisfies Record<string, Rule<SupplierPurchaseOrderStatus>>;
export type PoAction = keyof typeof PO_RULES;

export const PO_ACTION_TARGETS: Record<PoAction, readonly SupplierPurchaseOrderStatus[]> = {
  submit: ["SUBMITTED"],
  approve: ["APPROVED"],
  receive: ["PARTIALLY_RECEIVED", "RECEIVED"],
  cancel: ["CANCELLED"],
};

/** Where a purchase order stands, from the numbers alone (each line compared by its own governing measure — weight or quantity). */
export function purchaseOrderStatusFor(n: { linesOrdered: number; linesFullyReceived: number; anyReceived: boolean }): SupplierPurchaseOrderStatus {
  if (n.linesOrdered > 0 && n.linesFullyReceived >= n.linesOrdered) return "RECEIVED";
  if (n.anyReceived) return "PARTIALLY_RECEIVED";
  return "APPROVED";
}

export const PO_TRANSITIONS: Record<SupplierPurchaseOrderStatus, readonly SupplierPurchaseOrderStatus[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "CANCELLED"],
  APPROVED: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  RECEIVED: [],
  CANCELLED: [],
};

// ---- supplier invoice (cancellation only — PAID/UNPAID/PARTIALLY_PAID are derived, never stored) ------
export const SUPPLIER_INVOICE_RULES = {
  cancel: { from: ["UNPAID"], to: "CANCELLED" },
} as const satisfies Record<string, Rule<SupplierInvoiceStatus>>;
export type SupplierInvoiceAction = keyof typeof SUPPLIER_INVOICE_RULES;

// ---- supplier payment ---------------------------------------------------------------------------------
export const SUPPLIER_PAYMENT_RULES = {
  reverse: { from: ["RECORDED"], to: "REVERSED" },
} as const satisfies Record<string, Rule<SupplierPaymentStatus>>;
export type SupplierPaymentAction = keyof typeof SUPPLIER_PAYMENT_RULES;

// ---- the graphs, derived from the rules (used for exhaustive tests) -----------------------------------
const graph = <S extends string>(all: readonly S[], rules: Record<string, Rule<S>>): Record<S, readonly S[]> => {
  const out = Object.fromEntries(all.map((s) => [s, [] as S[]])) as Record<S, S[]>;
  for (const r of Object.values(rules)) for (const f of r.from) if (!out[f].includes(r.to)) out[f].push(r.to);
  return out;
};
export const REQUISITION_TRANSITIONS = graph(PURCHASE_REQUISITION_STATUSES, REQUISITION_RULES);
export const SUPPLIER_INVOICE_TRANSITIONS = graph(SUPPLIER_INVOICE_STATUSES, SUPPLIER_INVOICE_RULES);
export const SUPPLIER_PAYMENT_TRANSITIONS = graph(SUPPLIER_PAYMENT_STATUSES, SUPPLIER_PAYMENT_RULES);

export class IllegalProcurementTransitionError extends ConflictError {
  constructor(kind: string, action: string, from: string, allowed: readonly string[]) {
    super(`a ${kind} can't be ${action} from ${from.replace(/_/g, " ").toLowerCase()} (only from: ${allowed.map((a) => a.replace(/_/g, " ").toLowerCase()).join(", ")})`);
  }
}
function guard<S extends string>(kind: string, rules: Record<string, Rule<S>>, action: string, from: S): S {
  const rule = rules[action];
  if (!rule) throw new Error(`unknown ${kind} action ${action}`);
  if (!rule.from.includes(from)) throw new IllegalProcurementTransitionError(kind, action, from, rule.from);
  return rule.to;
}
export const checkRequisitionAction = (action: RequisitionAction, from: PurchaseRequisitionStatus) => guard("purchase requisition", REQUISITION_RULES, action, from);
export const checkPoAction = (action: PoAction, from: SupplierPurchaseOrderStatus) => guard("purchase order", PO_RULES, action, from);
export const checkSupplierInvoiceAction = (action: SupplierInvoiceAction, from: SupplierInvoiceStatus) => guard("supplier invoice", SUPPLIER_INVOICE_RULES, action, from);
export const checkSupplierPaymentAction = (action: SupplierPaymentAction, from: SupplierPaymentStatus) => guard("supplier payment", SUPPLIER_PAYMENT_RULES, action, from);
/** A derived move (receive) must still be a legal edge. */
export function assertPoMove(action: PoAction, from: SupplierPurchaseOrderStatus, to: SupplierPurchaseOrderStatus) {
  if (from !== to && !PO_TRANSITIONS[from].includes(to)) throw new IllegalProcurementTransitionError("purchase order", action, `${from} (to ${to})`, PO_TRANSITIONS[from]);
}
