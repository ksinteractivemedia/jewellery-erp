import { HALLMARKING_BATCH_STATUSES, type HallmarkingBatchStatus } from "@jewellery/types";
import { ConflictError } from "../../shared/errors";

/**
 * Send to Hallmarking → In Transit → At Hallmarking Centre → Received, as explicit business rules —
 * the same discipline as every other workflow module (business-rules.md §12, §14, §15). Every change
 * of status is a named ACTION with the statuses it may start from and the one it ends in; nothing
 * sets a status directly, and an action attempted from any other status is refused with a 409.
 * Verified/Failed are per-line outcomes once the batch is RECEIVED, not batch-level transitions —
 * see `checkLineOutcome` below.
 */
export interface Rule<S extends string> {
  readonly from: readonly S[];
  readonly to: S;
}

export const HALLMARKING_RULES = {
  dispatch: { from: ["PENDING"], to: "IN_TRANSIT" },
  arrive: { from: ["IN_TRANSIT"], to: "AT_CENTRE" },
  /** May be received straight from transit too — not every business logs "arrived" as its own step. */
  receive: { from: ["IN_TRANSIT", "AT_CENTRE"], to: "RECEIVED" },
  cancel: { from: ["PENDING"], to: "CANCELLED" },
} as const satisfies Record<string, Rule<HallmarkingBatchStatus>>;
export type HallmarkingAction = keyof typeof HALLMARKING_RULES;

const graph = <S extends string>(all: readonly S[], rules: Record<string, Rule<S>>): Record<S, readonly S[]> => {
  const out = Object.fromEntries(all.map((s) => [s, [] as S[]])) as Record<S, S[]>;
  for (const r of Object.values(rules)) for (const f of r.from) if (!out[f].includes(r.to)) out[f].push(r.to);
  return out;
};
export const HALLMARKING_TRANSITIONS = graph(HALLMARKING_BATCH_STATUSES, HALLMARKING_RULES);

export class IllegalHallmarkingTransitionError extends ConflictError {
  constructor(action: string, from: string, allowed: readonly string[]) {
    super(`a hallmarking batch can't be ${action} from ${from.replace(/_/g, " ").toLowerCase()} (only from: ${allowed.map((a) => a.replace(/_/g, " ").toLowerCase()).join(", ")})`);
  }
}
export function checkHallmarkingAction(action: HallmarkingAction, from: HallmarkingBatchStatus): HallmarkingBatchStatus {
  const rule: Rule<HallmarkingBatchStatus> = HALLMARKING_RULES[action];
  if (!rule.from.includes(from)) throw new IllegalHallmarkingTransitionError(action, from, rule.from);
  return rule.to;
}

/** A line can only get an outcome once (RECEIVED, no outcome yet) — never overwritten by a second decision. */
export function checkLineOutcome(batchStatus: HallmarkingBatchStatus, existingOutcome: string | undefined): void {
  if (batchStatus !== "RECEIVED") throw new ConflictError(`This batch is ${batchStatus.replace(/_/g, " ").toLowerCase()} — a piece can only be verified or failed once it has been received back.`);
  if (existingOutcome) throw new ConflictError(`This piece has already been marked ${existingOutcome.toLowerCase()}.`);
}
