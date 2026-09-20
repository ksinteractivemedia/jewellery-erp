import type { ProductVariant } from "@jewellery/types";
import {
  createProductVariantSchema,
  updateProductVariantSchema,
  type CreateProductVariantInput,
  type UpdateProductVariantInput,
} from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { ProductVariantModel } from "./product-variant.model";

export async function createProductVariant(input: CreateProductVariantInput): Promise<ProductVariant> {
  const parsed = createProductVariantSchema.parse(input);
  const doc = await ProductVariantModel.create(parsed);
  return toDTO<ProductVariant>(doc)!;
}

export async function findProductVariantById(id: string): Promise<ProductVariant | null> {
  return toDTO<ProductVariant>(await ProductVariantModel.findById(id));
}

export async function requireProductVariantById(id: string): Promise<ProductVariant> {
  const variant = await findProductVariantById(id);
  if (!variant) throw new NotFoundError("ProductVariant", id);
  return variant;
}

export async function listProductVariants(filter: { productId?: string; isActive?: boolean } = {}): Promise<ProductVariant[]> {
  return toDTOList<ProductVariant>(await ProductVariantModel.find(filter).sort({ sku: 1 }));
}

export async function updateProductVariant(id: string, input: UpdateProductVariantInput): Promise<ProductVariant> {
  const parsed = updateProductVariantSchema.parse(input);
  const doc = await ProductVariantModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("ProductVariant", id);
  return toDTO<ProductVariant>(doc)!;
}
