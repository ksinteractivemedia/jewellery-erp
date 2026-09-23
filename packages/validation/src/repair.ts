import { z } from "zod";
import { zId, zPaise } from "./common";
import { zHuid } from "./inventory-item";

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * Repair intake for an existing InventoryItem (one we sold, or one already in our stock) — `itemId`
 * is required. Intake for a piece we've never held (`isCustomerOwned`) supplies enough to create one
 * fresh instead: no `itemId`, but a metal/purity/weight to record it against.
 */
export const repairIntakeSchema = z
  .object({
    customer: z.object({ id: zId.optional(), name: text(200), phone: text(20), email: z.string().trim().email().optional() }),
    itemId: zId.optional(),
    itemDescription: text(300),
    metalId: zId.optional(),
    purity: z.string().trim().max(20).optional(),
    huid: zHuid.optional(),
    /** Required when there's no existing itemId — a customer-owned piece must still be weighed onto our books. */
    grossWeight: z.number().finite().positive().optional(),
    stoneWeight: z.number().finite().nonnegative().optional(),
    /** Where a customer-owned piece is created, or where an existing item is picked up from. */
    locationId: zId,
    stoneWork: text(500).optional(),
    dueDate: z.string().trim().optional(),
    notes: text(500).optional(),
  })
  .strict()
  .refine((d) => d.itemId || (d.grossWeight !== undefined && d.metalId && d.purity), {
    message: "an item not already in our stock needs a metal, purity and gross weight to record it",
    path: ["grossWeight"],
  });
export type RepairIntakeInput = z.output<typeof repairIntakeSchema>;

export const inspectRepairSchema = z
  .object({
    inspectionNotes: text(1000).optional(),
    stoneWork: text(500).optional(),
  })
  .strict();
export type InspectRepairInput = z.output<typeof inspectRepairSchema>;

export const estimateRepairSchema = z
  .object({
    labourCharge: zPaise,
    materialsCharge: zPaise.default(0),
    otherCharges: zPaise.default(0),
    notes: text(500).optional(),
  })
  .strict();
export type EstimateRepairInput = z.output<typeof estimateRepairSchema>;

export const decideRepairEstimateSchema = z
  .object({
    approved: z.boolean(),
    byName: text(200).optional(),
    note: text(500).optional(),
  })
  .strict();
export type DecideRepairEstimateInput = z.output<typeof decideRepairEstimateSchema>;

/** The work is done: the "after weight" the spec names, plus what it actually cost — recorded before the QC decision, so the numbers the decision is made on are on the record either way. */
export const recordRepairWorkSchema = z
  .object({
    afterGrossWeight: z.number().finite().positive(),
    afterStoneWeight: z.number().finite().nonnegative().default(0),
    stoneWork: text(500).optional(),
    finalCharges: z.object({ labourCharge: zPaise, materialsCharge: zPaise.default(0), otherCharges: zPaise.default(0) }).optional(),
  })
  .strict()
  .refine((d) => d.afterStoneWeight <= d.afterGrossWeight, { message: "afterStoneWeight cannot exceed afterGrossWeight", path: ["afterStoneWeight"] });
export type RecordRepairWorkInput = z.output<typeof recordRepairWorkSchema>;

export const repairQcDecisionSchema = z.object({ notes: text(500).optional() }).strict();
export type RepairQcDecisionInput = z.output<typeof repairQcDecisionSchema>;

export const deliverRepairSchema = z.object({ note: text(300).optional() }).strict();
export type DeliverRepairInput = z.output<typeof deliverRepairSchema>;
export const cancelRepairSchema = z.object({ reason: text(500).optional() }).strict();
export type CancelRepairInput = z.output<typeof cancelRepairSchema>;
