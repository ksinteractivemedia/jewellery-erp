import type { ChartOfAccount, SystemAccountRole } from "@jewellery/types";
import type { CreateChartOfAccountInput, UpdateChartOfAccountInput } from "@jewellery/validation";
import { ConflictError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { ChartOfAccountModel, type ChartOfAccountDocument } from "./chart-of-accounts.model";

/**
 * The default chart — code, name, type and (for the accounts the posting engine drives
 * automatically) a system role. This is policy-as-code, the same pattern as `role-matrix.ts`:
 * `syncChartOfAccounts()` runs at every boot and creates whatever is missing, but — unlike
 * roles — never overwrites a name/description a business has already customised. Only the
 * role → account mapping is protected (business-rules.md §20.1): an account's `systemRole`
 * can't drift by hand edit, so the posting engine's lookups are never ambiguous.
 */
export const DEFAULT_CHART_OF_ACCOUNTS: { code: string; name: string; type: ChartOfAccount["type"]; systemRole?: SystemAccountRole; description: string }[] = [
  { code: "1010", name: "Cash", type: "ASSET", systemRole: "CASH", description: "Cash in hand" },
  { code: "1020", name: "Bank", type: "ASSET", systemRole: "BANK", description: "Bank current account — every non-cash payment method lands here" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET", systemRole: "ACCOUNTS_RECEIVABLE", description: "What customers owe on issued invoices" },
  { code: "1200", name: "Inventory", type: "ASSET", systemRole: "INVENTORY", description: "Stock on hand, at cost" },
  { code: "1400", name: "GST Receivable", type: "ASSET", systemRole: "GST_RECEIVABLE", description: "Input tax credit on purchases" },
  { code: "2100", name: "Accounts Payable", type: "LIABILITY", systemRole: "ACCOUNTS_PAYABLE", description: "What is owed to suppliers on recorded invoices" },
  { code: "2200", name: "GST Payable", type: "LIABILITY", systemRole: "GST_PAYABLE", description: "Output tax collected on sales" },
  { code: "3000", name: "Owner's Equity", type: "EQUITY", description: "Opening balances and owner contributions" },
  { code: "4000", name: "Sales Revenue", type: "INCOME", systemRole: "SALES", description: "Gross revenue from B2C and B2B sales, before discount" },
  { code: "4900", name: "Discount Given", type: "INCOME", systemRole: "DISCOUNT_GIVEN", description: "Concessions given on sales — a contra-revenue account" },
  { code: "5000", name: "Purchases", type: "EXPENSE", systemRole: "PURCHASES", description: "Consumables and other non-stock purchases" },
  { code: "5100", name: "Cost of Goods Sold", type: "EXPENSE", systemRole: "COST_OF_GOODS_SOLD", description: "Book cost of pieces sold" },
];

export async function syncChartOfAccounts(): Promise<{ created: number }> {
  let created = 0;
  for (const a of DEFAULT_CHART_OF_ACCOUNTS) {
    const res = await ChartOfAccountModel.updateOne(
      { code: a.code },
      { $setOnInsert: { code: a.code, name: a.name, type: a.type, description: a.description, isSystem: true, isActive: true }, ...(a.systemRole ? { $set: { systemRole: a.systemRole } } : {}) },
      { upsert: true }
    );
    if (res.upsertedCount) created++;
  }
  return { created };
}

/** The posting engine's one lookup: which account currently plays this role. Never a hardcoded id — a cheap, indexed query, not cached, so a role reassignment on the COA screen takes effect on the very next posting. */
export async function requireSystemAccount(role: SystemAccountRole): Promise<ChartOfAccountDocument> {
  const doc = await ChartOfAccountModel.findOne({ systemRole: role, isActive: true });
  if (!doc) throw new DomainValidationError(`No active account holds the ${role} role — check Settings → Chart of Accounts.`);
  return doc;
}

export async function listChartOfAccounts(filter: { isActive?: boolean } = {}): Promise<ChartOfAccount[]> {
  const query: Record<string, unknown> = {};
  if (filter.isActive !== undefined) query.isActive = filter.isActive;
  return toDTOList<ChartOfAccount>(await ChartOfAccountModel.find(query).sort({ code: 1 }));
}

export async function createChartOfAccount(input: CreateChartOfAccountInput): Promise<ChartOfAccount> {
  const existing = await ChartOfAccountModel.findOne({ code: input.code.toUpperCase() }).lean();
  if (existing) throw new ConflictError(`An account with code ${input.code} already exists.`);
  const doc = await ChartOfAccountModel.create({ ...input, isSystem: false, isActive: true });
  return toDTO<ChartOfAccount>(doc)!;
}

export async function updateChartOfAccount(id: string, input: UpdateChartOfAccountInput): Promise<ChartOfAccount> {
  const doc = await ChartOfAccountModel.findById(id);
  if (!doc) throw new NotFoundError("Account", id);
  if (input.isActive === false && doc.systemRole) {
    const others = await ChartOfAccountModel.countDocuments({ systemRole: doc.systemRole, isActive: true, _id: { $ne: doc._id } });
    if (others === 0) throw new ConflictError(`${doc.name} is the only account holding the ${doc.systemRole} role — the posting engine needs one active. Give the role to another account first.`);
  }
  if (input.name !== undefined) doc.name = input.name;
  if (input.description !== undefined) doc.description = input.description;
  if (input.isActive !== undefined) doc.isActive = input.isActive;
  await doc.save();
  return toDTO<ChartOfAccount>(doc)!;
}
