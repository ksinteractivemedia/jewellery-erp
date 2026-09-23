import { JOB_WORK_ORDER_STATUSES, PRODUCTION_ORDER_STATUSES, type JobWorkOrderStatus, type ProductionOrderStatus } from "@jewellery/types";
import { ConflictError } from "../../shared/errors";

/**
 * Production Order → Material Issue → Manufacturing → QC → Finished Jewellery → Inventory, and Job
 * Work's issue → return, as EXPLICIT BUSINESS RULES — the same discipline as B2B (business-rules.md
 * §12) and Purchasing (§14). Every change of status is a named ACTION with the statuses it may start
 * from and the one it ends in; nothing sets a status directly, and an action attempted from any other
 * status is refused with a 409.
 */
export interface Rule<S extends string> {
  readonly from: readonly S[];
  readonly to: S;
}

// ---- production order --------------------------------------------------------------------------------
export const PRODUCTION_RULES = {
  /** Material moves from the shelf onto the manufacturing floor. */
  issueMaterial: { from: ["DRAFT"], to: "MATERIAL_ISSUED" },
  /** Work actually begins on the bench. */
  startManufacturing: { from: ["MATERIAL_ISSUED"], to: "IN_PROGRESS" },
  /** The piece is made; actual weight, wastage and labour cost are recorded, and it's handed to QC. */
  submitForQc: { from: ["IN_PROGRESS"], to: "QC_PENDING" },
  passQc: { from: ["QC_PENDING"], to: "QC_PASSED" },
  failQc: { from: ["QC_PENDING"], to: "QC_FAILED" },
  /** Back to the bench for another attempt. */
  rework: { from: ["QC_FAILED"], to: "IN_PROGRESS" },
  /** The finished piece(s) enter inventory; unused material is returned; wastage and any discrepancy are recorded. */
  complete: { from: ["QC_PASSED"], to: "COMPLETED" },
  /** Whatever was issued and not yet consumed is returned to stock in the same action. */
  cancel: { from: ["DRAFT", "MATERIAL_ISSUED", "IN_PROGRESS", "QC_FAILED"], to: "CANCELLED" },
} as const satisfies Record<string, Rule<ProductionOrderStatus>>;
export type ProductionAction = keyof typeof PRODUCTION_RULES;

// ---- job work order --------------------------------------------------------------------------------------
export const JOB_WORK_RULES = {
  issue: { from: ["DRAFT"], to: "ISSUED" },
  /** A return event: finished pieces and/or unused material recorded. Target is DERIVED from whether the caller marks it `final`. */
  returnGoods: { from: ["ISSUED", "PARTIALLY_RETURNED"], to: "PARTIALLY_RETURNED" /* or RETURNED — derived */ },
  cancel: { from: ["DRAFT"], to: "CANCELLED" },
} as const satisfies Record<string, Rule<JobWorkOrderStatus>>;
export type JobWorkAction = keyof typeof JOB_WORK_RULES;

export const JOB_WORK_ACTION_TARGETS: Record<JobWorkAction, readonly JobWorkOrderStatus[]> = {
  issue: ["ISSUED"],
  returnGoods: ["PARTIALLY_RETURNED", "RETURNED"],
  cancel: ["CANCELLED"],
};

// ---- the graphs, derived from the rules (used for exhaustive tests) -----------------------------------
const graph = <S extends string>(all: readonly S[], rules: Record<string, Rule<S>>): Record<S, readonly S[]> => {
  const out = Object.fromEntries(all.map((s) => [s, [] as S[]])) as Record<S, S[]>;
  for (const r of Object.values(rules)) for (const f of r.from) if (!out[f].includes(r.to)) out[f].push(r.to);
  return out;
};
export const PRODUCTION_TRANSITIONS = graph(PRODUCTION_ORDER_STATUSES, PRODUCTION_RULES);
export const JOB_WORK_TRANSITIONS: Record<JobWorkOrderStatus, readonly JobWorkOrderStatus[]> = {
  DRAFT: ["ISSUED", "CANCELLED"],
  ISSUED: ["PARTIALLY_RETURNED", "RETURNED"],
  PARTIALLY_RETURNED: ["PARTIALLY_RETURNED", "RETURNED"],
  RETURNED: [],
  CANCELLED: [],
};

export class IllegalManufacturingTransitionError extends ConflictError {
  constructor(kind: string, action: string, from: string, allowed: readonly string[]) {
    super(`a ${kind} can't be ${action} from ${from.replace(/_/g, " ").toLowerCase()} (only from: ${allowed.map((a) => a.replace(/_/g, " ").toLowerCase()).join(", ")})`);
  }
}
function guard<S extends string>(kind: string, rules: Record<string, Rule<S>>, action: string, from: S): S {
  const rule = rules[action];
  if (!rule) throw new Error(`unknown ${kind} action ${action}`);
  if (!rule.from.includes(from)) throw new IllegalManufacturingTransitionError(kind, action, from, rule.from);
  return rule.to;
}
export const checkProductionAction = (action: ProductionAction, from: ProductionOrderStatus) => guard("production order", PRODUCTION_RULES, action, from);
export const checkJobWorkAction = (action: JobWorkAction, from: JobWorkOrderStatus) => guard("job work order", JOB_WORK_RULES, action, from);
/** A derived move (returnGoods) must still be a legal edge. */
export function assertJobWorkMove(action: JobWorkAction, from: JobWorkOrderStatus, to: JobWorkOrderStatus) {
  if (from !== to && !JOB_WORK_TRANSITIONS[from].includes(to)) throw new IllegalManufacturingTransitionError("job work order", action, `${from} (to ${to})`, JOB_WORK_TRANSITIONS[from]);
}
