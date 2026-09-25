import { Types } from "mongoose";
import type { B2BInvoice, B2BSalesOrder } from "@jewellery/types";
import { ConflictError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { postSalesInvoice } from "../accounting/sales-posting";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import { postInSession, withInventoryTransaction } from "../inventory/inventory-transaction.service";
import { releaseItems } from "../inventory/stock-operations";
import { isStockConflict } from "../orders/order-inventory";
import { PriceSnapshotModel } from "../orders/price-snapshot.model";
import { addDays } from "../dashboard/range";
import { StockShortError } from "./b2b.errors";
import { InvoiceModel, SalesOrderModel, type LineAttrs, type SalesOrderDocument } from "./b2b.models";
import { customerContext, lookupSkus, stockCounts, stockKey } from "./b2b-core";
import { applySo, audit, nextNo, oid, type Actor } from "./b2b-store";
import { checkSoAction, salesOrderStatusFor } from "./b2b-status";
import { invoiceView, salesOrderView } from "./b2b-views";

const MAX_PICK_ATTEMPTS = 3;
const id = (v: unknown) => String(v);

/** A line's amounts for `quantity` of it (the unit prices never change, so an invoice for part of a line is the unit price × the part). */
const plain = (l: LineAttrs): LineAttrs => (typeof (l as unknown as { toObject?: () => LineAttrs }).toObject === "function" ? (l as unknown as { toObject: () => LineAttrs }).toObject() : l);
export const scaleLine = (l: LineAttrs, quantity: number): LineAttrs => ({
  ...plain(l),
  quantity,
  lineMaking: l.unitMaking * quantity,
  lineDiscount: l.unitDiscount * quantity,
  lineTaxable: l.unitTaxable * quantity,
  lineGst: l.unitGst * quantity,
  lineTotal: l.unitTotal * quantity,
});
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** The numbers an order's status is derived from. */
const counts = (so: { lines: LineAttrs[]; allocations: { itemIds: unknown[] }[]; invoiced: { quantity: number }[] }) => ({
  total: sum(so.lines.map((l) => l.quantity)),
  allocated: sum(so.allocations.map((a) => a.itemIds.length)),
  invoiced: sum(so.invoiced.map((i) => i.quantity)),
});

/**
 * Stock allocation and invoicing, in as many parts as the shelf and the customer need. Allocation HOLDS specific pieces for the order
 * in the ledger (no expiry — a wholesale order waits for its invoice, not for a payment page) for as many lines as stock allows;
 * invoicing SELLS held pieces (ledger SALE tied to the order) and issues an invoice for exactly those, in one transaction, so a piece
 * is never sold without an invoice or invoiced without being sold. The order's status is DERIVED from the numbers
 * (`salesOrderStatusFor`) and every move is checked against the rule tables.
 */
export function createFulfilmentService(deps: { now?: () => Date }) {
  const clock = deps.now ?? (() => new Date());

  const orderOf = async (soId: string): Promise<SalesOrderDocument> => {
    if (!Types.ObjectId.isValid(soId)) throw new NotFoundError("Sales order", soId);
    const so = await SalesOrderModel.findById(soId);
    if (!so) throw new NotFoundError("Sales order", soId);
    return so;
  };
  const view = async (so: SalesOrderDocument) => {
    const invs = await InvoiceModel.find({ salesOrderId: so._id }).sort({ sequence: 1 }).select("invoiceNo totals.total").lean();
    return salesOrderView(so.toObject(), invs.map((i) => ({ id: id(i._id), invoiceNo: i.invoiceNo, total: i.totals.total })));
  };

  /** Up to `need` available, unreserved pieces of a design (or size), oldest first. */
  async function pickUpTo(line: LineAttrs, need: number): Promise<string[]> {
    const rows = await InventoryItemModel.find({ productId: line.productId, variantId: line.variantId ?? null, status: "AVAILABLE", type: "FINISHED_JEWELLERY", reservation: { $exists: false }, quantity: { $gt: 0 } })
      .sort({ createdAt: 1, _id: 1 })
      .limit(need)
      .select("_id")
      .lean();
    return rows.map((r) => id(r._id));
  }

  async function allocate(soId: string, actor: Actor): Promise<B2BSalesOrder> {
    const so = await orderOf(soId);
    checkSoAction("allocate", so.status);
    const held = (i: number) => so.allocations.find((a) => a.lineIndex === i)?.itemIds.length ?? 0;
    const sold = (i: number) => so.invoiced.find((x) => x.lineIndex === i)?.quantity ?? 0;
    const needs = so.lines.map((l, i) => Math.max(l.quantity - sold(i) - held(i), 0));
    if (!needs.some((n) => n > 0)) throw new ConflictError("Every line is already allocated or invoiced.");

    for (let attempt = 1; attempt <= MAX_PICK_ATTEMPTS; attempt++) {
      const picked: string[][] = [];
      for (const [i, l] of so.lines.entries()) picked.push(needs[i]! > 0 ? await pickUpTo(l, needs[i]!) : []);
      if (!picked.some((p) => p.length)) break;
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
          const allocations = so.lines.map((_, i) => ({ lineIndex: i, itemIds: [...(so.allocations.find((a) => a.lineIndex === i)?.itemIds ?? []), ...picked[i]!.map((x) => new Types.ObjectId(x))] })).filter((a) => a.itemIds.length);
          const target = salesOrderStatusFor(counts({ lines: so.lines, allocations, invoiced: so.invoiced }));
          const short = so.lines.flatMap((l, i) => (needs[i]! > picked[i]!.length ? [{ sku: l.sku, name: l.name, wanted: needs[i]!, available: picked[i]!.length }] : []));
          return applySo(so._id, "allocate", actor, { session, target, at: clock(), note: short.length ? "Stock partly allocated" : "Stock allocated", set: { allocations, allocatedAt: clock(), ...(short.length ? { shortfall: short } : {}) }, ...(short.length ? {} : { unset: ["shortfall"] }) });
        });
        if (!moved) throw new ConflictError("This order changed while it was being allocated — please look again.");
        await audit(actor, AUDIT_ACTIONS.B2B_ORDER_ALLOCATED, "SalesOrder", so.id, { soNo: so.soNo, pieces: picked.flat().length, status: moved.status });
        return view(moved);
      } catch (error) {
        if (!isStockConflict(error)) throw error; // someone took a piece between choosing and holding: choose again
      }
    }

    // Nothing at all could be allocated: say what is missing, line by line.
    const hits = await lookupSkus(so.lines.map((l) => l.sku));
    const stock = await stockCounts([...hits.values()].map((h) => h.product._id));
    const shortfall = so.lines.flatMap((l, i) => (needs[i]! > 0 ? [{ sku: l.sku, name: l.name, wanted: needs[i]!, available: hits.get(l.sku) ? (stock.get(stockKey(hits.get(l.sku)!)) ?? 0) : 0 }] : [])).filter((s) => s.available < s.wanted);
    await SalesOrderModel.updateOne({ _id: so._id, status: so.status }, { $set: { shortfall } });
    throw new StockShortError(shortfall);
  }

  /** Give back everything held and not yet invoiced; the order goes back to CONFIRMED. */
  async function release(soId: string, actor: Actor): Promise<B2BSalesOrder> {
    const so = await orderOf(soId);
    checkSoAction("release", so.status);
    const held = so.allocations.flatMap((a) => a.itemIds.map(String));
    const moved = await applySo(so._id, "release", actor, { note: "Allocation released", set: { allocations: [] } });
    if (!moved) throw new ConflictError("This order changed — please look again.");
    if (held.length) await releaseItems({ performedBy: actor.id, channel: "B2B" }, { itemIds: held, referenceId: so.id, referenceType: "ORDER", reason: `${so.soNo} allocation released` });
    return view(moved);
  }

  /**
   * Sell held pieces and issue an invoice for them. By default every held piece is invoiced; `lines` invoices only some
   * (never more than is held). The invoice's GST split is taken from the frozen snapshots, and asserted equal to the lines' GST.
   */
  async function invoice(soId: string, actor: Actor, only?: { lineIndex: number; quantity: number }[]): Promise<B2BInvoice> {
    const so = await orderOf(soId);
    checkSoAction("invoice", so.status);
    const now = clock();
    const ctx = await customerContext(String(so.customerId), now);

    const heldOf = (i: number) => so.allocations.find((a) => a.lineIndex === i)?.itemIds ?? [];
    const plan = so.lines.map((_, i) => ({ lineIndex: i, quantity: heldOf(i).length }));
    if (only) {
      for (const p of plan) p.quantity = 0;
      for (const o of only) {
        const row = plan[o.lineIndex];
        if (!row) throw new DomainValidationError(`There is no line ${o.lineIndex + 1} on this order.`);
        if (o.quantity > heldOf(o.lineIndex).length) throw new ConflictError(`Line ${o.lineIndex + 1} (${so.lines[o.lineIndex]!.sku}) has only ${heldOf(o.lineIndex).length} allocated piece(s) to invoice.`);
        row.quantity += o.quantity;
      }
    }
    const chosen = plan.filter((p) => p.quantity > 0);
    if (!chosen.length) throw new ConflictError("Nothing is allocated to invoice yet — allocate stock first.");

    const invLines = chosen.map((p) => scaleLine(so.lines[p.lineIndex]!, p.quantity));
    const snaps = new Map((await PriceSnapshotModel.find({ _id: { $in: invLines.map((l) => l.priceSnapshotId).filter(Boolean) } }).lean()).map((s) => [id(s._id), s]));
    const taxes = { supplyType: "INTRA_STATE" as "INTRA_STATE" | "INTER_STATE", cgst: 0, sgst: 0, igst: 0 };
    for (const l of invLines) {
      const t = (snaps.get(id(l.priceSnapshotId))?.breakdown as { taxes: { supplyType: "INTRA_STATE" | "INTER_STATE"; cgst: number; sgst: number; igst: number } } | undefined)?.taxes;
      if (!t) throw new ConflictError(`Line ${l.sku} has no frozen price to invoice from.`);
      taxes.supplyType = t.supplyType;
      taxes.cgst += t.cgst * l.quantity;
      taxes.sgst += t.sgst * l.quantity;
      taxes.igst += t.igst * l.quantity;
    }
    const totals = { taxable: sum(invLines.map((l) => l.lineTaxable)), gst: sum(invLines.map((l) => l.lineGst)), total: sum(invLines.map((l) => l.lineTotal)), complete: true };
    if (taxes.cgst + taxes.sgst + taxes.igst !== totals.gst) throw new ConflictError("The invoice's GST does not match its lines' — refusing to issue it.");

    const invoiceNo = await nextNo("INV");
    const issueDate = ctx.today;
    const dueDate = addDays(issueDate, ctx.profile.paymentTermsDays);
    const sequence = (await InvoiceModel.countDocuments({ salesOrderId: so._id })) + 1;
    const soldItems = chosen.flatMap((p) => heldOf(p.lineIndex).slice(0, p.quantity).map(String));

    const result = await withInventoryTransaction(async (session) => {
      await postInSession(session, {
        type: "SALE",
        channel: "B2B",
        referenceType: "ORDER",
        referenceId: so.id,
        performedBy: actor.id,
        reason: `Invoiced ${invoiceNo} (${so.soNo})`,
        lines: soldItems.map((itemId) => ({ itemId, reservation: { referenceType: "ORDER", referenceId: so.id } })),
      });
      const [inv] = await InvoiceModel.create(
        [{ invoiceNo, salesOrderId: so._id, soNo: so.soNo, customerId: so.customerId, customerName: so.customerName, ...(ctx.customer.gstin ? { gstin: ctx.customer.gstin } : {}), issueDate, dueDate, lines: invLines, totals, taxes, shippingAddress: so.shippingAddress, billingAddress: so.billingAddress, sequence, createdBy: oid(actor.id) }],
        { session }
      );
      // The accounting layer's one entry point for a completed sale — see accounting/sales-posting.ts.
      // Gross sales is pre-discount (lineTaxable already has the discount subtracted): grossSales = taxable + discount.
      await postSalesInvoice(session, {
        channel: "B2B",
        date: issueDate,
        invoiceId: inv!.id,
        invoiceNo,
        performedBy: actor.id,
        performedByName: actor.name,
        grossSales: sum(invLines.map((l) => l.lineTaxable + l.lineDiscount)),
        discount: sum(invLines.map((l) => l.lineDiscount)),
        gst: totals.gst,
        total: totals.total,
        soldItemIds: soldItems,
      });
      const allocations = so.lines.map((_, i) => ({ lineIndex: i, itemIds: heldOf(i).slice(chosen.find((c) => c.lineIndex === i)?.quantity ?? 0) })).filter((a) => a.itemIds.length);
      const invoiced = so.lines.map((_, i) => ({ lineIndex: i, quantity: (so.invoiced.find((x) => x.lineIndex === i)?.quantity ?? 0) + (chosen.find((c) => c.lineIndex === i)?.quantity ?? 0) })).filter((x) => x.quantity > 0);
      const target = salesOrderStatusFor(counts({ lines: so.lines, allocations, invoiced }));
      const moved = await applySo(so._id, "invoice", actor, { session, target, at: now, note: `Invoiced ${invoiceNo}`, set: { allocations, invoiced }, push: { invoiceIds: inv!._id } });
      if (!moved) throw new ConflictError("This order changed while it was being invoiced — please look again.");
      return inv!;
    });
    await audit(actor, AUDIT_ACTIONS.B2B_INVOICE_ISSUED, "Invoice", result.id, { invoiceNo, soNo: so.soNo, sequence, total: totals.total, dueDate, partial: invLines.length !== so.lines.length || invLines.some((l, i) => l.quantity !== so.lines[chosen[i]!.lineIndex]!.quantity) });
    return invoiceView(result.toObject(), 0, 0, [], ctx.today);
  }

  /** Cancel what has not been invoiced; anything held goes back on the shelf, and invoices already issued stand. Audited with the reason. */
  async function cancel(soId: string, actor: Actor, reason: string): Promise<B2BSalesOrder> {
    const so = await orderOf(soId);
    const held = so.allocations.flatMap((a) => a.itemIds.map(String));
    const moved = await applySo(so._id, "cancel", actor, { note: `Cancelled: ${reason}`, set: { allocations: [] } });
    if (!moved) throw new ConflictError("This order changed — please look again.");
    if (held.length) await releaseItems({ performedBy: actor.id, channel: "B2B" }, { itemIds: held, referenceId: so.id, referenceType: "ORDER", reason: `${so.soNo} cancelled` });
    await audit(actor, AUDIT_ACTIONS.B2B_ORDER_CANCELLED, "SalesOrder", so.id, { soNo: so.soNo, from: so.status, reason, releasedPieces: held.length, invoicedBefore: so.invoiceIds.length });
    return view(moved);
  }

  return { allocate, release, invoice, cancel, view };
}
export type FulfilmentService = ReturnType<typeof createFulfilmentService>;
