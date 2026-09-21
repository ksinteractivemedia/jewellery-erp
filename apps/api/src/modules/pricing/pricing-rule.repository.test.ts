import { beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { ConflictError, DomainValidationError } from "../../shared/errors";
import { createPricingRule, listPricingRules, updatePricingRule } from "./pricing-rule.repository";

const metal = new Types.ObjectId().toString();
const base = { name: "Gold default", metalId: metal, channel: "BOTH" as const, makingChargeType: "PERCENTAGE" as const, makingChargeValue: 12, validFrom: new Date("2026-01-01") };

describe("the pricing rule book refuses ambiguous rules at save time", () => {
  beforeEach(async () => {
    await createPricingRule(base);
  });

  it("refuses a second rule that ranks equally with a stored one, naming it", async () => {
    await expect(createPricingRule({ ...base, name: "Twin", makingChargeValue: 11 })).rejects.toThrow(ConflictError);
    await expect(createPricingRule({ ...base, name: "Twin", makingChargeValue: 11 })).rejects.toThrow(/Gold default/);
    expect(await listPricingRules()).toHaveLength(1);
  });

  it("accepts a rule that is distinguishable: another priority, narrower scope, or later start", async () => {
    await createPricingRule({ ...base, name: "Higher priority", priority: 5 });
    await createPricingRule({ ...base, name: "B2B only", customerType: "B2B" });
    await createPricingRule({ ...base, name: "From July", validFrom: new Date("2026-07-01") });
    expect(await listPricingRules()).toHaveLength(4);
  });

  it("accepts a rule for a different metal, or one that sets a different dimension", async () => {
    await createPricingRule({ ...base, name: "Silver", metalId: new Types.ObjectId().toString() });
    await createPricingRule({ name: "Discount only", metalId: metal, validFrom: new Date("2026-01-01"), discount: { type: "PERCENTAGE", value: 3 } });
    expect(await listPricingRules()).toHaveLength(3);
  });

  it("accepts an inactive twin (it can't apply), but refuses to reactivate it into a clash", async () => {
    const twin = await createPricingRule({ ...base, name: "Dormant twin", isActive: false });
    await expect(updatePricingRule(twin.id, { isActive: true })).rejects.toThrow(ConflictError);
  });

  it("refuses an update that makes a rule tie with another, and leaves it unchanged", async () => {
    const other = await createPricingRule({ ...base, name: "Other", priority: 3 });
    await expect(updatePricingRule(other.id, { priority: 0 })).rejects.toThrow(ConflictError);
    expect((await listPricingRules()).find((r) => r.id === other.id)?.priority).toBe(3);
  });

  it("lets a rule be edited without clashing with itself", async () => {
    const [existing] = await listPricingRules();
    const updated = await updatePricingRule(existing!.id, { makingChargeValue: 13 });
    expect(updated.makingChargeValue).toBe(13);
  });
});

describe("customer-specific and typed rules round-trip through storage", () => {
  it("stores a customer-specific rule and finds it by customer", async () => {
    const customerId = new Types.ObjectId().toString();
    await createPricingRule({ name: "ACME", customerId, validFrom: new Date("2026-01-01"), makingChargeType: "PER_PIECE", makingChargeValue: 35_000, wastageType: "NONE", discount: { type: "PERCENTAGE", value: 50, appliesTo: "MAKING_CHARGES" } });
    const [rule] = await listPricingRules({ customerId });
    expect(rule).toMatchObject({ customerId, makingChargeType: "PER_PIECE", makingChargeValue: 35_000, wastageType: "NONE", discount: { type: "PERCENTAGE", value: 50, appliesTo: "MAKING_CHARGES" } });
  });

  it("refuses to save a rule the schema rejects (fractional paise, wastage NONE with a value)", async () => {
    await expect(createPricingRule({ ...base, makingChargeType: "FIXED", makingChargeValue: 10.5 })).rejects.toThrow();
    await expect(createPricingRule({ ...base, wastageType: "NONE", wastageValue: 2 })).rejects.toThrow();
  });

  it("re-validates the merged rule on update", async () => {
    // Switching the type without switching the value: 12,000 paise per gram would become "12,000%".
    const rule = await createPricingRule({ ...base, makingChargeType: "PER_GRAM", makingChargeValue: 12_000 });
    await expect(updatePricingRule(rule.id, { makingChargeType: "PERCENTAGE" })).rejects.toThrow(DomainValidationError);
  });
});
