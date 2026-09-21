import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveRange } from "../src/modules/dashboard/range";
import { createMediaService } from "../src/modules/media/media.service";
import { createMemoryStorage } from "../src/modules/media/storage";
import { createBranch } from "../src/modules/organization/branch.repository";
import { createCompany } from "../src/modules/organization/company.repository";
import { createLocation } from "../src/modules/organization/location.repository";
import { seedCatalog } from "../seed/catalog.seed";
import { buildSampleB2BFacts, buildSampleSalesFacts, createSampleDashboardProviders } from "./dashboard-sample";

const NOW = new Date("2026-09-20T06:00:00Z");
const address = { line1: "1 MG Road", city: "Mumbai", state: "Maharashtra", postalCode: "400001", country: "India" };

async function shop(branches = 2) {
  const company = await createCompany({ name: "Suvarna", legalName: "Suvarna Pvt. Ltd.", address });
  const ids: string[] = [];
  for (let i = 0; i < branches; i++) {
    const branch = await createBranch({ companyId: company.id, name: `Branch ${i}`, code: `BR${i}`, address });
    await createLocation({ branchId: branch.id, name: `Counter ${i}`, code: `C${i}`, type: "COUNTER" });
    ids.push(branch.id);
  }
  return ids;
}

describe("the sample dashboard adapter", () => {
  let branches: string[];
  beforeEach(async () => {
    branches = await shop();
    await seedCatalog(createMediaService(createMemoryStorage(), "http://api.test"));
  });

  it("builds the identical shop every time — no randomness", async () => {
    expect(await buildSampleSalesFacts(NOW)).toEqual(await buildSampleSalesFacts(NOW));
    expect(await buildSampleB2BFacts(NOW)).toEqual(await buildSampleB2BFacts(NOW));
    expect(readFileSync(join(__dirname, "dashboard-sample.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")).not.toMatch(/Math\.random|randomInt|faker/);
  });

  it("produces plausible order lines: positive revenue, cost below revenue, real catalogue names, both channels, both branches", async () => {
    const facts = await buildSampleSalesFacts(NOW);
    expect(facts.length).toBeGreaterThan(300);
    for (const f of facts) {
      expect(f.revenue).toBeGreaterThan(0);
      expect(f.cost).toBeGreaterThan(0);
      expect(f.cost).toBeLessThan(f.revenue);
      expect(Number.isInteger(f.revenue) && Number.isInteger(f.cost)).toBe(true);
    }
    expect(new Set(facts.map((f) => f.channel))).toEqual(new Set(["B2C", "B2B"]));
    expect(new Set(facts.map((f) => f.branchId))).toEqual(new Set(branches));
    expect(facts.some((f) => f.productName.startsWith("Sample "))).toBe(false); // used the seeded catalogue
    expect(new Set(facts.map((f) => f.categoryName)).size).toBeGreaterThan(2);
  });

  it("is labelled SAMPLE, and declares which filters it honours", async () => {
    const { sales, b2b } = await createSampleDashboardProviders(NOW);
    expect(sales).toMatchObject({ provenance: "SAMPLE", honours: { dateRange: true, branch: true, location: true } });
    expect(b2b).toMatchObject({ provenance: "SAMPLE", honours: { dateRange: false, branch: true, location: false } });
  });

  it("feeds the real aggregator: figures are internally consistent and respond to the filters", async () => {
    const { sales } = await createSampleDashboardProviders(NOW);
    const range = resolveRange({ from: "2026-08-22", to: "2026-09-20" }, NOW);
    const all = await sales.load({ range, now: NOW });
    expect(all.trend.points.reduce((t, p) => t + p.b2c + p.b2b, 0)).toBe(all.revenue.value);
    expect(all.b2cRevenue.value + all.b2bRevenue.value).toBe(all.revenue.value);
    expect(all.revenue.previous).not.toBeNull(); // 120 days of history, so there is a previous period
    expect(all.todayRevenue).toBeGreaterThan(0);
    expect(all.topProducts).toHaveLength(5);

    const one = await sales.load({ range, now: NOW, branchId: branches[0] });
    const two = await sales.load({ range, now: NOW, branchId: branches[1] });
    expect(one.revenue.value + two.revenue.value).toBe(all.revenue.value);
    expect(one.revenue.value).toBeLessThan(all.revenue.value);

    const week = await sales.load({ range: resolveRange({ from: "2026-09-14", to: "2026-09-20" }, NOW), now: NOW });
    expect(week.revenue.value).toBeLessThan(all.revenue.value);
    expect(week.trend.points).toHaveLength(7);
  });

  it("gives B2B a believable receivables picture: something outstanding, something overdue, credit within limits", async () => {
    const { b2b } = await createSampleDashboardProviders(NOW);
    const data = await b2b.load({ range: resolveRange({}, NOW), now: NOW });
    expect(data.outstanding).toBeGreaterThan(0);
    expect(data.overdue.amount).toBeGreaterThan(0);
    expect(data.overdue.amount).toBeLessThanOrEqual(data.outstanding);
    expect(data.pendingPurchaseOrders.count).toBeGreaterThan(0);
    expect(data.pendingQuotations.count).toBeGreaterThan(0);
    expect(data.creditUtilization.percentage).toBeGreaterThan(0);
    expect(data.creditUtilization.percentage).toBeLessThan(100);
    const one = await b2b.load({ range: resolveRange({}, NOW), now: NOW, branchId: branches[0] });
    expect(one.outstanding).toBeLessThan(data.outstanding);
  });
});

describe("the sample adapter with no shop", () => {
  it("returns no facts rather than inventing a branch", async () => {
    expect(await buildSampleSalesFacts(NOW)).toEqual([]);
    expect(await buildSampleB2BFacts(NOW)).toEqual({ purchaseOrders: [], quotations: [], invoices: [], creditAccounts: [] });
  });
});
