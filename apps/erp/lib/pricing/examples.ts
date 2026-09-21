import type { PricingPlaygroundMeta } from "@jewellery/types";
import { EMPTY_FORM, type PlaygroundForm } from "./playground";

/**
 * SAMPLE inputs for the pricing playground — illustrative figures a person can edit, not rates, not tax
 * advice, and never read by any calculation (CLAUDE.md rule 7: mock data stays isolated). The tax figures
 * here are what a person would type from the tax master; the engine reads whatever the form sends.
 */
export interface PlaygroundExample {
  id: string;
  label: string;
  note: string;
  metalCode: string;
  form: Partial<PlaygroundForm>;
}

const GST = { hsnCode: "7113", cgst: "1.5", sgst: "1.5", igst: "3", sellerState: "Maharashtra" };

export const EXAMPLES: PlaygroundExample[] = [
  {
    id: "necklace-22k", label: "22K gold necklace · B2C", note: "Making and wastage entered by hand; the discount is left to the stored rules.", metalCode: "GOLD",
    form: { purity: "22K", grossWeight: "25", stoneWeight: "1.5", rate: "6500", ratePurity: "22K", stoneValue: "4500", makingMode: "PERCENTAGE", makingValue: "12", wastageMode: "PERCENTAGE", wastageValue: "2", customerType: "B2C", buyerState: "Maharashtra", cost: "158000", ...GST },
  },
  {
    id: "ring-18k", label: "18K diamond ring · inter-state", note: "Per-gram making, fixed-weight wastage, 5% discount, IGST — priced from a 24K rate.", metalCode: "GOLD",
    form: { purity: "18K", grossWeight: "6.2", stoneWeight: "0.45", rate: "7100", ratePurity: "24K", stoneValue: "18500", makingMode: "PER_GRAM", makingValue: "650", wastageMode: "FIXED_WEIGHT", wastageValue: "0.15", discountMode: "PERCENTAGE", discountValue: "5", customerType: "B2C", buyerState: "Karnataka", cost: "60000", ...GST },
  },
  {
    id: "anklet-925", label: "925 silver anklet", note: "Silver, per-gram making, no wastage.", metalCode: "SILVER",
    form: { purity: "925", grossWeight: "42.5", stoneWeight: "0", rate: "95", ratePurity: "999", stoneValue: "0", makingMode: "PER_GRAM", makingValue: "8", wastageMode: "NONE", customerType: "B2C", buyerState: "Maharashtra", ...GST },
  },
  {
    id: "bangles-b2b", label: "B2B bangle lot · stored rules", note: "Making, wastage and discount left to the stored pricing rules for a B2B buyer.", metalCode: "GOLD",
    form: { purity: "22K", grossWeight: "80", stoneWeight: "0", pieces: "10", rate: "6500", ratePurity: "22K", stoneValue: "0", customerType: "B2B", buyerState: "Maharashtra", ...GST },
  },
];

/** An example as a full form, with its metal looked up by code from the live metal master. */
export function exampleToForm(example: PlaygroundExample, meta: PricingPlaygroundMeta | undefined): PlaygroundForm {
  const metal = meta?.metals.find((m) => m.code === example.metalCode);
  return { ...EMPTY_FORM, ...example.form, metalId: metal?.id ?? "" };
}
