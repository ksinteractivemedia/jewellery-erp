import type { ClientSession } from "mongoose";
import type { InventoryItem } from "@jewellery/types";
import { createInventoryItemSchema, type CreateInventoryItemInput } from "@jewellery/validation";
import { toDTO } from "../../shared/to-dto";
import { resolveFineness } from "../metals/metal.repository";
import { insertInventoryItem } from "./inventory-item.repository";
import type { InventoryItemAttrs } from "./inventory-item.model";
import { deriveWeights } from "./weight-calculations";

/**
 * The only sanctioned way to create an InventoryItem. Resolves fineness from the Metal's
 * purity options and derives net/fine weight here — a caller never supplies them
 * (createInventoryItemSchema deliberately has no netWeight/fineWeight fields).
 */
export async function createInventoryItem(input: CreateInventoryItemInput, session?: ClientSession): Promise<InventoryItem> {
  const parsed = createInventoryItemSchema.parse(input);
  const fineness = await resolveFineness(parsed.metalId, parsed.purity);
  const { netWeight, fineWeight } = deriveWeights(parsed.grossWeight, parsed.stoneWeight, fineness);

  const doc = await insertInventoryItem(
    {
      ...parsed,
      netWeight,
      fineWeight,
      fineness,
    } as unknown as InventoryItemAttrs,
    session
  );
  return toDTO<InventoryItem>(doc)!;
}
