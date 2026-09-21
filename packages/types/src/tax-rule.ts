import type { Id, Percent } from "./common";

/**
 * The rates the pricing engine applies — the whole compliance decision, as data (business-rules.md §6.2).
 * Whether a sale is intra- or inter-state comes from comparing the seller's and buyer's state; which
 * rates then apply comes from the rule, so no percentage or CGST/SGST-vs-IGST split lives in code.
 */
export interface TaxTerms {
  hsnCode: string;
  /** Seller and buyer in the same state: CGST + SGST. */
  intraState: { cgst: Percent; sgst: Percent };
  /** Different states: IGST. */
  interState: { igst: Percent };
}

/** An effective-dated, stored tax rule. Resolved by HSN code and date — see `resolveTaxRule`. */
export interface TaxRule extends TaxTerms {
  id: Id;
  name: string;
  validFrom: Date;
  /** Exclusive. */
  validTo?: Date;
  isActive: boolean;
}
