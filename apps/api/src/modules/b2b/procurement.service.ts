import { Types } from "mongoose";
import type { B2BCartQuote, B2BLine, B2BPurchaseOrder, B2BQuotation, B2BSalesOrder, CreditCheck } from "@jewellery/types";
import type { CreatePurchaseOrderInput, QuoteInput } from "@jewellery/validation";
import { AuthorizationError, ConflictError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { CustomerModel } from "../customers/customer.model";
import { withInventoryTransaction } from "../inventory/inventory-transaction.service";
import type { MediaService } from "../media/media.service";
import { PriceSnapshotModel } from "../orders/price-snapshot.model";
import { ProductCategoryModel } from "../catalog/product-category.model";
import { OrderBlockedError, CreditBlockedError, QuotationExpiredError } from "./b2b.errors";
import { AUDIT_ACTIONS as A } from "../audit/audit.service";
import { PurchaseOrderModel, QuotationModel, SalesOrderModel, type LineAttrs, type PurchaseOrderDocument, type QuotationDocument, type SalesOrderDocument } from "./b2b.models";
import { catalogueItem, creditFor, customerContext, lineOf, priceFor, resolveRows, resolvedView, totalsOf, type CustomerContext, type Resolved } from "./b2b-core";
import { applyPo, applyQuotation, applySo, audit, entry, nextNo, oid, type Actor } from "./b2b-store";
import { lineView, poView, quotationView, salesOrderView } from "./b2b-views";
import { checkCredit } from "./credit";
import { checkPoAction, checkQuotationAction, checkSoAction } from "./b2b-status";

const DAY_MS = 86_400_000;
const REVIEWABLE = ["SUBMITTED", "UNDER_REVIEW"] as const;
const id = (v: unknown) => String(v);

/**
 * Purchase orders, quotations, negotiation and the sales order. The buyer's side is scoped to ONE customer at every query; the
 * seller's side acts on any. The credit rule is enforced where an order becomes a commitment (`commitSalesOrder`), inside the
 * same transaction that serialises a customer's approvals — the portal only ever displays it.
 */
export function createProcurementService(deps: { media: MediaService; now?: () => Date }) {
  const { media } = deps;
  const clock = deps.now ?? (() => new Date());

  const addressAt = (ctx: CustomerContext, index?: number) => {
    const list = ctx.customer.shippingAddresses;
    if (index === undefined) return list[0] ?? ctx.customer.billingAddress;
    const a = list[index];
    if (!a) throw new DomainValidationError("Choose one of your saved shipping addresses.");
    return a;
  };

  async function displayNames() {
    const cats = await ProductCategoryModel.find({}).select("name").lean();
    return new Map(cats.map((c) => [id(c._id), c.name]));
  }

  // ---- the buyer: pricing a cart, creating and editing POs -------------------------------------------------
  async function quoteCart(customerId: string, input: { rows: { sku: string; quantity: number }[]; shippingAddressIndex?: number }): Promise<B2BCartQuote> {
    const ctx = await customerContext(customerId, clock());
    const state = addressAt(ctx, input.shippingAddressIndex)?.state ?? undefined;
    const resolved = await resolveRows(ctx, input.rows, state);
    const cats = await displayNames();
    const lines = resolved.map((r) => resolvedView(r, r.hit ? catalogueItem(r.hit, r.price!, r.available, { category: r.hit.product.categoryId ? cats.get(id(r.hit.product.categoryId)) : undefined, metal: ctx.world.metals.get(id(r.hit.product.metalId))?.name }, media) : undefined));
    const priced = lines.filter((l) => l.lineTotal !== null);
    const totals = { taxable: priced.reduce((s, l) => s + l.lineTaxable!, 0), gst: priced.reduce((s, l) => s + l.lineGst!, 0), total: priced.reduce((s, l) => s + l.lineTotal!, 0), complete: priced.length === lines.length };
    const credit = checkCredit(await creditFor(customerId, ctx), totals.total);
    return { lines, totals, credit, canSubmit: lines.length > 0 && !lines.some((l) => l.problems.some((p) => p.blocking)), quotedAt: ctx.now.toISOString() };
  }

  /** Price the lines and refuse what can't be ordered. Stock and price-on-request are not blocking: a wholesale PO may ask for more than is on the shelf, and the seller quotes the rest. */
  async function buildPo(ctx: CustomerContext, rows: { sku: string; quantity: number }[], address: NonNullable<ReturnType<typeof addressAt>>) {
    const resolved = await resolveRows(ctx, rows, address.state);
    if (resolved.some((r) => r.problems.some((p) => p.blocking))) throw new OrderBlockedError(resolved.map((r) => resolvedView(r)));
    const lines = resolved.map((r) => lineOf(r));
    const totals = totalsOf(lines);
    const credit = checkCredit(await creditFor(ctx.customer.id, ctx), totals.total);
    return { lines: lines as unknown as LineAttrs[], totals, credit };
  }

  async function createPurchaseOrder(customerId: string, actor: Actor, input: CreatePurchaseOrderInput): Promise<B2BPurchaseOrder> {
    const now = clock();
    const ctx = await customerContext(customerId, now);
    const address = addressAt(ctx, input.shippingAddressIndex);
    if (!address) throw new DomainValidationError("Add a shipping address to your account first.");
    const built = await buildPo(ctx, input.lines, address);
    const status = input.submit ? "SUBMITTED" : "DRAFT";
    const doc = await PurchaseOrderModel.create({
      poNo: await nextNo("BPO"),
      customerId: oid(customerId),
      customerName: ctx.customer.name,
      ...(input.customerPoRef ? { customerPoRef: input.customerPoRef } : {}),
      status,
      lines: built.lines.map((l) => ({ ...l, productId: oid(String(l.productId)), ...(l.variantId ? { variantId: oid(String(l.variantId)) } : {}) })),
      totals: built.totals,
      shippingAddress: address,
      billingAddress: ctx.customer.billingAddress ?? address,
      attachments: [],
      ...(input.notes ? { notes: input.notes } : {}),
      ...(input.requestedDeliveryDate ? { requestedDeliveryDate: input.requestedDeliveryDate } : {}),
      credit: built.credit,
      ...(input.submit ? { submittedAt: now } : {}),
      history: [entry(status, actor, now, input.submit ? "Submitted for review" : "Saved as a draft")],
    });
    return poView(doc.toObject());
  }

  const ownPo = async (customerId: string, poId: string): Promise<PurchaseOrderDocument> => {
    if (!Types.ObjectId.isValid(poId)) throw new NotFoundError("Purchase order", poId);
    const po = await PurchaseOrderModel.findOne({ _id: poId, customerId });
    if (!po) throw new NotFoundError("Purchase order", poId);
    return po;
  };

  async function updateDraft(customerId: string, poId: string, actor: Actor, input: CreatePurchaseOrderInput): Promise<B2BPurchaseOrder> {
    const po = await ownPo(customerId, poId);
    if (po.status !== "DRAFT") throw new ConflictError("Only a draft can be edited.");
    const now = clock();
    const ctx = await customerContext(customerId, now);
    const address = addressAt(ctx, input.shippingAddressIndex);
    if (!address) throw new DomainValidationError("Add a shipping address to your account first.");
    const built = await buildPo(ctx, input.lines, address);
    const updated = await PurchaseOrderModel.findOneAndUpdate(
      { _id: po._id, status: "DRAFT" },
      { $set: { lines: built.lines.map((l) => ({ ...l, productId: oid(String(l.productId)), ...(l.variantId ? { variantId: oid(String(l.variantId)) } : {}) })), totals: built.totals, shippingAddress: address, credit: built.credit, customerPoRef: input.customerPoRef, notes: input.notes, requestedDeliveryDate: input.requestedDeliveryDate } },
      { new: true }
    );
    if (!updated) throw new ConflictError("This purchase order changed — please reload it.");
    if (input.submit) return submitPurchaseOrder(customerId, poId, actor);
    return poView(updated.toObject());
  }

  /** DRAFT → SUBMITTED, re-priced and re-checked now: a draft saved last week must not be submitted at last week's prices. */
  async function submitPurchaseOrder(customerId: string, poId: string, actor: Actor): Promise<B2BPurchaseOrder> {
    const po = await ownPo(customerId, poId);
    if (po.status !== "DRAFT") throw new ConflictError("Only a draft can be submitted.");
    const now = clock();
    const ctx = await customerContext(customerId, now);
    const built = await buildPo(ctx, po.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })), po.shippingAddress);
    const moved = await applyPo(po._id, "submit", actor, {
      at: now,
      note: "Submitted for review",
      set: { lines: built.lines.map((l) => ({ ...l, productId: oid(String(l.productId)), ...(l.variantId ? { variantId: oid(String(l.variantId)) } : {}) })), totals: built.totals, credit: built.credit, submittedAt: now },
    });
    if (!moved) throw new ConflictError("This purchase order changed — please reload it.");
    return poView(moved.toObject());
  }

  // ---- withdrawing, rejecting -------------------------------------------------------------------------------
  /** Close every quotation still open on a PO that has just ended (a draft is discarded, a live one is rejected). */
  async function closeQuotations(poId: Types.ObjectId, session?: import("mongoose").ClientSession) {
    for (const q of await QuotationModel.find({ purchaseOrderId: poId, status: { $in: ["DRAFT", "QUOTED", "NEGOTIATION"] } }).session(session ?? null)) {
      await applyQuotation(q._id, q.status === "DRAFT" ? "discard" : "decline", session ? { session } : {});
    }
  }

  /** The customer withdraws a PO (or the seller cancels one that was approved but never converted). Audited either way. */
  async function cancelPurchaseOrder(po: PurchaseOrderDocument, actor: Actor, reason?: string): Promise<B2BPurchaseOrder> {
    const moved = await applyPo(po._id, "cancel", actor, { note: reason ? `Cancelled: ${reason}` : "Cancelled" });
    if (!moved) throw new ConflictError("This purchase order changed — please look again.");
    await closeQuotations(po._id);
    await audit(actor, A.B2B_PO_CANCELLED, "PurchaseOrder", po.id, { poNo: po.poNo, from: po.status, reason, by: actor.kind });
    return poView(moved.toObject());
  }
  const cancelOwnPurchaseOrder = async (customerId: string, poId: string, actor: Actor, reason?: string) => cancelPurchaseOrder(await ownPo(customerId, poId), actor, reason);

  // ---- the sales order: where credit is enforced -------------------------------------------------------------
  /**
   * Convert an APPROVED PO into a sales order — the moment an order becomes a commitment. The customer document is written first, so
   * two conversions for one credit limit conflict and the loser re-reads the winner's commitment. Within terms (or overridden) the
   * order is CONFIRMED; otherwise it is created as a DRAFT and held until credit is approved.
   */
  async function commitSalesOrder(a: { ctx: CustomerContext; po: PurchaseOrderDocument; quotation?: QuotationDocument; actor: Actor; override?: { reason: string } }): Promise<SalesOrderDocument> {
    const { ctx, po } = a;
    if (!po.approved?.lines?.length) throw new ConflictError("This purchase order has no approved terms to convert.");
    const lines = po.approved.lines;
    const now = clock();
    const soId = new Types.ObjectId();
    const totals = totalsOf(lines);
    const soNo = await nextNo("SO");
    let overrideUsed: CreditCheck | undefined;

    const so = await withInventoryTransaction(async (session) => {
      await CustomerModel.updateOne({ _id: po.customerId }, { $inc: { creditSeq: 1 } }, { session });
      const check = checkCredit(await creditFor(po.customerId, ctx, session), totals.total);
      const held = check.requiresApproval && !a.override;
      overrideUsed = check.requiresApproval && a.override ? check : undefined;
      const status = held ? "DRAFT" : "CONFIRMED";
      const [created] = await SalesOrderModel.create(
        [
          {
            _id: soId,
            soNo,
            purchaseOrderId: po._id,
            poNo: po.poNo,
            ...(po.customerPoRef ? { customerPoRef: po.customerPoRef } : {}),
            ...(a.quotation ? { quotationId: a.quotation._id } : {}),
            customerId: po.customerId,
            customerName: po.customerName,
            status,
            lines,
            totals,
            shippingAddress: po.shippingAddress,
            billingAddress: po.billingAddress,
            credit: { check, ...(check.requiresApproval && a.override ? { override: { reason: a.override.reason, at: now, byId: oid(a.actor.id), byName: a.actor.name } } : {}) },
            history: [entry(status, a.actor, now, held ? "Held for credit approval" : check.requiresApproval ? `Confirmed with credit override: ${a.override!.reason}` : "Confirmed")],
          },
        ],
        { session }
      );
      const moved = await applyPo(po._id, "convert", a.actor, { session, at: now, note: `Converted to ${soNo}`, set: { salesOrderId: soId } });
      if (!moved) throw new ConflictError("This purchase order changed while it was being converted — please look again.");
      if (a.quotation) await applyQuotation(a.quotation._id, "convert", { session });
      return created!;
    });
    if (overrideUsed) await audit(a.actor, A.B2B_CREDIT_OVERRIDDEN, "SalesOrder", so.id, { soNo, reason: a.override!.reason, exposureAfter: overrideUsed.exposureAfter, limit: overrideUsed.position.limit, reasons: overrideUsed.reasons.map((r) => r.code) });
    if (so.status === "CONFIRMED") await audit(a.actor, A.B2B_ORDER_CONFIRMED, "SalesOrder", so.id, { soNo, total: totals.total, override: !!overrideUsed });
    return so;
  }

  async function convertPurchaseOrder(poId: string, actor: Actor, opts: { creditOverride?: { reason: string }; canOverrideCredit: boolean }): Promise<B2BSalesOrder> {
    if (opts.creditOverride && !opts.canOverrideCredit) throw new AuthorizationError("Overriding a credit limit needs the credit-override permission.");
    const po = await anyPo(poId);
    checkPoAction("convert", po.status); // a clear 409 before any work
    const ctx = await customerContext(String(po.customerId), clock());
    const quotation = po.approved?.via === "QUOTATION" && po.quotationId ? await QuotationModel.findById(po.quotationId) : null;
    const so = await commitSalesOrder({ ctx, po, actor, ...(quotation ? { quotation } : {}), ...(opts.creditOverride ? { override: opts.creditOverride } : {}) });
    return salesOrderView(so.toObject());
  }

  // ---- quotations (the customer's answers) --------------------------------------------------------------------
  const ownQuotation = async (customerId: string, quoteId: string): Promise<QuotationDocument> => {
    if (!Types.ObjectId.isValid(quoteId)) throw new NotFoundError("Quotation", quoteId);
    const q = await QuotationModel.findOne({ _id: quoteId, customerId });
    if (!q) throw new NotFoundError("Quotation", quoteId);
    return q;
  };
  const poOf = async (q: { purchaseOrderId: Types.ObjectId }) => (await PurchaseOrderModel.findById(q.purchaseOrderId))!;

  /** The customer accepts: the quotation and the PO become APPROVED at exactly the quoted prices. The seller then converts it into a sales order. */
  async function acceptQuotation(customerId: string, quoteId: string, actor: Actor): Promise<B2BPurchaseOrder> {
    const q = await ownQuotation(customerId, quoteId);
    if (q.status === "EXPIRED") throw new QuotationExpiredError();
    checkQuotationAction("accept", q.status);
    if (q.validUntil <= clock()) {
      await expireStale();
      throw new QuotationExpiredError();
    }
    const po = await poOf(q);
    if (String(po.quotationId) !== q._id.toString()) throw new ConflictError("This quotation has been replaced by a newer one.");
    const now = clock();
    const approvedPo = await withInventoryTransaction(async (session) => {
      const acc = await applyQuotation(q._id, "accept", { session });
      if (!acc) throw new ConflictError("This quotation changed — please look again.");
      const moved = await applyPo(po._id, "accept", actor, { session, at: now, note: `Quotation ${q.quoteNo} accepted`, set: { approved: { lines: q.lines, totals: q.totals, approvedAt: now, approvedByName: actor.name, via: "QUOTATION" } } });
      if (!moved) throw new ConflictError("This purchase order changed — please look again.");
      return moved;
    });
    await audit(actor, A.B2B_QUOTATION_APPROVED, "Quotation", q.id, { quoteNo: q.quoteNo, poNo: po.poNo, total: q.totals.total });
    await audit(actor, A.B2B_PO_APPROVED, "PurchaseOrder", po.id, { poNo: po.poNo, via: "QUOTATION", total: q.totals.total, by: "CUSTOMER" });
    return poView(approvedPo.toObject());
  }

  async function counterQuotation(customerId: string, quoteId: string, actor: Actor, input: { message: string; requestedPrices?: { sku: string; unitTaxable: number }[] }): Promise<B2BQuotation> {
    const q = await ownQuotation(customerId, quoteId);
    if (q.status === "EXPIRED") throw new QuotationExpiredError();
    checkQuotationAction("counter", q.status);
    const now = clock();
    if (q.validUntil <= now) throw new QuotationExpiredError();
    const updated = await withInventoryTransaction(async (session) => {
      const u = await applyQuotation(q._id, "counter", { session, push: { messages: { by: "CUSTOMER", at: now, text: input.message, ...(input.requestedPrices?.length ? { requestedPrices: input.requestedPrices } : {}) } } });
      if (!u) throw new ConflictError("This quotation changed — please look again.");
      if (!(await applyPo(q.purchaseOrderId, "counter", actor, { session, at: now, note: "Customer asked for a revision" }))) throw new ConflictError("This purchase order changed — please look again.");
      return u;
    });
    const po = await poOf(q);
    await audit(actor, A.B2B_QUOTATION_COUNTERED, "Quotation", q.id, { quoteNo: q.quoteNo, poNo: po.poNo, requestedPrices: input.requestedPrices, message: input.message });
    return quotationView(updated.toObject(), { poNo: po.poNo, customerName: po.customerName, now });
  }

  async function declineQuotation(customerId: string, quoteId: string, actor: Actor, reason?: string): Promise<B2BQuotation> {
    const q = await ownQuotation(customerId, quoteId);
    checkQuotationAction("decline", q.status);
    const updated = await withInventoryTransaction(async (session) => {
      const u = await applyQuotation(q._id, "decline", { session, push: { messages: { by: "CUSTOMER", at: clock(), text: reason ? `Declined: ${reason}` : "Declined" } } });
      if (!u) throw new ConflictError("This quotation changed — please look again.");
      if (!(await applyPo(q.purchaseOrderId, "decline", actor, { session, note: reason ? `Customer declined the quotation: ${reason}` : "Customer declined the quotation" }))) throw new ConflictError("This purchase order changed — please look again.");
      return u;
    });
    const po = await poOf(q);
    await audit(actor, A.B2B_QUOTATION_REJECTED, "Quotation", q.id, { quoteNo: q.quoteNo, poNo: po.poNo, reason, by: "CUSTOMER" });
    await audit(actor, A.B2B_PO_REJECTED, "PurchaseOrder", po.id, { poNo: po.poNo, reason, by: "CUSTOMER" });
    return quotationView(updated.toObject(), { poNo: po.poNo, customerName: po.customerName, now: clock() });
  }

  /** Quotations whose validity has run out become EXPIRED, and so does the PO that was waiting on them. Idempotent; called on reads and on a timer. */
  async function expireStale(now: Date = clock()): Promise<number> {
    const stale = await QuotationModel.find({ status: { $in: ["QUOTED", "NEGOTIATION"] }, validUntil: { $lte: now } });
    let n = 0;
    for (const q of stale) {
      const done = await withInventoryTransaction(async (session) => {
        const e = await applyQuotation(q._id, "expire", { session });
        if (!e) return false;
        const po = await PurchaseOrderModel.findById(q.purchaseOrderId).session(session);
        if (po && String(po.quotationId) === q._id.toString() && (po.status === "QUOTED" || po.status === "NEGOTIATION")) await applyPo(po._id, "expire", "SYSTEM", { session, at: now, note: `Quotation ${q.quoteNo} expired` });
        return true;
      });
      if (done) {
        n++;
        await audit({ id: "000000000000000000000000", name: "System", kind: "SELLER" }, A.B2B_QUOTATION_EXPIRED, "Quotation", q.id, { quoteNo: q.quoteNo, validUntil: q.validUntil.toISOString() });
      }
    }
    return n;
  }

  // ---- the seller's side -------------------------------------------------------------------------------------
  const anyPo = async (poId: string): Promise<PurchaseOrderDocument> => {
    if (!Types.ObjectId.isValid(poId)) throw new NotFoundError("Purchase order", poId);
    const po = await PurchaseOrderModel.findById(poId);
    if (!po) throw new NotFoundError("Purchase order", poId);
    return po;
  };

  async function startReview(poId: string, actor: Actor): Promise<B2BPurchaseOrder> {
    const po = await anyPo(poId);
    const moved = await applyPo(po._id, "startReview", actor, { note: "Review started", set: { reviewerId: oid(actor.id) } });
    if (!moved) throw new ConflictError("This purchase order changed — please look again.");
    await audit(actor, A.B2B_PO_REVIEW_STARTED, "PurchaseOrder", po.id, { poNo: po.poNo });
    return poView(moved.toObject());
  }

  async function rejectPurchaseOrder(poId: string, actor: Actor, reason: string): Promise<B2BPurchaseOrder> {
    const po = await anyPo(poId);
    const moved = await applyPo(po._id, "reject", actor, { note: `Rejected: ${reason}` });
    if (!moved) throw new ConflictError("This purchase order changed — please look again.");
    await closeQuotations(po._id);
    await audit(actor, A.B2B_PO_REJECTED, "PurchaseOrder", po.id, { poNo: po.poNo, from: po.status, reason, by: "SELLER" });
    return poView(moved.toObject());
  }

  /**
   * Approve as asked, at today's price for this customer, with no quotation. Approval fixes the agreed terms (each line frozen as a
   * price snapshot) — it does not yet commit stock or credit: that is the conversion to a sales order. A price-on-request line
   * needs a quotation instead.
   */
  async function approvePurchaseOrder(poId: string, actor: Actor, note?: string): Promise<B2BPurchaseOrder> {
    const po = await anyPo(poId);
    checkPoAction("approve", po.status);
    const now = clock();
    const ctx = await customerContext(String(po.customerId), now);
    const resolved = await resolveRows(ctx, po.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })), po.shippingAddress.state);
    if (resolved.some((r) => r.problems.some((p) => p.blocking))) throw new OrderBlockedError(resolved.map((r) => resolvedView(r)));
    const unpriced = resolved.filter((r) => r.price?.status !== "AVAILABLE");
    if (unpriced.length) throw new DomainValidationError(`${unpriced.map((r) => r.sku).join(", ")} ${unpriced.length === 1 ? "has" : "have"} no price — issue a quotation instead.`);
    const lines = resolved.map((r) => lineOf(r)) as unknown as LineAttrs[];
    const approved = await withInventoryTransaction(async (session) => {
      const snaps = await PriceSnapshotModel.create(
        resolved.map((r) => {
          const ev = r.priced!.evidence!;
          return { orderId: po._id, documentType: "B2B_APPROVAL", productId: r.hit!.product._id, ...(r.hit!.variant ? { variantId: r.hit!.variant._id } : {}), sku: r.sku, computedAt: new Date(ev.computedAt), inputs: ev.inputs, breakdown: ev.breakdown, unitTotal: ev.breakdown.finalAmount };
        }),
        { session, ordered: true }
      );
      const withSnaps = lines.map((l, i) => ({ ...l, priceSnapshotId: snaps[i]!._id }));
      const moved = await applyPo(po._id, "approve", actor, { session, at: now, note: note ? `Approved: ${note}` : "Approved as requested", set: { approved: { lines: withSnaps, totals: totalsOf(lines), approvedAt: now, approvedByName: actor.name, via: "DIRECT" } } });
      if (!moved) throw new ConflictError("This purchase order changed — please look again.");
      return moved;
    });
    await audit(actor, A.B2B_PO_APPROVED, "PurchaseOrder", po.id, { poNo: po.poNo, via: "DIRECT", total: totalsOf(lines).total, note, by: "SELLER" });
    return poView(approved.toObject());
  }

  /** Confirm an order that was held for credit. Within terms now: no override needed. Still over: only the credit-override permission, with a reason, and it is audited. */
  async function approveCredit(soId: string, actor: Actor, opts: { reason: string; canOverrideCredit: boolean }): Promise<B2BSalesOrder> {
    if (!Types.ObjectId.isValid(soId)) throw new NotFoundError("Sales order", soId);
    const existing = await SalesOrderModel.findById(soId);
    if (!existing) throw new NotFoundError("Sales order", soId);
    checkSoAction("confirm", existing.status);
    const ctx = await customerContext(String(existing.customerId), clock());
    let usedOverride: CreditCheck | undefined;
    const confirmed = await withInventoryTransaction(async (session) => {
      await CustomerModel.updateOne({ _id: existing.customerId }, { $inc: { creditSeq: 1 } }, { session });
      const check = checkCredit(await creditFor(existing.customerId, ctx, session), existing.totals.total);
      if (check.requiresApproval && !opts.canOverrideCredit) throw new CreditBlockedError(check);
      usedOverride = check.requiresApproval ? check : undefined;
      const moved = await applySo(existing._id, "confirm", actor, {
        session,
        at: clock(),
        note: check.requiresApproval ? `Credit override: ${opts.reason}` : `Credit position now within terms: ${opts.reason}`,
        set: { "credit.check": check, ...(check.requiresApproval ? { "credit.override": { reason: opts.reason, at: clock(), byId: oid(actor.id), byName: actor.name } } : {}) },
      });
      if (!moved) throw new ConflictError("This order changed — please look again.");
      return moved;
    });
    if (usedOverride) await audit(actor, A.B2B_CREDIT_OVERRIDDEN, "SalesOrder", confirmed.id, { soNo: confirmed.soNo, reason: opts.reason, exposureAfter: usedOverride.exposureAfter, limit: usedOverride.position.limit, reasons: usedOverride.reasons.map((r) => r.code) });
    await audit(actor, A.B2B_ORDER_CONFIRMED, "SalesOrder", confirmed.id, { soNo: confirmed.soNo, total: confirmed.totals.total, override: !!usedOverride, reason: opts.reason });
    return salesOrderView(confirmed.toObject());
  }

  /** A concession is the only hand-entered part of a price; GST and rounding stay the engine's. Returns the resulting price, the standard price it departs from, and how it was entered. */
  function withConcession(ctx: CustomerContext, r: Resolved, c: QuoteInput["lines"][number] | undefined, state: string | undefined): { r: Resolved; concession?: B2BLine["concession"]; listUnit?: number } {
    const hit = r.hit!;
    const base = priceFor(ctx, hit, state, undefined, { ignorePolicy: true });
    const listUnit = base.price.status === "AVAILABLE" ? base.price.unitTaxable : undefined;
    const keep = (p: typeof base) => ({ ...r, price: p.price, ...(p.priced ? { priced: p.priced } : {}) });
    if (c?.discountPercent) {
      const p = priceFor(ctx, hit, state, { type: "PERCENTAGE", value: c.discountPercent, appliesTo: "TOTAL" }, { ignorePolicy: true });
      return { r: keep(p), concession: { kind: "PERCENT", value: c.discountPercent, note: c.note, ...(listUnit !== undefined ? { listUnitTaxable: listUnit } : {}) }, ...(listUnit !== undefined ? { listUnit } : {}) };
    }
    if (c?.unitTaxable !== undefined) {
      const subtotal = base.priced?.evidence?.breakdown.subtotal;
      if (base.price.status !== "AVAILABLE" || subtotal === undefined) return { r: keep(base) };
      const flat = subtotal - c.unitTaxable;
      if (flat < 0) throw new DomainValidationError(`${r.sku}: a target price above the standard price isn't a concession.`);
      const p = flat === 0 ? base : priceFor(ctx, hit, state, { type: "FLAT", value: flat }, { ignorePolicy: true });
      return { r: keep(p), concession: { kind: "TARGET_PRICE", value: c.unitTaxable, note: c.note, ...(listUnit !== undefined ? { listUnitTaxable: listUnit } : {}) }, ...(listUnit !== undefined ? { listUnit } : {}) };
    }
    return { r: keep(base), ...(listUnit !== undefined ? { listUnit } : {}) };
  }

  /**
   * Prepare a quotation for a PO: prices fixed now for `validDays`, each line frozen as a price snapshot. `issue: false` saves it as
   * a DRAFT (nothing is sent, the PO doesn't move); issuing supersedes any earlier version and moves the PO to QUOTED. Every
   * concession — a percentage off (a discount) or a target price (a price override) — needs a reason and is audited with the
   * standard price it departs from.
   */
  async function issueQuotation(poId: string, actor: Actor, input: QuoteInput): Promise<B2BQuotation> {
    const po = await anyPo(poId);
    checkPoAction("quote", po.status);
    const now = clock();
    const ctx = await customerContext(String(po.customerId), now);
    const state = po.shippingAddress.state;
    const base = await resolveRows(ctx, po.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })), state, { ignorePolicy: true });
    if (base.some((r) => r.problems.some((p) => p.blocking))) throw new OrderBlockedError(base.map((r) => resolvedView(r)));
    const concessions = new Map(input.lines.map((l) => [l.sku.trim().toUpperCase(), l]));
    for (const sku of concessions.keys()) if (!base.some((r) => r.sku === sku)) throw new DomainValidationError(`${sku} isn't on this purchase order.`);

    const built = base.map((r) => withConcession(ctx, r, concessions.get(r.sku), state));
    const unpriced = built.filter((b) => b.r.price?.status !== "AVAILABLE");
    if (unpriced.length) throw new DomainValidationError(`Can't quote ${unpriced.map((b) => b.r.sku).join(", ")}: the product has no price data (weight, stone value, metal rate or rule). Complete it in the catalogue first.`);
    const quoteId = new Types.ObjectId();
    const lines = built.map((b) => lineOf(b.r, b.concession)) as unknown as LineAttrs[];
    const totals = totalsOf(lines);
    const version = (await QuotationModel.countDocuments({ purchaseOrderId: po._id })) + 1;
    const quoteNo = await nextNo("QT");
    const status = input.issue ? "QUOTED" : "DRAFT";

    const q = await withInventoryTransaction(async (session) => {
      const snaps = await PriceSnapshotModel.create(
        built.map((b) => {
          const ev = b.r.priced!.evidence!;
          return { orderId: quoteId, documentType: "B2B_QUOTATION", productId: b.r.hit!.product._id, ...(b.r.hit!.variant ? { variantId: b.r.hit!.variant._id } : {}), sku: b.r.sku, computedAt: new Date(ev.computedAt), inputs: ev.inputs, breakdown: ev.breakdown, unitTotal: ev.breakdown.finalAmount };
        }),
        { session, ordered: true }
      );
      if (input.issue) for (const old of await QuotationModel.find({ purchaseOrderId: po._id, status: { $in: ["QUOTED", "NEGOTIATION"] } }).session(session)) await applyQuotation(old._id, "supersede", { session });
      const [created] = await QuotationModel.create(
        [{ _id: quoteId, quoteNo, purchaseOrderId: po._id, customerId: po.customerId, version, status, lines: lines.map((l, i) => ({ ...l, priceSnapshotId: snaps[i]!._id })), totals, validUntil: new Date(now.getTime() + input.validDays * DAY_MS), ...(input.terms ? { terms: input.terms } : {}), messages: input.message ? [{ by: "SELLER", at: now, text: input.message }] : [], issuedAt: now, issuedBy: oid(actor.id) }],
        { session }
      );
      if (input.issue) {
        const moved = await applyPo(po._id, "quote", actor, { session, at: now, note: version === 1 ? `Quotation ${quoteNo} issued` : `Quotation ${quoteNo} (revision ${version}) issued`, set: { quotationId: quoteId } });
        if (!moved) throw new ConflictError("This purchase order changed while the quotation was being prepared — please look again.");
      }
      return created!;
    });
    await audit(actor, A.B2B_QUOTATION_ISSUED, "Quotation", q.id, { quoteNo, poNo: po.poNo, version, total: totals.total, status });
    for (const b of built) {
      const c = b.concession;
      if (!c) continue;
      const line = lines.find((l) => l.sku === b.r.sku)!;
      const detail = { quoteNo, poNo: po.poNo, sku: b.r.sku, quantity: line.quantity, standardUnitTaxable: c.listUnitTaxable, agreedUnitTaxable: line.unitTaxable, reason: c.note };
      await audit(actor, c.kind === "PERCENT" ? A.B2B_DISCOUNT_APPLIED : A.B2B_PRICE_OVERRIDE, "Quotation", q.id, c.kind === "PERCENT" ? { ...detail, discountPercent: c.value, discountPerUnit: (c.listUnitTaxable ?? line.unitTaxable) - line.unitTaxable } : { ...detail, targetUnitTaxable: c.value });
    }
    return quotationView(q.toObject(), { poNo: po.poNo, customerName: po.customerName, now });
  }

  /** Send a saved DRAFT quotation to the customer. */
  async function issueDraftQuotation(quoteId: string, actor: Actor): Promise<B2BQuotation> {
    if (!Types.ObjectId.isValid(quoteId)) throw new NotFoundError("Quotation", quoteId);
    const q = await QuotationModel.findById(quoteId);
    if (!q) throw new NotFoundError("Quotation", quoteId);
    checkQuotationAction("issue", q.status);
    const po = await poOf(q);
    checkPoAction("quote", po.status);
    const now = clock();
    const issued = await withInventoryTransaction(async (session) => {
      for (const old of await QuotationModel.find({ purchaseOrderId: po._id, status: { $in: ["QUOTED", "NEGOTIATION"] } }).session(session)) await applyQuotation(old._id, "supersede", { session });
      // issuedAt was already fixed when the draft was written and is frozen from then on — issuing only moves the status.
      const u = await applyQuotation(q._id, "issue", { session });
      if (!u) throw new ConflictError("This quotation changed — please look again.");
      if (!(await applyPo(po._id, "quote", actor, { session, at: now, note: `Quotation ${q.quoteNo} issued`, set: { quotationId: q._id } }))) throw new ConflictError("This purchase order changed — please look again.");
      return u;
    });
    await audit(actor, A.B2B_QUOTATION_ISSUED, "Quotation", q.id, { quoteNo: q.quoteNo, poNo: po.poNo, version: q.version, total: q.totals.total, status: "QUOTED", fromDraft: true });
    return quotationView(issued.toObject(), { poNo: po.poNo, customerName: po.customerName, now });
  }
  async function discardDraftQuotation(quoteId: string, actor: Actor): Promise<B2BQuotation> {
    if (!Types.ObjectId.isValid(quoteId)) throw new NotFoundError("Quotation", quoteId);
    const q = await QuotationModel.findById(quoteId);
    if (!q) throw new NotFoundError("Quotation", quoteId);
    checkQuotationAction("discard", q.status);
    const u = await applyQuotation(q._id, "discard");
    if (!u) throw new ConflictError("This quotation changed — please look again.");
    const po = await poOf(q);
    await audit(actor, A.B2B_QUOTATION_REJECTED, "Quotation", q.id, { quoteNo: q.quoteNo, poNo: po.poNo, reason: "draft discarded", by: "SELLER" });
    return quotationView(u.toObject(), { poNo: po.poNo, customerName: po.customerName, now: clock() });
  }

  return { quoteCart, createPurchaseOrder, updateDraft, submitPurchaseOrder, cancelOwnPurchaseOrder, cancelPurchaseOrder, acceptQuotation, counterQuotation, declineQuotation, startReview, rejectPurchaseOrder, approvePurchaseOrder, convertPurchaseOrder, approveCredit, issueQuotation, issueDraftQuotation, discardDraftQuotation, expireStale, anyPo, ownPo, lineView };
}
export type ProcurementService = ReturnType<typeof createProcurementService>;
