import { DomainValidationError } from "../../shared/errors";

/**
 * The only place net/fine weight are computed. Never trust these values from a caller
 * (see createInventoryItemSchema in packages/validation) — always derive them here.
 */

/** Rounds to 3 decimal places — the precision jewellery scales actually report. */
export function roundWeight(grams: number): number {
  return Math.round(grams * 1000) / 1000;
}

export function calculateNetWeight(grossWeight: number, stoneWeight: number): number {
  if (grossWeight < 0 || stoneWeight < 0) {
    throw new DomainValidationError("grossWeight and stoneWeight must be non-negative");
  }
  if (stoneWeight > grossWeight) {
    throw new DomainValidationError("stoneWeight cannot exceed grossWeight");
  }
  return roundWeight(grossWeight - stoneWeight);
}

/**
 * `fineness` is the fraction of pure metal in the purity (22K gold = 0.916) — see
 * metal.repository.ts `resolveFineness`, which looks this up from `Metal.purityOptions`
 * rather than a hardcoded table, so a new purity standard is a data change.
 */
export function calculateFineWeight(netWeight: number, fineness: number): number {
  if (netWeight < 0) {
    throw new DomainValidationError("netWeight must be non-negative");
  }
  if (fineness <= 0 || fineness > 1) {
    throw new DomainValidationError("fineness must be in (0, 1]");
  }
  return roundWeight(netWeight * fineness);
}

export interface DerivedWeights {
  netWeight: number;
  fineWeight: number;
}

/** Convenience wrapper for the two calculations an InventoryItem always needs together. */
export function deriveWeights(grossWeight: number, stoneWeight: number, fineness: number): DerivedWeights {
  const netWeight = calculateNetWeight(grossWeight, stoneWeight);
  const fineWeight = calculateFineWeight(netWeight, fineness);
  return { netWeight, fineWeight };
}
