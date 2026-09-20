import { z } from "zod";
import { zId } from "./common";
import {
  hallmarkStatusSchema,
  inventoryItemKindSchema,
  inventoryStatusSchema,
  zHuid,
} from "./inventory-item";
import { MAX_MOVEMENT_ITEMS } from "./inventory-ledger";
import { movementTypeSchema } from "./transaction";

const zQueryBool = z.preprocess((v) => (v === "true" ? true : v === "false" ? false : v), z.boolean());
/** `status=AVAILABLE,RESERVED` → ["AVAILABLE","RESERVED"] (also accepts a repeated param). */
const zCsv = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v), z.array(item).max(12));

export const INVENTORY_SORT_FIELDS = ["updatedAt", "createdAt", "itemCode", "grossWeight", "netWeight", "fineWeight", "cost", "status"] as const;

const inventoryFilters = {
  q: z.string().trim().max(100).optional(),
  status: zCsv(inventoryStatusSchema).optional(),
  locationId: zId.optional(),
  metalId: zId.optional(),
  purity: z.string().trim().max(20).optional(),
  type: inventoryItemKindSchema.optional(),
  productId: zId.optional(),
  hallmarkStatus: hallmarkStatusSchema.optional(),
  availableForSale: zQueryBool.optional(),
  hasHuid: zQueryBool.optional(),
};

/** Query-string contract for `GET /api/inventory/items` — also what the ERP encodes into its URL. */
export const inventoryListQuerySchema = z.object({
  ...inventoryFilters,
  sort: z.enum(INVENTORY_SORT_FIELDS).default("updatedAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type InventoryListQuery = z.output<typeof inventoryListQuerySchema>;
export type InventoryListQueryInput = z.input<typeof inventoryListQuerySchema>;

export const stockSummaryQuerySchema = z.object({
  groupBy: z.enum(["location", "sku", "purity", "metal"]),
  /** `owned` = everything the business still holds (excludes SOLD and MELTING); `all` includes those. */
  scope: z.enum(["owned", "all"]).default("owned"),
  status: inventoryFilters.status,
  locationId: inventoryFilters.locationId,
  metalId: inventoryFilters.metalId,
  purity: inventoryFilters.purity,
  type: inventoryFilters.type,
});
export type StockSummaryQuery = z.output<typeof stockSummaryQuerySchema>;

export const ledgerQuerySchema = z.object({
  itemId: zId.optional(),
  movementType: zCsv(movementTypeSchema).optional(),
  /** Matches the entry's source OR destination. */
  locationId: zId.optional(),
  transactionId: zId.optional(),
  referenceId: zId.optional(),
  performedBy: zId.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type LedgerQuery = z.output<typeof ledgerQuerySchema>;
export type LedgerQueryInput = z.input<typeof ledgerQuerySchema>;

const zItemIds = z
  .array(zId)
  .min(1)
  .max(MAX_MOVEMENT_ITEMS)
  .refine((ids) => new Set(ids).size === ids.length, "each item can be listed only once");

export const reserveItemsSchema = z.object({
  itemIds: zItemIds,
  referenceType: z.enum(["ORDER", "CUSTOMER_PURCHASE_ORDER", "MANUAL"]).default("ORDER"),
  referenceId: zId,
  /** Hold length. Omit for an open-ended hold (released explicitly). */
  expiresInMinutes: z.number().int().min(1).max(60 * 24 * 7).optional(),
  reason: z.string().trim().max(500).optional(),
});
export type ReserveItemsInput = z.input<typeof reserveItemsSchema>;

export const releaseItemsSchema = z.object({
  itemIds: zItemIds,
  /** Must match the order that holds the item. */
  referenceId: zId,
  /** Release a hold that belongs to a different reference. Needs `inventory.approve_adjustment`. */
  force: z.boolean().default(false),
  reason: z.string().trim().max(500).optional(),
});
export type ReleaseItemsInput = z.input<typeof releaseItemsSchema>;

/** Movements that hand pieces to, or take them back from, a partner (workshop, job worker, hallmarking centre, repairer). */
export const PARTNER_MOVEMENTS = [
  "MANUFACTURING_ISSUE",
  "MANUFACTURING_RECEIPT",
  "JOBWORK_ISSUE",
  "JOBWORK_RECEIPT",
  "REPAIR_OUT",
  "REPAIR_IN",
  "HALLMARKING_OUT",
  "HALLMARKING_IN",
] as const;

export const partnerMovementSchema = z.object({
  type: z.enum(PARTNER_MOVEMENTS),
  itemIds: zItemIds,
  /** The partner location for an *_OUT/ISSUE, the receiving stock location for an *_IN/RECEIPT. */
  destinationLocationId: zId,
  reason: z.string().trim().max(500).optional(),
  /** HALLMARKING_IN: the HUID each piece came back with. */
  hallmarkResults: z.array(z.object({ itemId: zId, huid: zHuid })).max(MAX_MOVEMENT_ITEMS).optional(),
});
export type PartnerMovementInput = z.input<typeof partnerMovementSchema>;

export const createTransferSchema = z
  .object({
    fromLocationId: zId,
    toLocationId: zId,
    itemIds: zItemIds,
    notes: z.string().trim().max(500).optional(),
  })
  .refine((t) => t.fromLocationId !== t.toLocationId, { message: "source and destination must differ", path: ["toLocationId"] });
export type CreateTransferInput = z.input<typeof createTransferSchema>;

export const receiveTransferSchema = z.object({
  /** Omit to receive everything still pending. */
  itemIds: zItemIds.optional(),
});
export type ReceiveTransferInput = z.input<typeof receiveTransferSchema>;

export const cancelTransferSchema = z.object({ reason: z.string().trim().max(500).optional() });

export const transferListQuerySchema = z.object({
  status: z.enum(["IN_TRANSIT", "RECEIVED", "CANCELLED"]).optional(),
  locationId: zId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const requestAdjustmentSchema = z
  .object({
    itemId: zId,
    reason: z.string().trim().min(5, "explain the reason (at least 5 characters)").max(500),
    toStatus: inventoryStatusSchema.optional(),
    grossWeight: z.number().finite().positive().max(1_000_000).optional(),
    stoneWeight: z.number().finite().nonnegative().max(1_000_000).optional(),
    quantityDelta: z.number().int().refine((v) => v !== 0, "cannot be zero").optional(),
    weightDelta: z.number().finite().refine((v) => v !== 0, "cannot be zero").optional(),
  })
  .refine(
    (a) => a.toStatus !== undefined || a.grossWeight !== undefined || a.stoneWeight !== undefined || a.quantityDelta !== undefined || a.weightDelta !== undefined,
    { message: "request at least one change", path: ["toStatus"] }
  );
export type RequestAdjustmentInput = z.input<typeof requestAdjustmentSchema>;

export const adjustmentDecisionSchema = z.object({ note: z.string().trim().max(500).optional() });

export const adjustmentListQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  itemId: zId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const scanQuerySchema = z.object({ code: z.string().min(1).max(200) });
