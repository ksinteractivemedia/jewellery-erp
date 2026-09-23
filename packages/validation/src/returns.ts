import { z } from "zod";
import { zId, zPaise } from "./common";
import { zHuid } from "./inventory-item";

const text = (max: number) => z.string().trim().min(1).max(max);
const reason = text(500);

export const returnChannelSchema = z.enum(["B2C", "B2B"]);
export const returnReasonSchema = z.enum(["DEFECTIVE", "WRONG_ITEM", "NOT_AS_DESCRIBED", "SIZE_ISSUE", "CHANGED_MIND", "OTHER"]);
export const returnConditionSchema = z.enum(["GOOD", "DAMAGED", "DEFECTIVE"]);
export const returnSettlementMethodSchema = z.enum(["REFUND", "STORE_CREDIT", "ADJUST_INVOICE"]);

export const requestReturnSchema = z
  .object({
    orderId: zId,
    itemIds: z.array(zId).min(1).max(50),
    reason: returnReasonSchema,
    reasonNote: text(500).optional(),
  })
  .strict();
export type RequestReturnInput = z.output<typeof requestReturnSchema>;

/**
 * The customer-facing shape: a shopper/buyer knows their order's own LINES (what they bought), never the
 * internal InventoryItem a specific piece was fulfilled from — that mapping is the server's job
 * (order-context.ts resolves `lineRefs` to the exact items actually sold on them). The order id itself
 * comes from the URL of the scoped endpoint this is used on, never the body.
 */
export const requestReturnByOrderLinesSchema = z
  .object({
    lineRefs: z.array(z.string().trim().min(1).max(64)).min(1).max(50),
    reason: returnReasonSchema,
    reasonNote: text(500).optional(),
  })
  .strict();
export type RequestReturnByOrderLinesInput = z.output<typeof requestReturnByOrderLinesSchema>;

export const rejectReturnSchema = z.object({ reason }).strict();
export const approveReturnSchema = z.object({ note: text(500).optional() }).strict();
export const cancelReturnSchema = z.object({ reason: text(500).optional() }).strict();

const receiveReturnLineSchema = z
  .object({
    itemId: zId,
    /** What the piece's own mark actually reads, if it has one — must match the order's item or the receipt is refused outright (business-rules.md §17.2). */
    observedHuid: zHuid.optional(),
    /** The scale reading right now, if re-weighed on receipt. */
    observedGrossWeight: z.number().finite().positive().optional(),
    weightDiscrepancyNote: text(300).optional(),
  })
  .strict();
export const receiveReturnSchema = z.object({ destinationLocationId: zId, lines: z.array(receiveReturnLineSchema).min(1).max(50) }).strict();
export type ReceiveReturnInput = z.output<typeof receiveReturnSchema>;

const inspectReturnLineSchema = z
  .object({
    itemId: zId,
    condition: returnConditionSchema,
    conditionNote: text(300).optional(),
  })
  .strict();
export const inspectReturnSchema = z.object({ lines: z.array(inspectReturnLineSchema).min(1).max(50) }).strict();
export type InspectReturnInput = z.output<typeof inspectReturnSchema>;

export const settleReturnSchema = z
  .object({
    method: returnSettlementMethodSchema,
    amount: zPaise,
    reference: text(120).optional(),
    note: text(300).optional(),
  })
  .strict();
export type SettleReturnInput = z.output<typeof settleReturnSchema>;
