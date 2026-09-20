import type { ProductCategory } from "@jewellery/types";
import {
  createProductCategorySchema,
  updateProductCategorySchema,
  type CreateProductCategoryInput,
  type UpdateProductCategoryInput,
} from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { ProductCategoryModel } from "./product-category.model";
import { resolveUniqueSlug } from "./slug";

export async function createProductCategory(input: CreateProductCategoryInput): Promise<ProductCategory> {
  const parsed = createProductCategorySchema.parse(input);
  const slug = await resolveUniqueSlug(ProductCategoryModel, parsed.name, parsed.slug);
  const doc = await ProductCategoryModel.create({ ...parsed, slug });
  return toDTO<ProductCategory>(doc)!;
}

export async function findProductCategoryById(id: string): Promise<ProductCategory | null> {
  return toDTO<ProductCategory>(await ProductCategoryModel.findById(id));
}

export async function requireProductCategoryById(id: string): Promise<ProductCategory> {
  const category = await findProductCategoryById(id);
  if (!category) throw new NotFoundError("ProductCategory", id);
  return category;
}

export async function listProductCategories(filter: { parentId?: string; isActive?: boolean } = {}): Promise<ProductCategory[]> {
  return toDTOList<ProductCategory>(await ProductCategoryModel.find(filter).sort({ name: 1 }));
}

export async function updateProductCategory(id: string, input: UpdateProductCategoryInput): Promise<ProductCategory> {
  const { parentId, description, ...rest } = updateProductCategorySchema.parse(input);
  if (rest.slug) await resolveUniqueSlug(ProductCategoryModel, rest.name ?? rest.slug, rest.slug, id);
  const update: Record<string, unknown> = { $set: { ...rest } };
  const unset: Record<string, 1> = {};
  if (parentId === null) unset.parentId = 1;
  else if (parentId !== undefined) (update.$set as Record<string, unknown>).parentId = parentId;
  if (description === null) unset.description = 1;
  else if (description !== undefined) (update.$set as Record<string, unknown>).description = description;
  if (Object.keys(unset).length) update.$unset = unset;
  const doc = await ProductCategoryModel.findByIdAndUpdate(id, update, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("ProductCategory", id);
  return toDTO<ProductCategory>(doc)!;
}
