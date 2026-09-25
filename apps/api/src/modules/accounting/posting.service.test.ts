import { beforeEach, describe, expect, it } from "vitest";
import { DomainValidationError } from "../../shared/errors";
import { withInventoryTransaction } from "../inventory/inventory-transaction.service";
import { syncChartOfAccounts } from "./chart-of-accounts.service";
import { postJournal } from "./posting.service";

const line = (role: "ACCOUNTS_RECEIVABLE" | "SALES", direction: "DEBIT" | "CREDIT", amount: number) => ({ role, direction, amount });
const post = (amount: number) =>
  withInventoryTransaction((session) =>
    postJournal(session, {
      date: "2026-01-01",
      channel: "ERP",
      referenceType: "MANUAL",
      narration: "test",
      performedBy: "000000000000000000000001",
      lines: [line("ACCOUNTS_RECEIVABLE", "DEBIT", amount), line("SALES", "CREDIT", amount)],
    })
  );

beforeEach(async () => {
  await syncChartOfAccounts();
});

describe("postJournal refuses a line amount that isn't a whole non-negative number of paise", () => {
  it("rejects NaN outright, instead of silently dropping the line (which could let an unbalanced or empty entry through)", async () => {
    await expect(post(NaN)).rejects.toThrow(DomainValidationError);
  });
  it("rejects a fractional amount", async () => {
    await expect(post(100.5)).rejects.toThrow(DomainValidationError);
  });
  it("rejects a negative amount", async () => {
    await expect(post(-100)).rejects.toThrow(DomainValidationError);
  });
  it("rejects Infinity", async () => {
    await expect(post(Infinity)).rejects.toThrow(DomainValidationError);
  });
  it("still accepts a normal whole-paise amount", async () => {
    await expect(post(100)).resolves.toMatchObject({ totalDebit: 100, totalCredit: 100 });
  });
});
