import { z } from "zod";
import { zAddress, zId } from "./common";
import { zHuid } from "./inventory-item";

const text = (max: number) => z.string().trim().min(1).max(max);
const reason = text(300);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

// ---- assaying centre (reference data — never hardcoded) ---------------------------------------------
export const createAssayingCentreSchema = z
  .object({
    name: text(120),
    code: z.string().trim().toUpperCase().min(1).max(20),
    bisRegistrationNumber: text(40).optional(),
    locationId: zId,
    address: zAddress.optional(),
    contactPhone: z.string().trim().min(6).max(20).optional(),
    contactEmail: z.string().trim().toLowerCase().email().optional(),
    isActive: z.boolean().default(true),
  })
  .strict();
export type CreateAssayingCentreInput = z.output<typeof createAssayingCentreSchema>;
export const updateAssayingCentreSchema = createAssayingCentreSchema.partial();
export type UpdateAssayingCentreInput = z.output<typeof updateAssayingCentreSchema>;

// ---- hallmarking batch --------------------------------------------------------------------------------
export const createHallmarkingBatchSchema = z
  .object({
    assayingCentreId: zId,
    itemIds: z.array(zId).min(1).max(100),
    expectedReturnDate: day.optional(),
    notes: text(500).optional(),
  })
  .strict();
export type CreateHallmarkingBatchInput = z.output<typeof createHallmarkingBatchSchema>;

export const arriveHallmarkingBatchSchema = z.object({ notes: text(300).optional() }).strict();

const receiveLineSchema = z
  .object({
    itemId: zId,
    /** Only given if the centre actually applied one — omitted means it came back unmarked (e.g. rejected). Uniqueness is enforced by the same rule as everywhere else a HUID is set (inventory-transaction.service.ts). */
    huid: zHuid.optional(),
    certificateNumber: text(60).optional(),
    hallmarkDate: day.optional(),
  })
  .strict();
export const receiveHallmarkingBatchSchema = z.object({ lines: z.array(receiveLineSchema).min(1).max(100) }).strict();
export type ReceiveHallmarkingBatchInput = z.output<typeof receiveHallmarkingBatchSchema>;

export const verifyHallmarkingLineSchema = z.object({ notes: text(300).optional() }).strict();
export const failHallmarkingLineSchema = z.object({ failureReason: reason }).strict();
export const cancelHallmarkingBatchSchema = z.object({ reason: reason.optional() }).strict();
