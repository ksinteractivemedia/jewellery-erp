import { describe, expect, it } from "vitest";
import { pricingPreviewSchema } from "@jewellery/validation";
import { EXAMPLES, exampleToForm } from "./examples";
import { EMPTY_FORM, buildPreviewRequest, type PlaygroundForm } from "./playground";

const GOLD = "64b0c0ffee0000000000aa01";
const SILVER = "64b0c0ffee0000000000aa02";
const META = {
  metals: [
    { id: GOLD, code: "GOLD", name: "Gold", purities: [{ code: "24K", fineness: 0.999 }, { code: "22K", fineness: 0.916 }, { code: "18K", fineness: 0.75 }] },
    { id: SILVER, code: "SILVER", name: "Silver", purities: [{ code: "999", fineness: 0.999 }, { code: "925", fineness: 0.925 }] },
  ],
};

const necklace = exampleToForm(EXAMPLES[0]!, META);
const form = (over: Partial<PlaygroundForm> = {}): PlaygroundForm => ({ ...necklace, ...over });

describe("buildPreviewRequest", () => {
  it("waits, without complaint, until the required fields are filled", () => {
    expect(buildPreviewRequest(EMPTY_FORM)).toEqual({ request: null, errors: {} });
  });

  it("turns the typed necklace into exact paise, with hand-entered charges as overrides", () => {
    const { request, errors } = buildPreviewRequest(necklace);
    expect(errors).toEqual({});
    expect(request).toEqual({
      metalId: GOLD, purity: "22K", grossWeight: 25, stoneWeight: 1.5, pieces: 1,
      rate: { ratePerGram: 650_000, purity: "22K" },
      stoneValue: 450_000,
      cost: 15_800_000,
      making: { type: "PERCENTAGE", value: 12 },
      wastage: { type: "PERCENTAGE", value: 2 },
      customerType: "B2C",
      tax: { hsnCode: "7113", intraState: { cgst: 1.5, sgst: 1.5 }, interState: { igst: 3 }, sellerState: "Maharashtra", buyerState: "Maharashtra" },
    });
  });

  it("leaves a charge to the stored rules by sending nothing for it", () => {
    const { request } = buildPreviewRequest(form({ makingMode: "RULE", wastageMode: "RULE", discountMode: "RULE" }));
    expect(request).not.toHaveProperty("making");
    expect(request).not.toHaveProperty("wastage");
    expect(request).not.toHaveProperty("discount");
  });

  it("reads money-typed values as rupees → paise, percentages as percentages, and fixed wastage as grams", () => {
    const { request } = buildPreviewRequest(form({ makingMode: "PER_GRAM", makingValue: "650", wastageMode: "FIXED_WEIGHT", wastageValue: "0.15", discountMode: "FLAT", discountValue: "2,000.50", discountAppliesTo: "MAKING_CHARGES" }));
    expect(request?.making).toEqual({ type: "PER_GRAM", value: 65_000 });
    expect(request?.wastage).toEqual({ type: "FIXED_WEIGHT", value: 0.15 });
    expect(request?.discount).toEqual({ type: "FLAT", value: 200_050, appliesTo: "MAKING_CHARGES" });
    expect(buildPreviewRequest(form({ makingMode: "PER_PIECE", makingValue: "350" })).request?.making).toEqual({ type: "PER_PIECE", value: 35_000 });
    expect(buildPreviewRequest(form({ makingMode: "FIXED", makingValue: "1200" })).request?.making).toEqual({ type: "FIXED", value: 120_000 });
  });

  it("sends wastage NONE with no value", () => {
    expect(buildPreviewRequest(form({ wastageMode: "NONE", wastageValue: "" })).request?.wastage).toEqual({ type: "NONE" });
  });

  it("defaults blank stone weight to 0, blank pieces to 1, blank stone value to 0, and omits a blank cost", () => {
    const { request } = buildPreviewRequest(form({ stoneWeight: "", pieces: "", stoneValue: "", cost: "" }));
    expect(request).toMatchObject({ stoneWeight: 0, pieces: 1, stoneValue: 0 });
    expect(request).not.toHaveProperty("cost");
  });

  it("stays quiet but incomplete when a chosen charge has no value yet", () => {
    expect(buildPreviewRequest(form({ makingMode: "PERCENTAGE", makingValue: "" }))).toEqual({ request: null, errors: {} });
  });

  it.each([
    ["grossWeight", "12.3456"],
    ["stoneWeight", "1.5x"],
    ["rate", "65,0.0.0"],
    ["rate", "6500.505"],
    ["stoneValue", "abc"],
    ["cost", "-4"],
    ["pieces", "2.5"],
    ["cgst", "1,5"],
  ] as [keyof PlaygroundForm, string][])("flags %s = %j as a field error and sends nothing", (key, value) => {
    const { request, errors } = buildPreviewRequest(form({ [key]: value }));
    expect(request).toBeNull();
    expect(errors[key]).toBeTruthy();
  });

  it("does not judge whether the numbers make sense together — that is the API's answer", () => {
    // Stone heavier than the piece parses fine; the API refuses it with a reason the page then shows.
    expect(buildPreviewRequest(form({ stoneWeight: "999" })).request).not.toBeNull();
  });
});

describe("what the ERP sends is what the API accepts", () => {
  it.each(EXAMPLES.map((e) => [e.label, e] as const))("example “%s” → a request the API's schema accepts", (_label, example) => {
    const { request, errors } = buildPreviewRequest(exampleToForm(example, META));
    expect(errors).toEqual({});
    expect(request).not.toBeNull();
    expect(pricingPreviewSchema.safeParse(request).success).toBe(true);
  });

  it("looks the example's metal up by code, and leaves it blank when the master has no such metal", () => {
    expect(exampleToForm(EXAMPLES[2]!, META).metalId).toBe(SILVER);
    expect(exampleToForm(EXAMPLES[2]!, { metals: [] }).metalId).toBe("");
    expect(exampleToForm(EXAMPLES[0]!, undefined).metalId).toBe("");
  });

  it("every combination of charge type builds a schema-valid request", () => {
    const makings = [["PERCENTAGE", "12"], ["PER_GRAM", "650"], ["FIXED", "1200"], ["PER_PIECE", "350"]] as const;
    const wastages = [["PERCENTAGE", "2"], ["FIXED_WEIGHT", "0.15"], ["NONE", ""]] as const;
    const discounts = [["PERCENTAGE", "5"], ["FLAT", "2000"]] as const;
    for (const [makingMode, makingValue] of makings) for (const [wastageMode, wastageValue] of wastages) for (const [discountMode, discountValue] of discounts) {
      const { request } = buildPreviewRequest(form({ makingMode, makingValue, wastageMode, wastageValue, discountMode, discountValue }));
      expect(pricingPreviewSchema.safeParse(request).success, `${makingMode}/${wastageMode}/${discountMode}`).toBe(true);
    }
  });
});
