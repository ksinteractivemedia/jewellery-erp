import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { ALL_ROLE_NAMES, PERMISSIONS as P, ROLE_NAMES as R, type PermissionKey, type RoleName, type SalesData } from "@jewellery/types";
import { bearer, createStaff, loginAs, seedRbac, testConfig } from "../../test/helpers";
import { type World, makeWorld, receive, someOrder, someUser } from "../../test/inventory-fixtures";
import { createApp } from "./app";
import { InMemoryEmailSender } from "../modules/auth/email";
import { DEFAULT_ROLE_MATRIX } from "../modules/auth/rbac/role-matrix";
import type { B2BProvider, DashboardContext, SalesProvider } from "../modules/dashboard";
import { createMemoryStorage } from "../modules/media/storage";
import { movePartner, reserveItems } from "../modules/inventory/stock-operations";

let w: World;
const tokens = new Map<string, string>();

const SALES: SalesData = {
  todayRevenue: 70_000,
  revenue: { value: 520_000, previous: 320_000 },
  b2cRevenue: { value: 220_000, previous: 120_000 },
  b2bRevenue: { value: 300_000, previous: 200_000 },
  orders: { value: 3, previous: 2 },
  grossMargin: { restricted: false, value: 123_457, previous: 80_000, percentage: 23.74 },
  trend: { granularity: "day", points: [{ date: "2026-09-20", b2c: 70_000, b2b: 0 }] },
  split: { b2c: { revenue: 220_000, orders: 2 }, b2b: { revenue: 300_000, orders: 1 } },
  topCategories: [{ key: "rings", name: "Rings", revenue: 470_000, units: 5 }],
  topProducts: [{ key: "p1", name: "Solitaire Ring", revenue: 400_000, units: 4 }],
};

function makeApp(providers?: { sales?: SalesProvider; b2b?: B2BProvider }) {
  return createApp({ config: testConfig(), emailSender: new InMemoryEmailSender(), mediaStorage: createMemoryStorage(), dashboardProviders: providers });
}
let app = makeApp();

async function tokenFor(role: RoleName, forApp = app) {
  const key = `${role}`;
  if (!tokens.has(key)) {
    const { email } = await createStaff(role);
    const login = await loginAs(forApp, email);
    // Fail at the real cause: a failed sign-in would otherwise surface later as a baffling 401 on an unrelated request.
    if (!login.accessToken) throw new Error(`sign-in as ${role} <${email}> failed: ${login.res.status} ${JSON.stringify(login.res.body)}`);
    tokens.set(key, login.accessToken);
  }
  return tokens.get(key)!;
}
const get = async (path: string, role: RoleName = R.ADMIN, forApp = app) => request(forApp).get(path).set(bearer(await tokenFor(role, forApp)));

beforeEach(async () => {
  await seedRbac();
  tokens.clear();
  app = makeApp();
  w = await makeWorld();
});

const ENDPOINTS: { path: string; any: PermissionKey[] }[] = [
  { path: "/api/dashboard/meta", any: [P.INVENTORY_VIEW, P.SALES_VIEW, P.B2B_VIEW] },
  { path: "/api/dashboard/sales", any: [P.SALES_VIEW] },
  { path: "/api/dashboard/b2b", any: [P.B2B_VIEW] },
  { path: "/api/dashboard/inventory", any: [P.INVENTORY_VIEW] },
  { path: "/api/dashboard/operations", any: [P.INVENTORY_VIEW] },
  { path: "/api/dashboard/alerts", any: [P.INVENTORY_VIEW] },
  { path: "/api/dashboard/activity", any: [P.INVENTORY_VIEW] },
];

describe("authorization — each section is authorised on its own permission", () => {
  it("refuses an unauthenticated caller on every endpoint", async () => {
    for (const e of ENDPOINTS) expect((await request(app).get(e.path)).status, e.path).toBe(401);
  });

  it("allows every role exactly where the matrix grants a required permission (13 roles × 7 endpoints)", async () => {
    for (const role of ALL_ROLE_NAMES) {
      for (const e of ENDPOINTS) {
        const allowed = e.any.some((k) => DEFAULT_ROLE_MATRIX[role].includes(k));
        expect((await get(e.path, role)).status, `${role} ${e.path}`).toBe(allowed ? 200 : 403);
      }
    }
  });

  it("really does differ by role: a sales-only role sees sales but not stock or B2B, and vice versa", async () => {
    const stockOnly = ALL_ROLE_NAMES.find((r) => DEFAULT_ROLE_MATRIX[r].includes(P.INVENTORY_VIEW) && !DEFAULT_ROLE_MATRIX[r].includes(P.SALES_VIEW));
    const noB2B = ALL_ROLE_NAMES.find((r) => DEFAULT_ROLE_MATRIX[r].includes(P.SALES_VIEW) && !DEFAULT_ROLE_MATRIX[r].includes(P.B2B_VIEW));
    expect(stockOnly && noB2B).toBeTruthy();
    expect((await get("/api/dashboard/sales", stockOnly!)).status).toBe(403);
    expect((await get("/api/dashboard/b2b", noB2B!)).status).toBe(403);
  });
});

