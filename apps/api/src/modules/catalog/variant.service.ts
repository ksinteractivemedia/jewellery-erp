import type { ProductVariant } from "@jewellery/types";
import {
  createVariantBodySchema,
  updateProductVariantSchema,
  type CreateVariantBodyInput,
  type UpdateProductVariantInput,
} from "@jewellery/validation";
import { ConflictError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import type { RequestMeta } from "../auth/auth.service";
import type { AuthContext } from "../auth/authorization.service";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import { auditCatalog } from "./catalog-audit";
import { ProductVariantModel } from "./product-variant.model";
import { createProductVariant, listProductVariants, requireProductVariantById, updateProductVariant } from "./product-variant.repository";
import { ProductModel } from "./product.model";

/** A variant belongs to exactly one product; every operation is scoped by the product id in the URL. */
async function requireVariantOf(productId: string, variantId: string): Promise<ProductVariant> {
  const variant = await requireProductVariantById(variantId);
  if (variant.productId !== productId) throw new NotFoundError("ProductVariant", variantId);
  return variant;
}

export function createVariantService() {
  return {
    async list(productId: string): Promise<ProductVariant[]> {
      if (!(await ProductModel.exists({ _id: productId }))) throw new NotFoundError("Product", productId);
      return listProductVariants({ productId });
    },

    async create(actor: AuthContext, productId: string, input: CreateVariantBodyInput, meta: RequestMeta): Promise<ProductVariant> {
      const body = createVariantBodySchema.parse(input);
      const product = await ProductModel.findById(productId).select("defaultGrossWeight").lean();
      if (!product) throw new NotFoundError("Product", productId);
      if (body.defaultGrossWeight !== undefined && body.defaultNetWeight !== undefined && body.defaultNetWeight > body.defaultGrossWeight) {
        throw new DomainValidationError("net weight cannot exceed gross weight");
      }
      // Same SKU namespace as products.
      const [asProduct, asVariant] = await Promise.all([ProductModel.exists({ sku: body.sku }), ProductVariantModel.exists({ sku: body.sku })]);
      if (asProduct || asVariant) throw new ConflictError(`SKU "${body.sku}" is already in use`);
      const variant = await createProductVariant({ ...body, productId });
      await auditCatalog(actor, meta, AUDIT_ACTIONS.VARIANT_CREATED, "product_variant", variant.id, { productId, sku: variant.sku });
      return variant;
    },

    async update(actor: AuthContext, productId: string, variantId: string, input: UpdateProductVariantInput, meta: RequestMeta): Promise<ProductVariant> {
      const patch = updateProductVariantSchema.parse(input);
      const current = await requireVariantOf(productId, variantId);
      const gross = patch.defaultGrossWeight ?? current.defaultGrossWeight;
      const net = patch.defaultNetWeight ?? current.defaultNetWeight;
      if (gross !== undefined && net !== undefined && net > gross) throw new DomainValidationError("net weight cannot exceed gross weight");
      const variant = await updateProductVariant(variantId, patch);
      await auditCatalog(actor, meta, AUDIT_ACTIONS.VARIANT_UPDATED, "product_variant", variantId, { productId, fields: Object.keys(patch) });
      return variant;
    },

    async remove(actor: AuthContext, productId: string, variantId: string, meta: RequestMeta): Promise<void> {
      const variant = await requireVariantOf(productId, variantId);
      const pieces = await InventoryItemModel.countDocuments({ variantId });
      if (pieces) throw new ConflictError(`${pieces} inventory piece${pieces === 1 ? " references" : "s reference"} this variant — deactivate it instead of deleting`);
      await ProductVariantModel.deleteOne({ _id: variantId });
      await auditCatalog(actor, meta, AUDIT_ACTIONS.VARIANT_DELETED, "product_variant", variantId, { productId, sku: variant.sku });
    },
  };
}
export type VariantService = ReturnType<typeof createVariantService>;
