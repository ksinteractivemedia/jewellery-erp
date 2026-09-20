import type { StoneInventoryLot, StoneInventoryStatus } from "@jewellery/types";
import {
  createStoneInventorySchema,
  updateStoneInventoryDetailsSchema,
  type CreateStoneInventoryInput,
  type UpdateStoneInventoryDetailsInput,
} from "@jewellery/validation";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { StoneInventoryModel } from "./stone-inventory.model";

export async function createStoneInventoryLot(input: CreateStoneInventoryInput): Promise<StoneInventoryLot> {
  const parsed = createStoneInventorySchema.parse(input);
  const doc = await StoneInventoryModel.create(parsed);
  return toDTO<StoneInventoryLot>(doc)!;
}

export async function findStoneInventoryById(id: string): Promise<StoneInventoryLot | null> {
  return toDTO<StoneInventoryLot>(await StoneInventoryModel.findById(id));
}

export async function requireStoneInventoryById(id: string): Promise<StoneInventoryLot> {
  const lot = await findStoneInventoryById(id);
  if (!lot) throw new NotFoundError("StoneInventoryLot", id);
  return lot;
}

export async function listStoneInventory(
  filter: { stoneId?: string; status?: StoneInventoryStatus; locationId?: string } = {}
): Promise<StoneInventoryLot[]> {
  return toDTOList<StoneInventoryLot>(await StoneInventoryModel.find(filter).sort({ itemCode: 1 }));
}

export async function updateStoneInventoryDetails(id: string, input: UpdateStoneInventoryDetailsInput): Promise<StoneInventoryLot> {
  const parsed = updateStoneInventoryDetailsSchema.parse(input);
  const doc = await StoneInventoryModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("StoneInventoryLot", id);
  return toDTO<StoneInventoryLot>(doc)!;
}

/**
 * Atomic, guarded status/location change — deliberately simpler than the full
 * InventoryLedger machinery in ../inventory (no ledger trail yet for loose stones;
 * see docs/data-model.md for the note on unifying this in a later phase). Still
 * guarded so two concurrent operations can't both act on the same expected status.
 */
export async function changeStoneInventoryStatus(
  id: string,
  fromStatus: StoneInventoryStatus,
  toStatus: StoneInventoryStatus,
  locationId?: string
): Promise<StoneInventoryLot> {
  const doc = await StoneInventoryModel.findOneAndUpdate(
    { _id: id, status: fromStatus },
    { status: toStatus, ...(locationId ? { locationId } : {}) },
    { new: true }
  );
  if (!doc) {
    const exists = await StoneInventoryModel.exists({ _id: id });
    if (!exists) throw new NotFoundError("StoneInventoryLot", id);
    throw new ConflictError(`lot ${id} is not in status ${fromStatus}`);
  }
  return toDTO<StoneInventoryLot>(doc)!;
}
