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
import { PurchaseOrderModel, QuotationModel, SalesOrderModel, type LineAttrs, type PurchaseOrderDocument, type QuotationDocument, type SalesOrderDocument } from "./b2b.models";
import { catalogueItem, creditFor, customerContext, lineOf, priceFor, resolveRows, resolvedView, totalsOf, type CustomerContext, type Resolved } from "./b2b-core";
import { audit, entry, movePo, moveSo, nextNo, oid, type Actor } from "./b2b-store";
import { lineView, poView, quotationView, salesOrderView } from "./b2b-views";
import { checkCredit } from "./credit";

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
    const moved = await movePo(po._id, "SUBMITTED", ["DRAFT"], actor, {
      at: now,
      note: "Submitted for review",
      set: { lines: built.lines.map((l) => ({ ...l, productId: oid(String(l.productId)), ...(l.variantId ? { variantId: oid(String(l.variantId)) } : {}) })), totals: built.totals, credit: built.credit, submittedAt: now },
    });
    if (!moved) throw new ConflictError("This purchase order changed — please reload it.");
    return poView(moved.toObject());
  }

  /** Withdrawing stops the PO and any quotation still open on it. Once it is APPROVED it is a sales order and is cancelled there. */
  async function cancelPurchaseOrder(po: PurchaseOrderDocument, actor: Actor, reason?: string): Promise<B2BPurchaseOrder> {
    const moved = await movePo(po._id, "CANCELLED", ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATING"], actor, { note: reason ? `Cancelled: ${reason}` : "Cancelled" });
    if (!moved) throw new ConflictError(`This purchase order is ${po.status.replace("_", " ").toLowerCase()} and can no longer be cancelled here.`);
    await QuotationModel.updateMany({ purchaseOrderId: po._id, status: { $in: ["ISSUED", "REVISION_REQUESTED"] } }, { $set: { status: "REJECTED" } });
    return poView(moved.toObject());
  }
  const cancelOwnPurchaseOrder = async (customerId: string, poId: string, actor: Actor, reason?: string) => cancelPurchaseOrder(await ownPo(customerId, poId), actor, reason);

  // ---- the sales order: where credit is enforced ------------------------------------------------------------
  /** Commit an order. The customer document is written first, so two approvals for one credit limit conflict and the loser re-reads the winner's commitment. */
  async function commitSalesOrder(a: {
    ctx: CustomerContext;
    po: PurchaseOrderDocument;
    lines: LineAttrs[];
    /** Direct approval prices the lines now and freezes them here; an accepted quotation already carries its own frozen prices. */
    freeze?: { resolved: Resolved[] };
    quotation?: QuotationDocument;
    actor: Actor;
    override?: { reason: string };
    from: readonly PurchaseOrderDocument["status"][];
  }): Promise<SalesOrderDocument> {
    const { ctx, po } = a;
    const now = clock();
    const soId = new Types.ObjectId();
    const totals = totalsOf(a.lines);
    const soNo = await nextNo("SO");
    let overrideUsed: CreditCheck | undefined;

    const so = await withInventoryTransaction(async (session) => {
      await CustomerModel.updateOne({ _id: po.customerId }, { $inc: { creditSeq: 1 } }, { session });
      const check = checkCredit(await creditFor(po.customerId, ctx, session), totals.total);
      const blocked = check.requiresApproval;
      overrideUsed = blocked && a.override ? check : undefined;

      let lines = a.lines;
      if (a.freeze) {
        const snaps = await PriceSnapshotModel.create(
          a.freeze.resolved.map((r) => {
            const ev = r.priced!.evidence!;
            return { orderId: soId, documentType: "B2B_SALES_ORDER", productId: r.hit!.product._id, ...(r.hit!.variant ? { variantId: r.hit!.variant._id } : {}), sku: r.sku, computedAt: new Date(ev.computedAt), inputs: ev.inputs, breakdown: ev.breakdown, unitTotal: ev.breakdown.finalAmount };
          }),
          { session, ordered: true }
        );
        lines = a.lines.map((l, i) => ({ ...l, priceSnapshotId: snaps[i]!._id }));
      }
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
            status: blocked && !a.override ? "PENDING_CREDIT_APPROVAL" : "APPROVED",
            lines,
            totals,
            shippingAddress: po.shippingAddress,
            credit: { check, ...(blocked && a.override ? { override: { reason: a.override.reason, at: now, byId: oid(a.actor.id), byName: a.actor.name } } : {}) },
            history: [entry(blocked && !a.override ? "PENDING_CREDIT_APPROVAL" : "APPROVED", a.actor, now, blocked && !a.override ? "Held for credit approval" : blocked ? `Approved with credit override: ${a.override!.reason}` : "Approved")],
          },
        ],
        { session }
      );
      const moved = await movePo(po._id, "APPROVED", a.from, a.actor, { session, at: now, note: a.quotation ? "Quotation accepted" : "Approved", set: { salesOrderId: soId } });
      if (!moved) throw new ConflictError("This purchase order changed while it was being approved — please look again.");
      if (a.quotation) await QuotationModel.updateOne({ _id: a.quotation._id, status: "ISSUED" }, { $set: { status: "ACCEPTED" } }, { session });
      return created!;
    });
    if (overrideUsed) await audit(a.actor, AUDIT_ACTIONS.B2B_CREDIT_OVERRIDDEN, "SalesOrder", so.id, { soNo, reason: a.override!.reason, exposureAfter: overrideUsed.exposureAfter, limit: overrideUsed.position.limit, reasons: overrideUsed.reasons.map((r) => r.code) });
    return so;
  }

  // ---- quotations (the buyer's answers) ----------------------------------------------------------------------
  const ownQuotation = async (customerId: string, quoteId: string): Promise<QuotationDocument> => {
    if (!Types.ObjectId.isValid(quoteId)) throw new NotFoundError("Quotation", quoteId);
    const q = await QuotationModel.findOne({ _id: quoteId, customerId });
    if (!q) throw new NotFoundError("Quotation", quoteId);
    return q;
  };

  async function acceptQuotation(customerId: string, quoteId: string, actor: Actor): Promise<B2BSalesOrder> {
    const q = await ownQuotation(customerId, quoteId);
    if (q.status !== "ISSUED") throw new ConflictError(`This quotation is ${q.status.replace("_", " ").toLowerCase()} and can't be accepted.`);
    if (q.validUntil <= clock()) throw new QuotationExpiredError();
    const po = (await PurchaseOrderModel.findById(q.purchaseOrderId))!;
    if (po.status !== "QUOTED" || String(po.quotationId) !== q._id.toString()) throw new ConflictError("This quotation has been replaced by a newer one.");
    const ctx = await customerContext(customerId, clock());
    const so = await commitSalesOrder({ ctx, po, lines: q.lines, quotation: q, actor, from: ["QUOTED"] });
    return salesOrderView(so.toObject());
  }

  async function counterQuotation(customerId: string, quoteId: string, actor: Actor, input: { message: string; requestedPrices?: { sku: string; unitTaxable: number }[] }): Promise<B2BQuotation> {
    const q = await ownQuotation(customerId, quoteId);
    const now = clock();
    const updated = await QuotationModel.findOneAndUpdate(
      { _id: q._id, status: "ISSUED", validUntil: { $gt: now } },
      { $set: { status: "REVISION_REQUESTED" }, $push: { messages: { by: "CUSTOMER", at: now, text: input.message, ...(input.requestedPrices?.length ? { requestedPrices: input.requestedPrices } : {}) } } },
      { new: true }
    );
    if (!updated) throw new ConflictError("This quotation can no longer be negotiated.");
    await movePo(q.purchaseOrderId, "NEGOTIATING", ["QUOTED"], actor, { at: now, note: "Customer asked for a revision" });
    const po = await PurchaseOrderModel.findById(q.purchaseOrderId).select("poNo").lean();
    return quotationView(updated.toObject(), { poNo: po?.poNo ?? "", customerName: (await CustomerModel.findById(customerId).select("name").lean())?.name ?? "", now });
  }

  async function declineQuotation(customerId: string, quoteId: string, actor: Actor, reason?: string): Promise<B2BQuotation> {
    const q = await ownQuotation(customerId, quoteId);
    const updated = await QuotationModel.findOneAndUpdate({ _id: q._id, status: { $in: ["ISSUED", "REVISION_REQUESTED"] } }, { $set: { status: "REJECTED" }, $push: { messages: { by: "CUSTOMER", at: clock(), text: reason ? `Declined: ${reason}` : "Declined" } } }, { new: true });
    if (!updated) throw new ConflictError("This quotation can no longer be declined.");
    await movePo(q.purchaseOrderId, "CANCELLED", ["QUOTED", "NEGOTIATING"], actor, { note: "Customer declined the quotation" });
    const po = await PurchaseOrderModel.findById(q.purchaseOrderId).select("poNo").lean();
    return quotationView(updated.toObject(), { poNo: po?.poNo ?? "", customerName: q.customerId ? ((await CustomerModel.findById(q.customerId).select("name").lean())?.name ?? "") : "", now: clock() });
  }

  // ---- the seller's side ------------------------------------------------------------------------------------
  const anyPo = async (poId: string): Promise<PurchaseOrderDocument> => {
    if (!Types.ObjectId.isValid(poId)) throw new NotFoundError("Purchase order", poId);
    const po = await PurchaseOrderModel.findById(poId);
    if (!po) throw new NotFoundError("Purchase order", poId);
    return po;
  };

  async function startReview(poId: string, actor: Actor): Promise<B2BPurchaseOrder> {
    const po = await anyPo(poId);
    const moved = await movePo(po._id, "UNDER_REVIEW", ["SUBMITTED"], actor, { note: "Review started", set: { reviewerId: oid(actor.id) } });
    if (!moved) throw new ConflictError("Only a submitted purchase order can be taken into review.");
    await audit(actor, AUDIT_ACTIONS.B2B_PO_REVIEW_STARTED, "PurchaseOrder", po.id, { poNo: po.poNo });
    return poView(moved.toObject());
  }

  async function rejectPurchaseOrder(poId: string, actor: Actor, reason: string): Promise<B2BPurchaseOrder> {
    const po = await anyPo(poId);
    const moved = await movePo(po._id, "REJECTED", ["SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATING"], actor, { note: `Rejected: ${reason}` });
    if (!moved) throw new ConflictError("This purchase order can't be rejected in its current state.");
    await QuotationModel.updateMany({ purchaseOrderId: po._id, status: { $in: ["ISSUED", "REVISION_REQUESTED"] } }, { $set: { status: "REJECTED" } });
    await audit(actor, AUDIT_ACTIONS.B2B_PO_REJECTED, "PurchaseOrder", po.id, { poNo: po.poNo, reason });
    return poView(moved.toObject());
  }

  /** Approve at today's list price for this customer and create the sales order. A price-on-request line needs a quotation instead. */
  async function approvePurchaseOrder(poId: string, actor: Actor, opts: { creditOverride?: { reason: string }; canOverrideCredit: boolean }): Promise<B2BSalesOrder> {
    if (opts.creditOverride && !opts.canOverrideCredit) throw new AuthorizationError("Overriding a credit limit needs the credit-override permission.");
    const po = await anyPo(poId);
    if (!(REVIEWABLE as readonly string[]).includes(po.status)) throw new ConflictError("Only a submitted purchase order can be approved directly; a quoted one is accepted by the customer.");
    const ctx = await customerContext(String(po.customerId), clock());
    const resolved = await resolveRows(ctx, po.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })), po.shippingAddress.state);
    if (resolved.some((r) => r.problems.some((p) => p.blocking))) throw new OrderBlockedError(resolved.map((r) => resolvedView(r)));
    const unpriced = resolved.filter((r) => r.price?.status !== "AVAILABLE");
    if (unpriced.length) throw new DomainValidationError(`${unpriced.map((r) => r.sku).join(", ")} ${unpriced.length === 1 ? "has" : "have"} no price — issue a quotation instead.`);
    const so = await commitSalesOrder({ ctx, po, lines: resolved.map((r) => lineOf(r)) as unknown as LineAttrs[], freeze: { resolved }, actor, ...(opts.creditOverride ? { override: opts.creditOverride } : {}), from: [...REVIEWABLE] });
    await audit(actor, AUDIT_ACTIONS.B2B_PO_APPROVED, "PurchaseOrder", po.id, { poNo: po.poNo, soNo: so.soNo, total: so.totals.total, status: so.status });
    return salesOrderView(so.toObject());
  }

  /** Approve an order held for credit. If the position is now fine (the customer paid) no override is needed; otherwise only someone entitled to override can — and the reason is on the record. */
  async function approveCredit(soId: string, actor: Actor, opts: { reason: string; canOverrideCredit: boolean }): Promise<B2BSalesOrder> {
    if (!Types.ObjectId.isValid(soId)) throw new NotFoundError("Sales order", soId);
    const existing = await SalesOrderModel.findById(soId);
    if (!existing) throw new NotFoundError("Sales order", soId);
    const ctx = await customerContext(String(existing.customerId), clock());
    let usedOverride: CreditCheck | undefined;
    const approved = await withInventoryTransaction(async (session) => {
      await CustomerModel.updateOne({ _id: existing.customerId }, { $inc: { creditSeq: 1 } }, { session });
      const check = checkCredit(await creditFor(existing.customerId, ctx, session), existing.totals.total);
      if (check.requiresApproval && !opts.canOverrideCredit) throw new CreditBlockedError(check);
      usedOverride = check.requiresApproval ? check : undefined;
      const moved = await moveSo(existing._id, "APPROVED", ["PENDING_CREDIT_APPROVAL"], actor, {
        session,
        at: clock(),
        note: check.requiresApproval ? `Credit override: ${opts.reason}` : `Credit position now within terms: ${opts.reason}`,
        set: { "credit.check": check, ...(check.requiresApproval ? { "credit.override": { reason: opts.reason, at: clock(), byId: oid(actor.id), byName: actor.name } } : {}) },
      });
      if (!moved) throw new ConflictError("This order is not waiting for credit approval.");
      return moved;
    });
    if (usedOverride) await audit(actor, AUDIT_ACTIONS.B2B_CREDIT_OVERRIDDEN, "SalesOrder", approved.id, { soNo: approved.soNo, reason: opts.reason, exposureAfter: usedOverride.exposureAfter, limit: usedOverride.position.limit, reasons: usedOverride.reasons.map((r) => r.code) });
    return salesOrderView(approved.toObject());
  }

  /** Concessions are the only hand-entered part of a price; the arithmetic — GST, rounding — stays the engine's. */
  function withConcession(ctx: CustomerContext, r: Resolved, c: QuoteInput["lines"][number] | undefined, state: string | undefined): { r: Resolved; concession?: B2BLine["concession"] } {
    const hit = r.hit!;
    const note = c?.note;
    if (c?.discountPercent) {
      const p = priceFor(ctx, hit, state, { type: "PERCENTAGE", value: c.discountPercent, appliesTo: "TOTAL" }, { ignorePolicy: true });
      return { r: { ...r, price: p.price, ...(p.priced ? { priced: p.priced } : {}) }, concession: { kind: "PERCENT", value: c.discountPercent, ...(note ? { note } : {}) } };
    }
    if (c?.unitTaxable !== undefined) {
      const base = priceFor(ctx, hit, state, undefined, { ignorePolicy: true });
      const subtotal = base.priced?.evidence?.breakdown.subtotal;
      if (base.price.status !== "AVAILABLE" || subtotal === undefined) return { r: { ...r, price: base.price } };
      const flat = subtotal - c.unitTaxable;
      if (flat < 0) throw new DomainValidationError(`${r.sku}: a target price above the standard price isn't a concession.`);
      const p = flat === 0 ? base : priceFor(ctx, hit, state, { type: "FLAT", value: flat }, { ignorePolicy: true });
      return { r: { ...r, price: p.price, ...(p.priced ? { priced: p.priced } : {}) }, concession: { kind: "TARGET_PRICE", value: c.unitTaxable, ...(note ? { note } : {}) } };
    }
    const p = priceFor(ctx, hit, state, undefined, { ignorePolicy: true });
    return { r: { ...r, price: p.price, ...(p.priced ? { priced: p.priced } : {}) } };
  }

  /** Issue (or revise) a quotation for a PO: prices fixed now for `validDays`, each line frozen as a price snapshot. */
  async function issueQuotation(poId: string, actor: Actor, input: QuoteInput): Promise<B2BQuotation> {
    const po = await anyPo(poId);
    if (!["SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATING"].includes(po.status)) throw new ConflictError("A quotation can't be issued for this purchase order in its current state.");
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

    const q = await withInventoryTransaction(async (session) => {
      const snaps = await PriceSnapshotModel.create(
        built.map((b) => {
          const ev = b.r.priced!.evidence!;
          return { orderId: quoteId, documentType: "B2B_QUOTATION", productId: b.r.hit!.product._id, ...(b.r.hit!.variant ? { variantId: b.r.hit!.variant._id } : {}), sku: b.r.sku, computedAt: new Date(ev.computedAt), inputs: ev.inputs, breakdown: ev.breakdown, unitTotal: ev.breakdown.finalAmount };
        }),
        { session, ordered: true }
      );
      await QuotationModel.updateMany({ purchaseOrderId: po._id, status: { $in: ["ISSUED", "REVISION_REQUESTED"] } }, { $set: { status: "SUPERSEDED" } }, { session });
      const [created] = await QuotationModel.create(
        [
          {
            _id: quoteId,
            quoteNo,
            purchaseOrderId: po._id,
            customerId: po.customerId,
            version,
            status: "ISSUED",
            lines: lines.map((l, i) => ({ ...l, priceSnapshotId: snaps[i]!._id })),
            totals,
            validUntil: new Date(now.getTime() + input.validDays * DAY_MS),
            ...(input.terms ? { terms: input.terms } : {}),
            messages: input.message ? [{ by: "SELLER", at: now, text: input.message }] : [],
            issuedAt: now,
            issuedBy: oid(actor.id),
          },
        ],
        { session }
      );
      const moved = await movePo(po._id, "QUOTED", ["SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATING"], actor, { session, at: now, note: version === 1 ? `Quotation ${quoteNo} issued` : `Quotation ${quoteNo} (revision ${version}) issued`, set: { quotationId: quoteId } });
      if (!moved) throw new ConflictError("This purchase order changed while the quotation was being prepared — please look again.");
      return created!;
    });
    await audit(actor, AUDIT_ACTIONS.B2B_QUOTATION_ISSUED, "Quotation", q.id, { quoteNo, poNo: po.poNo, version, total: totals.total, concessions: [...concessions.values()].map((c) => ({ sku: c.sku, discountPercent: c.discountPercent, unitTaxable: c.unitTaxable })) });
    return quotationView(q.toObject(), { poNo: po.poNo, customerName: po.customerName, now });
  }

  return { quoteCart, createPurchaseOrder, updateDraft, submitPurchaseOrder, cancelOwnPurchaseOrder, cancelPurchaseOrder, acceptQuotation, counterQuotation, declineQuotation, startReview, rejectPurchaseOrder, approvePurchaseOrder, approveCredit, issueQuotation, anyPo, lineView };
}
export type ProcurementService = ReturnType<typeof createProcurementService>;
