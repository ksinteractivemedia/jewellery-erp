import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { PricingRule } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type PricingRuleAttrs = Omit<
  PricingRule,
  "id" | "customerId" | "customerGroupId" | "priceListId" | "metalId" | "categoryId"
> & {
  customerId?: Types.ObjectId;
  customerGroupId?: Types.ObjectId;
  priceListId?: Types.ObjectId;
  metalId?: Types.ObjectId;
  categoryId?: Types.ObjectId;
};
export type PricingRuleDocument = HydratedDocument<PricingRuleAttrs>;

const discountSchema = new Schema(
  {
    type: { type: String, enum: ["PERCENTAGE", "FLAT"], required: true },
    value: { type: Number, required: true, min: 0 },
    appliesTo: { type: String, enum: ["TOTAL", "MAKING_CHARGES"] },
  },
  { _id: false }
);

const pricingRuleSchema = new Schema<PricingRuleAttrs>(
  {
    name: { type: String, required: true, trim: true },

    customerType: { type: String, enum: ["B2C", "B2B"] },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    customerGroupId: { type: Schema.Types.ObjectId, ref: "CustomerGroup" },
    priceListId: { type: Schema.Types.ObjectId, ref: "PriceList" },
    metalId: { type: Schema.Types.ObjectId, ref: "Metal" },
    purity: String,
    categoryId: { type: Schema.Types.ObjectId, ref: "ProductCategory" },
    channel: { type: String, enum: ["ERP", "B2C", "B2B", "BOTH"], required: true, default: "BOTH" },

    // Money values (PER_GRAM / FIXED / PER_PIECE) are integer paise; PERCENTAGE is a percent. See pricing-rule.ts in @jewellery/types.
    makingChargeType: { type: String, enum: ["PERCENTAGE", "PER_GRAM", "FIXED", "PER_PIECE"] },
    makingChargeValue: { type: Number, min: 0 },

    wastageType: { type: String, enum: ["PERCENTAGE", "FIXED_WEIGHT", "NONE"] },
    wastageValue: { type: Number, min: 0 },

    discount: { type: discountSchema },

    priority: { type: Number, required: true, default: 0, min: 0 },
    validFrom: { type: Date, required: true },
    validTo: Date,
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<PricingRuleAttrs>()
);

// The pricing engine's core lookup: "every active rule whose scope could match this calculation".
pricingRuleSchema.index({ isActive: 1, channel: 1, validFrom: 1, validTo: 1 });
pricingRuleSchema.index({ metalId: 1, categoryId: 1, customerGroupId: 1, customerId: 1 });

export const PricingRuleModel: Model<PricingRuleAttrs> = model<PricingRuleAttrs>("PricingRule", pricingRuleSchema);
