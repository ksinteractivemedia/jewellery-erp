import type { Metal } from "@jewellery/types";
import { createMetalSchema, updateMetalSchema, type CreateMetalInput, type UpdateMetalInput } from "@jewellery/validation";
import { DomainValidationError, NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { MetalModel } from "./metal.model";

export async function createMetal(input: CreateMetalInput): Promise<Metal> {
  const parsed = createMetalSchema.parse(input);
  const doc = await MetalModel.create(parsed);
  return toDTO<Metal>(doc)!;
}

export async function findMetalById(id: string): Promise<Metal | null> {
  return toDTO<Metal>(await MetalModel.findById(id));
}

export async function requireMetalById(id: string): Promise<Metal> {
  const metal = await findMetalById(id);
  if (!metal) throw new NotFoundError("Metal", id);
  return metal;
}

export async function findMetalByCode(code: string): Promise<Metal | null> {
  return toDTO<Metal>(await MetalModel.findOne({ code: code.toUpperCase() }));
}

export async function listMetals(filter: { isActive?: boolean } = {}): Promise<Metal[]> {
  return toDTOList<Metal>(await MetalModel.find(filter).sort({ name: 1 }));
}

export async function updateMetal(id: string, input: UpdateMetalInput): Promise<Metal> {
  const parsed = updateMetalSchema.parse(input);
  const doc = await MetalModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("Metal", id);
  return toDTO<Metal>(doc)!;
}

/**
 * Resolves the fineness for a purity code on a metal — the one lookup weight-calculations.ts
 * needs. Throws rather than silently defaulting, since a wrong fineness silently corrupts
 * every downstream weight/value calculation for that item.
 */
export async function resolveFineness(metalId: string, purityCode: string): Promise<number> {
  const metal = await requireMetalById(metalId);
  const option = metal.purityOptions.find((p) => p.code === purityCode && p.isActive);
  if (!option) {
    throw new DomainValidationError(`purity '${purityCode}' is not a recognized, active purity for metal '${metal.code}'`);
  }
  return option.fineness;
}
