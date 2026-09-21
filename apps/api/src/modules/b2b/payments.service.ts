import { Types } from "mongoose";
import type { B2BPayment, B2BPaymentMethod } from "@jewellery/types";
import { ConflictError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { CustomerModel } from "../customers/customer.model";
import { businessDay } from "../dashboard/range";
import { withInventoryTransaction } from "../inventory/inventory-transaction.service";
import { SelfVerificationError } from "./b2b.errors";
import { AllocationModel, B2BPaymentModel, InvoiceModel, SalesOrderModel, type B2BPaymentDocument } from "./b2b.models";
import { paidByInvoice } from "./b2b-core";
import { assertPaymentTransition } from "./b2b-status";
import { audit, entry, nextNo, oid, type Actor } from "./b2b-store";
import { allocationViews, paymentView, stripAlloc } from "./b2b-views";

export interface PaymentInput {
  method: B2BPaymentMethod;
  amount: number;
  receivedDate: string;
  reference?: string;
  bankName?: string;
  notes?: string;
}

/**
 * Offline payments. A payment is first a RECORD — entered by the customer ("I've paid") or by staff — and settles nothing. Only when
 * someone OTHER than its author confirms the money arrived does it become VERIFIED, and only a verified payment can then be
 * allocated, explicitly, to invoices. An invoice's paid amount is always the sum of its allocations: entering a payment never
 * marks an invoice paid (business-rules.md §13).
 */
export function createB2BPaymentService(deps: { now?: () => Date }) {
  const clock = deps.now ?? (() => new Date());

  const view = async (p: B2BPaymentDocument): Promise<B2BPayment> => {
    const customer = await CustomerModel.findById(p.customerId).select("name").lean();
    return paymentView(p.toObject(), customer?.name ?? "", (await allocationViews({ paymentId: p._id })).map(stripAlloc));
  };
  const load = async (paymentId: string): Promise<B2BPaymentDocument> => {
    if (!Types.ObjectId.isValid(paymentId)) throw new NotFoundError("Payment", paymentId);
    const p = await B2BPaymentModel.findById(paymentId);
    if (!p) throw new NotFoundError("Payment", paymentId);
    return p;
  };

  async function create(customerId: string, actor: Actor, input: PaymentInput, source: "CUSTOMER" | "STAFF"): Promise<B2BPayment> {
    const customer = await CustomerModel.findById(customerId).select("name type").lean();
    if (!customer || customer.type !== "B2B") throw new NotFoundError("Customer", customerId);
    if (input.receivedDate > businessDay(clock())) throw new DomainValidationError("A payment can't be dated in the future.");
    const doc = await B2BPaymentModel.create({
      paymentNo: await nextNo("PAY"),
      customerId: oid(customerId),
      method: input.method,
      amount: input.amount,
      receivedDate: input.receivedDate,
      ...(input.reference ? { reference: input.reference } : {}),
      ...(input.bankName ? { bankName: input.bankName } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
      source,
      status: "PENDING_VERIFICATION",
      recordedById: oid(actor.id),
      recordedByName: actor.name,
    });
    if (source === "STAFF") await audit(actor, AUDIT_ACTIONS.B2B_PAYMENT_RECORDED, "Payment", doc.id, { paymentNo: doc.paymentNo, customerId, amount: input.amount, method: input.method, reference: input.reference });
    return view(doc);
  }

  return {
    view,
    /** The customer says they paid. A claim on the record — it settles nothing until someone verifies it. */
    report: (customerId: string, actor: Actor, input: PaymentInput) => create(customerId, actor, input, "CUSTOMER"),
    /** Staff enter a payment they have seen (a bank credit, a cheque, cash). Also just a record until a second person verifies it. */
    record: (customerId: string, actor: Actor, input: PaymentInput) => create(customerId, actor, input, "STAFF"),

    /** Confirm the money is in the bank (a cheque: cleared). Never by the person who entered it. */
    async verify(paymentId: string, actor: Actor, note?: string): Promise<B2BPayment> {
      const p = await load(paymentId);
      if (String(p.recordedById) === actor.id) throw new SelfVerificationError();
      assertPaymentTransition(p.status, "VERIFIED");
      const moved = await B2BPaymentModel.findOneAndUpdate({ _id: p._id, status: "PENDING_VERIFICATION" }, { $set: { status: "VERIFIED", verifiedById: oid(actor.id), verifiedByName: actor.name, verifiedAt: clock() } }, { new: true });
      if (!moved) throw new ConflictError("This payment has already been dealt with.");
      await audit(actor, AUDIT_ACTIONS.B2B_PAYMENT_VERIFIED, "Payment", p.id, { paymentNo: p.paymentNo, amount: p.amount, note });
      return view(moved);
    },

    async reject(paymentId: string, actor: Actor, reason: string): Promise<B2BPayment> {
      const p = await load(paymentId);
      assertPaymentTransition(p.status, "REJECTED");
      const moved = await B2BPaymentModel.findOneAndUpdate({ _id: p._id, status: "PENDING_VERIFICATION" }, { $set: { status: "REJECTED", rejectedReason: reason, verifiedById: oid(actor.id), verifiedByName: actor.name, verifiedAt: clock() } }, { new: true });
      if (!moved) throw new ConflictError("This payment has already been dealt with.");
      await audit(actor, AUDIT_ACTIONS.B2B_PAYMENT_REJECTED, "Payment", p.id, { paymentNo: p.paymentNo, reason });
      return view(moved);
    },

    /**
     * Apply a verified payment to invoices. Both the payment and each invoice are written in the same transaction, so two allocations
     * racing for one payment (or one invoice) conflict and the loser re-reads the truth: nothing is ever over-applied.
     */
    async allocate(paymentId: string, actor: Actor, allocations: { invoiceId: string; amount: number }[]): Promise<B2BPayment> {
      const p = await load(paymentId);
      const merged = new Map<string, number>();
      for (const a of allocations) merged.set(a.invoiceId, (merged.get(a.invoiceId) ?? 0) + a.amount);
      const settled: string[] = [];
      await withInventoryTransaction(async (session) => {
        settled.length = 0;
        const pay = await B2BPaymentModel.findOneAndUpdate({ _id: p._id, status: "VERIFIED" }, { $inc: { allocationSeq: 1 } }, { new: true, session });
        if (!pay) throw new ConflictError("Only a verified payment can be applied to invoices.");
        const already = (await AllocationModel.find({ paymentId: p._id, reversedAt: { $exists: false } }).session(session).lean()).reduce((s, a) => s + a.amount, 0);
        const requested = [...merged.values()].reduce((s, n) => s + n, 0);
        if (already + requested > pay.amount) throw new ConflictError(`Only ₹${((pay.amount - already) / 100).toLocaleString("en-IN")} of this payment is still unapplied.`);
        for (const [invoiceId, amount] of merged) {
          const inv = await InvoiceModel.findOneAndUpdate({ _id: invoiceId, customerId: pay.customerId, status: "ISSUED" }, { $inc: { allocationSeq: 1 } }, { new: true, session });
          if (!inv) throw new NotFoundError("Invoice", invoiceId); // also: another customer's invoice
          const balance = inv.totals.total - ((await paidByInvoice([inv._id], session)).get(inv.id) ?? 0);
          if (amount > balance) throw new ConflictError(`${inv.invoiceNo} only has ₹${(balance / 100).toLocaleString("en-IN")} left to pay.`);
          await AllocationModel.create([{ paymentId: pay._id, invoiceId: inv._id, customerId: pay.customerId, amount, createdById: oid(actor.id) }], { session });
          if (amount === balance) {
            settled.push(inv.invoiceNo);
            await SalesOrderModel.updateOne({ _id: inv.salesOrderId }, { $push: { history: entry("SETTLED", "SYSTEM", clock(), `${inv.invoiceNo} paid in full`) } }, { session });
          }
        }
      });
      await audit(actor, AUDIT_ACTIONS.B2B_PAYMENT_ALLOCATED, "Payment", p.id, { paymentNo: p.paymentNo, allocations: [...merged].map(([invoiceId, amount]) => ({ invoiceId, amount })), settledInvoices: settled });
      return view((await B2BPaymentModel.findById(p._id))!);
    },

    /** A verified payment turns out not to have cleared (a bounced cheque): it is reversed and every invoice it paid is owed again — automatically, because paid is derived. */
    async reverse(paymentId: string, actor: Actor, reason: string): Promise<B2BPayment> {
      const p = await load(paymentId);
      assertPaymentTransition(p.status, "REVERSED");
      await withInventoryTransaction(async (session) => {
        const moved = await B2BPaymentModel.findOneAndUpdate({ _id: p._id, status: "VERIFIED" }, { $set: { status: "REVERSED", reversedReason: reason }, $inc: { allocationSeq: 1 } }, { new: true, session });
        if (!moved) throw new ConflictError("Only a verified payment can be reversed.");
        await AllocationModel.updateMany({ paymentId: p._id, reversedAt: { $exists: false } }, { $set: { reversedAt: clock(), reversedReason: reason } }, { session });
      });
      await audit(actor, AUDIT_ACTIONS.B2B_PAYMENT_REVERSED, "Payment", p.id, { paymentNo: p.paymentNo, amount: p.amount, reason });
      return view((await B2BPaymentModel.findById(p._id))!);
    },
  };
}
export type B2BPaymentService = ReturnType<typeof createB2BPaymentService>;
