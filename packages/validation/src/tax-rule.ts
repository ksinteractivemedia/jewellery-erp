import { z } from "zod";

const zRate = z.number().finite().min(0).max(100).refine((n) => Math.abs(n * 1e6 - Math.round(n * 1e6)) < 1e-6, "at most 6 decimal places");

/**
 * The rates of a tax rule (business-rules.md §6.2). Under GST the CGST + SGST charged inside a state
 * always equal the IGST charged across states, so a rule where they disagree is a data-entry mistake —
 * rejecting it here is a consistency check on the data, not a hardcoded rate.
 */
export const taxTermsSchema = z
  .object({
    hsnCode: z.string().regex(/^\d{4,8}$/, "an HSN code is 4–8 digits"),
    intraState: z.object({ cgst: zRate, sgst: zRate }),
    interState: z.object({ igst: zRate }),
  })
  .refine((t) => Math.abs(t.intraState.cgst + t.intraState.sgst - t.interState.igst) < 1e-9, {
    message: "CGST + SGST must equal IGST",
    path: ["interState", "igst"],
  });
export type TaxTermsInput = z.input<typeof taxTermsSchema>;

/** A stored, effective-dated tax rule (business-rules.md §6.2 / §1.6). */
export const createTaxRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    validFrom: z.coerce.date(),
    validTo: z.coerce.date().optional(),
    isActive: z.boolean().default(true),
  })
  .and(taxTermsSchema)
  .refine((r) => !r.validTo || r.validTo > r.validFrom, { message: "validTo must be after validFrom", path: ["validTo"] });
export type CreateTaxRuleInput = z.input<typeof createTaxRuleSchema>;
