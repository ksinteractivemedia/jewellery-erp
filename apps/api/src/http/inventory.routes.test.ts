import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { ALL_ROLE_NAMES, PERMISSIONS as P, ROLE_NAMES as R, type InventoryItem, type PermissionKey, type RoleName } from "@jewellery/types";
import { type World, makeWorld, receive, someOrder, someUser } from "../../test/inventory-fixtures";
import { bearer, buildTestApp, createStaff, loginAs, seedRbac } from "../../test/helpers";
import { AuditLogModel } from "../modules/audit/audit-log.model";
import { DEFAULT_ROLE_MATRIX } from "../modules/auth/rbac/role-matrix";
import { createProduct } from "../modules/catalog/product.repository";
import { createProductVariant } from "../modules/catalog/product-variant.repository";
import { InventoryItemModel } from "../modules/inventory/inventory-item.model";
import { movePartner, releaseItems, returnItems, reserveItems, sellItems } from "../modules/inventory/stock-operations";
import { createMetalRate } from "../modules/metals/metal-rate.repository";

let t: ReturnType<typeof buildTestApp>;
let w: World;
const tokens = new Map<RoleName, { token: string; userId: string }>();

async function as(role: RoleName) {
  if (!tokens.has(role)) {
    const { email, user } = await createStaff(role);
    tokens.set(role, { token: (await loginAs(t.app, email)).accessToken, userId: user.id });
  }
  return tokens.get(role)!;
}
const call = async (role: RoleName, method: "get" | "post" | "patch", url: string, body?: unknown) => {
  const { token } = await as(role);
  const req = request(t.app)[method](url).set(bearer(token));
  return body === undefined ? req : req.send(body as object);
};
const mgr = (m: "get" | "post" | "patch", url: string, body?: unknown) => call(R.INVENTORY_MANAGER, m, url, body);
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
const codes = (res: request.Response) => res.body.items.map((i: { itemCode: string }) => i.itemCode);

beforeEach(async () => {
  await seedRbac();
  t = buildTestApp();
  tokens.clear();
  w = await makeWorld();
});

