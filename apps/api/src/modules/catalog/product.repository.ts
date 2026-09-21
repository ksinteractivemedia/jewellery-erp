import type { Product } from "@jewellery/types";
import { createProductSchema, updateProductSchema, type CreateProductInput, type UpdateProductInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { ProductModel } from "./product.model";
import { resolveUniqueSlug } from "./slug";

export async function createProduct(input: CreateProductInput, actorId?: string): Promise<Product> {
  const parsed = createProductSchema.parse(input);
  const slug = await resolveUniqueSlug(ProductModel, parsed.name, parsed.slug);
  const doc = await ProductModel.create({ ...parsed, slug, createdBy: actorId, updatedBy: actorId });
  return toDTO<Product>(doc)!;
}

export async function findProductById(id: string): Promise<Product | null> {
  return toDTO<Product>(await ProductModel.findById(id));
}

export async function requireProductById(id: string): Promise<Product> {
  const product = await findProductById(id);
  if (!product) throw new NotFoundError("Product", id);
  return product;
}

export async function findProductBySku(sku: string): Promise<Product | null> {
  return toDTO<Product>(await ProductModel.findOne({ sku: sku.toUpperCase() }));
}

export async function listProducts(
  filter: { categoryId?: string; metalId?: string; isActive?: boolean } = {}
): Promise<Product[]> {
  return toDTOList<Product>(await ProductModel.find(filter).sort({ name: 1 }));
}

/** `null` in the input clears an optional field; `undefined` leaves it alone. */
export async function updateProduct(id: string, input: UpdateProductInput, actorId?: string): Promise<Product> {
  const { description, categoryId, purity, defaultGrossWeight, defaultNetWeight, stoneValue, ...rest } = updateProductSchema.parse(input);
  const set: Record<string, unknown> = { ...rest, ...(actorId ? { updatedBy: actorId } : {}) };
  const unset: Record<string, 1> = {};
  for (const [key, value] of Object.entries({ description, categoryId, purity, defaultGrossWeight, defaultNetWeight, stoneValue })) {
    if (value === null) unset[key] = 1;
    else if (value !== undefined) set[key] = value;
  }
  if (rest.slug) await resolveUniqueSlug(ProductModel, rest.name ?? rest.slug, rest.slug, id);
  const update: Record<string, unknown> = { $set: set };
  if (Object.keys(unset).length) update.$unset = unset;
  const doc = await ProductModel.findByIdAndUpdate(id, update, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("Product", id);
  return toDTO<Product>(doc)!;
}