describe("filters are validated", () => {
  it.each([
    ["only from", "from=2026-09-01"],
    ["only to", "to=2026-09-01"],
    ["from after to", "from=2026-09-10&to=2026-09-01"],
    ["a malformed date", "from=20-09-2026&to=2026-09-20"],
    ["a month 13", "from=2026-13-01&to=2026-13-02"],
    ["a day that does not exist", "from=2026-02-30&to=2026-03-02"],
    ["a range over a year", "from=2025-01-01&to=2026-09-20"],
    ["a bad branch id", "branchId=main"],
    ["a bad location id", "locationId=counter"],
  ])("%s → 400", async (_name, query) => {
    for (const section of ["inventory", "operations", "alerts", "activity"]) {
      const res = await get(`/api/dashboard/${section}?${query}`);
      expect(res.status, `${section}?${query}`).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("accepts a range of exactly one year (366 days inclusive) and no more", async () => {
    expect((await get("/api/dashboard/activity?from=2025-09-20&to=2026-09-20")).status).toBe(200);
    expect((await get("/api/dashboard/activity?from=2025-09-19&to=2026-09-20")).status).toBe(400);
  });

  it("404s an unknown location or branch, and 400s a location outside the named branch", async () => {
    expect((await get("/api/dashboard/inventory?locationId=64b0c0ffee0000000000aaaa")).status).toBe(404);
    expect((await get("/api/dashboard/inventory?branchId=64b0c0ffee0000000000aaaa")).status).toBe(404);
    const mismatch = await get(`/api/dashboard/inventory?branchId=64b0c0ffee0000000000aaaa&locationId=${w.loc.counter}`);
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.message).toMatch(/does not belong/);
  });
});

describe("inventory, operations, alerts and activity — live", () => {
  it("serve real stock, and say they are LIVE and unaffected by the date range", async () => {
    await receive(w, { grossWeight: 10 });
    const res = await get("/api/dashboard/inventory?from=2020-01-01&to=2020-01-31");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "OK", provenance: "LIVE", scope: { honours: { dateRange: false, branch: true, location: true } } });
    expect(res.body.scope.range).toBeUndefined();
    expect(res.body.data).toMatchObject({ availablePieces: 1, stockValue: { cost: 5_000_000 } });
    expect(res.body.data.metals[0]).toMatchObject({ code: "GOLD", pieces: 1, netWeight: 10 });
  });

  it("leaks no database internals", async () => {
    await receive(w);
    for (const section of ["inventory", "operations", "alerts", "activity"]) {
      const text = JSON.stringify((await get(`/api/dashboard/${section}`)).body);
      expect(text, section).not.toMatch(/"_id"|"__v"|passwordHash/);
    }
  });

  it("filters by location and reports the queues and activity of that place", async () => {
    const a = await receive(w);
    await movePartner({ performedBy: someUser() }, { type: "HALLMARKING_OUT", itemIds: [a.id], destinationLocationId: w.loc.hallmark });
    await reserveItems({ performedBy: someUser() }, { itemIds: [(await receive(w, { locationId: w.loc.store2 })).id], referenceId: someOrder() });
    const ops = await get(`/api/dashboard/operations?locationId=${w.loc.hallmark}`);
    expect(ops.body.data.hallmarking.pieces).toBe(1);
    expect((await get(`/api/dashboard/operations?locationId=${w.loc.store2}`)).body.data.hallmarking.pieces).toBe(0);
    const inv = await get(`/api/dashboard/inventory?locationId=${w.loc.store2}`);
    expect(inv.body.data.reserved.pieces).toBe(1);
    expect(inv.body.data.availablePieces).toBe(0);
  });

  it("returns an empty alert list — a real answer — when nothing needs attention", async () => {
    expect((await get("/api/dashboard/alerts")).body).toMatchObject({ status: "OK", provenance: "LIVE", data: [] });
  });

  it("lists branches and locations for the filter bar", async () => {
    const res = await get("/api/dashboard/meta");
    expect(res.body.branches).toHaveLength(1);
    expect(res.body.branches[0].id).toBe(w.branchId);
    expect(res.body.branches[0].locations.length).toBe(8);
  });
});

describe("sales and B2B — NOT_CONNECTED until a module supplies them", () => {
  it("answers 200 with a clear 'not connected' state and no figures", async () => {
    const sales = await get("/api/dashboard/sales");
    expect(sales.status).toBe(200);
    expect(sales.body).toMatchObject({ status: "NOT_CONNECTED", requires: "Orders module" });
    expect(sales.body.explanation).toMatch(/Nothing here is estimated/);
    expect(sales.body.data).toBeUndefined();
    const b2b = await get("/api/dashboard/b2b");
    expect(b2b.body).toMatchObject({ status: "NOT_CONNECTED" });
    expect(b2b.body.data).toBeUndefined();
  });
});

