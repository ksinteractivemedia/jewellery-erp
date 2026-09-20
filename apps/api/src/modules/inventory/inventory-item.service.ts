import type { ClientSession } from "mongoose";
import type { InventoryItem } from "@jewellery/types";
import { createInventoryItemSchema, type CreateInventoryItemInput } from "@jewellery/validation";
import { ConflictError, DomainValidationError, DuplicateIdentifierError } from "../../shared/errors";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { toDTO } from "../../shared/to-dto";
import { resolveFineness } from "../metals/metal.repository";
import { insertInventoryItem } from "./inventory-item.repository";
import { InventoryItemModel, type InventoryItemAttrs } from "./inventory-item.model";
import { deriveWeights } from "./weight-calculations";

const FIELD_LABEL = { huid: "HUID", barcode: "barcode", itemCode: "item code", serialNumber: "serial number" } as const;

/** Friendly, typed duplicate errors instead of a raw E11000: names the field and the value that clashed. */
export async function assertIdentifiersFree(ids: { itemCode?: string; barcode?: string; huid?: string; serialNumber?: string }, excludeId?: string) {
  for (const field of ["huid", "barcode", "itemCode", "serialNumber"] as const) {
    const value = ids[field];
    if (!value) continue;
    const clash = await InventoryItemModel.exists({ [field]: value, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
    if (clash) throw new DuplicateIdentifierError(FIELD_LABEL[field], value);
  }
}

/** Maps a duplicate-key error raised by a racing writer (after our pre-check) to the same typed error. */
export function translateDuplicateKey(error: unknown): never {
  const e = error as { code?: number; keyPattern?: Record<string, unknown>; keyValue?: Record<string, unknown> };
  if (e?.code === 11000 && e.keyPattern) {
    const field = (Object.keys(e.keyPattern).find((k) => k in FIELD_LABEL) ?? "itemCode") as keyof typeof FIELD_LABEL;
    throw new DuplicateIdentifierError(FIELD_LABEL[field], String(e.keyValue?.[field] ?? ""));
  }
  throw error;
}

/**
 * The only sanctioned way to create an InventoryItem (and only receiveNewInventoryItem, which also
 * writes the first ledger entry, calls it outside tests). Resolves fineness from the Metal's purity
 * options and derives net/fine weight here — a caller never supplies them. Allocates the item code
 * when none is given.
 */
export async function createInventoryItem(
  input: CreateInventoryItemInput,
  session?: ClientSession,
  opts: { ledgerSeq?: number } = {}
): Promise<InventoryItem> {
  const parsed = createInventoryItemSchema.parse(input);
  if (parsed.serialization === "UNIT" && parsed.quantity !== 1) throw new DomainValidationError("a unit item has quantity 1 — use a batch item for multiple");
  const fineness = await resolveFineness(parsed.metalId, parsed.purity);
  const { netWeight, fineWeight } = deriveWeights(parsed.grossWeight, parsed.stoneWeight, fineness);
  const itemCode = parsed.itemCode ?? formatDocumentNumber("JE", await nextSequence("inventoryItem"));

  await assertIdentifiersFree({ itemCode, barcode: parsed.barcode, huid: parsed.huid, serialNumber: parsed.serialNumber });
  try {
    const doc = await insertInventoryItem(
      { ...parsed, itemCode, netWeight, fineWeight, fineness, ledgerSeq: opts.ledgerSeq ?? 0 } as unknown as InventoryItemAttrs,
      session
    );
    return toDTO<InventoryItem>(doc)!;
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) translateDuplicateKey(error);
    throw error;
  }
}

export { ConflictError };
