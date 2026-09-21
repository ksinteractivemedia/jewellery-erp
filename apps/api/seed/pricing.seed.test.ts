import { describe, expect, it } from "vitest";
import { createMediaService } from "../src/modules/media/media.service";
import { createMemoryStorage } from "../src/modules/media/storage";
import { findMetalByCode } from "../src/modules/metals/metal.repository";
import { createPricingPreviewService } from "../src/modules/pricing/pricing-preview.service";
import { findAmbiguousRules } from "@jewellery/pricing-engine";
import { listPricingRules } from "../src/modules/pricing/pricing-rule.repository";
import { seedCatalog } from "./catalog.seed";
import { seedPricingRules } from "./pricing.seed";

const TAX = { hsnCode: "7113", intraState: { cgst: 1.5, sgst: 1.5 }, interState: { igst: 3 }, sellerState: "Maharashtra", buyerState: "Maharashtra" };

describe("dev pricing seed", () => {
  it("builds an unambiguous rule book that resolves the way the playground promises", async () => {
    await seedCatalog(createMediaService(createMemoryStorage(), "http://api.test"));
    expect((await seedPricingRules()).rules).toBe(5);
    expect(findAmbiguousRules(await listPricingRules())).toEqual([]);

    const gold = (await findMetalByCode("GOLD"))!.id;
    const preview = createPricingPreviewService({ now: () => new Date("2026-09-20T00:00:00Z") });
    const price = (customerType: "B2C" | "B2B", purity: string) =>
      preview.preview({ metalId: gold, purity, grossWeight: 10, stoneWeight: 0, pieces: 1, rate: { ratePerGram: 650_000, purity }, stoneValue: 0, customerType, tax: TAX });

    const retail22 = await price("B2C", "22K");
    expect(retail22.rules.making?.source).toMatchObject({ ruleName: "Gold — retail default" });
    expect(retail22.rules.discount?.source).toMatchObject({ ruleName: "Akshaya Tritiya — 22K retail offer" });
    expect(retail22.discount).toBe(retail22.makingCharges / 2);

    const wholesale22 = await price("B2B", "22K");
    expect(wholesale22.rules.making?.source).toMatchObject({ ruleName: "Gold — wholesale default" });
    expect(wholesale22.discount).toBe(0);

    const retail18 = await price("B2C", "18K");
    expect(retail18.rules.making?.source).toMatchObject({ ruleName: "Gold 18K studded — retail" });
    expect(retail18.rules.making?.terms).toEqual({ type: "PER_GRAM", value: 65_000 });
  });
});
