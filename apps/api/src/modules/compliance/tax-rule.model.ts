import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import type { TaxRule } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type TaxRuleAttrs = Omit<TaxRule, "id">;
export type TaxRuleDocument = HydratedDocument<TaxRuleAttrs>;

/**
 * An effective-dated GST rule, keyed by HSN code (business-rules.md §1.6, §6.2). The rates ARE the data: nothing in
 * code says what GST on jewellery is. The pricing engine's `resolveTaxRule` picks the one in force on a date.
 */
const taxRuleSchema = new Schema<TaxRuleAttrs>(
  {
    name: { type: String, required: true, trim: true },
    hsnCode: { type: String, required: true, trim: true, match: /^\d{4,8}$/ },
    intraState: { type: new Schema({ cgst: { type: Number, required: true, min: 0, max: 100 }, sgst: { type: Number, required: true, min: 0, max: 100 } }, { _id: false }), required: true },
    interState: { type: new Schema({ igst: { type: Number, required: true, min: 0, max: 100 } }, { _id: false }), required: true },
    validFrom: { type: Date, required: true },
    validTo: Date,
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<TaxRuleAttrs>()
);
taxRuleSchema.index({ hsnCode: 1, isActive: 1, validFrom: -1 });

export const TaxRuleModel: Model<TaxRuleAttrs> = model<TaxRuleAttrs>("TaxRule", taxRuleSchema);
