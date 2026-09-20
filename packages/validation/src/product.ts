import { z } from "zod";
import { zGrams, zId, zStoneDetail } from "./common";
import {
  MAX_PRODUCT_IMAGES,
  MAX_PRODUCT_VIDEOS,
  zProductImage,
  zTags,
  zVideoUrl,
} from "./product-media";
import { zSlug } from "./slug";

export const zPurity = z.string().trim().min(1).max(20);

/** Design-guidance weights only; the pieces' real weights live on InventoryItem. */
const netNotAboveGross = (v: { defaultGrossWeight?: number; defaultNetWeight?: number }) =>
  v.defaultGrossWeight === undefined || v.defaultNetWeight === undefined || v.defaultNetWeight <= v.defaultGrossWeight;
const netNotAboveGrossMessage = { message: "net weight cannot exceed gross weight", path: ["defaultNetWeight"] };

const productFields = z.object({
  sku: z.string().trim().min(1).max(40).toUpperCase(),
  name: z.string().trim().min(1).max(200),
  /** Optional on create — derived from the name when omitted. */
  slug: zSlug.optional(),
  description: z.string().trim().max(5000).optional(),
  categoryId: zId.optional(),
  collectionIds: z.array(zId).max(50).default([]),
  metalId: zId,
  purity: zPurity.optional(),
  defaultGrossWeight: zGrams.optional(),
  defaultNetWeight: zGrams.optional(),
  stoneDetails: z.array(zStoneDetail).default([]),
  images: z.array(zProductImage).max(MAX_PRODUCT_IMAGES).default([]),
  videos: z.array(zVideoUrl).max(MAX_PRODUCT_VIDEOS).default([]),
  tags: zTags.default([]),
  b2cEnabled: z.boolean().default(false),
  b2bEnabled: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const createProductSchema = productFields.refine(netNotAboveGross, netNotAboveGrossMessage);
export type CreateProductInput = z.input<typeof createProductSchema>;

/**
 * SKU is immutable once created (it is referenced by inventory, invoices and barcodes).
 * Optional fields that can be cleared accept `null` — null removes the value.
 */
export const updateProductSchema = productFields
  .omit({ sku: true })
  .partial()
  .extend({
    description: z.string().trim().max(5000).nullable().optional(),
    categoryId: zId.nullable().optional(),
    purity: zPurity.nullable().optional(),
    defaultGrossWeight: zGrams.nullable().optional(),
    defaultNetWeight: zGrams.nullable().optional(),
  })
  .refine(
    (v) => netNotAboveGross({ defaultGrossWeight: v.defaultGrossWeight ?? undefined, defaultNetWeight: v.defaultNetWeight ?? undefined }),
    netNotAboveGrossMessage,
  );
export type UpdateProductInput = z.input<typeof updateProductSchema>;

export const PRODUCT_SORT_FIELDS = ["updatedAt", "createdAt", "name", "sku"] as const;

const zQueryBool = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());

/** Query-string contract for `GET /api/products` — also what the ERP list encodes into its URL. */
export const productListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: zId.optional(),
  collectionId: zId.optional(),
  metalId: zId.optional(),
  purity: zPurity.optional(),
  tag: z.string().trim().toLowerCase().max(30).optional(),
  isActive: zQueryBool.optional(),
  b2cEnabled: zQueryBool.optional(),
  b2bEnabled: zQueryBool.optional(),
  sort: z.enum(PRODUCT_SORT_FIELDS).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ProductListQuery = z.output<typeof productListQuerySchema>;
export type ProductListQueryInput = z.input<typeof productListQuerySchema>;

export const MAX_BULK_IDS = 200;
const zBulkIds = z.array(zId).min(1).max(MAX_BULK_IDS);

export const bulkProductActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set-active"), ids: zBulkIds, value: z.boolean() }),
  z.object({ action: z.literal("set-b2c"), ids: zBulkIds, value: z.boolean() }),
  z.object({ action: z.literal("set-b2b"), ids: zBulkIds, value: z.boolean() }),
  z.object({ action: z.literal("add-to-collection"), ids: zBulkIds, collectionId: zId }),
  z.object({ action: z.literal("remove-from-collection"), ids: zBulkIds, collectionId: zId }),
  z.object({ action: z.literal("set-category"), ids: zBulkIds, categoryId: zId.nullable() }),
]);
export type BulkProductActionInput = z.input<typeof bulkProductActionSchema>;
