import request from "supertest";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import { ALL_ROLE_NAMES, PERMISSIONS as P, ROLE_NAMES as R } from "@jewellery/types";
import { PNG } from "../../test/fixtures";
import { bearer, buildTestApp, createStaff, loginAs, seedRbac } from "../../test/helpers";
import { AuditLogModel } from "../modules/audit/audit-log.model";
import { DEFAULT_ROLE_MATRIX } from "../modules/auth/rbac/role-matrix";
import { InventoryItemModel } from "../modules/inventory/inventory-item.model";
import { createMetal } from "../modules/metals/metal.repository";

let t: ReturnType<typeof buildTestApp>;
let metalId: string;
let manager: string; // INVENTORY_MANAGER — holds catalog.manage + inventory.view
const auth = () => bearer(manager);
const api = (method: "get" | "post" | "put" | "patch" | "delete", url: string, token = manager) => request(t.app)[method](url).set(bearer(token));

async function tokenFor(role: (typeof R)[keyof typeof R] | null) {
  const staff = await createStaff(role);
  const login = await loginAs(t.app, staff.email);
  if (!login.accessToken) console.log("LOGINFAIL", role, staff.email, login.res.status, JSON.stringify(login.res.body));
  return login.accessToken;
}

async function mkProduct(over: Record<string, unknown> = {}) {
  const res = await api("post", "/api/products").send({ sku: `SKU-${Math.random().toString(36).slice(2, 8)}`, name: "Temple Ring", metalId, ...over });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.product;
}
const mkCategory = async (name: string, parentId?: string) => (await api("post", "/api/catalog/categories").send({ name, parentId })).body.category;
const mkCollection = async (name: string) => (await api("post", "/api/catalog/collections").send({ name })).body.collection;
const upload = (token = manager, bytes: Buffer = PNG, filename = "a.png", type = "image/png") =>
  request(t.app).post("/api/media/images").set(bearer(token)).attach("file", bytes, { filename, contentType: type });

beforeEach(async () => {
  await seedRbac();
  t = buildTestApp();
  manager = await tokenFor(R.INVENTORY_MANAGER);
  metalId = (await createMetal({ code: "GOLD", name: "Gold", purityOptions: [{ code: "22K", fineness: 0.916, isActive: true }, { code: "18K", fineness: 0.75, isActive: true }] } as never)).id;
});

describe("authorization", () => {
  const reads = ["/api/products", "/api/products/meta", "/api/catalog/categories", "/api/catalog/collections"];
  const writes: ["post" | "patch" | "delete", string][] = [
    ["post", "/api/products"],
    ["post", "/api/products/bulk"],
    ["patch", "/api/products/64b0c0ffee0000000000aaaa"],
    ["delete", "/api/products/64b0c0ffee0000000000aaaa"],
    ["post", "/api/products/64b0c0ffee0000000000aaaa/variants"],
    ["post", "/api/catalog/categories"],
    ["post", "/api/catalog/collections"],
    ["post", "/api/media/images"],
  ];

  it("every catalogue endpoint refuses an unauthenticated caller", async () => {
    for (const url of reads) expect((await request(t.app).get(url)).status, url).toBe(401);
    for (const [m, url] of writes) expect((await request(t.app)[m](url)).status, `${m} ${url}`).toBe(401);
  });

  it("across all 13 roles: reads need catalog.view, writes need catalog.manage — and nothing else decides", async () => {
    for (const role of ALL_ROLE_NAMES) {
      const token = await tokenFor(role);
      const canView = DEFAULT_ROLE_MATRIX[role].includes(P.CATALOG_VIEW);
      const canManage = DEFAULT_ROLE_MATRIX[role].includes(P.CATALOG_MANAGE);
      for (const url of reads) expect((await api("get", url, token)).status === 403, `${role} GET ${url}`).toBe(!canView);
      // An empty body is invalid for every write, so an authorised caller sees 400/404 — never 403; an unauthorised one always 403.
      for (const [m, url] of writes) expect((await api(m, url, token)).status === 403, `${role} ${m} ${url}`).toBe(!canManage);
    }
  });

  it("only roles that hold inventory.view see stock on a product — a catalogue-only role does not", async () => {
    const product = await mkProduct();
    await InventoryItemModel.create({
      itemCode: "IT-1", productId: product.id, type: "FINISHED_JEWELLERY", grossWeight: 5, stoneWeight: 0, netWeight: 5, fineWeight: 4.58,
      metalId, purity: "22K", fineness: 0.916, locationId: new Types.ObjectId(), cost: 1000, quantity: 1,
    } as never);
    expect((await api("get", `/api/products/${product.id}`)).body.product.stock).toEqual({ pieces: 1, available: 1 });

    const root = await tokenFor(R.SUPER_ADMIN);
    const role = await api("post", "/api/roles", root).send({ name: "Catalogue Reader", description: "x", permissionKeys: [P.CATALOG_VIEW] });
    const user = await createStaff(null);
    await api("put", `/api/users/${user.user.id}/roles`, root).send({ roleIds: [role.body.role.id] });
    const reader = await loginAs(t.app, user.email);
    const res = await api("get", `/api/products/${product.id}`, reader.accessToken);
    expect(res.status).toBe(200);
    expect(res.body.product).not.toHaveProperty("stock");
  });
});

