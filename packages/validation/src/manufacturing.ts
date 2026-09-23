import { z } from "zod";
import { zAddress, zGrams, zId, zPaise, zStoneDetail } from "./common";

const text = (max: number) => z.string().trim().min(1).max(max);
const reason = text(300);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

/** What the order is meant to consume, fixed at creation — everything a bill of materials needs to be checked against later. */
export const bomInputSchema = z
  .object({
    metalId: zId,
    purity: z.string().trim().min(1).max(20),
    expectedGrossWeight: zGrams.refine((v) => v > 0, "must be greater than zero"),
    expectedWastage: zGrams.default(0),
    stonesRequired: z.array(zStoneDetail).max(50).default([]),
    notes: text(500).optional(),
  })
  .strict();
export type BomInput = z.output<typeof bomInputSchema>;

export const createProductionOrderSchema = z
  .object({
    productId: zId,
    variantId: zId.optional(),
    quantity: z.number().int().positive().max(10_000).default(1),
    bom: bomInputSchema,
    locationId: zId,
  })
  .strict();
export type CreateProductionOrderInput = z.output<typeof createProductionOrderSchema>;

/** Which existing AVAILABLE items to move onto the floor — whole items only (see manufacturing-core.ts: a batch is never split by this module). */
export const issueMaterialSchema = z.object({ itemIds: z.array(zId).min(1).max(50) }).strict();
export type IssueMaterialInput = z.output<typeof issueMaterialSchema>;

export const submitForQcSchema = z
  .object({
    actualGrossWeight: zGrams.refine((v) => v > 0, "must be greater than zero"),
    actualWastage: zGrams.default(0),
    labourCost: zPaise.default(0),
  })
  .strict();
export type SubmitForQcInput = z.output<typeof submitForQcSchema>;

export const qcDecisionSchema = z.object({ notes: text(500).optional() }).strict();
export const rejectQcSchema = z.object({ notes: reason }).strict();

const finishedPieceSchema = z
  .object({
    quantity: z.number().int().positive().max(1_000).default(1),
    grossWeight: zGrams.refine((v) => v > 0, "must be greater than zero"),
    stoneWeight: zGrams.default(0),
    huid: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/).optional(),
  })
  .strict();

/**
 * Closes out a production order once QC has passed: the finished piece(s) it creates, any unused
 * issued material returned whole (never split), and the wastage figure. The reconciliation
 * (issued - returned - finished - wastage) is computed here, not trusted from the client; a
 * non-trivial discrepancy is refused without an explanatory note (the same discipline as a
 * goods-receipt weight discrepancy in procurement).
 */
export const completeProductionSchema = z
  .object({
    finishedPieces: z.array(finishedPieceSchema).min(1).max(100),
    returnedItemIds: z.array(zId).max(50).default([]),
    wastage: zGrams.default(0),
    discrepancyNote: text(300).optional(),
  })
  .strict();
export type CompleteProductionInput = z.output<typeof completeProductionSchema>;

export const cancelManufacturingSchema = z.object({ reason: reason.optional() }).strict();

// ---- job work -------------------------------------------------------------------------------------------
export const createJobWorkOrderSchema = z
  .object({
    vendorId: zId,
    productId: zId.optional(),
    variantId: zId.optional(),
    issueDate: day,
    dueDate: day,
    bom: bomInputSchema,
    makingCharges: zPaise.default(0),
    expectedOutputDescription: text(300).optional(),
    locationId: zId,
    deliveryAddress: zAddress.optional(),
  })
  .strict()
  .refine((d) => d.dueDate >= d.issueDate, { message: "due date can't be before the issue date", path: ["dueDate"] });
export type CreateJobWorkOrderInput = z.output<typeof createJobWorkOrderSchema>;

/**
 * One return event against a job-work order — may be partial (some finished pieces and/or some
 * unused material now, the rest later) or `final: true` to close the order (nothing more is coming
 * back). The reconciliation is cumulative across every return event on the order.
 */
export const returnJobWorkSchema = z
  .object({
    finishedPieces: z.array(finishedPieceSchema).max(100).default([]),
    returnedItemIds: z.array(zId).max(50).default([]),
    wastage: zGrams.default(0),
    discrepancyNote: text(300).optional(),
    final: z.boolean().default(false),
  })
  .strict()
  .refine((d) => d.finishedPieces.length > 0 || d.returnedItemIds.length > 0 || d.wastage > 0 || d.final, { message: "a return needs something to record" });
export type ReturnJobWorkInput = z.output<typeof returnJobWorkSchema>;
