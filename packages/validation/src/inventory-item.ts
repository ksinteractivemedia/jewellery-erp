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
  "RETURNED_TO_CUSTOMER",
]);

/**
 * A BIS HUID: exactly six letters/digits. Stored uppercase — "ab12cd" and "AB12CD" are the same
 * mark, so they must collide as duplicates rather than sneak in as two.
 */
export const zHuid = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, "HUID must be exactly 6 letters or digits");

/** Barcodes/serials are printed labels — printable, no whitespace inside, bounded. */
export const zLabelCode = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._\-/]+$/, "may contain letters, digits and . _ - / only");

/** A weight the scale could have produced: positive, finite, at most 3 decimals, under a sane ceiling. */
export const zScaleWeight = z
  .number()
  .finite()
  .positive("must be greater than zero")
  .max(1_000_000, "weight is implausibly large")
  .refine((g) => Math.abs(g * 1000 - Math.round(g * 1000)) < 1e-6, "at most 3 decimal places");

export const zStoneWeightValue = z
  .number()
  .finite()
  .nonnegative("cannot be negative")
  .max(1_000_000)
  .refine((g) => Math.abs(g * 1000 - Math.round(g * 1000)) < 1e-6, "at most 3 decimal places");

export const RECEIPT_MOVEMENTS = ["PURCHASE_RECEIPT", "MANUFACTURING_RECEIPT", "JOBWORK_RECEIPT", "ADJUSTMENT"] as const;

/**
 * `netWeight`/`fineWeight` are deliberately NOT inputs — they're always derived from
 * grossWeight/stoneWeight/fineness by the service layer (see weight-calculations.ts),
 * never trusted from a caller. `itemCode` is optional: the server allocates the next one.
 */
export const createInventoryItemSchema = z
  .object({
    itemCode: z.string().trim().min(1).max(40).toUpperCase().optional(),
    barcode: zLabelCode.optional(),
    serialNumber: zLabelCode.optional(),
    productId: zId.optional(),
    variantId: zId.optional(),
    type: inventoryItemKindSchema,
    serialization: serializationSchema.default("UNIT"),
    grossWeight: zScaleWeight,
    stoneWeight: zStoneWeightValue.default(0),
    metalId: zId,
    purity: z.string().trim().min(1).max(20),
    huid: zHuid.optional(),
    /** Defaults to HALLMARKED when a HUID is given, NOT_APPLICABLE otherwise. */
    hallmarkStatus: hallmarkStatusSchema.optional(),
    stoneDetails: z.array(zStoneDetail).default([]),
    locationId: zId,
    status: inventoryStatusSchema.default("AVAILABLE"),
    cost: zPaise,
    quantity: z.number().int().positive().default(1),
    /** Set when a piece comes off the bench or back from a job worker — which order made it, so its origin is traceable without rejoining the ledger. */
    manufacturingInfo: z.object({ productionOrderId: zId.optional(), jobWorkOrderId: zId.optional(), manufacturedDate: z.coerce.date().optional() }).optional(),
    /** True only for a repair-intake piece the business never sold and does not own — see InventoryItem.isCustomerOwned. */
    isCustomerOwned: z.boolean().default(false),
  })
  .refine((data) => data.stoneWeight <= data.grossWeight, {
    message: "stoneWeight cannot exceed grossWeight",
    path: ["stoneWeight"],
  })
  .refine((data) => data.type === "LOOSE_STONE" || data.stoneWeight < data.grossWeight, {
    message: "stoneWeight must be less than grossWeight — a metal item needs a positive net weight",
    path: ["stoneWeight"],
  })
  .refine((data) => !(data.huid && data.hallmarkStatus === "NOT_APPLICABLE"), {
    message: "an item with a HUID is hallmarked",
    path: ["hallmarkStatus"],
  })
  .transform((data) => ({ ...data, hallmarkStatus: data.hallmarkStatus ?? (data.huid ? ("HALLMARKED" as const) : ("NOT_APPLICABLE" as const)) }));
export type CreateInventoryItemInput = z.input<typeof createInventoryItemSchema>;

/**
 * Non-stock identifiers only. A HUID can be set once (then it is the piece's legal identity) —
 * enforced in the service; status/location/weight never go through here.
 */
export const updateInventoryItemDetailsSchema = z.object({
  barcode: zLabelCode.optional(),
  serialNumber: zLabelCode.optional(),
  huid: zHuid.optional(),
  stoneDetails: z.array(zStoneDetail).optional(),
});
export type UpdateInventoryItemDetailsInput = z.input<typeof updateInventoryItemDetailsSchema>;