// ---------------------------------------------------------------------------------------------
describe("authorization", () => {
  const someId = "64b0c0ffee0000000000aaaa";
  const ENDPOINTS: { method: "get" | "post" | "patch"; path: string; any: PermissionKey[] }[] = [
    { method: "get", path: "/api/inventory/meta", any: [P.INVENTORY_VIEW] },
    { method: "get", path: "/api/inventory/locations", any: [P.INVENTORY_VIEW] },
    { method: "get", path: "/api/inventory/items", any: [P.INVENTORY_VIEW] },
    { method: "get", path: `/api/inventory/items/${someId}`, any: [P.INVENTORY_VIEW] },
    { method: "get", path: `/api/inventory/items/${someId}/audit`, any: [P.INVENTORY_VIEW] },
    { method: "get", path: "/api/inventory/stock/summary?groupBy=location", any: [P.INVENTORY_VIEW] },
    { method: "get", path: "/api/inventory/ledger", any: [P.INVENTORY_VIEW] },
    { method: "get", path: "/api/inventory/scan?code=X", any: [P.INVENTORY_VIEW] },
    { method: "get", path: "/api/inventory/transfers", any: [P.INVENTORY_VIEW] },
    { method: "get", path: "/api/inventory/adjustments", any: [P.INVENTORY_VIEW] },
    { method: "post", path: "/api/inventory/items", any: [P.INVENTORY_CREATE] },
    { method: "patch", path: `/api/inventory/items/${someId}/identifiers`, any: [P.INVENTORY_CREATE] },
    { method: "post", path: "/api/inventory/reservations", any: [P.SALES_CREATE, P.INVENTORY_TRANSFER] },
    { method: "post", path: "/api/inventory/reservations/release", any: [P.SALES_CREATE, P.INVENTORY_TRANSFER] },
    { method: "post", path: "/api/inventory/movements", any: [P.INVENTORY_TRANSFER] },
    { method: "post", path: "/api/inventory/returns/inspect", any: [P.INVENTORY_TRANSFER] },
    { method: "post", path: "/api/inventory/transfers", any: [P.INVENTORY_TRANSFER] },
    { method: "post", path: `/api/inventory/transfers/${someId}/receive`, any: [P.INVENTORY_TRANSFER] },
    { method: "post", path: `/api/inventory/transfers/${someId}/cancel`, any: [P.INVENTORY_TRANSFER] },
    { method: "post", path: "/api/inventory/adjustments", any: [P.INVENTORY_ADJUST] },
    { method: "post", path: `/api/inventory/adjustments/${someId}/approve`, any: [P.INVENTORY_APPROVE_ADJUSTMENT] },
    { method: "post", path: `/api/inventory/adjustments/${someId}/reject`, any: [P.INVENTORY_APPROVE_ADJUSTMENT] },
  ];

  it("every inventory endpoint refuses an unauthenticated caller", async () => {
    for (const e of ENDPOINTS) expect((await request(t.app)[e.method](e.path)).status, `${e.method} ${e.path}`).toBe(401);
  });

  it("across all 13 roles: allowed exactly where the permission matrix says — and never decided by anything else", async () => {
    for (const role of ALL_ROLE_NAMES) {
      for (const e of ENDPOINTS) {
        const permitted = e.any.some((p) => DEFAULT_ROLE_MATRIX[role].includes(p));
        const res = await call(role, e.method, e.path, e.method === "get" ? undefined : {});
        // An empty/invalid body or an unknown id is 400/404 for an authorised caller; 403 only ever means "not permitted".
        expect(res.status === 403, `${role} ${e.method} ${e.path} → ${res.status}`).toBe(!permitted);
      }
    }
  });

  it("sale and return are not reachable over HTTP — they belong to the order flow, not to an operator", async () => {
    for (const path of ["/api/inventory/sales", "/api/inventory/sale", "/api/inventory/returns", "/api/inventory/items/64b0c0ffee0000000000aaaa/sell"]) {
      expect((await mgr("post", path, {})).status, path).toBe(404);
    }
  });

  it("client-claimed permissions or roles in headers/body change nothing", async () => {
    const { token } = await as(R.VIEWER);
    const res = await request(t.app).post("/api/inventory/transfers").set(bearer(token)).set("X-Role", "SUPER_ADMIN").send({ role: "SUPER_ADMIN", permissions: ["inventory.transfer"] });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------------------------
describe("list, search, filter, sort", () => {
  let a: InventoryItem, b: InventoryItem, c: InventoryItem, d: InventoryItem, e: InventoryItem;
  beforeEach(async () => {
    const ring = await createProduct({ sku: "RNG-001", name: "Rihaan Solitaire Ring", metalId: w.gold } as never);
    const chain = await createProduct({ sku: "CHN-001", name: "Temple Chain", metalId: w.gold } as never);
    const variant = await createProductVariant({ productId: ring.id, sku: "RNG-001-S14", attributes: { size: "14" } });
    a = await receive(w, { itemCode: "JE-A", productId: ring.id, variantId: variant.id, grossWeight: 5, huid: "AAAA11", cost: 20_000_00 });
    b = await receive(w, { itemCode: "JE-B", productId: ring.id, grossWeight: 8, purity: "18K", locationId: w.loc.vault, cost: 30_000_00 });
    c = await receive(w, { itemCode: "JE-C", productId: chain.id, grossWeight: 30, locationId: w.loc.warehouse, cost: 150_000_00, barcode: "8901234567890" });
    d = await receive(w, { itemCode: "JE-D", productId: chain.id, grossWeight: 12, cost: 60_000_00 });
    e = await receive(w, { itemCode: "JE-E", grossWeight: 2.5, metalId: w.silver, purity: "925", cost: 5_000_00 });
    await reserveItems({ performedBy: someUser() }, { itemIds: [d.id], referenceId: someOrder() });
    await sellItems({ performedBy: someUser() }, { itemIds: [e.id], referenceType: "ORDER", referenceId: someOrder() });
  });
  const list = (qs = "") => mgr("get", `/api/inventory/items${qs}`);

  it("returns rich rows: product, variant, metal, location, weights, status, availability, hold", async () => {
    const res = await list("?q=JE-A");
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      itemCode: "JE-A", huid: "AAAA11", hallmarkStatus: "HALLMARKED", status: "AVAILABLE", availableForSale: true, purity: "22K", cost: 20_000_00,
      grossWeight: 5, netWeight: 5, fineWeight: 4.58, product: { sku: "RNG-001", name: "Rihaan Solitaire Ring" }, variantSku: "RNG-001-S14",
      metal: { code: "GOLD" }, location: { name: "Counter", type: "COUNTER" },
    });
    const held = (await list("?q=JE-D")).body.items[0];
    expect(held).toMatchObject({ status: "RESERVED", availableForSale: false });
    expect(held.reservedForOrder).toMatch(/^[0-9a-f]{24}$/);
  });

  it("searches item code, barcode, HUID, product SKU/name and variant SKU; every word must match", async () => {
    expect(codes(await list("?q=je-b"))).toEqual(["JE-B"]);
    expect(codes(await list("?q=8901234567890"))).toEqual(["JE-C"]);
    expect(codes(await list("?q=aaaa11"))).toEqual(["JE-A"]);
    expect(codes((await list("?q=RNG-001"))).sort()).toEqual(["JE-A", "JE-B"]);
    expect(codes((await list("?q=temple"))).sort()).toEqual(["JE-C", "JE-D"]);
    expect(codes(await list("?q=S14"))).toEqual(["JE-A"]);
    expect(codes(await list("?q=temple%20JE-C"))).toEqual(["JE-C"]);
    expect(codes(await list("?q=temple%20ring"))).toEqual([]);
  });

  it("treats regex metacharacters in the search as literal text", async () => {
    for (const q of ["(", ".*", "[a-", "\\", "JE-(A"]) expect((await list(`?q=${encodeURIComponent(q)}`)).status, q).toBe(200);
    expect((await list(`?q=${encodeURIComponent(".*")}`)).body.total).toBe(0);
  });

  it("filters by status (one or several), location, metal, purity, hallmark, HUID presence and sellability — and combines them with AND", async () => {
    expect(codes(await list("?status=RESERVED"))).toEqual(["JE-D"]);
    expect(codes(await list("?status=RESERVED,SOLD")).sort()).toEqual(["JE-D", "JE-E"]);
    expect(codes(await list(`?locationId=${w.loc.vault}`))).toEqual(["JE-B"]);
    expect(codes(await list(`?metalId=${w.silver}`))).toEqual(["JE-E"]);
    expect(codes(await list("?purity=18K"))).toEqual(["JE-B"]);
    expect(codes(await list("?hallmarkStatus=HALLMARKED"))).toEqual(["JE-A"]);
    expect(codes(await list("?hasHuid=true"))).toEqual(["JE-A"]);
    expect(codes(await list("?hasHuid=false")).sort()).toEqual(["JE-B", "JE-C", "JE-D", "JE-E"]);
    expect(codes(await list("?availableForSale=true")).sort()).toEqual(["JE-A", "JE-B", "JE-C"]);
    expect(codes(await list("?availableForSale=false")).sort()).toEqual(["JE-D", "JE-E"]);
    expect(codes(await list(`?availableForSale=true&metalId=${w.gold}&purity=22K&locationId=${w.loc.counter}`))).toEqual(["JE-A"]);
  });

  it("sorts by weight, cost and code in both directions, with a stable tiebreak", async () => {
    expect(codes(await list("?sort=grossWeight&order=desc"))[0]).toBe("JE-C");
    expect(codes(await list("?sort=grossWeight&order=asc"))[0]).toBe("JE-E");
    expect(codes(await list("?sort=cost&order=desc"))[0]).toBe("JE-C");
    expect(codes(await list("?sort=itemCode&order=asc"))).toEqual(["JE-A", "JE-B", "JE-C", "JE-D", "JE-E"]);
  });

  it("totals describe the whole filtered set, not the page; paging is correct", async () => {
    const all = await list("?pageSize=2");
    expect(all.body).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    expect(all.body.items).toHaveLength(2);
    expect(all.body.totals).toMatchObject({ count: 5, quantity: 5, grossWeight: 57.5, cost: 265_000_00 });
    const gold = await list(`?metalId=${w.gold}&pageSize=1`);
    expect(gold.body.totals).toMatchObject({ count: 4, grossWeight: 55, netWeight: 55, cost: 260_000_00 });
    expect(gold.body.totals.fineWeight).toBeCloseTo(5 * 0.916 + 8 * 0.75 + 30 * 0.916 + 12 * 0.916, 3);
    expect((await list("?page=9")).body.items).toEqual([]);
  });

  it("rejects malformed parameters instead of ignoring them", async () => {
    for (const qs of ["?status=LOST", "?sort=passwordHash", "?pageSize=1000", "?page=0", "?locationId=nope", "?availableForSale=maybe", "?order=sideways"]) {
      expect((await list(qs)).status, qs).toBe(400);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("item detail & valuation", () => {
  it("shows the piece with its product, location, and valuation from the current rate", async () => {
    const product = await createProduct({ sku: "NCK-9", name: "Kundan Necklace", metalId: w.gold } as never);
    const item = await receive(w, { productId: product.id, grossWeight: 10, stoneWeight: 1, cost: 55_000_00, huid: "ZZ99ZZ" });
    await createMetalRate({ metalId: w.gold, purity: "24K", ratePerGram: 650_000, effectiveFrom: new Date(Date.now() - 86_400_000), source: "MANUAL" } as never);
    const res = await mgr("get", `/api/inventory/items/${item.id}`);
    expect(res.status).toBe(200);
    const d = res.body.item;
    expect(d).toMatchObject({ itemCode: item.itemCode, huid: "ZZ99ZZ", grossWeight: 10, stoneWeight: 1, netWeight: 9, fineWeight: 8.244, purity: "22K", availableForSale: true, product: { sku: "NCK-9" }, location: { name: "Counter" }, ledgerSeq: 1 });
    expect(d.valuation).toMatchObject({ costPaise: 55_000_00, ratePerGramPaise: 650_000, ratePurity: "24K", metalValueNote: "Derived from the 24K rate" });
    expect(d.valuation.metalValuePaise).toBe(Math.round((8.244 * 650_000) / 0.999));
  });

  it("uses the item's own purity rate when there is one, and says so plainly when there is no rate", async () => {
    const item = await receive(w, { grossWeight: 10 });
    expect((await mgr("get", `/api/inventory/items/${item.id}`)).body.item.valuation).toEqual({ costPaise: 50_000_00, metalValueNote: "No current rate on file for this metal" });
    await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 595_000, effectiveFrom: new Date(Date.now() - 1000), source: "MANUAL" } as never);
    const v = (await mgr("get", `/api/inventory/items/${item.id}`)).body.item.valuation;
    expect(v).toMatchObject({ ratePurity: "22K", metalValuePaise: 5_950_000 });
    expect(v.metalValueNote).toBeUndefined();
  });

  it("a future-dated rate is not used yet", async () => {
    const item = await receive(w);
    await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 999_999, effectiveFrom: new Date(Date.now() + 86_400_000), source: "MANUAL" } as never);
    expect((await mgr("get", `/api/inventory/items/${item.id}`)).body.item.valuation.metalValuePaise).toBeUndefined();
  });

  it("404s an unknown id, 400s a malformed one, leaks no internals", async () => {
    expect((await mgr("get", "/api/inventory/items/64b0c0ffee0000000000ffff")).status).toBe(404);
    expect((await mgr("get", "/api/inventory/items/nope")).status).toBe(400);
    const item = await receive(w);
    const d = (await mgr("get", `/api/inventory/items/${item.id}`)).body.item;
    expect(d).not.toHaveProperty("_id");
    expect(d).not.toHaveProperty("__v");
  });
});

// ---------------------------------------------------------------------------------------------
describe("stock summaries", () => {
  beforeEach(async () => {
    const ring = await createProduct({ sku: "RNG-001", name: "Ring", metalId: w.gold } as never);
    const r1 = await receive(w, { productId: ring.id, grossWeight: 10, cost: 100_00 });
    const r2 = await receive(w, { productId: ring.id, grossWeight: 5, cost: 50_00 });
    await receive(w, { grossWeight: 20, purity: "18K", locationId: w.loc.warehouse, cost: 200_00 });
    const inTransit = await receive(w, { productId: ring.id, grossWeight: 4, cost: 40_00 });
    const sold = await receive(w, { grossWeight: 100, cost: 999_00 });
    await receive(w, { grossWeight: 7, metalId: w.silver, purity: "925", locationId: w.loc.vault, cost: 10_00 });
    await reserveItems({ performedBy: someUser() }, { itemIds: [r2.id], referenceId: someOrder() });
    await sellItems({ performedBy: someUser() }, { itemIds: [sold.id], referenceType: "ORDER", referenceId: someOrder() });
    await (await import("../modules/inventory/stock-operations")).createTransfer({ performedBy: someUser() }, { fromLocationId: w.loc.counter, toLocationId: w.loc.store2, itemIds: [inTransit.id] });
    void r1;
  });
  const summary = async (q: string) => (await mgr("get", `/api/inventory/stock/summary?${q}`)).body;
  const row = (s: { rows: { label: string }[] }, label: string) => s.rows.find((r) => r.label === label) as never as Record<string, never>;

  it("by location: pieces, weights, cost and a status breakdown — SOLD stock is not owned stock", async () => {
    const s = await summary("groupBy=location");
    expect(row(s, "Counter")).toMatchObject({ pieces: 2, grossWeight: 15, cost: 150_00, availablePieces: 1, byStatus: { AVAILABLE: 1, RESERVED: 1 } });
    expect(row(s, "Warehouse")).toMatchObject({ pieces: 1, grossWeight: 20, availablePieces: 1 });
    expect(row(s, "Store2")).toMatchObject({ pieces: 1, grossWeight: 4, availablePieces: 0, byStatus: { IN_TRANSIT: 1 } }); // en route: counted at the destination, not sellable
    expect(s.rows.some((r: { label: string }) => r.label === "Counter" && false)).toBe(false);
    expect(s.totals).toMatchObject({ count: 5, grossWeight: 46, cost: 150_00 + 200_00 + 40_00 + 10_00 });
  });

  it("scope=all includes sold stock", async () => {
    const s = await summary("groupBy=location&scope=all");
    expect(s.totals).toMatchObject({ count: 6, grossWeight: 146 });
    expect(row(s, "Counter").byStatus).toMatchObject({ SOLD: 1 });
  });

  it("by SKU (with a bucket for pieces not linked to a product), purity and metal", async () => {
    const bySku = await summary("groupBy=sku");
    expect(row(bySku, "RNG-001")).toMatchObject({ pieces: 3, grossWeight: 19, sublabel: "Ring" });
    expect(row(bySku, "No product")).toMatchObject({ pieces: 2, grossWeight: 27 });

    const byPurity = await summary("groupBy=purity");
    expect(row(byPurity, "Gold 22K")).toMatchObject({ pieces: 3, grossWeight: 19 });
    expect(row(byPurity, "Gold 18K")).toMatchObject({ pieces: 1, grossWeight: 20 });
    expect(row(byPurity, "Silver 925")).toMatchObject({ pieces: 1, grossWeight: 7 });

    const byMetal = await summary("groupBy=metal");
    expect(row(byMetal, "Gold")).toMatchObject({ pieces: 4, grossWeight: 39 });
    expect(row(byMetal, "Silver")).toMatchObject({ pieces: 1, grossWeight: 7 });
    expect(byMetal.rows[0].label).toBe("Gold"); // ordered by fine weight, largest first
  });

  it("filters narrow the summary; bad grouping is a 400", async () => {
    const s = await summary(`groupBy=location&metalId=${w.silver}`);
    expect(s.rows).toHaveLength(1);
    expect(row(s, "Vault")).toMatchObject({ pieces: 1 });
    expect((await mgr("get", "/api/inventory/stock/summary?groupBy=customer")).status).toBe(400);
    expect((await mgr("get", "/api/inventory/stock/summary")).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------
describe("ledger & audit history", () => {
  it("lists movements with who, why, where and the balance after — filterable by item, type, location, reference", async () => {
    const product = await createProduct({ sku: "P-1", name: "Bangle", metalId: w.gold } as never);
    const item = await receive(w, { productId: product.id });
    const order = someOrder();
    const { userId } = await as(R.STORE_MANAGER);
    await reserveItems({ performedBy: userId }, { itemIds: [item.id], referenceId: order, reason: "Customer on the phone" });
    await releaseItems({ performedBy: userId }, { itemIds: [item.id], referenceId: order });
    await movePartner({ performedBy: userId }, { type: "HALLMARKING_OUT", itemIds: [item.id], destinationLocationId: w.loc.hallmark });

    const hist = await mgr("get", `/api/inventory/ledger?itemId=${item.id}&order=asc`);
    expect(hist.body.total).toBe(4);
    expect(hist.body.rows.map((r: { sequence: number; movementType: string }) => [r.sequence, r.movementType])).toEqual([[1, "PURCHASE_RECEIPT"], [2, "RESERVATION"], [3, "RELEASE_RESERVATION"], [4, "HALLMARKING_OUT"]]);
    expect(hist.body.rows[1]).toMatchObject({ itemCode: item.itemCode, productName: "Bangle", reason: "Customer on the phone", referenceType: "ORDER", referenceId: order, fromStatus: "AVAILABLE", toStatus: "RESERVED", balanceAfter: { quantity: 1, grossWeight: 10 } });
    expect(hist.body.rows[1].performedBy.name).toMatch(/Test STORE_MANAGER/);
    expect(hist.body.rows[3]).toMatchObject({ sourceLocation: { name: "Counter" }, destinationLocation: { name: "Hallmark" } });

    const onlyRes = await mgr("get", "/api/inventory/ledger?movementType=RESERVATION,RELEASE_RESERVATION");
    expect(onlyRes.body.rows.map((r: { movementType: string }) => r.movementType).sort()).toEqual(["RELEASE_RESERVATION", "RESERVATION"]);
    expect((await mgr("get", `/api/inventory/ledger?locationId=${w.loc.hallmark}`)).body.total).toBe(1);
    expect((await mgr("get", `/api/inventory/ledger?referenceId=${order}`)).body.total).toBe(2);
    expect((await mgr("get", `/api/inventory/ledger?performedBy=${userId}`)).body.total).toBe(3);
    expect((await mgr("get", "/api/inventory/ledger?movementType=DELETE")).status).toBe(400);
    expect((await mgr("get", "/api/inventory/ledger?pageSize=500")).status).toBe(400);
  });

  it("date filters and paging work; newest first by default", async () => {
    for (let i = 0; i < 3; i++) await receive(w);
    const res = await mgr("get", "/api/inventory/ledger?pageSize=2");
    expect(res.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(res.body.rows).toHaveLength(2);
    expect((await mgr("get", `/api/inventory/ledger?from=${new Date(Date.now() + 60_000).toISOString()}`)).body.total).toBe(0);
    expect((await mgr("get", `/api/inventory/ledger?to=${new Date(Date.now() + 60_000).toISOString()}`)).body.total).toBe(3);
  });

  it("attributes system work to 'System', not to a person", async () => {
    const item = await receive(w);
    const order = someOrder();
    await reserveItems({ performedBy: someUser() }, { itemIds: [item.id], referenceId: order, expiresAt: new Date(Date.now() - 1000) });
    await (await import("../modules/inventory/stock-operations")).releaseExpiredReservations();
    const rows = (await mgr("get", `/api/inventory/ledger?itemId=${item.id}&order=asc`)).body.rows;
    expect(rows.at(-1)).toMatchObject({ movementType: "RELEASE_RESERVATION", performedBy: { name: "System" }, reason: "Reservation expired" });
  });

  it("an item's audit history shows who did what through the API, with their request id — and no secrets", async () => {
    const item = await receive(w);
    const order = someOrder();
    const sm = await as(R.STORE_MANAGER);
    expect((await call(R.STORE_MANAGER, "post", "/api/inventory/reservations", { itemIds: [item.id], referenceId: order })).status).toBe(201);
    expect((await call(R.STORE_MANAGER, "post", "/api/inventory/reservations/release", { itemIds: [item.id], referenceId: order })).status).toBe(200);
    const res = await mgr("get", `/api/inventory/items/${item.id}/audit`);
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e: { action: string }) => e.action)).toEqual(["inventory.released", "inventory.reserved"]);
    expect(res.body.entries[0]).toMatchObject({ outcome: "SUCCESS", actorId: sm.userId, targetType: "inventory_transaction" });
    expect(res.body.entries[0].requestId).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|token/i);
    expect((await mgr("get", `/api/inventory/items/${(await receive(w)).id}/audit`)).body.entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("scan resolution", () => {
  it("resolves a QR payload, an item code, a barcode, a serial number and a HUID to the same kind of row", async () => {
    const item = await receive(w, { itemCode: "JE-000045", barcode: "8901234567890", serialNumber: "SN-77", huid: "ab12cd" });
    const scan = async (code: string) => (await mgr("get", `/api/inventory/scan?code=${encodeURIComponent(code)}`)).body;
    expect(await scan("JERP:ITEM:JE-000045")).toMatchObject({ format: "QR_URI", matchedBy: "ITEM_CODE", item: { id: item.id, itemCode: "JE-000045" } });
    expect(await scan("je-000045\r\n")).toMatchObject({ matchedBy: "ITEM_CODE", item: { id: item.id } });
    expect(await scan("8901234567890")).toMatchObject({ format: "PLAIN", matchedBy: "BARCODE", item: { id: item.id } });
    expect(await scan("SN-77")).toMatchObject({ matchedBy: "SERIAL_NUMBER" });
    expect(await scan("AB12CD")).toMatchObject({ matchedBy: "HUID", item: { id: item.id } });
    expect(await scan("ab12cd")).toMatchObject({ matchedBy: "HUID" });
  });

  it("returns no item — not an error — for unknown or unparseable codes, and never queries with hostile text", async () => {
    await receive(w);
    for (const code of ["NOPE-1", "JERP:ITEM:MISSING", "<script>", "a;b", "x".repeat(150), "{\"$ne\":null}"]) {
      const res = await mgr("get", `/api/inventory/scan?code=${encodeURIComponent(code)}`);
      expect(res.status, code).toBe(200);
      expect(res.body.item, code).toBeUndefined();
    }
    expect((await mgr("get", "/api/inventory/scan")).status).toBe(400);
    expect((await mgr("get", "/api/inventory/scan?code=")).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------
describe("receiving and identifying stock over HTTP", () => {
  const body = (over: Record<string, unknown> = {}) => ({ type: "FINISHED_JEWELLERY", grossWeight: 18.42, stoneWeight: 0.5, metalId: w.gold, purity: "22K", locationId: w.loc.counter, cost: 92_000_00, ...over });

  it("creates the piece, allocates its code, writes ledger #1 and audits it", async () => {
    const res = await mgr("post", "/api/inventory/items", { ...body({ huid: "hk8x2m" }), reason: "Supplier delivery SD-14" });
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ itemCode: expect.stringMatching(/^JE-\d{6}$/), huid: "HK8X2M", hallmarkStatus: "HALLMARKED", netWeight: 17.92, status: "AVAILABLE", availableForSale: true });
    expect(res.body.entry).toMatchObject({ sequence: 1, movementType: "PURCHASE_RECEIPT" });
    const audit = await AuditLogModel.findOne({ action: "inventory.item_received" }).lean();
    expect(audit).toMatchObject({ outcome: "SUCCESS", targetType: "inventory_item", targetId: res.body.item.id });
  });

  it("refuses invalid weights with the field named, and creates nothing", async () => {
    for (const [over, path] of [[{ grossWeight: 0 }, "grossWeight"], [{ grossWeight: -5 }, "grossWeight"], [{ stoneWeight: 30 }, "stoneWeight"], [{ grossWeight: 5.1234 }, "grossWeight"]] as const) {
      const res = await mgr("post", "/api/inventory/items", body(over));
      expect(res.status, JSON.stringify(over)).toBe(400);
      expect(res.body.error.issues.map((i: { path: string }) => i.path)).toContain(path);
    }
    expect(await InventoryItemModel.countDocuments()).toBe(0);
  });

  it("refuses a duplicate HUID with 409 and a typed code; a malformed HUID with 400", async () => {
    expect((await mgr("post", "/api/inventory/items", body({ huid: "AB12CD" }))).status).toBe(201);
    const dup = await mgr("post", "/api/inventory/items", body({ huid: "ab12cd" }));
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: "DUPLICATE_IDENTIFIER", message: "HUID AB12CD is already assigned to another item" });
    expect((await mgr("post", "/api/inventory/items", body({ huid: "TOOLONGX" }))).status).toBe(400);
    expect(await InventoryItemModel.countDocuments()).toBe(1);
  });

  it("refuses unknown metals, wrong purities, unknown/partner locations", async () => {
    expect((await mgr("post", "/api/inventory/items", body({ metalId: "64b0c0ffee0000000000ffff" }))).status).toBeGreaterThanOrEqual(400);
    expect((await mgr("post", "/api/inventory/items", body({ purity: "14K" }))).status).toBeGreaterThanOrEqual(400);
    expect((await mgr("post", "/api/inventory/items", body({ locationId: w.loc.jobworker }))).status).toBe(400);
    expect((await mgr("post", "/api/inventory/items", body({ locationId: "64b0c0ffee0000000000ffff" }))).status).toBe(404);
    expect(await InventoryItemModel.countDocuments()).toBe(0);
  });

  it("cannot smuggle status, quantity, weights or ledger fields past the schema", async () => {
    const res = await mgr("post", "/api/inventory/items", { ...body(), netWeight: 999, fineWeight: 999, ledgerSeq: 50, reservation: { referenceId: someOrder() }, netweight: 1 });
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ netWeight: 17.92, ledgerSeq: 1 });
    expect(res.body.item.reservation).toBeUndefined();
  });

  it("sets a HUID once, and never again", async () => {
    const item = await receive(w);
    const ok = await mgr("patch", `/api/inventory/items/${item.id}/identifiers`, { huid: "ab12cd", barcode: "BC-100" });
    expect(ok.status).toBe(200);
    expect(ok.body.item).toMatchObject({ huid: "AB12CD", hallmarkStatus: "HALLMARKED", barcode: "BC-100" });
    const again = await mgr("patch", `/api/inventory/items/${item.id}/identifiers`, { huid: "ZZ99ZZ" });
    expect(again.status).toBe(409);
    expect(await AuditLogModel.countDocuments({ action: "inventory.identifiers_updated" })).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe("reservations, movements, transfers over HTTP", () => {
  it("reserve → conflict → wrong-order release refused → own release; all-or-nothing on a bad id", async () => {
    const [a, b] = [await receive(w), await receive(w)];
    const order = someOrder();
    const ok = await call(R.STORE_MANAGER, "post", "/api/inventory/reservations", { itemIds: [a.id], referenceId: order, expiresInMinutes: 30 });
    expect(ok.status).toBe(201);
    expect(ok.body.entries[0]).toMatchObject({ movementType: "RESERVATION", toStatus: "RESERVED" });
    expect((await mgr("get", `/api/inventory/items/${a.id}`)).body.item).toMatchObject({ status: "RESERVED", availableForSale: false, reservedForOrder: order });
    expect((await call(R.STORE_MANAGER, "post", "/api/inventory/reservations", { itemIds: [a.id], referenceId: someOrder() })).status).toBe(409);
    expect((await call(R.STORE_MANAGER, "post", "/api/inventory/reservations", { itemIds: [b.id, "64b0c0ffee0000000000ffff"], referenceId: someOrder() })).status).toBe(404);
    expect((await InventoryItemModel.findById(b.id).lean())!.status).toBe("AVAILABLE");

    const other = await call(R.STORE_MANAGER, "post", "/api/inventory/reservations/release", { itemIds: [a.id], referenceId: someOrder() });
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe("RESERVED_FOR_OTHER");
    expect((await call(R.STORE_MANAGER, "post", "/api/inventory/reservations/release", { itemIds: [a.id], referenceId: order })).status).toBe(200);
  });

  it("only the person who placed a hold (or a manager) can release it — knowing the order id is not enough", async () => {
    const a = await receive(w);
    const order = someOrder();
    expect((await call(R.STORE_MANAGER, "post", "/api/inventory/reservations", { itemIds: [a.id], referenceId: order })).status).toBe(201);
    // Another user who can reserve (warehouse manager holds inventory.transfer) knows the order id, but did not place the hold.
    const other = await call(R.WAREHOUSE_MANAGER, "post", "/api/inventory/reservations/release", { itemIds: [a.id], referenceId: order });
    expect(other.status).toBe(403);
    expect(other.body.error.message).toMatch(/reserved by someone else/);
    expect((await InventoryItemModel.findById(a.id).lean())!.status).toBe("RESERVED");
    // A holder of approval authority may.
    expect((await mgr("post", "/api/inventory/reservations/release", { itemIds: [a.id], referenceId: order })).status).toBe(200);
  });

  it("forcing a release of someone else's hold needs approval authority", async () => {
    const a = await receive(w);
    await call(R.STORE_MANAGER, "post", "/api/inventory/reservations", { itemIds: [a.id], referenceId: someOrder() });
    const denied = await call(R.STORE_MANAGER, "post", "/api/inventory/reservations/release", { itemIds: [a.id], referenceId: someOrder(), force: true });
    expect(denied.status).toBe(403);
    expect((await InventoryItemModel.findById(a.id).lean())!.status).toBe("RESERVED");
    const forced = await mgr("post", "/api/inventory/reservations/release", { itemIds: [a.id], referenceId: someOrder(), force: true });
    expect(forced.status).toBe(200);
    expect((await AuditLogModel.findOne({ action: "inventory.released" }).lean())!.metadata).toMatchObject({ forced: true });
  });

  it("rejects malformed reservations: no order, duplicates, too many pieces, hold too long", async () => {
    const a = await receive(w);
    for (const bad of [{ itemIds: [a.id] }, { itemIds: [a.id, a.id], referenceId: someOrder() }, { itemIds: [], referenceId: someOrder() }, { itemIds: [a.id], referenceId: someOrder(), expiresInMinutes: 999999 }, { itemIds: Array(101).fill(a.id), referenceId: someOrder() }]) {
      expect((await mgr("post", "/api/inventory/reservations", bad)).status, JSON.stringify(bad).slice(0, 60)).toBe(400);
    }
  });

  it("dispatches, lists, receives and cancels transfers; audits each", async () => {
    const [a, b, c] = [await receive(w), await receive(w), await receive(w)];
    const made = await mgr("post", "/api/inventory/transfers", { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [a.id, b.id], notes: "Weekly restock" });
    expect(made.status).toBe(201);
    const id = made.body.transfer.id;
    const list = await mgr("get", "/api/inventory/transfers?status=IN_TRANSIT");
    expect(list.body.total).toBe(1);
    expect(list.body.transfers[0]).toMatchObject({ transferNo: made.body.transfer.transferNo, fromLocation: { name: "Counter" }, toLocation: { name: "Warehouse" }, lines: [{ itemCode: a.itemCode, state: "PENDING" }, { itemCode: b.itemCode }] });
    expect((await mgr("get", `/api/inventory/transfers/${id}`)).body.transfer.dispatchedByName).toMatch(/Test INVENTORY_MANAGER/);
    expect((await mgr("post", `/api/inventory/transfers/${id}/receive`, { itemIds: [a.id] })).body.transfer.status).toBe("IN_TRANSIT");
    expect((await mgr("post", `/api/inventory/transfers/${id}/cancel`, { reason: "Wrong bag" })).body.transfer.status).toBe("RECEIVED");
    expect((await mgr("post", `/api/inventory/transfers/${id}/receive`, {})).status).toBe(409);

    const second = await mgr("post", "/api/inventory/transfers", { fromLocationId: w.loc.counter, toLocationId: w.loc.store2, itemIds: [c.id] });
    expect((await mgr("post", `/api/inventory/transfers/${second.body.transfer.id}/cancel`, {})).body.transfer.status).toBe("CANCELLED");
    expect((await AuditLogModel.find({ action: /^inventory\.transfer_/ }).lean()).map((e) => e.action).sort()).toEqual(["inventory.transfer_cancelled", "inventory.transfer_cancelled", "inventory.transfer_dispatched", "inventory.transfer_dispatched", "inventory.transfer_received"]);
    expect((await mgr("get", "/api/inventory/transfers/64b0c0ffee0000000000ffff")).status).toBe(404);
  });

  it("transfer validation: same place, partner place, unknown piece, ineligible piece", async () => {
    const [a, held] = [await receive(w), await receive(w)];
    await mgr("post", "/api/inventory/reservations", { itemIds: [held.id], referenceId: someOrder() });
    expect((await mgr("post", "/api/inventory/transfers", { fromLocationId: w.loc.counter, toLocationId: w.loc.counter, itemIds: [a.id] })).status).toBe(400);
    expect((await mgr("post", "/api/inventory/transfers", { fromLocationId: w.loc.counter, toLocationId: w.loc.jobworker, itemIds: [a.id] })).status).toBe(400);
    expect((await mgr("post", "/api/inventory/transfers", { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: ["64b0c0ffee0000000000ffff"] })).status).toBe(404);
    expect((await mgr("post", "/api/inventory/transfers", { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [a.id, held.id] })).status).toBe(409);
    expect((await InventoryItemModel.findById(a.id).lean())!.status).toBe("AVAILABLE");
  });

  it("hallmarking round trip through /movements, with the HUID coming back; wrong destination types are 400", async () => {
    const a = await receive(w);
    expect((await mgr("post", "/api/inventory/movements", { type: "HALLMARKING_OUT", itemIds: [a.id], destinationLocationId: w.loc.warehouse })).status).toBe(400);
    expect((await mgr("post", "/api/inventory/movements", { type: "HALLMARKING_OUT", itemIds: [a.id], destinationLocationId: w.loc.hallmark })).status).toBe(201);
    expect((await mgr("get", `/api/inventory/items/${a.id}`)).body.item).toMatchObject({ status: "HALLMARKING", hallmarkStatus: "PENDING", location: { name: "Hallmark" } });
    expect((await mgr("post", "/api/inventory/movements", { type: "HALLMARKING_IN", itemIds: [a.id], destinationLocationId: w.loc.vault, hallmarkResults: [{ itemId: a.id, huid: "hm00aa" }] })).status).toBe(201);
    expect((await mgr("get", `/api/inventory/items/${a.id}`)).body.item).toMatchObject({ status: "AVAILABLE", huid: "HM00AA", hallmarkStatus: "HALLMARKED", location: { name: "Vault" } });
    expect((await mgr("post", "/api/inventory/movements", { type: "SALE", itemIds: [a.id], destinationLocationId: w.loc.vault })).status).toBe(400); // not a partner movement
    expect((await AuditLogModel.countDocuments({ action: "inventory.moved" }))).toBe(2);
  });

  it("inspects a returned piece: back on the shelf or damaged", async () => {
    const [a, b] = [await receive(w), await receive(w)];
    for (const i of [a, b]) {
      const order = someOrder();
      await sellItems({ performedBy: someUser() }, { itemIds: [i.id], referenceType: "ORDER", referenceId: order });
      await returnItems({ performedBy: someUser() }, { itemIds: [i.id], destinationLocationId: w.loc.counter, referenceId: order, referenceType: "ORDER" });
    }
    expect((await mgr("post", "/api/inventory/returns/inspect", { itemIds: [a.id], outcome: "AVAILABLE", destinationLocationId: w.loc.counter })).status).toBe(201);
    expect((await mgr("post", "/api/inventory/returns/inspect", { itemIds: [b.id], outcome: "DAMAGED", destinationLocationId: w.loc.counter })).status).toBe(201);
    expect((await mgr("post", "/api/inventory/returns/inspect", { itemIds: [a.id], outcome: "SCRAP", destinationLocationId: w.loc.counter })).status).toBe(400); // write-offs go through approval
    expect((await mgr("post", "/api/inventory/returns/inspect", { itemIds: [a.id], outcome: "AVAILABLE", destinationLocationId: w.loc.counter })).status).toBe(409); // already inspected
    expect((await InventoryItemModel.findById(a.id).lean())!.status).toBe("AVAILABLE");
    expect((await InventoryItemModel.findById(b.id).lean())!.status).toBe("DAMAGED");
  });

  it("caps a movement at 100 pieces", async () => {
    const res = await mgr("post", "/api/inventory/transfers", { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: Array.from({ length: 101 }, (_, i) => `64b0c0ffee00000000${String(i).padStart(6, "0")}`) });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------
describe("adjustments over HTTP (four-eyes)", () => {
  it("one person requests, a different one approves; the ledger and audit show both", async () => {
    const item = await receive(w);
    const requested = await call(R.STORE_MANAGER, "post", "/api/inventory/adjustments", { itemId: item.id, reason: "Stone fell out, item damaged", toStatus: "DAMAGED" });
    expect(requested.status).toBe(201);
    const id = requested.body.adjustment.id;
    expect((await InventoryItemModel.findById(item.id).lean())!.status).toBe("AVAILABLE"); // nothing yet
    const pending = await mgr("get", "/api/inventory/adjustments?status=PENDING");
    expect(pending.body.adjustments[0]).toMatchObject({ id, requestedByName: expect.stringMatching(/STORE_MANAGER/), stale: false, current: { status: "AVAILABLE" } });

    const approved = await mgr("post", `/api/inventory/adjustments/${id}/approve`, { note: "Verified" });
    expect(approved.status).toBe(200);
    expect(approved.body.adjustment).toMatchObject({ status: "APPROVED", decisionNote: "Verified" });
    expect((await mgr("get", `/api/inventory/items/${item.id}`)).body.item.status).toBe("DAMAGED");
    const ledger = await mgr("get", `/api/inventory/ledger?itemId=${item.id}&order=asc`);
    expect(ledger.body.rows.at(-1)).toMatchObject({ movementType: "ADJUSTMENT", reason: "Stone fell out, item damaged", toStatus: "DAMAGED" });
    const audits = (await AuditLogModel.find({ action: /^inventory\.adjustment_/ }).lean()).map((a) => a.action).sort();
    expect(audits).toEqual(["inventory.adjustment_approved", "inventory.adjustment_requested"]);
  });

  it("the requester cannot approve their own request, even holding the approval permission", async () => {
    const item = await receive(w);
    const requested = await mgr("post", "/api/inventory/adjustments", { itemId: item.id, reason: "Reweighed on the new scale", grossWeight: 9.8 });
    expect(requested.status).toBe(201);
    const self = await mgr("post", `/api/inventory/adjustments/${requested.body.adjustment.id}/approve`, {});
    expect(self.status).toBe(403);
    expect((await InventoryItemModel.findById(item.id).lean())!.grossWeight).toBe(10);
  });

  it("a role with adjust but not approve cannot approve or reject; one with approve but not adjust cannot request", async () => {
    const item = await receive(w);
    const requested = await call(R.STORE_MANAGER, "post", "/api/inventory/adjustments", { itemId: item.id, reason: "Reweighed on the new scale", grossWeight: 9.8 });
    const id = requested.body.adjustment.id;
    expect((await call(R.STORE_MANAGER, "post", `/api/inventory/adjustments/${id}/approve`, {})).status).toBe(403);
    expect((await call(R.STORE_MANAGER, "post", `/api/inventory/adjustments/${id}/reject`, {})).status).toBe(403);
    expect((await call(R.WAREHOUSE_MANAGER, "post", "/api/inventory/adjustments", { itemId: item.id, reason: "Reweighed on the new scale", grossWeight: 9.8 })).status).toBe(403);
  });

  it("flags a request as stale once the piece has moved, and refuses to approve it", async () => {
    const item = await receive(w);
    const requested = await call(R.STORE_MANAGER, "post", "/api/inventory/adjustments", { itemId: item.id, reason: "Stone fell out, item damaged", toStatus: "DAMAGED" });
    await mgr("post", "/api/inventory/reservations", { itemIds: [item.id], referenceId: someOrder() });
    expect((await mgr("get", "/api/inventory/adjustments?status=PENDING")).body.adjustments[0].stale).toBe(true);
    const res = await mgr("post", `/api/inventory/adjustments/${requested.body.adjustment.id}/approve`, {});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONCURRENT_MODIFICATION");
  });

  it("rejects impossible or empty requests with 400 and a clear message", async () => {
    const item = await receive(w, { grossWeight: 10, stoneWeight: 2 });
    for (const bad of [{ itemId: item.id, reason: "ok", toStatus: "DAMAGED" }, { itemId: item.id, reason: "Nothing is changing here" }, { itemId: item.id, reason: "Weight below its stone", grossWeight: 1 }, { itemId: item.id, reason: "Negative weight", grossWeight: -3 }, { itemId: item.id, reason: "A unit with deltas", quantityDelta: -1 }]) {
      const res = await call(R.STORE_MANAGER, "post", "/api/inventory/adjustments", bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    expect((await call(R.STORE_MANAGER, "post", "/api/inventory/adjustments", { itemId: "64b0c0ffee0000000000ffff", reason: "Unknown item here", toStatus: "DAMAGED" })).status).toBe(404);
    expect((await mgr("get", "/api/inventory/adjustments?status=MAYBE")).status).toBe(400);
  });

  it("reject leaves stock alone and is audited; a decided request can't be decided again", async () => {
    const item = await receive(w);
    const requested = await call(R.STORE_MANAGER, "post", "/api/inventory/adjustments", { itemId: item.id, reason: "Stone fell out, item damaged", toStatus: "DAMAGED" });
    const id = requested.body.adjustment.id;
    expect((await mgr("post", `/api/inventory/adjustments/${id}/reject`, { note: "Photos say otherwise" })).body.adjustment).toMatchObject({ status: "REJECTED" });
    expect((await mgr("post", `/api/inventory/adjustments/${id}/approve`, {})).status).toBe(409);
    expect((await InventoryItemModel.findById(item.id).lean())!.status).toBe("AVAILABLE");
    expect(await AuditLogModel.countDocuments({ action: "inventory.adjustment_rejected" })).toBe(1);
  });
});

describe("meta", () => {
  it("returns locations (all types), metals with purities and the purities in use, for filters and forms", async () => {
    await receive(w, { purity: "18K" });
    const res = await mgr("get", "/api/inventory/meta");
    expect(res.body.locations.map((l: { type: string }) => l.type).sort()).toEqual(["COUNTER", "HALLMARKING_CENTER", "JOB_WORKER", "MANUFACTURING_UNIT", "REPAIR_CENTER", "STORE", "VAULT", "WAREHOUSE"]);
    expect(res.body.metals.find((m: { code: string }) => m.code === "GOLD").purities).toEqual(["24K", "22K", "18K"]);
    expect(res.body.usedPurities).toEqual(["18K"]);
    expect(ids(res.body.locations)).toHaveLength(8);
  });
});
