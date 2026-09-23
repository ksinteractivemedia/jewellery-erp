import { B2B_PAYMENT_STATUSES, PURCHASE_ORDER_STATUSES, QUOTATION_STATUSES, SALES_ORDER_STATUSES, type B2BPaymentStatus, type PurchaseOrderStatus, type QuotationStatus, type SalesOrderStatus } from "@jewellery/types";
import { ConflictError } from "../../shared/errors";

/**
 * The commercial workflow as EXPLICIT BUSINESS RULES (business-rules.md §12). Every change of status is a named ACTION with the
 * statuses it may start from and the one it ends in; nothing sets a status directly, and an action attempted from any other
 * status is refused with a 409. The tables below are the only place these rules live — the services, the API and the tests all
 * read them.
 */
export interface Rule<S extends string> {
  readonly from: readonly S[];
  readonly to: S;
}

// ---- purchase order --------------------------------------------------------------------------------
export const PO_RULES = {
  /** The customer sends a draft to the seller. */
  submit: { from: ["DRAFT"], to: "SUBMITTED" },
  /** The seller picks it up for review. */
  startReview: { from: ["SUBMITTED"], to: "UNDER_REVIEW" },
  /** The seller issues a quotation — the first, a revision after a counter-offer, or a fresh one after the last expired. */
  quote: { from: ["SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATION", "EXPIRED"], to: "QUOTED" },
  /** The customer asks for different terms on the live quotation. */
  counter: { from: ["QUOTED"], to: "NEGOTIATION" },
  /** The seller approves the PO as asked, at today's prices, without a quotation. */
  approve: { from: ["SUBMITTED", "UNDER_REVIEW"], to: "APPROVED" },
  /** The customer accepts the live quotation. */
  accept: { from: ["QUOTED"], to: "APPROVED" },
  /** The seller turns it down. */
  reject: { from: ["SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATION"], to: "REJECTED" },
  /** The customer declines the quotation they were given. */
  decline: { from: ["QUOTED", "NEGOTIATION"], to: "REJECTED" },
  /** The quotation's validity ran out. */
  expire: { from: ["QUOTED", "NEGOTIATION"], to: "EXPIRED" },
  /** An approved PO becomes a sales order (credit is enforced here). */
  convert: { from: ["APPROVED"], to: "CONVERTED" },
  /** The customer withdraws it, or the seller cancels an approved-but-unconverted one. */
  cancel: { from: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATION", "EXPIRED", "APPROVED"], to: "CANCELLED" },
} as const satisfies Record<string, Rule<PurchaseOrderStatus>>;
export type PoAction = keyof typeof PO_RULES;

// ---- quotation ---------------------------------------------------------------------------------------
export const QUOTATION_RULES = {
  issue: { from: ["DRAFT"], to: "QUOTED" },
  discard: { from: ["DRAFT"], to: "REJECTED" },
  counter: { from: ["QUOTED"], to: "NEGOTIATION" },
  accept: { from: ["QUOTED"], to: "APPROVED" },
  decline: { from: ["QUOTED", "NEGOTIATION"], to: "REJECTED" },
  /** A newer version replaces it. */
  supersede: { from: ["QUOTED", "NEGOTIATION"], to: "SUPERSEDED" },
  expire: { from: ["QUOTED", "NEGOTIATION"], to: "EXPIRED" },
  convert: { from: ["APPROVED"], to: "CONVERTED" },
} as const satisfies Record<string, Rule<QuotationStatus>>;
export type QuotationAction = keyof typeof QUOTATION_RULES;

// ---- sales order ---------------------------------------------------------------------------------------
/**
 * Allocation and fulfilment move an order between several statuses depending on the numbers, so their targets are DERIVED by
 * `salesOrderStatusFor` — but every derived move is still checked against the graph below, so an impossible one is refused.
 */
export const SO_RULES = {
  /** Credit is now fine (or overridden): the order is a commitment. */
  confirm: { from: ["DRAFT"], to: "CONFIRMED" },
  /** Hold specific pieces for as many lines as stock allows. */
  allocate: { from: ["CONFIRMED", "PARTIALLY_ALLOCATED", "PARTIALLY_FULFILLED"], to: "PARTIALLY_ALLOCATED" /* or ALLOCATED / PARTIALLY_FULFILLED — derived */ },
  /** Give back everything held and not yet invoiced. */
  release: { from: ["PARTIALLY_ALLOCATED", "ALLOCATED"], to: "CONFIRMED" },
  /** Invoice (sell) what is held. */
  invoice: { from: ["PARTIALLY_ALLOCATED", "ALLOCATED", "PARTIALLY_FULFILLED"], to: "PARTIALLY_FULFILLED" /* or FULFILLED — derived */ },
  /** Cancel what has not been invoiced; invoices already issued stand. */
  cancel: { from: ["DRAFT", "CONFIRMED", "PARTIALLY_ALLOCATED", "ALLOCATED", "PARTIALLY_FULFILLED"], to: "CANCELLED" },
} as const satisfies Record<string, Rule<SalesOrderStatus>>;
export type SoAction = keyof typeof SO_RULES;

/** Every status an action may END in (the derived actions have several). */
export const SO_ACTION_TARGETS: Record<SoAction, readonly SalesOrderStatus[]> = {
  confirm: ["CONFIRMED"],
  allocate: ["PARTIALLY_ALLOCATED", "ALLOCATED", "PARTIALLY_FULFILLED", "CONFIRMED"], // CONFIRMED: nothing could be allocated (no move)
  release: ["CONFIRMED"],
  invoice: ["PARTIALLY_FULFILLED", "FULFILLED"],
  cancel: ["CANCELLED"],
};

/** Where an order stands, from the numbers alone. */
export function salesOrderStatusFor(n: { total: number; allocated: number; invoiced: number }): SalesOrderStatus {
  if (n.total > 0 && n.invoiced >= n.total) return "FULFILLED";
  if (n.invoiced > 0) return "PARTIALLY_FULFILLED";
  if (n.total > 0 && n.allocated >= n.total) return "ALLOCATED";
  if (n.allocated > 0) return "PARTIALLY_ALLOCATED";
  return "CONFIRMED";
}

// ---- payment ---------------------------------------------------------------------------------------------
export const PAYMENT_RULES = {
  verify: { from: ["PENDING_VERIFICATION"], to: "VERIFIED" },
  reject: { from: ["PENDING_VERIFICATION"], to: "REJECTED" },
  reverse: { from: ["VERIFIED"], to: "REVERSED" },
} as const satisfies Record<string, Rule<B2BPaymentStatus>>;
export type PaymentAction = keyof typeof PAYMENT_RULES;

// ---- the graphs, derived from the rules (used for the pair check and by the tests) ----------------------------
const graph = <S extends string>(all: readonly S[], rules: Record<string, Rule<S>>, extra: Record<string, readonly S[]> = {}): Record<S, readonly S[]> => {
  const out = Object.fromEntries(all.map((s) => [s, [] as S[]])) as Record<S, S[]>;
  for (const r of Object.values(rules)) for (const f of r.from) if (!out[f].includes(r.to)) out[f].push(r.to);
  for (const [f, tos] of Object.entries(extra)) for (const t of tos) if (!out[f as S].includes(t)) out[f as S].push(t);
  return out;
};
export const PO_TRANSITIONS = graph(PURCHASE_ORDER_STATUSES, PO_RULES);
export const QUOTATION_TRANSITIONS = graph(QUOTATION_STATUSES, QUOTATION_RULES);
/**
 * The sales order's edges are listed explicitly rather than derived: allocate and invoice end in a status that depends on the
 * numbers, and only some of those are reachable from each starting point (e.g. allocating more to a part-invoiced order leaves
 * it PARTIALLY_FULFILLED, never PARTIALLY_ALLOCATED).
 */
export const SO_TRANSITIONS: Record<SalesOrderStatus, readonly SalesOrderStatus[]> = {
  DRAFT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PARTIALLY_ALLOCATED", "ALLOCATED", "CANCELLED"],
  PARTIALLY_ALLOCATED: ["PARTIALLY_ALLOCATED", "ALLOCATED", "PARTIALLY_FULFILLED", "FULFILLED", "CONFIRMED", "CANCELLED"],
  ALLOCATED: ["PARTIALLY_FULFILLED", "FULFILLED", "CONFIRMED", "CANCELLED"],
  PARTIALLY_FULFILLED: ["PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED"],
  FULFILLED: [],
  CANCELLED: [],
};
export const PAYMENT_TRANSITIONS = graph(B2B_PAYMENT_STATUSES, PAYMENT_RULES);

export class IllegalB2BTransitionError extends ConflictError {
  constructor(kind: string, action: string, from: string, allowed: readonly string[]) {
    super(`a ${kind} can't be ${action} from ${from.replace(/_/g, " ").toLowerCase()} (only from: ${allowed.map((a) => a.replace(/_/g, " ").toLowerCase()).join(", ")})`);
  }
}
function guard<S extends string>(kind: string, rules: Record<string, Rule<S>>, action: string, from: S): S {
  const rule = rules[action];
  if (!rule) throw new Error(`unknown ${kind} action ${action}`);
  if (!rule.from.includes(from)) throw new IllegalB2BTransitionError(kind, action, from, rule.from);
  return rule.to;
}
/** Throws unless `action` may start from `from`; returns the status it ends in. */
export const checkPoAction = (action: PoAction, from: PurchaseOrderStatus) => guard("purchase order", PO_RULES, action, from);
export const checkQuotationAction = (action: QuotationAction, from: QuotationStatus) => guard("quotation", QUOTATION_RULES, action, from);
export const checkSoAction = (action: SoAction, from: SalesOrderStatus) => guard("sales order", SO_RULES, action, from);
export const checkPaymentAction = (action: PaymentAction, from: B2BPaymentStatus) => guard("payment", PAYMENT_RULES, action, from);
/** A derived move (allocate / invoice) must still be a legal edge. */
export function assertSoMove(action: SoAction, from: SalesOrderStatus, to: SalesOrderStatus) {
  if (from !== to && !SO_TRANSITIONS[from].includes(to)) throw new IllegalB2BTransitionError("sales order", action, `${from} (to ${to})`, SO_TRANSITIONS[from]);
}
