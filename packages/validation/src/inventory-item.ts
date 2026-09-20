import { z } from "zod";
import { zGrams, zId, zPaise, zStoneDetail } from "./common";

export const inventoryItemKindSchema = z.enum(["FINISHED_JEWELLERY", "RAW_MATERIAL", "SEMI_FINISHED", "LOOSE_STONE"]);
export const serializationSchema = z.enum(["UNIT", "BATCH"]);
export const hallmarkStatusSchema = z.enum(["NOT_APPLICABLE", "PENDING", "HALLMARKED"]);
export const inventoryStatusSchema = z.enum([
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "RETURNED",
  "DAMAGED",
  "UNDER_REPAIR",
  "IN_MANUFACTURING",
  "WITH_JOB_WORKER",
  "IN_TRANSIT",
  "HALLMARKING",
  "SCRAP",
  "MELTING",
]);

/**
 * `netWeight`/`fineWeight` are deliberately NOT inputs — they're always derived from
 * grossWeight/stoneWeight/fineness by the service layer (see weight-calculations.ts),
 * never trusted from a caller.
 */
export const createInventoryItemSchema = z
  .object({
    itemCode: z.string().min(1).toUpperCase(),
    barcode: z.string().optional(),
    serialNumber: z.string().optional(),
    productId: zId.optional(),
    variantId: zId.optional(),
    type: inventoryItemKindSchema,
    serialization: serializationSchema.default("UNIT"),
    grossWeight: zGrams,
    stoneWeight: zGrams.default(0),
    metalId: zId,
    purity: z.string().min(1),
    huid: z.string().optional(),
    hallmarkStatus: hallmarkStatusSchema.default("NOT_APPLICABLE"),
    stoneDetails: z.array(zStoneDetail).default([]),
    locationId: zId,
    status: inventoryStatusSchema.default("AVAILABLE"),
    cost: zPaise,
    quantity: z.number().int().positive().default(1),
  })
  .refine((data) => data.stoneWeight <= data.grossWeight, {
    message: "stoneWeight cannot exceed grossWeight",
    path: ["stoneWeight"],
  });
export type CreateInventoryItemInput = z.input<typeof createInventoryItemSchema>;

/** Editable, non-ledger-governed fields only — status/location/weight never go through here. */
export const updateInventoryItemDetailsSchema = z.object({
  barcode: z.string().optional(),
  serialNumber: z.string().optional(),
  huid: z.string().optional(),
  hallmarkStatus: hallmarkStatusSchema.optional(),
  stoneDetails: z.array(zStoneDetail).optional(),
});
export type UpdateInventoryItemDetailsInput = z.input<typeof updateInventoryItemDetailsSchema>;
