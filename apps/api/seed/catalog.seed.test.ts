import { describe, expect, it } from "vitest";
import { createProductService } from "../src/modules/catalog/product.service";
import { ProductModel } from "../src/modules/catalog/product.model";
import { ProductCategoryModel } from "../src/modules/catalog/product-category.model";
import { ProductCollectionModel } from "../src/modules/catalog/product-collection.model";
import { detectImage } from "../src/modules/media/image-validation";
import { createMediaService } from "../src/modules/media/media.service";
import { createMemoryStorage } from "../src/modules/media/storage";
import { MetalModel } from "../src/modules/metals/metal.model";
import { placeholderPng, TINTS } from "./png";
import { seedCatalog } from "./catalog.seed";

describe("dev catalogue seed", () => {
  it("generates real PNG bytes the upload validator accepts", () => {
    for (const tint of Object.values(TINTS)) expect(detectImage(placeholderPng(tint, 1))?.ext).toBe("png");
  });

  it("only produces data the API itself would accept: valid purities, existing references, uploaded images", async () => {
    const storage = createMemoryStorage();
    const media = createMediaService(storage, "http://api.test");
    const result = await seedCatalog(media);
    expect(result.products).toBeGreaterThanOrEqual(30);
    expect(storage.size()).toBe(result.images);

    const metals = new Map((await MetalModel.find().lean()).map((m) => [String(m._id), m.purityOptions.map((o) => o.code)]));
    const categoryIds = new Set((await ProductCategoryModel.find().lean()).map((c) => String(c._id)));
    const collectionIds = new Set((await ProductCollectionModel.find().lean()).map((c) => String(c._id)));
    const products = await ProductModel.find().lean();
    for (const p of products) {
      expect(metals.get(String(p.metalId)), p.sku).toContain(p.purity);
      expect(categoryIds.has(String(p.categoryId)), p.sku).toBe(true);
      for (const c of p.collectionIds) expect(collectionIds.has(String(c)), p.sku).toBe(true);
      for (const img of p.images) expect(await media.exists(img.key), p.sku).toBe(true);
      expect(p.defaultNetWeight ?? 0, p.sku).toBeLessThanOrEqual(p.defaultGrossWeight ?? Infinity);
    }
    // A mix, so the ERP's filters and badges have something to show.
    expect(products.some((p) => !p.isActive)).toBe(true);
    expect(products.some((p) => p.b2cEnabled && !p.b2bEnabled)).toBe(true);
    expect(products.some((p) => p.images.length === 0)).toBe(true);

    const list = await createProductService({ media }).list({ sort: "name", order: "asc", page: 1, pageSize: 100 } as never);
    expect(list.total).toBe(products.length);
  });
});
