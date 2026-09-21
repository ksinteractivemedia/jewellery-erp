import { Types } from "mongoose";
import type { B2BInvoice, B2BSalesOrder } from "@jewellery/types";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import { postInSession, withInventoryTransaction } from "../inventory/inventory-transaction.service";
import { releaseItems } from "../inventory/stock-operations";
import { isStockConflict, pickPieces } from "../orders/order-inventory";
import { PriceSnapshotModel } from "../orders/price-snapshot.model";
import { addDays } from "../dashboard/range";
import { StockShortError } from "./b2b.errors";
import { InvoiceModel, SalesOrderModel, type SalesOrderDocument } from "./b2b.models";
import { customerContext, stockCounts, stockKey, lookupSkus } from "./b2b-core";
import { audit, moveSo, nextNo, oid, type Actor } from "./b2b-store";
import { invoiceView, salesOrderView } from "./b2b-views";

const MAX_PICK_ATTEMPTS = 3;
const id = (v: unknown) => String(v);

/**
 * Stock allocation and invoicing. Allocation HOLDS specific pieces for the order in the ledger (no expiry — a wholesale order
 * waits for its invoice, not for a payment page); invoicing SELLS them (ledger SALE tied to the order) and issues the invoice
 * in the same transaction, so a piece is never sold without an invoice or invoiced without being sold.
 */
