import type { CategoryNode, CollectionView, ProductCategory, ProductCollection } from "@jewellery/types";
import {
  type CreateProductCategoryInput,
  type CreateProductCollectionInput,
  type UpdateProductCategoryInput,
  type UpdateProductCollectionInput,
} from "@jewellery/validation";
import { ConflictError, DomainValidationError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import type { RequestMeta } from "../auth/auth.service";
import type { AuthContext } from "../auth/authorization.service";
import { auditCatalog } from "./catalog-audit";
import { ProductCategoryModel } from "./product-category.model";
import {
  createProductCategory,
  requireProductCategoryById,
  updateProductCategory,
} from "./product-category.repository";
import { ProductCollectionModel } from "./product-collection.model";
import {
  createProductCollection,
  requireProductCollectionById,
  updateProductCollection,
} from "./product-collection.repository";
import { ProductModel } from "./product.model";

async function productCountsBy(field: "categoryId" | "collectionIds"): Promise<Map<string, number>> {
  const rows = await ProductModel.aggregate<{ _id: unknown; n: number }>(
    field === "collectionIds"
      ? [{ $unwind: "$collectionIds" }, { $group: { _id: "$collectionIds", n: { $sum: 1 } } }]
      : [{ $match: { categoryId: { $exists: true } } }, { $group: { _id: "$categoryId", n: { $sum: 1 } } }]
  );
  return new Map(rows.map((r) => [String(r._id), r.n]));
}

/**
 * Walks up from `parentId`; a category can't be moved beneath itself or one of its own
 * descendants (that would detach the subtree into an unreachable cycle).
 */
async function assertNoCycle(categoryId: string, newParentId: string) {
  let cursor: string | undefined = newParentId;
  for (let depth = 0; cursor && depth < 50; depth++) {
    if (cursor === categoryId) throw new DomainValidationError("A category cannot be moved under itself or its own descendants");
    const parent: { parentId?: unknown } | null = await ProductCategoryModel.findById(cursor).select("parentId").lean();
    if (!parent) throw new DomainValidationError("Parent category does not exist");
    cursor = parent.parentId ? String(parent.parentId) : undefined;
  }
}

export function createTaxonomyService() {
  return {
    // ---- categories -------------------------------------------------------
    async listCategories(): Promise<CategoryNode[]> {
      const [categories, counts] = await Promise.all([ProductCategoryModel.find().sort({ name: 1 }).lean(), productCountsBy("categoryId")]);
      return categories.map((c) => ({
        id: String(c._id),
        name: c.name,
        slug: c.slug,
        description: c.description ?? undefined,
        parentId: c.parentId ? String(c.parentId) : undefined,
        isActive: c.isActive,
        productCount: counts.get(String(c._id)) ?? 0,
      }));
    },

    async createCategory(actor: AuthContext, input: CreateProductCategoryInput, meta: RequestMeta): Promise<ProductCategory> {
      if (input.parentId) await requireProductCategoryById(input.parentId).catch(() => {
        throw new DomainValidationError("Parent category does not exist");
      });
      const category = await createProductCategory(input);
      await auditCatalog(actor, meta, AUDIT_ACTIONS.CATEGORY_CREATED, "product_category", category.id, { name: category.name, parentId: category.parentId });
      return category;
    },

    async updateCategory(actor: AuthContext, id: string, input: UpdateProductCategoryInput, meta: RequestMeta): Promise<ProductCategory> {
      await requireProductCategoryById(id);
      if (input.parentId) await assertNoCycle(id, input.parentId);
      const category = await updateProductCategory(id, input);
      await auditCatalog(actor, meta, AUDIT_ACTIONS.CATEGORY_UPDATED, "product_category", id, { fields: Object.keys(input) });
      return category;
    },

    /** Refuses while the category still has children or products — orphaning either would silently reshuffle the catalogue. */
    async deleteCategory(actor: AuthContext, id: string, meta: RequestMeta): Promise<void> {
      const category = await requireProductCategoryById(id);
      const [children, products] = await Promise.all([ProductCategoryModel.countDocuments({ parentId: id }), ProductModel.countDocuments({ categoryId: id })]);
      if (children) throw new ConflictError(`Category has ${children} sub-categor${children === 1 ? "y" : "ies"} — move or delete them first`);
      if (products) throw new ConflictError(`Category has ${products} product${products === 1 ? "" : "s"} — reassign them or deactivate the category instead`);
      await ProductCategoryModel.deleteOne({ _id: id });
      await auditCatalog(actor, meta, AUDIT_ACTIONS.CATEGORY_DELETED, "product_category", id, { name: category.name });
    },

    // ---- collections ------------------------------------------------------
    async listCollections(): Promise<CollectionView[]> {
      const [collections, counts] = await Promise.all([ProductCollectionModel.find().sort({ name: 1 }).lean(), productCountsBy("collectionIds")]);
      return collections.map((c) => ({
        id: String(c._id),
        name: c.name,
        slug: c.slug,
        description: c.description ?? undefined,
        isActive: c.isActive,
        productCount: counts.get(String(c._id)) ?? 0,
      }));
    },

    async createCollection(actor: AuthContext, input: CreateProductCollectionInput, meta: RequestMeta): Promise<ProductCollection> {
      const collection = await createProductCollection(input);
      await auditCatalog(actor, meta, AUDIT_ACTIONS.COLLECTION_CREATED, "product_collection", collection.id, { name: collection.name });
      return collection;
    },

    async updateCollection(actor: AuthContext, id: string, input: UpdateProductCollectionInput, meta: RequestMeta): Promise<ProductCollection> {
      await requireProductCollectionById(id);
      const collection = await updateProductCollection(id, input);
      await auditCatalog(actor, meta, AUDIT_ACTIONS.COLLECTION_UPDATED, "product_collection", id, { fields: Object.keys(input) });
      return collection;
    },

    /** Membership is only a grouping, so deleting a collection just detaches it from its products — no product is lost. */
    async deleteCollection(actor: AuthContext, id: string, meta: RequestMeta): Promise<{ detachedFrom: number }> {
      const collection = await requireProductCollectionById(id);
      const detached = await ProductModel.updateMany({ collectionIds: id }, { $pull: { collectionIds: id } });
      await ProductCollectionModel.deleteOne({ _id: id });
      await auditCatalog(actor, meta, AUDIT_ACTIONS.COLLECTION_DELETED, "product_collection", id, { name: collection.name, detachedFrom: detached.modifiedCount });
      return { detachedFrom: detached.modifiedCount };
    },
  };
}
export type TaxonomyService = ReturnType<typeof createTaxonomyService>;
