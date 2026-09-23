import { Types } from "mongoose";
import type { BomInput } from "@jewellery/validation";
import { resolveFineness } from "../metals/metal.repository";
import { roundWeight } from "../inventory/weight-calculations";
import type { BomAttrs, ReconciliationAttrs } from "./manufacturing.models";

/** Beyond the ordered gold trade's convention already used by procurement — see procurement-core.ts's own tolerance. */
export const DISCREPANCY_TOLERANCE_GRAMS = 0.5;

export async function buildBom(input: BomInput): Promise<BomAttrs> {
  const fineness = await resolveFineness(input.metalId, input.purity);
  return {
    metalId: input.metalId as never,
    purity: input.purity,
    fineness,
    expectedGrossWeight: roundWeight(input.expectedGrossWeight),
    expectedWastage: roundWeight(input.expectedWastage),
    stonesRequired: input.stonesRequired.map(({ stoneId, ...s }) => ({ ...s, ...(stoneId ? { stoneId: new Types.ObjectId(stoneId) } : {}) })),
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

/**
 * The five figures the reconciliation screen shows, computed from what actually happened — never
 * trusted from the client. `issued` is fixed at material-issue time; the rest accumulate as the
 * order is completed/returned. A discrepancy beyond tolerance must carry a note (never silently
 * folded into wastage) — the same discipline procurement's goods-receipt weight check uses.
 */
export function reconcile(args: { issuedGrossWeight: number; returnedGrossWeight: number; finishedGrossWeight: number; wastageGrossWeight: number; discrepancyNote?: string }): ReconciliationAttrs {
  const discrepancy = roundWeight(args.issuedGrossWeight - args.returnedGrossWeight - args.finishedGrossWeight - args.wastageGrossWeight);
  const hasDiscrepancy = Math.abs(discrepancy) > DISCREPANCY_TOLERANCE_GRAMS;
  return {
    issuedGrossWeight: args.issuedGrossWeight,
    returnedGrossWeight: args.returnedGrossWeight,
    finishedGrossWeight: args.finishedGrossWeight,
    wastageGrossWeight: args.wastageGrossWeight,
    discrepancyGrossWeight: discrepancy,
    hasDiscrepancy,
    ...(args.discrepancyNote ? { discrepancyNote: args.discrepancyNote } : {}),
  };
}