export function createFulfilmentService(deps: { now?: () => Date }) {
  const clock = deps.now ?? (() => new Date());

  const orderOf = async (soId: string): Promise<SalesOrderDocument> => {
    if (!Types.ObjectId.isValid(soId)) throw new NotFoundError("Sales order", soId);
    const so = await SalesOrderModel.findById(soId);
    if (!so) throw new NotFoundError("Sales order", soId);
    return so;
  };

  /** Hold pieces for every line — all of them or none. Short stock is reported line by line and the order stays APPROVED, ready to retry when stock arrives. */
  async function allocate(soId: string, actor: Actor): Promise<B2BSalesOrder> {
    const so = await orderOf(soId);
    if (so.status !== "APPROVED") throw new ConflictError(`Only an approved order can be allocated (this one is ${so.status.replace(/_/g, " ").toLowerCase()}).`);
    const needs = so.lines.map((l) => ({ productId: id(l.productId), ...(l.variantId ? { variantId: id(l.variantId) } : {}), quantity: l.quantity }));

    for (let attempt = 1; attempt <= MAX_PICK_ATTEMPTS; attempt++) {
      const picked = await pickPieces(needs);
      if (!picked) break;
      try {
        const moved = await withInventoryTransaction(async (session) => {
          await postInSession(session, {
            type: "RESERVATION",
            channel: "B2B",
            referenceType: "ORDER",
            referenceId: so.id,
            performedBy: actor.id,
            reason: `Allocated to ${so.soNo}`,
            lines: picked.flat().map((itemId) => ({ itemId, reservation: { referenceType: "ORDER", referenceId: so.id } })),
          });
          return moveSo(so._id, "ALLOCATED", ["APPROVED"], actor, { session, at: clock(), note: "Stock allocated", set: { allocations: picked.map((itemIds, lineIndex) => ({ lineIndex, itemIds: itemIds.map((x) => new Types.ObjectId(x)) })), allocatedAt: clock() }, unset: ["shortfall"] });
        });
        if (!moved) throw new ConflictError("This order changed while it was being allocated — please look again.");
        await audit(actor, AUDIT_ACTIONS.B2B_ORDER_ALLOCATED, "SalesOrder", so.id, { soNo: so.soNo, pieces: picked.flat().length });
        return salesOrderView(moved.toObject());
      } catch (error) {
        if (!isStockConflict(error)) throw error; // someone took a piece between choosing and holding: choose again
      }
    }

    const hits = await lookupSkus(so.lines.map((l) => l.sku));
    const counts = await stockCounts([...hits.values()].map((h) => h.product._id));
    const shortfall = so.lines
      .map((l) => ({ sku: l.sku, name: l.name, wanted: l.quantity, available: (hits.get(l.sku) ? (counts.get(stockKey(hits.get(l.sku)!)) ?? 0) : 0) }))
      .filter((s) => s.available < s.wanted);
    await SalesOrderModel.updateOne({ _id: so._id, status: "APPROVED" }, { $set: { shortfall } });
    throw new StockShortError(shortfall);
  }

  /** Sell the held pieces and issue the invoice, together. The invoice's GST split is summed from the frozen price snapshots — it is never recomputed. */
  async function invoice(soId: string, actor: Actor): Promise<B2BInvoice> {
    const so = await orderOf(soId);
    if (so.status !== "ALLOCATED") throw new ConflictError(`Only an allocated order can be invoiced (this one is ${so.status.replace(/_/g, " ").toLowerCase()}).`);
    const now = clock();
    const ctx = await customerContext(String(so.customerId), now);
    const snaps = new Map((await PriceSnapshotModel.find({ _id: { $in: so.lines.map((l) => l.priceSnapshotId).filter(Boolean) } }).lean()).map((s) => [id(s._id), s]));
    const taxes = { supplyType: "INTRA_STATE" as "INTRA_STATE" | "INTER_STATE", cgst: 0, sgst: 0, igst: 0 };
    for (const line of so.lines) {
      const t = (snaps.get(id(line.priceSnapshotId))?.breakdown as { taxes: { supplyType: "INTRA_STATE" | "INTER_STATE"; cgst: number; sgst: number; igst: number } } | undefined)?.taxes;
      if (!t) throw new ConflictError(`Line ${line.sku} has no frozen price to invoice from.`);
      taxes.supplyType = t.supplyType;
      taxes.cgst += t.cgst * line.quantity;
      taxes.sgst += t.sgst * line.quantity;
      taxes.igst += t.igst * line.quantity;
    }
    if (taxes.cgst + taxes.sgst + taxes.igst !== so.totals.gst) throw new ConflictError("The invoice's GST does not match the order's — refusing to issue it.");

    const invoiceNo = await nextNo("INV");
    const issueDate = ctx.today;
    const dueDate = addDays(issueDate, ctx.profile.paymentTermsDays);
    const itemIds = so.allocations.flatMap((a) => a.itemIds.map(String));
    const created = await withInventoryTransaction(async (session) => {
      await postInSession(session, {
        type: "SALE",
        channel: "B2B",
        referenceType: "ORDER",
        referenceId: so.id,
        performedBy: actor.id,
        reason: `Invoiced ${invoiceNo} (${so.soNo})`,
        lines: itemIds.map((itemId) => ({ itemId, reservation: { referenceType: "ORDER", referenceId: so.id } })),
      });
      const [inv] = await InvoiceModel.create(
        [{ invoiceNo, salesOrderId: so._id, soNo: so.soNo, customerId: so.customerId, customerName: so.customerName, ...(ctx.customer.gstin ? { gstin: ctx.customer.gstin } : {}), issueDate, dueDate, lines: so.lines, totals: so.totals, taxes, shippingAddress: so.shippingAddress, createdBy: oid(actor.id) }],
        { session }
      );
      const moved = await moveSo(so._id, "INVOICED", ["ALLOCATED"], actor, { session, at: now, note: `Invoiced ${invoiceNo}`, set: { invoiceId: inv!._id } });
      if (!moved) throw new ConflictError("This order changed while it was being invoiced — please look again.");
      return inv!;
    });
    await audit(actor, AUDIT_ACTIONS.B2B_INVOICE_ISSUED, "Invoice", created.id, { invoiceNo, soNo: so.soNo, total: so.totals.total, dueDate });
    return invoiceView(created.toObject(), 0, [], ctx.today);
  }

  /** Cancel an order that hasn't been invoiced; anything it holds goes back on the shelf. */
  async function cancel(soId: string, actor: Actor, reason: string): Promise<B2BSalesOrder> {
    const so = await orderOf(soId);
    const moved = await moveSo(so._id, "CANCELLED", ["PENDING_CREDIT_APPROVAL", "APPROVED", "ALLOCATED"], actor, { at: clock(), note: `Cancelled: ${reason}` });
    if (!moved) throw new ConflictError("An invoiced or already cancelled order can't be cancelled.");
    const held = await InventoryItemModel.find({ status: "RESERVED", "reservation.referenceId": so._id }).select("_id").lean();
    if (held.length) await releaseItems({ performedBy: actor.id, channel: "B2B" }, { itemIds: held.map((h) => String(h._id)), referenceId: so.id, referenceType: "ORDER", reason: `${so.soNo} cancelled` });
    await audit(actor, AUDIT_ACTIONS.B2B_ORDER_CANCELLED, "SalesOrder", so.id, { soNo: so.soNo, reason, hadStock: held.length });
    return salesOrderView(moved.toObject());
  }

  return { allocate, invoice, cancel };
}
export type FulfilmentService = ReturnType<typeof createFulfilmentService>;
