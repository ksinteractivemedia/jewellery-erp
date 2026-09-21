import { PricingError, priceItem, resolveTaxRule } from "@jewellery/pricing-engine";
import type { PriceBreakdown, PriceSnapshot, PricingRule, StorePrice, StorePriceUnavailableReason, TaxRule } from "@jewellery/types";
import { listActiveTaxRules } from "../compliance/tax-rule.repository";
import { MetalModel } from "../metals/metal.model";
import { MetalRateModel } from "../metals/metal-rate.model";
import { CompanyModel } from "../organization/company.model";
import { listPricingRules } from "../pricing/pricing-rule.repository";

interface MetalLite {
  id: string;
  name: string;
  code: string;
  fineness: Map<string, number>;
}
interface Rate {
  ratePerGram: number;
  purity: string;
  effectiveFrom: Date;
}

/** Everything a price depends on besides the piece itself, loaded once per request so a listing of 24 products costs one round of queries. */
export interface PricingWorld {
  now: Date;
  metals: Map<string, MetalLite>;
  rates: Map<string, Rate[]>; // by metal id, newest first
  rules: PricingRule[];
  taxRule: TaxRule | null;
  sellerState: string | null;
  hsnCode: string | null;
}

export async function loadPricingWorld(now: Date, hsnCode: string | null): Promise<PricingWorld> {
  const [metals, rateRows, rules, taxRules, company] = await Promise.all([
    MetalModel.find({}).select("code name purityOptions").lean(),
    // The newest quote per (metal, purity) in force now.
    MetalRateModel.aggregate<{ _id: { metalId: unknown; purity: string }; ratePerGram: number; effectiveFrom: Date }>([
      { $match: { effectiveFrom: { $lte: now } } },
      { $sort: { effectiveFrom: -1 } },
      { $group: { _id: { metalId: "$metalId", purity: "$purity" }, ratePerGram: { $first: "$ratePerGram" }, effectiveFrom: { $first: "$effectiveFrom" } } },
    ]),
    listPricingRules({ isActive: true }),
    hsnCode ? listActiveTaxRules(hsnCode) : Promise.resolve([]),
    CompanyModel.findOne({ isActive: true }).sort({ createdAt: 1 }).select("address").lean(),
  ]);

  const rates = new Map<string, Rate[]>();
  for (const r of rateRows) {
    const key = String(r._id.metalId);
    rates.set(key, [...(rates.get(key) ?? []), { ratePerGram: r.ratePerGram, purity: r._id.purity, effectiveFrom: r.effectiveFrom }].sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime()));
  }
  let taxRule: TaxRule | null = null;
  if (hsnCode) {
    try {
      taxRule = resolveTaxRule(taxRules, { hsnCode, asOf: now });
    } catch {
      taxRule = null; // none in force, or two that tie: never guess a tax rate
    }
  }
  return {
    now,
    metals: new Map(metals.map((m) => [String(m._id), { id: String(m._id), name: m.name, code: m.code, fineness: new Map(m.purityOptions.map((p) => [p.code, p.fineness])) }])),
    rates,
    rules,
    taxRule,
    sellerState: company?.address?.state ?? null,
    hsnCode,
  };
}

export interface PriceableDesign {
  metalId: string;
  purity?: string;
  grossWeight?: number;
  netWeight?: number;
  hasStones: boolean;
  stoneValue?: number;
  categoryId?: string;
}

const MESSAGES: Record<StorePriceUnavailableReason, string> = {
  NO_WEIGHT: "Price on request — this piece is priced individually.",
  STONE_VALUE_MISSING: "Price on request — the stones in this piece are valued individually.",
  NO_METAL_RATE: "Live price temporarily unavailable — the metal rate is being updated.",
  PRICING_NOT_CONFIGURED: "Live price temporarily unavailable.",
};
const onRequest = (reason: StorePriceUnavailableReason): StorePrice => ({ status: "ON_REQUEST", reason, message: MESSAGES[reason] });
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** What an order must freeze about a price: every input the engine used, and everything it returned. */
export interface PricedDesign {
  price: StorePrice;
  /** Present only when the price is AVAILABLE. */
  evidence?: { inputs: PriceSnapshot["inputs"]; breakdown: PriceBreakdown; computedAt: string };
}

/**
 * The live price of a design, by the ONE pricing engine (CLAUDE.md rule 1) — no price math lives here. Every input the
 * engine needs must be real: a weight, the metal rate, the stones' value, a making rule, a GST rule. If any is missing
 * the answer is "price on request" with the reason; a number that quietly leaves something out would be a wrong price.
 *
 * While browsing, the buyer's state isn't known, and CGST + SGST always equal IGST (enforced when a tax rule is saved), so the
 * total is the same whichever applies: the price is evaluated as intra-state and only the total is shown. Checkout knows the
 * delivery state, passes it as `buyerState`, and the order records which split applied.
 */
export function priceDesign(world: PricingWorld, design: PriceableDesign): StorePrice {
  return priceDesignWithEvidence(world, design).price;
}

