import { REPAIR_ORDER_STATUSES, type RepairOrderStatus } from "@jewellery/types";
import { ConflictError } from "../../shared/errors";

/**
 * Customer → repair intake → inspection → estimate → approval → repair → QC → ready →
 * delivery/pickup, as explicit business rules — the same discipline as every other workflow module.
 * DECLINED (the customer doesn't approve the estimate) and CANCELLED both hand the piece straight
 * back, unrepaired; QC_FAILED loops back to IN_PROGRESS for rework. `intake` itself isn't a listed
 * action here — creating the order *is* the first ledger movement (the piece physically arrives),
 * handled atomically in repair-order.service.ts, the same way a hallmarking batch's PENDING or a
 * production order's DRAFT is created directly rather than reached by an action.
 */
export interface Rule<S extends string> {
  readonly from: readonly S[];
  readonly to: S;
}

export const REPAIR_RULES = {
  inspect: { from: ["INTAKE"], to: "INSPECTED" },
  estimate: { from: ["INSPECTED", "ESTIMATED"], to: "ESTIMATED" },
  approveEstimate: { from: ["ESTIMATED"], to: "APPROVED" },
  declineEstimate: { from: ["ESTIMATED"], to: "DECLINED" },
  start: { from: ["APPROVED"], to: "IN_PROGRESS" },
  recordWork: { from: ["IN_PROGRESS"], to: "QC_PENDING" },
  qcPass: { from: ["QC_PENDING"], to: "READY" },
  qcFail: { from: ["QC_PENDING"], to: "QC_FAILED" },
  rework: { from: ["QC_FAILED"], to: "IN_PROGRESS" },
  deliver: { from: ["READY"], to: "DELIVERED" },
  cancel: { from: ["INTAKE", "INSPECTED", "ESTIMATED", "APPROVED", "IN_PROGRESS", "QC_PENDING", "QC_FAILED"], to: "CANCELLED" },
} as const satisfies Record<string, Rule<RepairOrderStatus>>;
export type RepairAction = keyof typeof REPAIR_RULES;

const graph = <S extends string>(all: readonly S[], rules: Record<string, Rule<S>>): Record<S, readonly S[]> => {
  const out = Object.fromEntries(all.map((s) => [s, [] as S[]])) as Record<S, S[]>;
  for (const r of Object.values(rules)) for (const f of r.from) if (!out[f].includes(r.to)) out[f].push(r.to);
  return out;
};
export const REPAIR_TRANSITIONS = graph(REPAIR_ORDER_STATUSES, REPAIR_RULES);

/** A movement (`REPAIR_RETURN`) always accompanies leaving custody — deliver, decline, or cancel. */
export const HANDS_BACK: ReadonlySet<RepairAction> = new Set(["deliver", "declineEstimate", "cancel"]);

export class IllegalRepairTransitionError extends ConflictError {
  constructor(action: string, from: string, allowed: readonly string[]) {
    super(`a repair order can't be ${action} from ${from.replace(/_/g, " ").toLowerCase()} (only from: ${allowed.map((a) => a.replace(/_/g, " ").toLowerCase()).join(", ")})`);
  }
}
export function checkRepairAction(action: RepairAction, from: RepairOrderStatus): RepairOrderStatus {
  const rule: Rule<RepairOrderStatus> = REPAIR_RULES[action];
  if (!rule.from.includes(from)) throw new IllegalRepairTransitionError(action, from, rule.from);
  return rule.to;
}
