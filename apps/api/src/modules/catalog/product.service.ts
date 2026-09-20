import type { BulkResult, CatalogMeta, ProductDetail, ProductListItem, ProductListResult, ProductVariant } from "@jewellery/types";
import {
  bulkProductActionSchema,
  createProductSchema,
  updateProductSchema,
  type BulkProductActionInput,
  type CreateProductInput,
  type ProductListQuery,
  type UpdateProductInput,
} from "@jewellery/validation";
import type { FilterQuery, Types } from "mongoose";
import { ConflictError, DomainValidationError } from "../../shared/errors";
import { toDTOList } from "../../shared/to-dto";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import type { RequestMeta } from "../auth/auth.service";
import type { AuthContext } from "../auth/authorization.service";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import type { MediaService } from "../media/media.service";
import { MetalModel } from "../metals/metal.model";
import { auditCatalog } from "./catalog-audit";
import { ProductCategoryModel } from "./product-category.model";
import { ProductCollectionModel } from "./product-collection.model";
import { ProductVariantModel } from "./product-variant.model";
import { ProductModel, type ProductAttrs } from "./product.model";
import { createProduct, requireProductById, updateProduct } from "./product.repository";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const idStr = (v: unknown) => String(v);

type Lean = ProductAttrs & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

export function createProductService(deps: { media: MediaService }) {
  const { media } = deps;

  /** Every reference a product carries must point at something real — Mongo won't check that for us. */
  async function assertReferences(p: {
    metalId?: string;
    purity?: string | null;
    categoryId?: string | null;
    collectionIds?: string[];
    images?: { key: string }[];
  }) {
    if (p.metalId) {
      const metal = await MetalModel.findById(p.metalId).lean();
      if (!metal) throw new DomainValidationError("Metal does not exist");
      const codes = metal.purityOptions.filter((o) => o.isActive).map((o) => o.code);
      if (p.purity && codes.length && !codes.includes(p.purity)) {
        throw new DomainValidationError(`Purity "${p.purity}" is not valid for ${metal.name} (${codes.join(", ")})`);
      }
    }
    if (p.categoryId && !(await ProductCategoryModel.exists({ _id: p.categoryId }))) {
      throw new DomainValidationError("Category does not exist");
    }
    if (p.collectionIds?.length) {
      const unique = [...new Set(p.collectionIds)];
      if ((await ProductCollectionModel.countDocuments({ _id: { $in: unique } })) !== unique.length) {
        throw new DomainValidationError("One or more collections do not exist");
      }
    }
    for (const image of p.images ?? []) {
      if (!(await media.exists(image.key))) throw new DomainValidationError(`Image ${image.key} was not uploaded`);
    }
  }

  /** SKUs are one namespace across products and variants: a scan/lookup by SKU must be unambiguous. */
  async function assertSkuFree(sku: string) {
    const [product, variant] = await Promise.all([ProductModel.exists({ sku }), ProductVariantModel.exists({ sku })]);
    if (product || variant) throw new ConflictError(`SKU "${sku}" is already in use`);
  }

  function buildFilter(q: ProductListQuery): FilterQuery<ProductAttrs> {
    const and: FilterQuery<ProductAttrs>[] = [];
    if (q.categoryId) and.push({ categoryId: q.categoryId });
    if (q.collectionId) and.push({ collectionIds: q.collectionId });
    if (q.metalId) and.push({ metalId: q.metalId });
    if (q.purity) and.push({ purity: q.purity });
    if (q.tag) and.push({ tags: q.tag });
    if (q.isActive !== undefined) and.push({ isActive: q.isActive });
    if (q.b2cEnabled !== undefined) and.push({ b2cEnabled: q.b2cEnabled });
    if (q.b2bEnabled !== undefined) and.push({ b2bEnabled: q.b2bEnabled });
    return and.length ? { $and: and } : {};
  }

  /** Multi-word search: every word must match SKU, name, slug or a tag — or belong to a variant SKU. */
  async function searchClauses(text: string): Promise<FilterQuery<ProductAttrs>[]> {
    const words = text.split(/\s+/).filter(Boolean).slice(0, 6);
    return Promise.all(
      words.map(async (word) => {
        const re = new RegExp(escapeRegex(word), "i");
        const variantProducts = await ProductVariantModel.distinct("productId", { sku: re });
        return { $or: [{ sku: re }, { name: re }, { slug: re }, { tags: re }, ...(variantProducts.length ? [{ _id: { $in: variantProducts } }] : [])] };
      })
    );
  }

  const summariesById = <T extends { _id: unknown }>(rows: T[]) => new Map(rows.map((r) => [idStr(r._id), r]));

  return {
    async list(query: ProductListQuery): Promise<ProductListResult> {
      const filter = buildFilter(query);
      if (query.q) {
        const clauses = await searchClauses(query.q);
        if (clauses.length) filter.$and = [...(filter.$and ?? []), ...clauses];
      }
      const dir = query.order === "asc" ? 1 : -1;
      const sort: Record<string, 1 | -1> = { [query.sort]: dir, _id: dir };
      // Case-insensitive ordering for text sorts (SKU/name mix cases in practice).
      const collation = query.sort === "name" || query.sort === "sku" ? { locale: "en", strength: 2 } : undefined;

      const [total, rows] = await Promise.all([
        ProductModel.countDocuments(filter),
        ProductModel.find(filter)
          .sort(sort)
          .collation(collation ?? { locale: "simple" })
          .skip((query.page - 1) * query.pageSize)
          .limit(query.pageSize)
          .lean<Lean[]>(),
      ]);

      const ids = rows.map((r) => r._id);
      const [metals, categories, collections, variantCounts] = await Promise.all([
        MetalModel.find({ _id: { $in: rows.map((r) => r.metalId) } }).select("code name").lean(),
        ProductCategoryModel.find({ _id: { $in: rows.map((r) => r.categoryId).filter(Boolean) } }).select("name").lean(),
        ProductCollectionModel.find({ _id: { $in: rows.flatMap((r) => r.collectionIds) } }).select("name").lean(),
        ProductVariantModel.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { productId: { $in: ids } } }, { $group: { _id: "$productId", n: { $sum: 1 } } }]),
      ]);
      const metalMap = summariesById(metals);
      const categoryMap = summariesById(categories);
      const collectionMap = summariesById(collections);
      const variantMap = new Map(variantCounts.map((v) => [idStr(v._id), v.n]));

      const items: ProductListItem[] = rows.map((r) => {
        const metal = metalMap.get(idStr(r.metalId));
        const category = r.categoryId ? categoryMap.get(idStr(r.categoryId)) : undefined;
        return {
          id: idStr(r._id),
          sku: r.sku,
          name: r.name,
          slug: r.slug,
          isActive: r.isActive,
          b2cEnabled: r.b2cEnabled,
          b2bEnabled: r.b2bEnabled,
          metal: metal ? { id: idStr(metal._id), code: metal.code, name: metal.name } : undefined,
          purity: r.purity ?? undefined,
          category: category ? { id: idStr(category._id), name: category.name } : undefined,
          collections: r.collectionIds.flatMap((cid) => {
            const c = collectionMap.get(idStr(cid));
            return c ? [{ id: idStr(c._id), name: c.name }] : [];
          }),
          tags: r.tags,
          primaryImageUrl: r.images[0] ? media.urlFor(r.images[0].key) : undefined,
          imageCount: r.images.length,
          variantCount: variantMap.get(idStr(r._id)) ?? 0,
          updatedAt: r.updatedAt,
        };
      });
      return { items, total, page: query.page, pageSize: query.pageSize };
    },

    /** `includeStock` is decided by the route from the caller's `inventory.view` — a catalogue reader never sees stock. */
    async detail(id: string, opts: { includeStock: boolean }): Promise<ProductDetail> {
      const product = await requireProductById(id);
      const [metal, category, collections, variants] = await Promise.all([
        MetalModel.findById(product.metalId).select("code name").lean(),
        product.categoryId ? ProductCategoryModel.findById(product.categoryId).select("name").lean() : null,
        ProductCollectionModel.find({ _id: { $in: product.collectionIds } }).select("name").lean(),
        ProductVariantModel.find({ productId: id }).sort({ sku: 1 }),
      ]);
      const detail: ProductDetail = {
        ...product,
        images: product.images.map((i) => ({ ...i, url: media.urlFor(i.key) })),
        metal: metal ? { id: idStr(metal._id), code: metal.code, name: metal.name } : undefined,
        category: category ? { id: idStr(category._id), name: category.name } : undefined,
        collections: collections.map((c) => ({ id: idStr(c._id), name: c.name })),
        variants: toDTOList<ProductVariant>(variants),
      };
      if (opts.includeStock) {
        const [pieces, available] = await Promise.all([
          InventoryItemModel.countDocuments({ productId: id }),
          InventoryItemModel.countDocuments({ productId: id, status: "AVAILABLE" }),
        ]);
        detail.stock = { pieces, available };
      }
      return detail;
    },

    async create(actor: AuthContext, input: CreateProductInput, meta: RequestMeta): Promise<ProductDetail> {
      const parsed = createProductSchema.parse(input);
      await assertSkuFree(parsed.sku);
      await assertReferences(parsed);
      const product = await createProduct(parsed, actor.userId);
      await auditCatalog(actor, meta, AUDIT_ACTIONS.PRODUCT_CREATED, "product", product.id, { sku: product.sku, name: product.name });
      return this.detail(product.id, { includeStock: false });
    },

    async update(actor: AuthContext, id: string, input: UpdateProductInput, meta: RequestMeta): Promise<ProductDetail> {
      const patch = updateProductSchema.parse(input);
      const current = await requireProductById(id);

      // Effective values after the patch: metal + purity must still agree, net must not exceed gross.
      const metalId = patch.metalId ?? current.metalId;
      const purity = patch.purity === undefined ? current.purity : (patch.purity ?? undefined);
      await assertReferences({
        metalId: patch.metalId !== undefined || patch.purity !== undefined ? metalId : undefined,
        purity,
        categoryId: patch.categoryId,
        collectionIds: patch.collectionIds,
        images: patch.images?.filter((i) => !current.images.some((c) => c.key === i.key)),
      });
      const gross = patch.defaultGrossWeight === undefined ? current.defaultGrossWeight : (patch.defaultGrossWeight ?? undefined);
      const net = patch.defaultNetWeight === undefined ? current.defaultNetWeight : (patch.defaultNetWeight ?? undefined);
      if (gross !== undefined && net !== undefined && net > gross) throw new DomainValidationError("net weight cannot exceed gross weight");

      await updateProduct(id, patch, actor.userId);
      await auditCatalog(actor, meta, AUDIT_ACTIONS.PRODUCT_UPDATED, "product", id, { fields: Object.keys(patch) });
      return this.detail(id, { includeStock: false });
    },

    async bulk(actor: AuthContext, input: BulkProductActionInput, meta: RequestMeta): Promise<BulkResult> {
      const cmd = bulkProductActionSchema.parse(input);
      const ids = [...new Set(cmd.ids)];
      const inSelection = { _id: { $in: ids } };
      // `change` narrows the selection to rows the action would actually alter, so "modified"
      // means what a user expects and an already-satisfied row isn't re-stamped with updatedBy.
      let change: Record<string, unknown>;
      let update: Record<string, unknown>;
      switch (cmd.action) {
        case "set-active":
          change = { isActive: { $ne: cmd.value } };
          update = { $set: { isActive: cmd.value } };
          break;
        case "set-b2c":
          change = { b2cEnabled: { $ne: cmd.value } };
          update = { $set: { b2cEnabled: cmd.value } };
          break;
        case "set-b2b":
          change = { b2bEnabled: { $ne: cmd.value } };
          update = { $set: { b2bEnabled: cmd.value } };
          break;
        case "add-to-collection":
          await assertReferences({ collectionIds: [cmd.collectionId] });
          change = { collectionIds: { $ne: cmd.collectionId } };
          update = { $addToSet: { collectionIds: cmd.collectionId } };
          break;
        case "remove-from-collection":
          change = { collectionIds: cmd.collectionId };
          update = { $pull: { collectionIds: cmd.collectionId } };
          break;
        case "set-category":
          await assertReferences({ categoryId: cmd.categoryId });
          change = { categoryId: cmd.categoryId ? { $ne: cmd.categoryId } : { $exists: true } };
          update = cmd.categoryId ? { $set: { categoryId: cmd.categoryId } } : { $unset: { categoryId: 1 } };
          break;
      }
      update.$set = { ...(update.$set as object | undefined), updatedBy: actor.userId };
      const [matched, result] = await Promise.all([
        ProductModel.countDocuments(inSelection),
        ProductModel.updateMany({ ...inSelection, ...change }, update),
      ]);
      const { action: _a, ids: _i, ...params } = cmd;
      await auditCatalog(actor, meta, AUDIT_ACTIONS.PRODUCT_BULK_UPDATED, "product", undefined, {
        action: cmd.action,
        ...params,
        requested: ids.length,
        matched,
        modified: result.modifiedCount,
        ids,
      });
      return { matched, modified: result.modifiedCount };
    },

    /**
     * Hard delete is only for a product that never became stock. Once any InventoryItem points
     * at it, the definition is history (invoices, ledger) — deactivate instead.
     */
    async remove(actor: AuthContext, id: string, meta: RequestMeta): Promise<void> {
      const product = await requireProductById(id);
      const pieces = await InventoryItemModel.countDocuments({ productId: id });
      if (pieces) throw new ConflictError(`${pieces} inventory piece${pieces === 1 ? " references" : "s reference"} this product — deactivate it instead of deleting`);
      const variants = await ProductVariantModel.deleteMany({ productId: id });
      await ProductModel.deleteOne({ _id: id });
      await auditCatalog(actor, meta, AUDIT_ACTIONS.PRODUCT_DELETED, "product", id, { sku: product.sku, name: product.name, variantsDeleted: variants.deletedCount });
    },

    async meta(): Promise<CatalogMeta> {
      const [metals, usedPurities, tags] = await Promise.all([
        MetalModel.find({ isActive: true }).sort({ name: 1 }).lean(),
        ProductModel.distinct("purity"),
        ProductModel.distinct("tags"),
      ]);
      return {
        metals: metals.map((m) => ({
          id: idStr(m._id),
          code: m.code,
          name: m.name,
          purities: m.purityOptions.filter((o) => o.isActive).map((o) => o.code),
        })),
        usedPurities: (usedPurities as (string | null)[]).filter((p): p is string => Boolean(p)).sort(),
        tags: (tags as string[]).sort(),
      };
    },

  };
}
export type ProductService = ReturnType<typeof createProductService>;
