import { describe, expect, it } from "vitest";
import { EXCHANGE_STATUSES } from "@jewellery/types";
import { completeExchangeSchema, createExchangeSchema, oldJewelleryAssessmentSchema } from "@jewellery/validation";
import { EXCHANGE_RULES, EXCHANGE_TRANSITIONS, IllegalExchangeTransitionError, checkExchangeAction } from "./exchange-status";

describe("exchange: every action x every status", () => {
  for (const [action, rule] of Object.entries(EXCHANGE_RULES)) {
    for (const status of EXCHANGE_STATUSES) {
      const allowed = (rule.from as readonly string[]).includes(status);
      it(`${action} from ${status} is ${allowed ? `allowed -> ${rule.to}` : "refused"}`, () => {
        if (allowed) expect(checkExchangeAction(action as never, status)).toBe(rule.to);
        else expect(() => checkExchangeAction(action as never, status)).toThrow(IllegalExchangeTransitionError);
      });
    }
  }
});

describe("the graph is exactly what the rules imply", () => {
  it("COMPLETED/CANCELLED have no exits", () => {
    for (const from of EXCHANGE_STATUSES) {
      for (const to of EXCHANGE_STATUSES) {
        const viaRule = Object.values(EXCHANGE_RULES).some((r) => (r.from as readonly string[]).includes(from) && r.to === to);
        expect(EXCHANGE_TRANSITIONS[from].includes(to), `${from} -> ${to}`).toBe(viaRule);
      }
    }
    expect(EXCHANGE_TRANSITIONS.COMPLETED).toEqual([]);
    expect(EXCHANGE_TRANSITIONS.CANCELLED).toEqual([]);
  });
});

describe("re-assessment", () => {
  it("ASSESSED can be re-assessed (weighing again isn't a correction, it's the job)", () => {
    expect(checkExchangeAction("assess", "DRAFT")).toBe("ASSESSED");
    expect(checkExchangeAction("assess", "ASSESSED")).toBe("ASSESSED");
    expect(() => checkExchangeAction("assess", "COMPLETED")).toThrow();
  });
});

describe("oldJewelleryAssessmentSchema", () => {
  it("refuses stone weight exceeding gross weight, and unknown fields", () => {
    const base = { description: "old bangle", metalId: "a".repeat(24), grossWeight: 20, stoneWeight: 2, assessedPurity: "22K", ratePerGram: 650000 };
    expect(oldJewelleryAssessmentSchema.safeParse(base).success).toBe(true);
    expect(oldJewelleryAssessmentSchema.safeParse({ ...base, stoneWeight: 25 }).success).toBe(false);
    expect(oldJewelleryAssessmentSchema.safeParse({ ...base, valuation: 100 } as never).success).toBe(false); // computed server-side, never accepted as input
  });
});

describe("createExchangeSchema / completeExchangeSchema", () => {
  it("needs a customer and an assessment to create; completion needs a location and a new product", () => {
    const assessment = { description: "old bangle", metalId: "a".repeat(24), grossWeight: 20, stoneWeight: 2, assessedPurity: "22K", ratePerGram: 650000 };
    expect(createExchangeSchema.safeParse({ customer: { name: "Asha" }, oldJewellery: assessment }).success).toBe(true);
    expect(createExchangeSchema.safeParse({ customer: { name: "Asha" } } as never).success).toBe(false);
    expect(
      completeExchangeSchema.safeParse({
        locationId: "a".repeat(24),
        newProduct: { productId: "b".repeat(24), sku: "RG-001", name: "Ring", unitPrice: 500000, lineTotal: 500000 },
        settlement: { method: "CASH" },
      }).success
    ).toBe(true);
  });
});