describe("with providers registered", () => {
  const seen: { sales: DashboardContext[]; b2b: DashboardContext[] } = { sales: [], b2b: [] };
  const sales = (honours = { dateRange: true, branch: true, location: true }): SalesProvider => ({ provenance: "SAMPLE", honours, load: async (ctx) => (seen.sales.push(ctx), SALES) });
  const b2b = (honours = { dateRange: false, branch: true, location: false }): B2BProvider => ({
    provenance: "SAMPLE",
    honours,
    load: async (ctx) => (seen.b2b.push(ctx), { pendingPurchaseOrders: { count: 2, value: 750_000 }, pendingQuotations: { count: 1, value: 400_000 }, outstanding: 1_300_000, overdue: { amount: 800_000, invoices: 2, customers: 2 }, creditUtilization: { used: 1_300_000, limit: 3_000_000, percentage: 43.3 } }),
  });
  beforeEach(() => {
    seen.sales = [];
    seen.b2b = [];
  });

  it("passes the provider's data through with its provenance, honoured filters and the range applied", async () => {
    const wired = makeApp({ sales: sales(), b2b: b2b() });
    const res = await get("/api/dashboard/sales?from=2026-09-01&to=2026-09-10", R.ADMIN, wired);
    expect(res.body).toMatchObject({ status: "OK", provenance: "SAMPLE", scope: { range: { from: "2026-09-01", to: "2026-09-10" }, honours: { dateRange: true, branch: true, location: true } } });
    expect(res.body.data.revenue).toEqual({ value: 520_000, previous: 320_000 });
    expect(seen.sales[0]!.range).toMatchObject({ from: "2026-09-01", to: "2026-09-10", days: 10 });
  });

  it("hands the provider only the filters it honours — a location arrives as its branch when locations aren't supported", async () => {
    const wired = makeApp({ sales: sales({ dateRange: true, branch: true, location: false }), b2b: b2b() });
    await get(`/api/dashboard/sales?locationId=${w.loc.counter}`, R.ADMIN, wired);
    expect(seen.sales[0]).toMatchObject({ branchId: w.branchId });
    expect(seen.sales[0]!.locationId).toBeUndefined();

    const withLocation = makeApp({ sales: sales(), b2b: b2b() });
    await get(`/api/dashboard/sales?locationId=${w.loc.counter}`, R.ADMIN, withLocation);
    expect(seen.sales[1]).toMatchObject({ branchId: w.branchId, locationId: w.loc.counter });

    await get(`/api/dashboard/b2b?locationId=${w.loc.counter}`, R.ADMIN, withLocation);
    expect(seen.b2b[0]).toMatchObject({ branchId: w.branchId });
    expect(seen.b2b[0]!.locationId).toBeUndefined();
  });

  it("passes no filter when none was chosen", async () => {
    const wired = makeApp({ sales: sales(), b2b: b2b() });
    await get("/api/dashboard/sales", R.ADMIN, wired);
    expect(seen.sales[0]!.branchId).toBeUndefined();
    expect(seen.sales[0]!.locationId).toBeUndefined();
  });

  it("serves the B2B section as a snapshot (no date range applied)", async () => {
    const wired = makeApp({ sales: sales(), b2b: b2b() });
    const res = await get("/api/dashboard/b2b", R.ADMIN, wired);
    expect(res.body).toMatchObject({ status: "OK", provenance: "SAMPLE", data: { outstanding: 1_300_000, overdue: { amount: 800_000 } }, scope: { honours: { dateRange: false, branch: true, location: false } } });
    expect(res.body.scope.range).toBeUndefined();
  });

  describe("margin is withheld on the server from anyone without financial visibility", () => {
    it("sends it to a caller who holds accounting.view", async () => {
      expect(DEFAULT_ROLE_MATRIX[R.ADMIN]).toContain(P.ACCOUNTING_VIEW);
      const res = await get("/api/dashboard/sales", R.ADMIN, makeApp({ sales: sales() }));
      expect(res.body.data.grossMargin).toEqual({ restricted: false, value: 123_457, previous: 80_000, percentage: 23.74 });
    });

    it("withholds it — the figures never leave the server — from a sales role that lacks it", async () => {
      const role = ALL_ROLE_NAMES.find((r) => DEFAULT_ROLE_MATRIX[r].includes(P.SALES_VIEW) && !DEFAULT_ROLE_MATRIX[r].includes(P.ACCOUNTING_VIEW))!;
      expect(role).toBeTruthy();
      const res = await get("/api/dashboard/sales", role, makeApp({ sales: sales() }));
      expect(res.status).toBe(200);
      expect(res.body.data.grossMargin).toEqual({ restricted: true });
      // Not merely hidden in the JSON shape: nothing derived from cost is anywhere in the body.
      expect(res.text).not.toMatch(/123457|80000|23\.74/);
      expect(res.body.data.revenue.value).toBe(520_000); // revenue itself is still theirs to see
    });
  });
});
