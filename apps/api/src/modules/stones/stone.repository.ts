import type { Stone } from "@jewellery/types";
import { createStoneSchema, updateStoneSchema, type CreateStoneInput, type UpdateStoneInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { StoneModel } from "./stone.model";

export async function createStone(input: CreateStoneInput): Promise<Stone> {
  const parsed = createStoneSchema.parse(input);
  const doc = await StoneModel.create(parsed);
  return toDTO<Stone>(doc)!;
}

export async function findStoneById(id: string): Promise<Stone | null> {
  return toDTO<Stone>(await StoneModel.findById(id));
}

export async function requireStoneById(id: string): Promise<Stone> {
  const stone = await findStoneById(id);
  if (!stone) throw new NotFoundError("Stone", id);
  return stone;
}

export async function listStones(filter: { category?: string; isActive?: boolean } = {}): Promise<Stone[]> {
  return toDTOList<Stone>(await StoneModel.find(filter).sort({ name: 1 }));
}

export async function updateStone(id: string, input: UpdateStoneInput): Promise<Stone> {
  const parsed = updateStoneSchema.parse(input);
  const doc = await StoneModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("Stone", id);
  return toDTO<Stone>(doc)!;
}
