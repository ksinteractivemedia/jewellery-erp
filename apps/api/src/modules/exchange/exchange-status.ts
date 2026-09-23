import { EXCHANGE_STATUSES, type ExchangeStatus } from "@jewellery/types";
import { ConflictError } from "../../shared/errors";

/**
 * Old jewellery → inspection → weight/purity assessment → valuation → new product → difference
 * payable/refundable, done at the counter in one sitting: DRAFT → ASSESSED → COMPLETED, or
 * CANCELLED before the old piece is actually taken in. Explicit, checked actions only, the same
 * discipline as every other workflow module.
 */
export interface Rule<S extends string> {
  readonly from: readonly S[];
  readonly to: S;
}

export const EXCHANGE_RULES = {
  /** Re-assessable while nothing has been taken in yet — weighing again isn't a mistake to correct, it's the job. */
  assess: { from: ["DRAFT", "ASSESSED"], to: "ASSESSED" },
  complete: { from: ["ASSESSED"], to: "COMPLETED" },
  cancel: { from: ["DRAFT", "ASSESSED"], to: "CANCELLED" },
} as const satisfies Record<string, Rule<ExchangeStatus>>;
export type ExchangeAction = keyof typeof EXCHANGE_RULES;

const graph = <S extends string>(all: readonly S[], rules: Record<string, Rule<S>>): Record<S, readonly S[]> => {
  const out = Object.fromEntries(all.map((s) => [s, [] as S[]])) as Record<S, S[]>;
  for (const r of Object.values(rules)) for (const f of r.from) if (!out[f].includes(r.to)) out[f].push(r.to);
  return out;
};
export const EXCHANGE_TRANSITIONS = graph(EXCHANGE_STATUSES, EXCHANGE_RULES);

export class IllegalExchangeTransitionError extends ConflictError {
  constructor(action: string, from: string, allowed: readonly string[]) {
    super(`an exchange can't be ${action} from ${from.replace(/_/g, " ").toLowerCase()} (only from: ${allowed.map((a) => a.replace(/_/g, " ").toLowerCase()).join(", ")})`);
  }
}
export function checkExchangeAction(action: ExchangeAction, from: ExchangeStatus): ExchangeStatus {
  const rule: Rule<ExchangeStatus> = EXCHANGE_RULES[action];
  if (!rule.from.includes(from)) throw new IllegalExchangeTransitionError(action, from, rule.from);
  return rule.to;
}
