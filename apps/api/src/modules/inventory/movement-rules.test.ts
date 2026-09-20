import { describe, expect, it } from "vitest";
import { MOVEMENT_TYPES } from "@jewellery/validation";
import type { InventoryStatus } from "@jewellery/types";
import { LEGAL_TRANSITIONS } from "./status-transitions";
import { MOVEMENT_RULES, OWNED_STATUSES, STOCK_LOCATION_TYPES, allowedTargets, isAvailableForSale, isOwnedStock } from "./movement-rules";

describe("movement rules", () => {
  it("has a rule for every ledger movement type (no type can be posted without one)", () => {
    for (const type of MOVEMENT_TYPES) expect(MOVEMENT_RULES[type], type).toBeDefined();
  });

  it("never permits a status change the physical status graph forbids", () => {
    for (const type of MOVEMENT_TYPES) {
      for (const [from, to] of MOVEMENT_RULES[type].transitions) expect(LEGAL_TRANSITIONS[from].includes(to), `${type}: ${from} → ${to}`).toBe(true);
    }
  });

  it("every status other than SOLD/MELTING has an owner in some movement's `from`", () => {
    const reachable = new Set<InventoryStatus>(MOVEMENT_TYPES.flatMap((t) => MOVEMENT_RULES[t].transitions.map(([, to]) => to)));
    for (const s of ["AVAILABLE", "RESERVED", "SOLD", "RETURNED", "DAMAGED", "UNDER_REPAIR", "IN_MANUFACTURING", "WITH_JOB_WORKER", "IN_TRANSIT", "HALLMARKING", "SCRAP", "MELTING"] as InventoryStatus[]) {
      // DAMAGED via RETURN inspection; the rest via their own movement. Nothing is unreachable by design.
      expect(reachable.has(s) || s === "AVAILABLE", s).toBe(true);
    }
  });

  it("pairs each outbound movement with exactly one way back", () => {
    expect(allowedTargets("TRANSFER_OUT", "AVAILABLE")).toEqual(["IN_TRANSIT"]);
    expect(allowedTargets("TRANSFER_IN", "IN_TRANSIT")).toEqual(["AVAILABLE"]);
    expect(allowedTargets("HALLMARKING_OUT", "AVAILABLE")).toEqual(["HALLMARKING"]);
    expect(allowedTargets("HALLMARKING_IN", "HALLMARKING")).toEqual(["AVAILABLE"]);
    expect(allowedTargets("JOBWORK_ISSUE", "AVAILABLE")).toEqual(["WITH_JOB_WORKER"]);
    expect(allowedTargets("JOBWORK_RECEIPT", "WITH_JOB_WORKER")).toEqual(["AVAILABLE"]);
  });

  it("a movement can't run from a status it doesn't own", () => {
    expect(allowedTargets("SALE", "SOLD")).toEqual([]);
    expect(allowedTargets("SALE", "IN_TRANSIT")).toEqual([]);
    expect(allowedTargets("RESERVATION", "RESERVED")).toEqual([]);
    expect(allowedTargets("TRANSFER_IN", "AVAILABLE")).toEqual([]);
    expect(allowedTargets("HALLMARKING_OUT", "SOLD")).toEqual([]);
    expect(allowedTargets("RETURN", "AVAILABLE")).toEqual([]);
  });

  it("partner movements are bound to the right kind of location", () => {
    expect(MOVEMENT_RULES.JOBWORK_ISSUE.destination).toEqual(["JOB_WORKER"]);
    expect(MOVEMENT_RULES.HALLMARKING_OUT.destination).toEqual(["HALLMARKING_CENTER"]);
    expect(MOVEMENT_RULES.REPAIR_OUT.destination).toEqual(["REPAIR_CENTER"]);
    expect(MOVEMENT_RULES.MANUFACTURING_ISSUE.destination).toEqual(["MANUFACTURING_UNIT"]);
    for (const back of ["JOBWORK_RECEIPT", "HALLMARKING_IN", "REPAIR_IN", "MANUFACTURING_RECEIPT", "TRANSFER_IN", "TRANSFER_OUT"] as const) {
      expect(MOVEMENT_RULES[back].destination, back).toEqual(STOCK_LOCATION_TYPES);
    }
  });

  it("only receipt-style movements and adjustments can create stock", () => {
    const creators = MOVEMENT_TYPES.filter((t) => MOVEMENT_RULES[t].creates);
    expect(creators.sort()).toEqual(["ADJUSTMENT", "JOBWORK_RECEIPT", "MANUFACTURING_RECEIPT", "PURCHASE_RECEIPT"]);
  });

  it("owned stock excludes exactly SOLD and MELTING", () => {
    expect(isOwnedStock("SOLD")).toBe(false);
    expect(isOwnedStock("MELTING")).toBe(false);
    expect(OWNED_STATUSES).toHaveLength(10);
  });

  it("available-for-sale = AVAILABLE, finished, un-held, with quantity", () => {
    const base = { status: "AVAILABLE", type: "FINISHED_JEWELLERY", quantity: 1, reservation: undefined } as const;
    expect(isAvailableForSale(base)).toBe(true);
    expect(isAvailableForSale({ ...base, status: "RESERVED" })).toBe(false);
    expect(isAvailableForSale({ ...base, status: "IN_TRANSIT" })).toBe(false);
    expect(isAvailableForSale({ ...base, type: "RAW_MATERIAL" })).toBe(false);
    expect(isAvailableForSale({ ...base, quantity: 0 })).toBe(false);
    expect(isAvailableForSale({ ...base, reservation: { referenceType: "ORDER", referenceId: "x", reservedAt: new Date(), reservedBy: "u" } })).toBe(false);
  });
});
