import type { ProductDetail } from "@jewellery/types";
import type { CreateProductInput, UpdateProductInput } from "@jewellery/validation";

/** What the form edits. Images carry their resolved URL so previews work; only `{key, alt}` is sent. */
export interface ProductFormValues {
  sku: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  collectionIds: string[];
  metalId: string;
  purity: string;
  defaultGrossWeight?: number;
  defaultNetWeight?: number;
  images: { key: string; url: string; alt?: string }[];
  videos: string[];
  tags: string[];
  b2cEnabled: boolean;
  b2bEnabled: boolean;
  isActive: boolean;
}

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  sku: "",
  name: "",
  slug: "",
  description: "",
  categoryId: "",
  collectionIds: [],
  metalId: "",
  purity: "",
  images: [],
  videos: [],
  tags: [],
  b2cEnabled: false,
  b2bEnabled: false,
  isActive: true,
};

export const toFormValues = (p: ProductDetail): ProductFormValues => ({
  sku: p.sku,
  name: p.name,
  slug: p.slug,
  description: p.description ?? "",
  categoryId: p.categoryId ?? "",
  collectionIds: p.collectionIds,
  metalId: p.metalId,
  purity: p.purity ?? "",
  defaultGrossWeight: p.defaultGrossWeight,
  defaultNetWeight: p.defaultNetWeight,
  images: p.images.map(({ key, url, alt }) => ({ key, url, alt })),
  videos: p.videos,
  tags: p.tags,
  b2cEnabled: p.b2cEnabled,
  b2bEnabled: p.b2bEnabled,
  isActive: p.isActive,
});

const images = (v: ProductFormValues) => v.images.map(({ key, alt }) => ({ key, ...(alt?.trim() ? { alt: alt.trim() } : {}) }));

/** Blank optional fields are omitted on create. */
export const toCreatePayload = (v: ProductFormValues): CreateProductInput => ({
  sku: v.sku,
  name: v.name,
  ...(v.slug.trim() ? { slug: v.slug.trim() } : {}),
  ...(v.description.trim() ? { description: v.description } : {}),
  ...(v.categoryId ? { categoryId: v.categoryId } : {}),
  collectionIds: v.collectionIds,
  metalId: v.metalId,
  ...(v.purity ? { purity: v.purity } : {}),
  ...(v.defaultGrossWeight !== undefined ? { defaultGrossWeight: v.defaultGrossWeight } : {}),
  ...(v.defaultNetWeight !== undefined ? { defaultNetWeight: v.defaultNetWeight } : {}),
  images: images(v),
  videos: v.videos,
  tags: v.tags,
  b2cEnabled: v.b2cEnabled,
  b2bEnabled: v.b2bEnabled,
  isActive: v.isActive,
});

/** On update a blank optional field means "clear it" — the API takes `null` for that. The SKU is immutable and never sent. */
export const toUpdatePayload = (v: ProductFormValues): UpdateProductInput => ({
  name: v.name,
  slug: v.slug.trim() || undefined,
  description: v.description.trim() ? v.description : null,
  categoryId: v.categoryId || null,
  collectionIds: v.collectionIds,
  metalId: v.metalId,
  purity: v.purity || null,
  defaultGrossWeight: v.defaultGrossWeight ?? null,
  defaultNetWeight: v.defaultNetWeight ?? null,
  images: images(v),
  videos: v.videos,
  tags: v.tags,
  b2cEnabled: v.b2cEnabled,
  b2bEnabled: v.b2bEnabled,
  isActive: v.isActive,
});
