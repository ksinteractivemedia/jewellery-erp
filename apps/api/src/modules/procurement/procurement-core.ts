import { isLedgerTracked, isWeightTracked, type PurchaseType } from "@jewellery/types";
import type { PurchaseLineInput } from "@jewellery/validation";
import { DomainValidationError } from "../../shared/errors";
import { resolveFineness } from "../metals/metal.repository";
import { roundWeight } from "../inventory/weight-calculations";
import type { PurchaseLineAttrs, TotalsAttrs } from "./procurement.models";

/** Round to the nearest whole paisa, half away from zero — the codebase's one rounding convention for money. */
export const roundPaise = (p: number) => Math.round(p);

/**
 * A line's agreed value: `fineWeight × ratePerGram` for a weight-tracked purchase (the gold-trade
 * convention — the rate is quoted per gram of FINE metal, so purity is priced in directly, unlike
 * the sales engine's rule-resolved breakdown, which this deliberately is not — see procurement.ts).
 */
export async function buildPurchaseLine(input: PurchaseLineInput): Promise<PurchaseLineAttrs> {
  const type = input.purchaseType as PurchaseType;
  const weightTracked = isWeightTracked(type);
  let fineness: number | undefined;
  let value: number;
  // Every ledger-tracked line (everything but CONSUMABLE) ends up as an InventoryItem and needs a fineness snapshot,
  // even one priced by the piece (finished jewellery) rather than by the gram.
  if (isLedgerTracked(type)) {
    if (!input.metalId || !input.purity) throw new DomainValidationError(`${input.purchaseType} needs a metal and purity`);
    fineness = await resolveFineness(input.metalId, input.purity);
  }
  if (weightTracked) {
    if (!input.grossWeight || !input.ratePerGram) throw new DomainValidationError(`${input.purchaseType} needs an ordered gross weight and a rate per gram`);
    const fineWeight = roundWeight(input.grossWeight * fineness!);
    value = roundPaise(fineWeight * input.ratePerGram);
  } else {
    if (input.purchaseType !== "CONSUMABLE" && !input.ratePerUnit) throw new DomainValidationError(`${input.purchaseType} needs a rate per unit`);
    value = roundPaise((input.ratePerUnit ?? 0) * input.quantity);
  }
  return {
    purchaseType: input.purchaseType as PurchaseType,
    description: input.description,
    ...(input.productId ? { productId: input.productId as unknown as PurchaseLineAttrs["productId"] } : {}),
    ...(input.variantId ? { variantId: input.variantId as unknown as PurchaseLineAttrs["variantId"] } : {}),
    ...(input.metalId ? { metalId: input.metalId as unknown as PurchaseLineAttrs["metalId"] } : {}),
    ...(input.purity ? { purity: input.purity } : {}),
    ...(fineness !== undefined ? { fineness } : {}),
    quantity: input.quantity,
    ...(input.grossWeight !== undefined ? { grossWeight: roundWeight(input.grossWeight) } : {}),
    ...(input.ratePerGram !== undefined ? { ratePerGram: input.ratePerGram } : {}),
    ...(input.ratePerUnit !== undefined ? { ratePerUnit: input.ratePerUnit } : {}),
    value,
    ...(input.lotNumber ? { lotNumber: input.lotNumber } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    receivedQuantity: 0,
    receivedGrossWeight: 0,
  };
}

export function totalsOf(lines: { value: number }[], taxAmount = 0): TotalsAttrs {
  const subtotal = lines.reduce((s, l) => s + l.value, 0);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

/** A line is fully received once its governing measure (weight for a weight-tracked type, quantity otherwise) is met. */
export function lineIsClosed(l: Pick<PurchaseLineAttrs, "purchaseType" | "quantity" | "grossWeight" | "receivedQuantity" | "receivedGrossWeight">): boolean {
  return isWeightTracked(l.purchaseType) ? l.receivedGrossWeight >= (l.grossWeight ?? 0) : l.receivedQuantity >= l.quantity;
}

/** How much of a line's governing measure is still outstanding. */
export function lineOutstanding(l: Pick<PurchaseLineAttrs, "purchaseType" | "quantity" | "grossWeight" | "receivedQuantity" | "receivedGrossWeight">): number {
  return isWeightTracked(l.purchaseType) ? roundWeight((l.grossWeight ?? 0) - l.receivedGrossWeight) : l.quantity - l.receivedQuantity;
}

/** The tolerance beyond which a receipt's weight is flagged against the PO line's pro-rata expectation — real scale readings never match an estimate exactly. */
export const WEIGHT_DISCREPANCY_TOLERANCE_PERCENT = 2;
