import type { ClientSession } from "mongoose";
import type { InventoryItem, InventoryStatus } from "@jewellery/types";
import { updateInventoryItemDetailsSchema, type UpdateInventoryItemDetailsInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { InventoryItemModel, type InventoryItemAttrs } from "./inventory-item.model";

/** Internal — only inventory-item.service.ts (creation) and inventory-transaction.service.ts (movement) call this directly. */
export async function insertInventoryItem(attrs: InventoryItemAttrs, session?: ClientSession) {
  const [doc] = await InventoryItemModel.create([attrs], { session });
  return doc;
}

export async function findInventoryItemById(id: string): Promise<InventoryItem | null> {
  return toDTO<InventoryItem>(await InventoryItemModel.findById(id));
}

export async function requireInventoryItemById(id: string): Promise<InventoryItem> {
  const item = await findInventoryItemById(id);
  if (!item) throw new NotFoundError("InventoryItem", id);
  return item;
}

export async function findInventoryItemByCode(itemCode: string): Promise<InventoryItem | null> {
  return toDTO<InventoryItem>(await InventoryItemModel.findOne({ itemCode: itemCode.toUpperCase() }));
}

export async function listInventoryItems(
  filter: { status?: InventoryStatus; locationId?: string; productId?: string; metalId?: string } = {}
): Promise<InventoryItem[]> {
  return toDTOList<InventoryItem>(await InventoryItemModel.find(filter).sort({ createdAt: -1 }));
}

/** Non-ledger-governed fields only — huid/hallmarkStatus/barcode/serialNumber/stoneDetails. */
export async function updateInventoryItemDetails(id: string, input: UpdateInventoryItemDetailsInput): Promise<InventoryItem> {
  const parsed = updateInventoryItemDetailsSchema.parse(input);
  const doc = await InventoryItemModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("InventoryItem", id);
  return toDTO<InventoryItem>(doc)!;
}
