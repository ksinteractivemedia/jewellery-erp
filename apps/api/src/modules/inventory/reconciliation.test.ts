import { describe, expect, it } from "vitest";
import type { InventoryLedgerEntry } from "@jewellery/types";
import { replayLedger } from "./reconciliation";

const bal = (q: number, g: number) => ({ quantity: q, grossWeight: g, stoneWeight: 0, netWeight: g, fineWeight: Math.round(g * 916) / 1000 });
const entry = (over: Partial<InventoryLedgerEntry> & Pick<InventoryLedgerEntry, "sequence" | "toStatus" | "balanceAfter">): InventoryLedgerEntry =>
  ({ id: `e${over.sequence}`, transactionId: "t", itemId: "i", movementType: "ADJUSTMENT", quantity: 0, grossWeight: 0, netWeight: 0, fineWeight: 0, ...over }) as InventoryLedgerEntry;

describe("replayLedger", () => {
  const good = [
    entry({ sequence: 1, movementType: "PURCHASE_RECEIPT", toStatus: "AVAILABLE", quantity: 1, grossWeight: 10, netWeight: 10, fineWeight: 9.16, balanceAfter: bal(1, 10), destinationLocationId: "A" }),
    entry({ sequence: 2, movementType: "RESERVATION", fromStatus: "AVAILABLE", toStatus: "RESERVED", balanceAfter: bal(1, 10), destinationLocationId: "A" }),
    entry({ sequence: 3, movementType: "SALE", fromStatus: "RESERVED", toStatus: "SOLD", balanceAfter: bal(1, 10), destinationLocationId: "A" }),
  ];

  it("reports the state the ledger ends in, regardless of the order it is handed over", () => {
    const r = replayLedger([good[2]!, good[0]!, good[1]!]);
    expect(r).toMatchObject({ problems: [], sequence: 3, status: "SOLD", locationId: "A" });
    expect(r.balance).toMatchObject({ quantity: 1, grossWeight: 10 });
  });

  it("flags a missing entry (sequence gap)", () => {
    expect(replayLedger([good[0]!, good[2]!]).problems.join()).toMatch(/expected sequence 2 but found 3/);
  });

  it("flags entries that don't chain (status jumps)", () => {
    const broken = [good[0]!, entry({ sequence: 2, movementType: "SALE", fromStatus: "RESERVED", toStatus: "SOLD", balanceAfter: bal(1, 10), destinationLocationId: "A" })];
    expect(replayLedger(broken).problems.join()).toMatch(/starts from RESERVED but #1 ended at AVAILABLE/);
  });

  it("flags a balance that isn't previous balance + delta", () => {
    const tampered = [good[0]!, entry({ sequence: 2, fromStatus: "AVAILABLE", toStatus: "AVAILABLE", grossWeight: -1, netWeight: -1, fineWeight: -0.916, balanceAfter: bal(1, 10), destinationLocationId: "A" })];
    expect(replayLedger(tampered).problems.join()).toMatch(/grossWeight: previous balance \+ delta = 9/);
  });

  it("accepts a legitimate weight correction", () => {
    const fixed = [good[0]!, entry({ sequence: 2, fromStatus: "AVAILABLE", toStatus: "AVAILABLE", grossWeight: -0.5, netWeight: -0.5, fineWeight: -0.458, balanceAfter: { quantity: 1, grossWeight: 9.5, stoneWeight: 0, netWeight: 9.5, fineWeight: 8.702 }, destinationLocationId: "A" })];
    expect(replayLedger(fixed).problems).toEqual([]);
  });

  it("an empty ledger replays to nothing", () => {
    expect(replayLedger([])).toMatchObject({ problems: [], sequence: 0, status: undefined });
  });
});
