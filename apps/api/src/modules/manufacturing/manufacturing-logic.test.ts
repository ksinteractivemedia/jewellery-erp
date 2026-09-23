import { describe, expect, it } from "vitest";
import { JOB_WORK_ORDER_STATUSES, PRODUCTION_ORDER_STATUSES } from "@jewellery/types";
import { bomInputSchema, returnJobWorkSchema } from "@jewellery/validation";
import {
  IllegalManufacturingTransitionError,
  JOB_WORK_ACTION_TARGETS,
  JOB_WORK_RULES,
  JOB_WORK_TRANSITIONS,
  PRODUCTION_RULES,
  PRODUCTION_TRANSITIONS,
  assertJobWorkMove,
  checkJobWorkAction,
  checkProductionAction,
} from "./manufacturing-status";
import { DISCREPANCY_TOLERANCE_GRAMS, reconcile } from "./manufacturing-core";

/** Every (action x status) pair is decided by the rule table: allowed exactly from the listed statuses, refused with a typed 409 from every other. */
function exhaust(kind: string, all: readonly string[], rules: Record<string, { from: readonly string[]; to: string }>, check: (action: string, status: string) => string) {
  describe(`${kind}: every action x every status`, () => {
    for (const [action, rule] of Object.entries(rules)) {
      for (const status of all) {
        const allowed = rule.from.includes(status);
        it(`${action} from ${status} is ${allowed ? `allowed -> ${rule.to}` : "refused"}`, () => {
          if (allowed) expect(check(action, status)).toBe(rule.to);
          else expect(() => check(action, status)).toThrow(IllegalManufacturingTransitionError);
        });
      }
    }
  });
}
exhaust("production order", PRODUCTION_ORDER_STATUSES, PRODUCTION_RULES, (a, s) => checkProductionAction(a as never, s as never));

describe("job work order: every action x every status (returnGoods's target is derived, so only the guard is checked)", () => {
  for (const [action, rule] of Object.entries(JOB_WORK_RULES)) {
    for (const status of JOB_WORK_ORDER_STATUSES) {
      const allowed = (rule.from as readonly string[]).includes(status);
      it(`${action} from ${status} is ${allowed ? "allowed" : "refused"}`, () => {
        if (allowed) expect(() => checkJobWorkAction(action as never, status)).not.toThrow();
        else expect(() => checkJobWorkAction(action as never, status)).toThrow(IllegalManufacturingTransitionError);
      });
    }
  }
});

describe("the graphs are exactly what the rules imply", () => {
  it("production order: every edge is produced by some action, and terminal statuses have no exits", () => {
    for (const from of PRODUCTION_ORDER_STATUSES) {
      for (const to of PRODUCTION_ORDER_STATUSES) {
        const viaRule = Object.values(PRODUCTION_RULES).some((r) => (r.from as readonly string[]).includes(from) && r.to === to);
        expect(PRODUCTION_TRANSITIONS[from].includes(to), `${from} -> ${to}`).toBe(viaRule);
      }
    }
    for (const t of ["COMPLETED", "CANCELLED"] as const) expect(PRODUCTION_TRANSITIONS[t]).toEqual([]);
  });
  it("job work order: ISSUED/PARTIALLY_RETURNED can only reach PARTIALLY_RETURNED or RETURNED; RETURNED and CANCELLED are final", () => {
    expect([...JOB_WORK_TRANSITIONS.ISSUED].sort()).toEqual(["PARTIALLY_RETURNED", "RETURNED"]);
    expect([...JOB_WORK_TRANSITIONS.PARTIALLY_RETURNED].sort()).toEqual(["PARTIALLY_RETURNED", "RETURNED"]);
    expect(JOB_WORK_TRANSITIONS.RETURNED).toEqual([]);
    expect(JOB_WORK_TRANSITIONS.CANCELLED).toEqual([]);
  });
});

describe("nothing skips a stage: a derived job-work move must still be a legal edge", () => {
  it("returnGoods can move ISSUED -> PARTIALLY_RETURNED or -> RETURNED, never further", () => {
    expect(() => assertJobWorkMove("returnGoods", "ISSUED", "PARTIALLY_RETURNED")).not.toThrow();
    expect(() => assertJobWorkMove("returnGoods", "ISSUED", "RETURNED")).not.toThrow();
    expect(() => assertJobWorkMove("returnGoods", "RETURNED", "PARTIALLY_RETURNED")).toThrow(IllegalManufacturingTransitionError);
  });
  it("every action's JOB_WORK_ACTION_TARGETS entry only names statuses the graph actually reaches from somewhere", () => {
    for (const [action, targets] of Object.entries(JOB_WORK_ACTION_TARGETS)) {
      for (const target of targets) {
        const reachable = (JOB_WORK_RULES[action as keyof typeof JOB_WORK_RULES].from as readonly string[]).some((f) => f === target || JOB_WORK_TRANSITIONS[f as keyof typeof JOB_WORK_TRANSITIONS].includes(target as never));
        expect(reachable, `${action} -> ${target}`).toBe(true);
      }
    }
  });
});

