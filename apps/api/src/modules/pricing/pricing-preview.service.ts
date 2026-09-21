import { PricingError, priceItem } from "@jewellery/pricing-engine";
import type { PriceBreakdown, PricingPlaygroundMeta, PurityRef, WastageTerms } from "@jewellery/types";
import type { PricingPreviewRequest } from "@jewellery/validation";
import { DomainValidationError } from "../../shared/errors";
import { listMetals, requireMetalById } from "../metals/metal.repository";
import { listPricingRules } from "./pricing-rule.repository";

/**
 * The internal pricing playground's backend: a what-if calculation for an authorised admin. It reads
 * reference data (the metal's purities) and the stored pricing rules, calls the ONE pricing engine, and
 * returns its complete breakdown. It reads no orders and writes nothing — no PriceSnapshot, no audit row
 * (nothing was sold or changed). The clock is injected so tests can pin the rule date.
 */
export function createPricingPreviewService(deps: { now?: () => Date } = {}) {
  const now = deps.now ?? (() => new Date());

  return {
    async meta(): Promise<PricingPlaygroundMeta> {
      const metals = await listMetals({ isActive: true });
      return {
        metals: metals.map((m) => ({ id: m.id, code: m.code, name: m.name, purities: m.purityOptions.filter((p) => p.isActive).map((p) => ({ code: p.code, fineness: p.fineness })) })),
      };
    },

    async preview(request: PricingPreviewRequest): Promise<PriceBreakdown> {
      const metal = await requireMetalById(request.metalId);
      const purityOf = (code: string, what: string): PurityRef => {
        const option = metal.purityOptions.find((p) => p.isActive && p.code === code);
        if (!option) throw new DomainValidationError(`${what} "${code}" is not an active purity of ${metal.name}`);
        return { code: option.code, fineness: option.fineness };
      };
      const purity = purityOf(request.purity, "purity");
      const ratePurity = purityOf(request.rate.purity, "rate purity");

      const { sellerState, buyerState, ...taxTerms } = request.tax;
      const wastage = request.wastage as WastageTerms | undefined;

      try {
        return priceItem({
          metalId: metal.id,
          purity,
          grossWeight: request.grossWeight,
          stoneWeight: request.stoneWeight,
          pieces: request.pieces,
          metalRate: { metalId: metal.id, purity: ratePurity, ratePerGram: request.rate.ratePerGram },
          stoneValue: request.stoneValue,
          ...(request.cost !== undefined ? { cost: request.cost } : {}),
          taxRule: taxTerms,
          sellerState,
          buyerState,
          context: { asOf: now(), channel: "ERP", customerType: request.customerType },
          rules: await listPricingRules({ isActive: true }),
          overrides: {
            ...(request.making ? { makingRule: request.making } : {}),
            ...(wastage ? { wastageRule: wastage } : {}),
            ...(request.discount ? { discountRule: request.discount } : {}),
          },
        });
      } catch (error) {
        // The engine refuses unusable input with a reason a person can act on; that is a 400, not a crash.
        if (error instanceof PricingError) throw new DomainValidationError(error.message);
        throw error;
      }
    },
  };
}
export type PricingPreviewService = ReturnType<typeof createPricingPreviewService>;
