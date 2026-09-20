import type { Id, Paise, Timestamps } from "./common";

export type MetalRateSource = "MANUAL" | "FEED";

/**
 * A historical rate quotation. Never updated once created — a correction is a new
 * document with a later `effectiveFrom` (business-rules.md §1.3's sibling rule for rates).
 * "Current rate" = the row with the latest `effectiveFrom <= now` for a given metal+purity.
 */
export interface MetalRate extends Timestamps {
  id: Id;
  metalId: Id;
  /** The purity this rate is quoted for, e.g. "24K" — other purities are derived via fineness ratio by the pricing engine. */
  purity: string;
  ratePerGram: Paise;
  effectiveFrom: Date;
  source: MetalRateSource;
  createdBy?: Id;
}