describe("product create / read / update", () => {
  it("creates a product, derives a slug, uppercases the SKU, and records who created it", async () => {
    const res = await api("post", "/api/products").send({ sku: "ring-001", name: "Temple Ring", metalId, purity: "22K", tags: ["Bridal", "bridal"], b2cEnabled: true });
    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({ sku: "RING-001", slug: "temple-ring", purity: "22K", tags: ["bridal"], b2cEnabled: true, b2bEnabled: false, isActive: true });
    expect(res.body.product.metal).toMatchObject({ code: "GOLD" });
    expect(res.body.product.createdBy).toBeTypeOf("string");
    expect(res.body.product).not.toHaveProperty("status");
    expect(res.body.product).not.toHaveProperty("quantity"); // a Product is not a physical piece
  });

  it("de-duplicates a derived slug but conflicts on an explicit duplicate", async () => {
    const a = await mkProduct({ name: "Temple Necklace" });
    const b = await mkProduct({ name: "Temple Necklace" });
    expect([a.slug, b.slug]).toEqual(["temple-necklace", "temple-necklace-2"]);
    const res = await api("post", "/api/products").send({ sku: "X1", name: "Other", metalId, slug: "temple-necklace" });
    expect(res.status).toBe(409);
  });

  it("rejects a duplicate SKU (case-insensitively) and a SKU already used by a variant", async () => {
    const p = await mkProduct({ sku: "RING-001" });
    expect((await api("post", "/api/products").send({ sku: "ring-001", name: "Dup", metalId })).status).toBe(409);
    await api("post", `/api/products/${p.id}/variants`).send({ sku: "RING-001-14", attributes: { size: "14" } });
    expect((await api("post", "/api/products").send({ sku: "RING-001-14", name: "Clash", metalId })).status).toBe(409);
  });

  it("rejects references that do not exist: metal, category, collection, purity-for-metal and un-uploaded images", async () => {
    const ghost = "64b0c0ffee0000000000ffff";
    const post = (over: object) => api("post", "/api/products").send({ sku: "S" + Math.random(), name: "N", metalId, ...over });
    expect((await post({ metalId: ghost })).status).toBe(400);
    expect((await post({ categoryId: ghost })).status).toBe(400);
    expect((await post({ collectionIds: [ghost] })).status).toBe(400);
    expect((await post({ purity: "14K" })).status).toBe(400);
    expect((await post({ images: [{ key: "products/00000000-0000-4000-8000-000000000000.png" }] })).status).toBe(400);
    expect((await post({ name: "" })).status).toBe(400);
  });

  it("attaches uploaded images in order and exposes resolved URLs; the first is primary", async () => {
    const a = (await upload()).body.key;
    const b = (await upload()).body.key;
    const p = await mkProduct({ images: [{ key: b, alt: "front" }, { key: a }] });
    expect(p.images.map((i: { key: string }) => i.key)).toEqual([b, a]);
    expect(p.images[0]).toMatchObject({ alt: "front", url: `http://api.test/api/media/${b}` });
    const list = await api("get", "/api/products");
    expect(list.body.items[0]).toMatchObject({ primaryImageUrl: `http://api.test/api/media/${b}`, imageCount: 2 });
  });

  it("updates fields, keeps the SKU immutable, clears optional fields with null, and stamps updatedBy", async () => {
    const category = await mkCategory("Rings");
    const p = await mkProduct({ sku: "KEEP-1", categoryId: category.id, purity: "22K", description: "old" });
    const res = await api("patch", `/api/products/${p.id}`).send({ sku: "HACK", name: "Renamed", description: null, categoryId: null, isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({ sku: "KEEP-1", name: "Renamed", isActive: false, slug: p.slug });
    expect(res.body.product.description).toBeUndefined();
    expect(res.body.product.categoryId).toBeUndefined();
    expect(res.body.product.purity).toBe("22K");
  });

  it("re-validates purity against the metal when either changes, and net ≤ gross against stored values", async () => {
    const silver = await createMetal({ code: "SILVER", name: "Silver", purityOptions: [{ code: "925", fineness: 0.925, isActive: true }] } as never);
    const p = await mkProduct({ purity: "22K", defaultGrossWeight: 10 });
    expect((await api("patch", `/api/products/${p.id}`).send({ metalId: silver.id })).status).toBe(400); // 22K isn't a silver purity
    expect((await api("patch", `/api/products/${p.id}`).send({ metalId: silver.id, purity: "925" })).status).toBe(200);
    expect((await api("patch", `/api/products/${p.id}`).send({ defaultNetWeight: 11 })).status).toBe(400);
  });

  it("404s an unknown id and 400s a malformed one", async () => {
    expect((await api("get", "/api/products/64b0c0ffee0000000000ffff")).status).toBe(404);
    expect((await api("get", "/api/products/not-an-id")).status).toBe(400);
  });

  it("does not leak Mongo internals", async () => {
    const p = await mkProduct();
    const detail = (await api("get", `/api/products/${p.id}`)).body.product;
    expect(detail).not.toHaveProperty("_id");
    expect(detail).not.toHaveProperty("__v");
  });
});

describe("product list: search, filter, sort, paginate", () => {
  beforeEach(async () => {
    const bridal = await mkCollection("Bridal Edit");
    const rings = await mkCategory("Rings");
    const neck = await mkCategory("Necklaces");
    await mkProduct({ sku: "RNG-001", name: "Rihaan Solitaire Ring", categoryId: rings.id, collectionIds: [bridal.id], purity: "18K", tags: ["diamond", "engagement"], b2cEnabled: true });
    await mkProduct({ sku: "RNG-002", name: "Temple Band Ring", categoryId: rings.id, purity: "22K", tags: ["temple"], b2bEnabled: true });
    await mkProduct({ sku: "NCK-001", name: "Kundan Bridal Necklace", categoryId: neck.id, collectionIds: [bridal.id], purity: "22K", tags: ["kundan", "bridal"], isActive: false });
  });
  const list = async (qs: string) => (await api("get", `/api/products?${qs}`)).body;
  const skus = (b: { items: { sku: string }[] }) => b.items.map((i) => i.sku).sort();

  it("searches across SKU, name, slug and tags, every word must match", async () => {
    expect(skus(await list("q=rng"))).toEqual(["RNG-001", "RNG-002"]);
    expect(skus(await list("q=bridal"))).toEqual(["NCK-001"]); // name + tag, and not the Bridal *collection* products by name
    expect(skus(await list("q=kundan%20necklace"))).toEqual(["NCK-001"]);
    expect(skus(await list("q=kundan%20ring"))).toEqual([]);
    expect(skus(await list("q=ENGAGEMENT"))).toEqual(["RNG-001"]);
  });

  it("finds a product by one of its variant SKUs", async () => {
    const p = (await list("q=RNG-001")).items[0];
    await api("post", `/api/products/${p.id}/variants`).send({ sku: "RNG-001-SIZE14", attributes: { size: "14" } });
    expect(skus(await list("q=SIZE14"))).toEqual(["RNG-001"]);
  });

  it("treats regex metacharacters in the search text literally (no error, no wildcard)", async () => {
    for (const q of ["(", ".*", "[a-", "\\", "RNG-00(1"]) expect((await api("get", `/api/products?q=${encodeURIComponent(q)}`)).status, q).toBe(200);
    expect(skus(await list("q=" + encodeURIComponent(".*")))).toEqual([]);
  });

  it("filters by category, collection, metal, purity, tag and each flag; filters combine with AND", async () => {
    const cats = (await api("get", "/api/catalog/categories")).body.categories;
    const cols = (await api("get", "/api/catalog/collections")).body.collections;
    const rings = cats.find((c: { name: string }) => c.name === "Rings").id;
    expect(skus(await list(`categoryId=${rings}`))).toEqual(["RNG-001", "RNG-002"]);
    expect(skus(await list(`collectionId=${cols[0].id}`))).toEqual(["NCK-001", "RNG-001"]);
    expect(skus(await list(`collectionId=${cols[0].id}&categoryId=${rings}`))).toEqual(["RNG-001"]);
    expect(skus(await list(`metalId=${metalId}&purity=22K`))).toEqual(["NCK-001", "RNG-002"]);
    expect(skus(await list("tag=kundan"))).toEqual(["NCK-001"]);
    expect(skus(await list("isActive=false"))).toEqual(["NCK-001"]);
    expect(skus(await list("isActive=true&b2cEnabled=true"))).toEqual(["RNG-001"]);
    expect(skus(await list("b2bEnabled=true"))).toEqual(["RNG-002"]);
    expect(skus(await list("b2bEnabled=false"))).toEqual(["NCK-001", "RNG-001"]);
  });

  it("sorts by name and SKU in both directions, case-insensitively, with a stable tiebreak", async () => {
    await mkProduct({ sku: "aaa-lower", name: "aardvark charm" });
    const names = async (qs: string) => (await list(qs)).items.map((i: { name: string }) => i.name);
    expect((await names("sort=name&order=asc"))[0]).toBe("aardvark charm");
    expect((await names("sort=name&order=desc"))[0]).toBe("Temple Band Ring");
    expect((await list("sort=sku&order=asc")).items[0].sku).toBe("aaa-lower".toUpperCase());
  });

  it("paginates with a correct total, and an out-of-range page is empty rather than an error", async () => {
    const p1 = await list("pageSize=2&page=1&sort=sku&order=asc");
    const p2 = await list("pageSize=2&page=2&sort=sku&order=asc");
    expect(p1).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect([p1.items.length, p2.items.length]).toEqual([2, 1]);
    expect(new Set([...p1.items, ...p2.items].map((i: { id: string }) => i.id)).size).toBe(3);
    expect((await list("page=9")).items).toEqual([]);
  });

  it("rejects bad query params instead of ignoring them", async () => {
    for (const qs of ["sort=passwordHash", "pageSize=1000", "page=0", "isActive=maybe", "categoryId=nope", "order=sideways"]) {
      expect((await api("get", `/api/products?${qs}`)).status, qs).toBe(400);
    }
  });

  it("list rows carry the summaries the table needs (metal, category, collections, variant count)", async () => {
    const row = (await list("q=RNG-001")).items[0];
    expect(row).toMatchObject({ metal: { code: "GOLD" }, category: { name: "Rings" }, collections: [{ name: "Bridal Edit" }], variantCount: 0, imageCount: 0 });
  });
});

describe("meta", () => {
  it("returns active metals with their purities, used purities and tags for the filters/forms", async () => {
    await mkProduct({ purity: "22K", tags: ["zeta", "alpha"] });
    const res = await api("get", "/api/products/meta");
    expect(res.body.metals[0]).toMatchObject({ code: "GOLD", purities: ["22K", "18K"] });
    expect(res.body.usedPurities).toEqual(["22K"]);
    expect(res.body.tags).toEqual(["alpha", "zeta"]);
  });
});

describe("bulk actions", () => {
  it("activates/deactivates and toggles channels for many products at once, and reports matched/modified", async () => {
    const [a, b] = [await mkProduct(), await mkProduct()];
    const res = await api("post", "/api/products/bulk").send({ action: "set-active", ids: [a.id, b.id], value: false });
    expect(res.body).toEqual({ matched: 2, modified: 2 });
    expect((await api("get", `/api/products/${a.id}`)).body.product.isActive).toBe(false);
    expect((await api("post", "/api/products/bulk").send({ action: "set-b2c", ids: [a.id], value: true })).body.modified).toBe(1);
    expect((await api("post", "/api/products/bulk").send({ action: "set-b2c", ids: [a.id], value: true })).body).toEqual({ matched: 1, modified: 0 }); // idempotent
  });

  it("adds/removes a collection and sets/clears a category", async () => {
    const [p, q] = [await mkProduct(), await mkProduct()];
    const col = await mkCollection("Festive");
    const cat = await mkCategory("Bangles");
    await api("post", "/api/products/bulk").send({ action: "add-to-collection", ids: [p.id, q.id], collectionId: col.id });
    await api("post", "/api/products/bulk").send({ action: "add-to-collection", ids: [p.id], collectionId: col.id }); // no duplicate membership
    expect((await api("get", `/api/products/${p.id}`)).body.product.collectionIds).toEqual([col.id]);
    await api("post", "/api/products/bulk").send({ action: "remove-from-collection", ids: [q.id], collectionId: col.id });
    expect((await api("get", `/api/products/${q.id}`)).body.product.collectionIds).toEqual([]);
    await api("post", "/api/products/bulk").send({ action: "set-category", ids: [p.id], categoryId: cat.id });
    expect((await api("get", `/api/products/${p.id}`)).body.product.category.name).toBe("Bangles");
    await api("post", "/api/products/bulk").send({ action: "set-category", ids: [p.id], categoryId: null });
    expect((await api("get", `/api/products/${p.id}`)).body.product.category).toBeUndefined();
  });

  it("rejects an empty selection, an oversized one, unknown actions and references that don't exist", async () => {
    const ghost = "64b0c0ffee0000000000ffff";
    expect((await api("post", "/api/products/bulk").send({ action: "set-active", ids: [], value: true })).status).toBe(400);
    expect((await api("post", "/api/products/bulk").send({ action: "set-active", ids: Array(201).fill(ghost), value: true })).status).toBe(400);
    expect((await api("post", "/api/products/bulk").send({ action: "nuke", ids: [ghost] })).status).toBe(400);
    expect((await api("post", "/api/products/bulk").send({ action: "add-to-collection", ids: [ghost], collectionId: ghost })).status).toBe(400);
    expect((await api("post", "/api/products/bulk").send({ action: "set-active", ids: [ghost], value: true })).body).toEqual({ matched: 0, modified: 0 });
  });
});

describe("variants", () => {
  it("creates, lists (in the product detail), updates and deletes a variant under its product", async () => {
    const p = await mkProduct({ sku: "BNG-1" });
    const v = await api("post", `/api/products/${p.id}/variants`).send({ sku: "bng-1-2.4", attributes: { size: "2.4" }, defaultGrossWeight: 20 });
    expect(v.status).toBe(201);
    expect(v.body.variant).toMatchObject({ sku: "BNG-1-2.4", productId: p.id, attributes: { size: "2.4" }, isActive: true });
    expect((await api("get", `/api/products/${p.id}`)).body.product.variants).toHaveLength(1);
    const upd = await api("patch", `/api/products/${p.id}/variants/${v.body.variant.id}`).send({ attributes: { size: "2.6" }, sku: "HACK" });
    expect(upd.body.variant).toMatchObject({ sku: "BNG-1-2.4", attributes: { size: "2.6" } });
    expect((await api("delete", `/api/products/${p.id}/variants/${v.body.variant.id}`)).status).toBe(204);
    expect((await api("get", `/api/products/${p.id}/variants`)).body.variants).toEqual([]);
  });

  it("is scoped to its product: another product's id cannot reach the variant", async () => {
    const [p, other] = [await mkProduct(), await mkProduct()];
    const v = (await api("post", `/api/products/${p.id}/variants`).send({ sku: "V-1" })).body.variant;
    expect((await api("patch", `/api/products/${other.id}/variants/${v.id}`).send({ isActive: false })).status).toBe(404);
    expect((await api("delete", `/api/products/${other.id}/variants/${v.id}`)).status).toBe(404);
  });

  it("rejects duplicate SKUs (including a product's SKU), an unknown product, and net > gross", async () => {
    const p = await mkProduct({ sku: "P-1" });
    await api("post", `/api/products/${p.id}/variants`).send({ sku: "V-1" });
    expect((await api("post", `/api/products/${p.id}/variants`).send({ sku: "v-1" })).status).toBe(409);
    expect((await api("post", `/api/products/${p.id}/variants`).send({ sku: "P-1" })).status).toBe(409);
    expect((await api("post", "/api/products/64b0c0ffee0000000000ffff/variants").send({ sku: "V-2" })).status).toBe(404);
    expect((await api("post", `/api/products/${p.id}/variants`).send({ sku: "V-3", defaultGrossWeight: 1, defaultNetWeight: 2 })).status).toBe(400);
  });

  it("cannot delete a variant that inventory pieces reference", async () => {
    const p = await mkProduct();
    const v = (await api("post", `/api/products/${p.id}/variants`).send({ sku: "V-9" })).body.variant;
    await InventoryItemModel.create({ itemCode: "IT-9", productId: p.id, variantId: v.id, type: "FINISHED_JEWELLERY", grossWeight: 1, stoneWeight: 0, netWeight: 1, fineWeight: 0.9, metalId, purity: "22K", fineness: 0.916, locationId: new Types.ObjectId(), cost: 1, quantity: 1 } as never);
    expect((await api("delete", `/api/products/${p.id}/variants/${v.id}`)).status).toBe(409);
  });
});

describe("deleting a product", () => {
  it("deletes a product that never became stock, along with its variants", async () => {
    const p = await mkProduct();
    await api("post", `/api/products/${p.id}/variants`).send({ sku: "GONE-1" });
    expect((await api("delete", `/api/products/${p.id}`)).status).toBe(204);
    expect((await api("get", `/api/products/${p.id}`)).status).toBe(404);
    expect((await api("post", "/api/products").send({ sku: "GONE-1", name: "reuse", metalId })).status).toBe(201); // its variant SKU is free again
  });

  it("refuses once an InventoryItem references it — the catalogue definition is history by then", async () => {
    const p = await mkProduct();
    await InventoryItemModel.create({ itemCode: "IT-2", productId: p.id, type: "FINISHED_JEWELLERY", grossWeight: 1, stoneWeight: 0, netWeight: 1, fineWeight: 0.9, metalId, purity: "22K", fineness: 0.916, locationId: new Types.ObjectId(), cost: 1, quantity: 1 } as never);
    const res = await api("delete", `/api/products/${p.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/deactivate/i);
    expect((await api("get", `/api/products/${p.id}`)).status).toBe(200);
  });

  it("creating or editing a Product never creates an InventoryItem or touches stock", async () => {
    const p = await mkProduct();
    await api("patch", `/api/products/${p.id}`).send({ name: "Renamed" });
    await api("post", "/api/products/bulk").send({ action: "set-active", ids: [p.id], value: false });
    expect(await InventoryItemModel.countDocuments()).toBe(0);
  });
});

describe("categories", () => {
  it("builds a tree with product counts, and moves a category to the top level with null", async () => {
    const gold = await mkCategory("Gold Jewellery");
    const rings = await mkCategory("Rings", gold.id);
    await mkProduct({ categoryId: rings.id });
    const tree = (await api("get", "/api/catalog/categories")).body.categories;
    expect(tree.find((c: { id: string }) => c.id === rings.id)).toMatchObject({ parentId: gold.id, productCount: 1, slug: "rings" });
    expect(tree.find((c: { id: string }) => c.id === gold.id).productCount).toBe(0);
    const moved = await api("patch", `/api/catalog/categories/${rings.id}`).send({ parentId: null, description: "Finger rings" });
    expect(moved.body.category.parentId).toBeUndefined();
    expect(moved.body.category.description).toBe("Finger rings");
  });

  it("refuses cycles: under itself, under its child, or under a missing parent", async () => {
    const a = await mkCategory("A");
    const b = await mkCategory("B", a.id);
    const c = await mkCategory("C", b.id);
    expect((await api("patch", `/api/catalog/categories/${a.id}`).send({ parentId: a.id })).status).toBe(400);
    expect((await api("patch", `/api/catalog/categories/${a.id}`).send({ parentId: c.id })).status).toBe(400);
    expect((await api("patch", `/api/catalog/categories/${a.id}`).send({ parentId: "64b0c0ffee0000000000ffff" })).status).toBe(400);
    expect((await api("post", "/api/catalog/categories").send({ name: "Orphan", parentId: "64b0c0ffee0000000000ffff" })).status).toBe(400);
  });

  it("de-duplicates derived slugs, conflicts on an explicit duplicate, and refuses to delete a category with children or products", async () => {
    const a = await mkCategory("Chains");
    const b = await mkCategory("Chains");
    expect([a.slug, b.slug]).toEqual(["chains", "chains-2"]);
    expect((await api("post", "/api/catalog/categories").send({ name: "Other", slug: "chains" })).status).toBe(409);
    const child = await mkCategory("Gold Chains", a.id);
    expect((await api("delete", `/api/catalog/categories/${a.id}`)).status).toBe(409);
    await mkProduct({ categoryId: child.id });
    expect((await api("delete", `/api/catalog/categories/${child.id}`)).status).toBe(409);
    expect((await api("delete", `/api/catalog/categories/${b.id}`)).status).toBe(204);
  });

  it("an inactive flag round-trips", async () => {
    const c = await mkCategory("Seasonal");
    const res = await api("patch", `/api/catalog/categories/${c.id}`).send({ isActive: false });
    expect(res.body.category.isActive).toBe(false);
  });
});

describe("collections", () => {
  it("creates, lists with counts, updates and deletes; deleting only detaches products from it", async () => {
    const col = await mkCollection("Festive 2026");
    const p = await mkProduct({ collectionIds: [col.id] });
    expect((await api("get", "/api/catalog/collections")).body.collections[0]).toMatchObject({ name: "Festive 2026", slug: "festive-2026", productCount: 1, isActive: true });
    expect((await api("patch", `/api/catalog/collections/${col.id}`).send({ description: "Diwali", isActive: false })).body.collection).toMatchObject({ description: "Diwali", isActive: false });
    const del = await api("delete", `/api/catalog/collections/${col.id}`);
    expect(del.body).toEqual({ detachedFrom: 1 });
    const after = (await api("get", `/api/products/${p.id}`)).body.product;
    expect(after.collectionIds).toEqual([]); // the product itself survives
    expect((await api("get", "/api/catalog/collections")).body.collections).toEqual([]);
  });

  it("conflicts on an explicit duplicate slug and 404s an unknown id", async () => {
    await mkCollection("Bridal");
    expect((await api("post", "/api/catalog/collections").send({ name: "Bridal 2", slug: "bridal" })).status).toBe(409);
    expect((await api("patch", "/api/catalog/collections/64b0c0ffee0000000000ffff").send({ name: "x" })).status).toBe(404);
  });
});

describe("media upload & serving", () => {
  it("stores a valid image under a server-generated key and serves it publicly with safe headers", async () => {
    const up = await upload();
    expect(up.status).toBe(201);
    expect(up.body.key).toMatch(/^products\/[0-9a-f-]{36}\.png$/);
    expect(up.body.url).toBe(`http://api.test/${"api/media/" + up.body.key}`);
    expect(t.mediaStorage.size()).toBe(1);

    const got = await request(t.app).get(`/api/media/${up.body.key}`); // no auth: <img> can't send one
    expect(got.status).toBe(200);
    expect(got.headers["content-type"]).toBe("image/png");
    expect(got.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    expect(got.headers["x-content-type-options"]).toBe("nosniff");
    expect(got.headers["cache-control"]).toMatch(/immutable/);
    expect(Buffer.from(got.body).equals(PNG)).toBe(true);
  });

  it("decides the type from the bytes: HTML/SVG renamed to .png with an image content-type is refused", async () => {
    expect((await upload(manager, Buffer.from("<html><script>alert(1)</script></html>"), "x.png", "image/png")).status).toBe(400);
    expect((await upload(manager, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "x.svg", "image/svg+xml")).status).toBe(400);
    expect(t.mediaStorage.size()).toBe(0);
  });

  it("stores a real PNG under .png even if the client claims a different filename or type", async () => {
    const res = await upload(manager, PNG, "../../evil.php", "text/html");
    expect(res.status).toBe(201);
    expect(res.body.key).toMatch(/\.png$/);
    expect(res.body.contentType).toBe("image/png");
  });

  it("rejects an oversized file with 413 and a request with no file with 400", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 1)]);
    expect((await upload(manager, big)).status).toBe(413);
    expect((await api("post", "/api/media/images")).status).toBe(400);
    expect(t.mediaStorage.size()).toBe(0);
  });

  it("requires catalog.manage to upload — a read-only role gets 403 and nothing is stored", async () => {
    const viewer = await tokenFor(R.VIEWER);
    expect((await upload(viewer)).status).toBe(403);
    expect(t.mediaStorage.size()).toBe(0);
  });

  it("404s unknown keys and refuses traversal or foreign extensions", async () => {
    for (const path of ["products/00000000-0000-4000-8000-000000000000.png", "..%2F..%2Fetc%2Fpasswd", "products/a.svg", "products/%2e%2e/x.png"]) {
      expect((await request(t.app).get(`/api/media/${path}`)).status, path).toBe(404);
    }
  });
});

