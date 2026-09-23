import { RETURN_STATUSES, type ReturnStatus } from "@jewellery/types";
import { ConflictError } from "../../shared/errors";

/**
 * REQUESTED → APPROVED/REJECTED → RECEIVED → INSPECTED → SETTLED, or CANCELLED before the piece is
 * physically back — the same explicit-action discipline as every other workflow module
 * (business-rules.md §12/§14/§15/§16). Nothing sets a status directly; an action attempted from any
 * other status is refused with a 409.
 */
export interface Rule<S extends string> {
  readonly from: readonly S[];
  readonly to: S;
}

export const RETURN_RULES = {
  approve: { from: ["REQUESTED"], to: "APPROVED" },
  reject: { from: ["REQUESTED"], to: "REJECTED" },
  receive: { from: ["APPROVED"], to: "RECEIVED" },
  inspect: { from: ["RECEIVED"], to: "INSPECTED" },
  settle: { from: ["INSPECTED"], to: "SETTLED" },
  /** Only before the piece is physically back — once RECEIVED, there is stock in flux and the return must be seen through. */
  cancel: { from: ["REQUESTED", "APPROVED"], to: "CANCELLED" },
} as const satisfies Record<string, Rule<ReturnStatus>>;
export type ReturnAction = keyof typeof RETURN_RULES;

const graph = <S extends string>(all: readonly S[], rules: Record<string, Rule<S>>): Record<S, readonly S[]> => {
  const out = Object.fromEntries(all.map((s) => [s, [] as S[]])) as Record<S, S[]>;
  for (const r of Object.values(rules)) for (const f of r.from) if (!out[f].includes(r.to)) out[f].push(r.to);
  return out;
};
export const RETURN_TRANSITIONS = graph(RETURN_STATUSES, RETURN_RULES);

export class IllegalReturnTransitionError extends ConflictError {
  constructor(action: string, from: string, allowed: readonly string[]) {
    super(`a return can't be ${action} from ${from.replace(/_/g, " ").toLowerCase()} (only from: ${allowed.map((a) => a.replace(/_/g, " ").toLowerCase()).join(", ")})`);
  }
}
export function checkReturnAction(action: ReturnAction, from: ReturnStatus): ReturnStatus {
  const rule: Rule<ReturnStatus> = RETURN_RULES[action];
  if (!rule.from.includes(from)) throw new IllegalReturnTransitionError(action, from, rule.from);
  return rule.to;
}
