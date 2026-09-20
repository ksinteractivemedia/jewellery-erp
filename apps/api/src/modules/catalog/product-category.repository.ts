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

export async function createProductCategory(input: CreateProductCategoryInput): Promise<ProductCategory> {
  const parsed = createProductCategorySchema.parse(input);
  const doc = await ProductCategoryModel.create(parsed);
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
  const parsed = updateProductCategorySchema.parse(input);
  const doc = await ProductCategoryModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("ProductCategory", id);
  return toDTO<ProductCategory>(doc)!;
}
