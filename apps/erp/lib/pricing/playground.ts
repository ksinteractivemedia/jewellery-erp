import type { CustomerType, DiscountAppliesTo } from "@jewellery/types";
import type { PricingPreviewInput } from "@jewellery/validation";
import { parseNumber, rupeesToPaise } from "./parse";

export type MakingMode = "RULE" | "PERCENTAGE" | "PER_GRAM" | "FIXED" | "PER_PIECE";
export type WastageMode = "RULE" | "NONE" | "PERCENTAGE" | "FIXED_WEIGHT";
export type DiscountMode = "RULE" | "PERCENTAGE" | "FLAT";

/** Everything the playground form holds, as the strings a person typed. */
export interface PlaygroundForm {
  metalId: string;
  purity: string;
  grossWeight: string;
  stoneWeight: string;
  pieces: string;
  rate: string;
  ratePurity: string;
  stoneValue: string;
  cost: string;
  makingMode: MakingMode;
  makingValue: string;
  wastageMode: WastageMode;
  wastageValue: string;
  discountMode: DiscountMode;
  discountValue: string;
  discountAppliesTo: DiscountAppliesTo;
  customerType: CustomerType;
  hsnCode: string;
  cgst: string;
  sgst: string;
  igst: string;
  sellerState: string;
  buyerState: string;
}

export const EMPTY_FORM: PlaygroundForm = {
  metalId: "", purity: "", grossWeight: "", stoneWeight: "", pieces: "1", rate: "", ratePurity: "", stoneValue: "", cost: "",
  makingMode: "RULE", makingValue: "", wastageMode: "RULE", wastageValue: "", discountMode: "RULE", discountValue: "", discountAppliesTo: "TOTAL",
  customerType: "B2C", hsnCode: "", cgst: "", sgst: "", igst: "", sellerState: "", buyerState: "",
};

export interface BuiltRequest {
  /** Null until every required field parses — the form then shows what is missing instead of calling the API. */
  request: PricingPreviewInput | null;
  /** Field → message, only for text that is present but unusable. */
  errors: Partial<Record<keyof PlaygroundForm, string>>;
}

const MONEY_MODES = new Set(["PER_GRAM", "FIXED", "PER_PIECE", "FLAT"]);

/**
 * Form strings → the API's request. Anything blank-but-required just leaves `request` null; anything
 * typed-but-unusable becomes a field error. Whether the numbers make sense together (stone heavier than
 * the piece, discount bigger than the price…) is the API's answer to give, and it is shown as such.
 */
export function buildPreviewRequest(form: PlaygroundForm): BuiltRequest {
  const errors: BuiltRequest["errors"] = {};
  let complete = true;

  const number = (key: keyof PlaygroundForm, places: number, opts: { required?: boolean; fallback?: number } = {}): number | undefined => {
    const text = form[key] as string;
    if (!text.trim()) {
      if (opts.fallback !== undefined) return opts.fallback;
      if (opts.required !== false) complete = false;
      return undefined;
    }
    const value = parseNumber(text, places);
    if (value === undefined) { errors[key] = places === 0 ? "Enter a whole number" : `Enter a number (up to ${places} decimals)`; complete = false; }
    return value;
  };
  const paise = (key: keyof PlaygroundForm, opts: { required?: boolean; fallback?: number } = {}): number | undefined => {
    const text = form[key] as string;
    if (!text.trim()) {
      if (opts.fallback !== undefined) return opts.fallback;
      if (opts.required !== false) complete = false;
      return undefined;
    }
    const value = rupeesToPaise(text);
    if (value === undefined) { errors[key] = "Enter an amount in rupees (up to 2 decimals)"; complete = false; }
    return value;
  };
  const text = (key: keyof PlaygroundForm): string | undefined => {
    const value = (form[key] as string).trim();
    if (!value) complete = false;
    return value || undefined;
  };
  const valueFor = (mode: string, key: keyof PlaygroundForm, percentPlaces = 6) =>
    MONEY_MODES.has(mode) ? paise(key) : mode === "FIXED_WEIGHT" ? number(key, 3) : number(key, percentPlaces);

  const metalId = text("metalId");
  const purity = text("purity");
  const ratePurity = text("ratePurity");
  const grossWeight = number("grossWeight", 3);
  const stoneWeight = number("stoneWeight", 3, { fallback: 0 });
  const pieces = number("pieces", 0, { fallback: 1 });
  const ratePerGram = paise("rate");
  const stoneValue = paise("stoneValue", { fallback: 0 });
  const cost = paise("cost", { required: false });
  const hsnCode = text("hsnCode");
  const cgst = number("cgst", 6);
  const sgst = number("sgst", 6);
  const igst = number("igst", 6);
  const sellerState = text("sellerState");
  const buyerState = text("buyerState");

  const making = form.makingMode === "RULE" ? undefined : { type: form.makingMode, value: valueFor(form.makingMode, "makingValue") };
  const wastage = form.wastageMode === "RULE" ? undefined : form.wastageMode === "NONE" ? { type: "NONE" as const } : { type: form.wastageMode, value: valueFor(form.wastageMode, "wastageValue") };
  const discount = form.discountMode === "RULE" ? undefined : { type: form.discountMode, value: valueFor(form.discountMode, "discountValue"), appliesTo: form.discountAppliesTo };

  if (!complete) return { request: null, errors };
  return {
    errors,
    request: {
      metalId: metalId!, purity: purity!, grossWeight: grossWeight!, stoneWeight: stoneWeight!, pieces: pieces!,
      rate: { ratePerGram: ratePerGram!, purity: ratePurity! },
      stoneValue: stoneValue!,
      ...(cost !== undefined ? { cost } : {}),
      ...(making ? { making: making as NonNullable<PricingPreviewInput["making"]> } : {}),
      ...(wastage ? { wastage: wastage as NonNullable<PricingPreviewInput["wastage"]> } : {}),
      ...(discount ? { discount: discount as NonNullable<PricingPreviewInput["discount"]> } : {}),
      customerType: form.customerType,
      tax: { hsnCode: hsnCode!, intraState: { cgst: cgst!, sgst: sgst! }, interState: { igst: igst! }, sellerState: sellerState!, buyerState: buyerState! },
    },
  };
}
