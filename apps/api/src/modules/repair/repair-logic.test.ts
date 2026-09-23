import { describe, expect, it } from "vitest";
import { REPAIR_ORDER_STATUSES } from "@jewellery/types";
import { repairIntakeSchema, recordRepairWorkSchema, estimateRepairSchema } from "@jewellery/validation";
import { REPAIR_RULES, REPAIR_TRANSITIONS, IllegalRepairTransitionError, checkRepairAction } from "./repair-status";

describe("repair order: every action x every status", () => {
  for (const [action, rule] of Object.entries(REPAIR_RULES)) {
    for (const status of REPAIR_ORDER_STATUSES) {
      const allowed = (rule.from as readonly string[]).includes(status);
      it(`${action} from ${status} is ${allowed ? `allowed -> ${rule.to}` : "refused"}`, () => {
        if (allowed) expect(checkRepairAction(action as never, status)).toBe(rule.to);
        else expect(() => checkRepairAction(action as never, status)).toThrow(IllegalRepairTransitionError);
      });
    }
  }
});

describe("the graph is exactly what the rules imply", () => {
  it("DECLINED/DELIVERED/CANCELLED have no exits", () => {
    for (const from of REPAIR_ORDER_STATUSES) {
      for (const to of REPAIR_ORDER_STATUSES) {
        const viaRule = Object.values(REPAIR_RULES).some((r) => (r.from as readonly string[]).includes(from) && r.to === to);
        expect(REPAIR_TRANSITIONS[from].includes(to), `${from} -> ${to}`).toBe(viaRule);
      }
    }
    expect(REPAIR_TRANSITIONS.DECLINED).toEqual([]);
    expect(REPAIR_TRANSITIONS.DELIVERED).toEqual([]);
    expect(REPAIR_TRANSITIONS.CANCELLED).toEqual([]);
  });
});

describe("the workflow's own vocabulary and its loops", () => {
  it("matches the spec, and QC_FAILED loops back to IN_PROGRESS for rework", () => {
    expect([...REPAIR_ORDER_STATUSES].sort()).toEqual(
      ["INTAKE", "INSPECTED", "ESTIMATED", "APPROVED", "DECLINED", "IN_PROGRESS", "QC_PENDING", "QC_FAILED", "READY", "DELIVERED", "CANCELLED"].sort()
    );
    expect(checkRepairAction("rework", "QC_FAILED")).toBe("IN_PROGRESS");
    expect(checkRepairAction("declineEstimate", "ESTIMATED")).toBe("DECLINED");
    expect(checkRepairAction("estimate", "ESTIMATED")).toBe("ESTIMATED"); // re-estimable before a decision
  });
  it("cancel reaches every working status but not READY (which should be delivered instead) or a terminal one", () => {
    for (const s of ["INTAKE", "INSPECTED", "ESTIMATED", "APPROVED", "IN_PROGRESS", "QC_PENDING", "QC_FAILED"] as const) {
      expect(checkRepairAction("cancel", s)).toBe("CANCELLED");
    }
    expect(() => checkRepairAction("cancel", "READY")).toThrow();
    expect(() => checkRepairAction("cancel", "DELIVERED")).toThrow();
  });
});

describe("repairIntakeSchema", () => {
  it("an existing item needs only its id; a customer-owned piece needs metal, purity and weight", () => {
    const customer = { name: "Priya", phone: "9876543210" };
    expect(repairIntakeSchema.safeParse({ customer, itemId: "a".repeat(24), itemDescription: "Gold ring", locationId: "b".repeat(24) }).success).toBe(true);
    expect(repairIntakeSchema.safeParse({ customer, itemDescription: "Gold ring", locationId: "b".repeat(24) }).success).toBe(false);
    expect(
      repairIntakeSchema.safeParse({ customer, itemDescription: "Gold ring", metalId: "a".repeat(24), purity: "22K", grossWeight: 12, locationId: "b".repeat(24) }).success
    ).toBe(true);
  });
});

describe("recordRepairWorkSchema / estimateRepairSchema", () => {
  it("the after-repair stone weight cannot exceed the after-repair gross weight", () => {
    expect(recordRepairWorkSchema.safeParse({ afterGrossWeight: 10, afterStoneWeight: 2 }).success).toBe(true);
    expect(recordRepairWorkSchema.safeParse({ afterGrossWeight: 10, afterStoneWeight: 12 }).success).toBe(false);
  });
  it("an estimate's charges are non-negative paise, never a computed total accepted as input", () => {
    expect(estimateRepairSchema.safeParse({ labourCharge: 50000 }).success).toBe(true);
    expect(estimateRepairSchema.safeParse({ labourCharge: 50000, total: 50000 } as never).success).toBe(false);
  });
});
