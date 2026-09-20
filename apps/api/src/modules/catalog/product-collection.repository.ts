import type { ProductCollection } from "@jewellery/types";
import {
  createProductCollectionSchema,
  updateProductCollectionSchema,
  type CreateProductCollectionInput,
  type UpdateProductCollectionInput,
} from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { ProductCollectionModel } from "./product-collection.model";
import { resolveUniqueSlug } from "./slug";

export async function createProductCollection(input: CreateProductCollectionInput): Promise<ProductCollection> {
  const parsed = createProductCollectionSchema.parse(input);
  const slug = await resolveUniqueSlug(ProductCollectionModel, parsed.name, parsed.slug);
  const doc = await ProductCollectionModel.create({ ...parsed, slug });
  return toDTO<ProductCollection>(doc)!;
}

export async function findProductCollectionById(id: string): Promise<ProductCollection | null> {
  return toDTO<ProductCollection>(await ProductCollectionModel.findById(id));
}

export async function requireProductCollectionById(id: string): Promise<ProductCollection> {
  const collection = await findProductCollectionById(id);
  if (!collection) throw new NotFoundError("ProductCollection", id);
  return collection;
}

export async function listProductCollections(filter: { isActive?: boolean } = {}): Promise<ProductCollection[]> {
  return toDTOList<ProductCollection>(await ProductCollectionModel.find(filter).sort({ name: 1 }));
}

export async function updateProductCollection(id: string, input: UpdateProductCollectionInput): Promise<ProductCollection> {
  const { description, ...rest } = updateProductCollectionSchema.parse(input);
  if (rest.slug) await resolveUniqueSlug(ProductCollectionModel, rest.name ?? rest.slug, rest.slug, id);
  const update: Record<string, unknown> = { $set: { ...rest } };
  if (description === null) update.$unset = { description: 1 };
  else if (description !== undefined) (update.$set as Record<string, unknown>).description = description;
  const doc = await ProductCollectionModel.findByIdAndUpdate(id, update, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("ProductCollection", id);
  return toDTO<ProductCollection>(doc)!;
}
