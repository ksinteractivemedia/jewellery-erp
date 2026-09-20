import type { ClientSession } from "mongoose";
import type { InventoryLedgerEntry } from "@jewellery/types";
import { createInventoryLedgerEntrySchema, type CreateInventoryLedgerEntryInput } from "@jewellery/validation";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { InventoryLedgerModel } from "./inventory-ledger.model";

/** Internal — only inventory-transaction.service.ts posts ledger entries. */
export async function insertLedgerEntry(input: CreateInventoryLedgerEntryInput, session?: ClientSession): Promise<InventoryLedgerEntry> {
  const parsed = createInventoryLedgerEntrySchema.parse(input);
  const [doc] = await InventoryLedgerModel.create([parsed], { session });
  return toDTO<InventoryLedgerEntry>(doc)!;
}

/** Full, ordered movement history for one item — the standard "where has this piece been" query. */
export async function listLedgerForItem(itemId: string): Promise<InventoryLedgerEntry[]> {
  return toDTOList<InventoryLedgerEntry>(await InventoryLedgerModel.find({ itemId }).sort({ createdAt: 1 }));
}

export async function listLedgerForTransaction(transactionId: string): Promise<InventoryLedgerEntry[]> {
  return toDTOList<InventoryLedgerEntry>(await InventoryLedgerModel.find({ transactionId }).sort({ createdAt: 1 }));
}