/** Who is buying, when it isn't an anonymous shopper: the B2B portal passes the customer, their group and their price list. */
export interface PricingAudience {
  channel: "B2C" | "B2B";
  customerType: "B2C" | "B2B";
  customerId?: string;
  customerGroupId?: string;
  priceListId?: string;
  /** A hand-entered concession, replacing what resolution picked (recorded by the engine as an OVERRIDE). */
  discountOverride?: { type: "PERCENTAGE" | "FLAT"; value: number; appliesTo?: "TOTAL" | "MAKING_CHARGES" };
}
const RETAIL: PricingAudience = { channel: "B2C", customerType: "B2C" };

export function priceDesignWithEvidence(world: PricingWorld, design: PriceableDesign, buyerState?: string, audience: PricingAudience = RETAIL): PricedDesign {
  const unavailable = (reason: StorePriceUnavailableReason): PricedDesign => ({ price: onRequest(reason) });
  const metal = world.metals.get(design.metalId);
  if (!metal || !design.purity) return unavailable("PRICING_NOT_CONFIGURED");
  const gross = design.grossWeight;
  if (gross === undefined || gross <= 0) return unavailable("NO_WEIGHT");
  const net = design.netWeight ?? gross;
  if (design.hasStones && design.stoneValue === undefined) return unavailable("STONE_VALUE_MISSING");

  const fineness = metal.fineness.get(design.purity);
  if (fineness === undefined) return unavailable("PRICING_NOT_CONFIGURED");
  // This purity's own quote if there is one, else the newest quote for any other purity of the metal (the engine scales it by fineness).
  const quotes = world.rates.get(design.metalId) ?? [];
  const quote = quotes.find((q) => q.purity === design.purity) ?? quotes.find((q) => metal.fineness.has(q.purity));
  if (!quote) return unavailable("NO_METAL_RATE");
  if (!world.taxRule || !world.sellerState || !world.hsnCode) return unavailable("PRICING_NOT_CONFIGURED");

  try {
    const buyer = buyerState ?? world.sellerState;
    const b = priceItem({
      metalId: design.metalId,
      purity: { code: design.purity, fineness },
      grossWeight: round3(gross),
      stoneWeight: round3(Math.max(gross - net, 0)),
      metalRate: { metalId: design.metalId, purity: { code: quote.purity, fineness: metal.fineness.get(quote.purity)! }, ratePerGram: quote.ratePerGram },
      stoneValue: design.stoneValue ?? 0,
      taxRule: world.taxRule,
      sellerState: world.sellerState,
      buyerState: buyer,
      context: {
        asOf: world.now,
        channel: audience.channel,
        customerType: audience.customerType,
        ...(audience.customerId ? { customerId: audience.customerId } : {}),
        ...(audience.customerGroupId ? { customerGroupId: audience.customerGroupId } : {}),
        ...(audience.priceListId ? { priceListId: audience.priceListId } : {}),
        ...(design.categoryId ? { categoryId: design.categoryId } : {}),
      },
      rules: world.rules,
      ...(audience.discountOverride ? { overrides: { discountRule: audience.discountOverride } } : {}),
    });
    // A jewellery price without its making charge would be wrong, not merely incomplete.
    if (!b.rules.making) return unavailable("PRICING_NOT_CONFIGURED");
    const computedAt = world.now.toISOString();
    const price: StorePrice = {
      status: "AVAILABLE",
      dynamic: true,
      total: b.finalAmount,
      breakdown: { metalValue: b.metalValue, wastage: b.wastageValue, makingCharges: b.makingCharges, stoneValue: b.stoneValue, discount: b.discount, taxableValue: b.taxableValue, gst: b.totalTax, total: b.finalAmount },
      basis: { grossWeight: b.weights.gross, netWeight: b.weights.net, metalName: metal.name, purity: design.purity, ratePerGram: Math.round(b.rate.effectiveRatePerGram), rateEffectiveFrom: quote.effectiveFrom.toISOString() },
      computedAt,
    };
    return {
      price,
      evidence: {
        computedAt,
        breakdown: b,
        inputs: {
          metalId: design.metalId,
          metalName: metal.name,
          purity: design.purity,
          fineness,
          grossWeight: b.weights.gross,
          netWeight: b.weights.net,
          stoneValue: b.stoneValue,
          quotedPurity: quote.purity,
          ratePerGram: quote.ratePerGram,
          rateEffectiveFrom: quote.effectiveFrom.toISOString(),
          hsnCode: world.hsnCode,
          ...(world.taxRule.id ? { taxRuleId: world.taxRule.id } : {}),
          sellerState: world.sellerState,
          buyerState: buyer,
          channel: audience.channel,
          customerType: audience.customerType,
          ...(audience.customerId ? { customerId: audience.customerId } : {}),
          ...(design.categoryId ? { categoryId: design.categoryId } : {}),
        },
      },
    };
  } catch (error) {
    if (error instanceof PricingError) return unavailable(error.code === "INVALID_WEIGHT" || error.code === "WEIGHT_MISMATCH" ? "NO_WEIGHT" : "PRICING_NOT_CONFIGURED");
    throw error;
  }
}
