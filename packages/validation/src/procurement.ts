import { z } from "zod";
import { zAddress, zGrams, zId, zPaise } from "./common";

const text = (max: number) => z.string().trim().min(1).max(max);
const reason = text(300);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

export const purchaseTypeSchema = z.enum(["GOLD", "SILVER", "PLATINUM", "STONE", "FINISHED_JEWELLERY", "RAW_MATERIAL", "CONSUMABLE"]);
const WEIGHT_TRACKED = new Set(["GOLD", "SILVER", "PLATINUM", "RAW_MATERIAL", "STONE"]);

/**
 * One requisition/PO line. A weight-tracked purchase type (gold, silver, platinum, raw material,
 * stone) must carry a metal, purity and ordered gross weight with a rate per gram; everything else
 * is ordered by quantity with a rate per unit. A consumable needs neither weight nor metal — it is
 * never a metal piece.
 */
export const purchaseLineInputSchema = z
  .object({
    purchaseType: purchaseTypeSchema,
    description: text(200),
    productId: zId.optional(),
    variantId: zId.optional(),
    metalId: zId.optional(),
    purity: z.string().trim().min(1).max(20).optional(),
    quantity: z.number().int().positive().max(1_000_000).default(1),
    grossWeight: zGrams.optional(),
    ratePerGram: zPaise.optional(),
    ratePerUnit: zPaise.optional(),
    lotNumber: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((l, ctx) => {
    // Every ledger-tracked type ends up as an InventoryItem, which always needs a metal and purity — a CONSUMABLE never does (it is
    // never a metal piece, and is not ledger-tracked at all; see procurement.ts's isLedgerTracked).
    if (l.purchaseType !== "CONSUMABLE") {
      if (!l.metalId) ctx.addIssue({ code: "custom", message: `${l.purchaseType} needs a metal`, path: ["metalId"] });
      if (!l.purity) ctx.addIssue({ code: "custom", message: `${l.purchaseType} needs a purity`, path: ["purity"] });
    }
    if (WEIGHT_TRACKED.has(l.purchaseType)) {
      // Ordered and priced by weight — the gross weight and its per-gram rate are what govern the order.
      if (!l.grossWeight) ctx.addIssue({ code: "custom", message: `${l.purchaseType} needs an ordered gross weight`, path: ["grossWeight"] });
      if (!l.ratePerGram) ctx.addIssue({ code: "custom", message: `${l.purchaseType} needs a rate per gram`, path: ["ratePerGram"] });
    } else if (l.purchaseType !== "CONSUMABLE" || l.ratePerUnit !== undefined) {
      // Ordered and priced by the piece (finished jewellery) or unit (a priced consumable) — weight, if any, is only settled at receipt.
      if (!l.ratePerUnit) ctx.addIssue({ code: "custom", message: `${l.purchaseType} needs a rate per unit`, path: ["ratePerUnit"] });
    }
  });
export type PurchaseLineInput = z.output<typeof purchaseLineInputSchema>;

export const createRequisitionSchema = z
  .object({
    department: text(60).optional(),
    reason: text(300),
    lines: z.array(purchaseLineInputSchema).min(1).max(100),
    /** false saves a draft; true submits it for approval. */
    submit: z.boolean().default(false),
  })
  .strict();
export type CreateRequisitionInput = z.output<typeof createRequisitionSchema>;

export const rejectRequisitionSchema = z.object({ reason }).strict();

export const createSupplierPurchaseOrderSchema = z
  .object({
    supplierId: zId,
    requisitionId: zId.optional(),
    lines: z.array(purchaseLineInputSchema).min(1).max(100),
    deliveryLocationId: zId,
    billingAddress: zAddress.optional(),
    expectedDeliveryDate: day.optional(),
    notes: text(1000).optional(),
    submit: z.boolean().default(false),
  })
  .strict();
export type CreateSupplierPurchaseOrderInput = z.output<typeof createSupplierPurchaseOrderSchema>;

export const approveSupplierPurchaseOrderSchema = z.object({ note: text(300).optional() }).strict();
export const cancelSupplierPurchaseOrderSchema = z.object({ reason }).strict();

/**
 * A goods-receipt line: what actually arrived against one PO line. `grossWeight` is required for a
 * weight-tracked line (the scale reading — never assumed to equal what was ordered); `quantity` is
 * required otherwise. `purity` must be given for a weight-tracked line so it can be checked against
 * what was ordered — receiving the wrong purity is refused, not silently accepted (see the service).
 * `expectedGrossWeight`, if given, is what the delivery note said THIS shipment should weigh — the
 * service compares it against the scale reading and flags a discrepancy beyond tolerance; a line
 * received in several shipments only needs it on the shipments that actually state an expectation.
 */
export const receiptLineInputSchema = z
  .object({
    purchaseOrderLineIndex: z.number().int().nonnegative(),
    /** How many of the ordered pieces this receipt covers — governs over-receipt on a quantity-tracked line only. */
    quantity: z.number().int().positive().max(1_000_000).default(1),
    /** The scale reading. Required by the service for any ledger-tracked line (it is never assumed to equal what was ordered) — the schema can't know that here, since it doesn't have the PO line's purchase type. */
    grossWeight: zGrams.optional(),
    expectedGrossWeight: zGrams.optional(),
    purity: z.string().trim().min(1).max(20).optional(),
    locationId: zId,
    lotNumber: z.string().trim().max(60).optional(),
    /** Required once the computed variance exceeds tolerance — the service enforces this, not the schema (it doesn't know the PO line yet). */
    discrepancyNote: z.string().trim().max(300).optional(),
  })
  .strict();
export type ReceiptLineInput = z.output<typeof receiptLineInputSchema>;

export const receiveGoodsSchema = z
  .object({
    receivedDate: day,
    notes: text(500).optional(),
    lines: z.array(receiptLineInputSchema).min(1).max(100),
  })
  .strict();
export type ReceiveGoodsInput = z.output<typeof receiveGoodsSchema>;

export const createSupplierInvoiceSchema = z
  .object({
    supplierId: zId,
    purchaseOrderId: zId.optional(),
    goodsReceiptIds: z.array(zId).max(50).default([]),
    supplierInvoiceNo: text(60),
    invoiceDate: day,
    dueDate: day.optional(),
    lines: z.array(purchaseLineInputSchema).min(1).max(100),
    taxAmount: zPaise.default(0),
  })
  .strict();
export type CreateSupplierInvoiceInput = z.output<typeof createSupplierInvoiceSchema>;

export const cancelSupplierInvoiceSchema = z.object({ reason }).strict();

export const SUPPLIER_PAYMENT_METHOD_VALUES = ["BANK_TRANSFER", "NEFT", "RTGS", "IMPS", "CHEQUE", "CASH", "OTHER"] as const;
export const recordSupplierPaymentSchema = z
  .object({
    supplierId: zId,
    method: z.enum(SUPPLIER_PAYMENT_METHOD_VALUES),
    amount: zPaise.refine((v) => v > 0, "must be greater than zero"),
    paidDate: day,
    reference: z.string().trim().max(60).optional(),
    bankName: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(300).optional(),
  })
  .strict();
export type RecordSupplierPaymentInput = z.output<typeof recordSupplierPaymentSchema>;

export const reverseSupplierPaymentSchema = z.object({ reason }).strict();

export const allocateSupplierPaymentSchema = z
  .object({
    allocations: z
      .array(z.object({ supplierInvoiceId: zId, amount: zPaise.refine((v) => v > 0, "must be greater than zero") }).strict())
      .min(1)
      .max(50),
  })
  .strict();
export type AllocateSupplierPaymentInput = z.output<typeof allocateSupplierPaymentSchema>;
