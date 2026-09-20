import type { Product } from "@jewellery/types";
import { createProductSchema, updateProductSchema, type CreateProductInput, type UpdateProductInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { ProductModel } from "./product.model";

export async function createProduct(input: CreateProductInput): Promise<Product> {
  const parsed = createProductSchema.parse(input);
  const doc = await ProductModel.create(parsed);
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
  filter: { categoryId?: string; metalId?: string; status?: string } = {}
): Promise<Product[]> {
  return toDTOList<Product>(await ProductModel.find(filter).sort({ name: 1 }));
}

export async function updateProduct(id: string, input: UpdateProductInput): Promise<Product> {
  const parsed = updateProductSchema.parse(input);
  const doc = await ProductModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("Product", id);
  return toDTO<Product>(doc)!;
}
