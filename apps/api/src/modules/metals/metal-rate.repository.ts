import type { MetalRate } from "@jewellery/types";
import { createMetalRateSchema, type CreateMetalRateInput } from "@jewellery/validation";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { MetalRateModel } from "./metal-rate.model";

export async function createMetalRate(input: CreateMetalRateInput): Promise<MetalRate> {
  const parsed = createMetalRateSchema.parse(input);
  const doc = await MetalRateModel.create(parsed);
  return toDTO<MetalRate>(doc)!;
}

/** The rate in effect as of a given moment (defaults to now) — the ledger/pricing engine's only read path. */
export async function findCurrentRate(metalId: string, purity: string, asOf: Date = new Date()): Promise<MetalRate | null> {
  const doc = await MetalRateModel.findOne({ metalId, purity, effectiveFrom: { $lte: asOf } }).sort({ effectiveFrom: -1 });
  return toDTO<MetalRate>(doc);
}

export async function listRateHistory(metalId: string, purity: string): Promise<MetalRate[]> {
  return toDTOList<MetalRate>(await MetalRateModel.find({ metalId, purity }).sort({ effectiveFrom: -1 }));
}