describe("audit trail", () => {
  it("records who changed what for product, bulk, category, collection and media mutations — with no secrets", async () => {
    const p = await mkProduct({ sku: "AUD-1" });
    await api("patch", `/api/products/${p.id}`).send({ name: "Audited", description: "d" });
    await api("post", "/api/products/bulk").send({ action: "set-active", ids: [p.id], value: false });
    await mkCategory("Audit Cat");
    await mkCollection("Audit Col");
    await upload();
    await api("delete", `/api/products/${p.id}`);

    const actions = (await AuditLogModel.find().lean()).map((e) => e.action);
    for (const a of ["catalog.product_created", "catalog.product_updated", "catalog.product_bulk_updated", "catalog.category_created", "catalog.collection_created", "catalog.media_uploaded", "catalog.product_deleted"]) {
      expect(actions, a).toContain(a);
    }
    const updated = await AuditLogModel.findOne({ action: "catalog.product_updated" }).lean();
    expect(updated).toMatchObject({ outcome: "SUCCESS", targetType: "product", targetId: p.id, metadata: { fields: ["name", "description"] } });
    expect(updated!.actorEmail).toBeTruthy();
    const bulk = await AuditLogModel.findOne({ action: "catalog.product_bulk_updated" }).lean();
    expect(bulk!.metadata).toMatchObject({ action: "set-active", requested: 1, matched: 1, modified: 1 });
  });

  it("a denied write is audited as a denial and changes nothing", async () => {
    const viewer = await tokenFor(R.VIEWER);
    const res = await api("post", "/api/products", viewer).send({ sku: "NOPE", name: "x", metalId });
    expect(res.status).toBe(403);
    expect(await AuditLogModel.countDocuments({ action: "authz.denied" })).toBeGreaterThan(0);
    expect((await api("get", "/api/products")).body.total).toBe(0);
  });
});
