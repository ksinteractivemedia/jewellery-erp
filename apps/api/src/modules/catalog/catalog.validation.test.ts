import { describe, expect, it } from "vitest";
import {
  bulkProductActionSchema,
  createProductSchema,
  createVariantBodySchema,
  productListQuerySchema,
  slugify,
  updateProductSchema,
} from "@jewellery/validation";

const id = "64b0c0ffee0000000000aaaa";
const base = { sku: "ring-001", name: "Temple Ring", metalId: id };

describe("slugify", () => {
  it.each([
    ["Temple Necklace", "temple-necklace"],
    ["  Gold  &  Diamond Ring! ", "gold-and-diamond-ring"],
    ["Kundan Set — 22K", "kundan-set-22k"],
    ["Café Ünïcode", "cafe-unicode"],
    ["---", ""],
  ])("%s → %s", (input, expected) => expect(slugify(input)).toBe(expected));

  it("never ends or starts with a hyphen, even when truncated", () => {
    const slug = slugify("word ".repeat(60));
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(slug).not.toMatch(/^-|-$/);
  });
});

describe("createProductSchema", () => {
  it("uppercases the SKU and applies safe defaults (channels off, active, empty lists)", () => {
    const p = createProductSchema.parse(base);
    expect(p).toMatchObject({ sku: "RING-001", b2cEnabled: false, b2bEnabled: false, isActive: true, images: [], videos: [], tags: [], collectionIds: [] });
    expect(p.slug).toBeUndefined();
  });

  it("normalises and de-duplicates tags", () => {
    expect(createProductSchema.parse({ ...base, tags: [" Bridal ", "bridal", "GOLD"] }).tags).toEqual(["bridal", "gold"]);
  });

  it("rejects more than 20 tags, 12 images and 5 videos", () => {
    expect(createProductSchema.safeParse({ ...base, tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, images: Array.from({ length: 13 }, (_, i) => ({ key: `products/a${i}.png` })) }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, videos: Array.from({ length: 6 }, (_, i) => `https://v.example/${i}`) }).success).toBe(false);
  });

  it("only accepts https video links", () => {
    expect(createProductSchema.safeParse({ ...base, videos: ["https://youtu.be/abc"] }).success).toBe(true);
    for (const bad of ["http://youtu.be/abc", "javascript:alert(1)", "ftp://x.test/a", "not a url"]) {
      expect(createProductSchema.safeParse({ ...base, videos: [bad] }).success, bad).toBe(false);
    }
  });

  it("only accepts server-shaped image keys — no URLs, traversal or foreign extensions", () => {
    expect(createProductSchema.safeParse({ ...base, images: [{ key: "products/3f2b1c9e-0000-4000-8000-000000000000.png" }] }).success).toBe(true);
    for (const bad of ["https://evil.test/a.png", "../secret.png", "products/../a.png", "products/a.svg", "/etc/passwd", "products/a.png?x=1"]) {
      expect(createProductSchema.safeParse({ ...base, images: [{ key: bad }] }).success, bad).toBe(false);
    }
  });

  it("rejects a net weight above the gross weight and negative weights", () => {
    expect(createProductSchema.safeParse({ ...base, defaultGrossWeight: 5, defaultNetWeight: 6 }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, defaultGrossWeight: 5, defaultNetWeight: 5 }).success).toBe(true);
    expect(createProductSchema.safeParse({ ...base, defaultGrossWeight: -1 }).success).toBe(false);
  });

  it("rejects malformed slugs and ids", () => {
    expect(createProductSchema.safeParse({ ...base, slug: "Not A Slug" }).success).toBe(false);
    expect(createProductSchema.safeParse({ ...base, metalId: "nope" }).success).toBe(false);
  });
});

describe("updateProductSchema", () => {
  it("cannot change the SKU — it is stripped, not applied", () => {
    expect(updateProductSchema.parse({ sku: "NEW", name: "x" })).not.toHaveProperty("sku");
  });

  it("accepts null to clear optional fields, and no defaults leak into a partial update", () => {
    const parsed = updateProductSchema.parse({ categoryId: null, purity: null });
    expect(parsed).toEqual({ categoryId: null, purity: null });
  });

  it("still enforces net <= gross when both are supplied", () => {
    expect(updateProductSchema.safeParse({ defaultGrossWeight: 1, defaultNetWeight: 2 }).success).toBe(false);
  });
});

describe("productListQuerySchema", () => {
  it("coerces query-string values and applies defaults", () => {
    expect(productListQuerySchema.parse({ isActive: "false", b2cEnabled: "true", page: "3", pageSize: "50" })).toMatchObject({
      isActive: false,
      b2cEnabled: true,
      page: 3,
      pageSize: 50,
      sort: "updatedAt",
      order: "desc",
    });
  });

  it("caps page size and rejects unknown sort fields and non-boolean flags", () => {
    expect(productListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ sort: "passwordHash" }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ isActive: "maybe" }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });
});

describe("bulkProductActionSchema", () => {
  it("requires ids and the action's own parameter", () => {
    expect(bulkProductActionSchema.safeParse({ action: "set-active", ids: [id], value: true }).success).toBe(true);
    expect(bulkProductActionSchema.safeParse({ action: "set-active", ids: [], value: true }).success).toBe(false);
    expect(bulkProductActionSchema.safeParse({ action: "set-active", ids: [id] }).success).toBe(false);
    expect(bulkProductActionSchema.safeParse({ action: "add-to-collection", ids: [id] }).success).toBe(false);
    expect(bulkProductActionSchema.safeParse({ action: "set-category", ids: [id], categoryId: null }).success).toBe(true);
    expect(bulkProductActionSchema.safeParse({ action: "delete-everything", ids: [id] }).success).toBe(false);
  });

  it("caps a single bulk request at 200 ids", () => {
    expect(bulkProductActionSchema.safeParse({ action: "set-active", ids: Array(201).fill(id), value: true }).success).toBe(false);
  });
});

describe("createVariantBodySchema", () => {
  it("takes the product from the path, not the body", () => {
    const parsed = createVariantBodySchema.parse({ sku: "ring-001-14", attributes: { size: "14" }, productId: id });
    expect(parsed).not.toHaveProperty("productId");
    expect(parsed.sku).toBe("RING-001-14");
  });
});