describe("the workflow's own vocabulary matches the spec exactly", () => {
  it("production order: Production Order -> Material Issue -> Manufacturing -> QC -> Finished Jewellery -> Inventory", () => {
    expect([...PRODUCTION_ORDER_STATUSES].sort()).toEqual(["CANCELLED", "COMPLETED", "DRAFT", "IN_PROGRESS", "MATERIAL_ISSUED", "QC_FAILED", "QC_PASSED", "QC_PENDING"].sort());
  });
  it("job work order statuses", () => {
    expect([...JOB_WORK_ORDER_STATUSES].sort()).toEqual(["CANCELLED", "DRAFT", "ISSUED", "PARTIALLY_RETURNED", "RETURNED"].sort());
  });
});

// ---- material reconciliation --------------------------------------------------------------------------
describe("reconcile: issued = returned + finished + wastage, or the difference is a flagged discrepancy", () => {
  it("balances exactly to zero discrepancy", () => {
    const r = reconcile({ issuedGrossWeight: 500, returnedGrossWeight: 50, finishedGrossWeight: 440, wastageGrossWeight: 10 });
    expect(r).toMatchObject({ issuedGrossWeight: 500, returnedGrossWeight: 50, finishedGrossWeight: 440, wastageGrossWeight: 10, discrepancyGrossWeight: 0, hasDiscrepancy: false });
  });
  it("a tiny rounding difference within tolerance is not a discrepancy", () => {
    const r = reconcile({ issuedGrossWeight: 500, returnedGrossWeight: 50, finishedGrossWeight: 440, wastageGrossWeight: 9.7 });
    expect(r.discrepancyGrossWeight).toBeCloseTo(0.3, 5);
    expect(r.hasDiscrepancy).toBe(false);
  });
  it("a real gap beyond tolerance is flagged, and carries the note when given", () => {
    const r = reconcile({ issuedGrossWeight: 500, returnedGrossWeight: 50, finishedGrossWeight: 400, wastageGrossWeight: 10, discrepancyNote: "40 g unaccounted for — investigating" });
    expect(r.discrepancyGrossWeight).toBe(40);
    expect(r.hasDiscrepancy).toBe(true);
    expect(r.discrepancyNote).toContain("investigating");
  });
  it("more came back than was issued is also a discrepancy (negative), not silently clamped", () => {
    const r = reconcile({ issuedGrossWeight: 500, returnedGrossWeight: 500, finishedGrossWeight: 10, wastageGrossWeight: 0 });
    expect(r.discrepancyGrossWeight).toBe(-10);
    expect(r.hasDiscrepancy).toBe(true);
  });
  it("the tolerance is a small, fixed amount of slack for scale rounding, not a percentage", () => {
    expect(DISCREPANCY_TOLERANCE_GRAMS).toBeGreaterThan(0);
    expect(DISCREPANCY_TOLERANCE_GRAMS).toBeLessThan(1);
  });
});

// ---- validation ---------------------------------------------------------------------------------------
describe("bomInputSchema", () => {
  it("needs a positive expected gross weight and rejects an unknown field", () => {
    const base = { metalId: "a".repeat(24), purity: "22K", expectedGrossWeight: 10 };
    expect(bomInputSchema.safeParse(base).success).toBe(true);
    expect(bomInputSchema.safeParse({ ...base, expectedGrossWeight: 0 }).success).toBe(false);
    expect(bomInputSchema.safeParse({ ...base, actualGrossWeight: 1 } as never).success).toBe(false);
  });
});

describe("returnJobWorkSchema", () => {
  it("needs something to record unless it's the final close", () => {
    expect(returnJobWorkSchema.safeParse({}).success).toBe(false);
    expect(returnJobWorkSchema.safeParse({ final: true }).success).toBe(true);
    expect(returnJobWorkSchema.safeParse({ wastage: 2 }).success).toBe(true);
  });
});
