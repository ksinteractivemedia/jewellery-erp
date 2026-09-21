import { ProductCategoryModel } from "../src/modules/catalog/product-category.model";
import { ProductModel } from "../src/modules/catalog/product.model";
import { aggregateB2B } from "../src/modules/dashboard/b2b-aggregation";
import type { B2BFacts, B2BProvider, DashboardProviders, SalesFact, SalesProvider } from "../src/modules/dashboard/providers";
import { addDays, businessDay, dayStart } from "../src/modules/dashboard/range";
import { aggregateSales } from "../src/modules/dashboard/sales-aggregation";
import { BranchModel } from "../src/modules/organization/branch.model";
import { LocationModel } from "../src/modules/organization/location.model";

/**
 * DEVELOPMENT ONLY — sample sales and B2B data, so the dashboard's Sales and B2B sections can be exercised
 * before the Orders, invoicing and credit modules exist. It is a *development adapter*: it stands in for those
 * modules' providers and is reached only from scripts/dev-memory.ts (a test enforces that nothing under src/
 * imports it). Everything it returns is labelled `SAMPLE`, and the screen says so.
 *
 * What it fakes is only the *facts* (order lines, invoices, credit accounts). Every figure the dashboard
 * shows — totals, trend, split, rankings, receivables, credit — is computed from those facts by the same
 * aggregators a real provider will use, so the filters, comparisons and edge cases are the real ones.
 *
 * The facts follow arithmetic patterns, not a random source: the same call always builds the same shop.
 * They are shaped like a jewellery business (weekday rhythm, mostly B2C with larger, thinner-margin B2B
 * orders) and are NOT a forecast or a benchmark of anything.
 */
if (process.env.NODE_ENV === "production") throw new Error("dashboard sample data must never load in production");

const HISTORY_DAYS = 120;
const FALLBACK_PRODUCTS = [
  { key: "sample-ring", name: "Sample solitaire ring", category: "Rings" },
  { key: "sample-necklace", name: "Sample bridal necklace", category: "Necklaces" },
  { key: "sample-bangle", name: "Sample gold bangle", category: "Bangles" },
];

async function loadShop() {
  const [branches, locations, products, categories] = await Promise.all([
    BranchModel.find({ isActive: true }).sort({ code: 1 }).lean(),
    LocationModel.find({ isActive: true, type: { $in: ["STORE", "COUNTER"] } }).sort({ code: 1 }).lean(),
    ProductModel.find({ isActive: true }).sort({ sku: 1 }).limit(14).select("sku name categoryId").lean(),
    ProductCategoryModel.find({}).select("name").lean(),
  ]);
  const categoryName = new Map(categories.map((c) => [String(c._id), c.name]));
  const catalogue = products.map((p) => ({ key: String(p._id), name: p.name, category: (p.categoryId && categoryName.get(String(p.categoryId))) || "Uncategorised" }));
  return { branches: branches.map((b) => String(b._id)), locations, products: catalogue.length ? catalogue : FALLBACK_PRODUCTS };
}

export async function buildSampleSalesFacts(now: Date): Promise<SalesFact[]> {
  const shop = await loadShop();
  if (shop.branches.length === 0) return [];
  const today = businessDay(now);
  const facts: SalesFact[] = [];
  for (let d = 0; d < HISTORY_DAYS; d++) {
    const day = addDays(today, -d);
    const orders = 2 + ((d * 7 + 3) % 5); // 2–6 orders a day, with a weekly-ish rhythm
    for (let i = 0; i < orders; i++) {
      const pattern = d * 13 + i * 7;
      const channel = pattern % 5 === 0 ? "B2B" : "B2C";
      const branchId = shop.branches[pattern % shop.branches.length]!;
      const storeLocation = shop.locations.find((l) => String(l.branchId) === branchId);
      const product = shop.products[pattern % shop.products.length]!;
      const units = channel === "B2B" ? 2 + (pattern % 4) : 1;
      const unitRevenue = 1_800_000 + ((pattern * 370_000) % 9_000_000); // ₹18,000 – ₹1,08,000 in paise
      const revenue = unitRevenue * units;
      facts.push({
        orderId: `sample-${day}-${i}`,
        at: new Date(dayStart(day).getTime() + (10 + i) * 3_600_000), // 10:00 IST onwards
        channel,
        branchId,
        ...(storeLocation ? { locationId: String(storeLocation._id) } : {}),
        revenue,
        cost: Math.floor((revenue * (channel === "B2B" ? 88 : 80)) / 100), // B2B trades on thinner margin
        units,
        categoryKey: product.category.toLowerCase(),
        categoryName: product.category,
        productKey: product.key,
        productName: product.name,
      });
    }
  }
  return facts;
}

export async function buildSampleB2BFacts(now: Date): Promise<B2BFacts> {
  const { branches } = await loadShop();
  if (branches.length === 0) return { purchaseOrders: [], quotations: [], invoices: [], creditAccounts: [] };
  const branch = (i: number) => branches[i % branches.length]!;
  const at = (days: number) => new Date(now.getTime() + days * 86_400_000);
  return {
    purchaseOrders: Array.from({ length: 6 }, (_, i) => ({ id: `sample-po-${i}`, branchId: branch(i), status: i % 3 === 2 ? ("CONFIRMED" as const) : ("PENDING" as const), value: (i + 2) * 15_000_000 })),
    quotations: Array.from({ length: 5 }, (_, i) => ({ id: `sample-q-${i}`, branchId: branch(i), status: i % 2 === 0 ? ("PENDING" as const) : ("ACCEPTED" as const), value: (i + 3) * 9_000_000 })),
    invoices: Array.from({ length: 8 }, (_, i) => {
      const total = 40_000_000 + i * 9_000_000;
      return { id: `sample-inv-${i}`, customerId: `sample-customer-${i % 5}`, branchId: branch(i), total, paid: i % 3 === 0 ? total : i % 3 === 1 ? Math.floor((total * 40) / 100) : 0, dueDate: at((i - 4) * 7) };
    }),
    creditAccounts: Array.from({ length: 5 }, (_, i) => {
      const limit = (10 + i * 2) * 10_000_000;
      return { customerId: `sample-customer-${i}`, branchId: branch(i), limit, used: Math.floor((limit * ((35 + i * 11) % 100)) / 100) };
    }),
  };
}

/** Sample providers for `createApp({ dashboardProviders })`. Facts are built once, relative to `now` at start-up. */
export async function createSampleDashboardProviders(now: Date = new Date()): Promise<Required<DashboardProviders>> {
  const [sales, b2b] = await Promise.all([buildSampleSalesFacts(now), buildSampleB2BFacts(now)]);
  const salesProvider: SalesProvider = { provenance: "SAMPLE", honours: { dateRange: true, branch: true, location: true }, load: async (ctx) => aggregateSales(sales, ctx) };
  const b2bProvider: B2BProvider = { provenance: "SAMPLE", honours: { dateRange: false, branch: true, location: false }, load: async (ctx) => aggregateB2B(b2b, { now: ctx.now, branchId: ctx.branchId }) };
  return { sales: salesProvider, b2b: b2bProvider };
}
