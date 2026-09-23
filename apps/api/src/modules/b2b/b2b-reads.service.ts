import { Types } from "mongoose";
import type { B2BAccount, B2BCatalogueItem, B2BCatalogueResult, B2BDashboard, B2BInvoice, B2BOutstanding, B2BPayment, B2BPurchaseOrder, B2BQuotation, B2BSalesOrder, CreditPosition, Customer } from "@jewellery/types";
import type { PortalCatalogueQuery, UpdateB2BProfileInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { UserModel } from "../auth/user.model";
import { ProductCategoryModel } from "../catalog/product-category.model";
import { ProductVariantModel } from "../catalog/product-variant.model";
import { ProductModel } from "../catalog/product.model";
import { CustomerGroupModel } from "../customers/customer-group.model";
import { CustomerModel } from "../customers/customer.model";
import { businessDay } from "../dashboard/range";
import type { MediaService } from "../media/media.service";
import { AllocationModel, B2BPaymentModel, InvoiceModel, PurchaseOrderModel, QuotationModel, SalesOrderModel } from "./b2b.models";
import { buyerStateFor, catalogueItem, creditFor, customerContext, paidByInvoice, priceFor, stockCounts, stockKey, type SkuHit } from "./b2b-core";
import { audit, type Actor } from "./b2b-store";
import { allocationViews, invoiceView, paymentView, poView, quotationView, salesOrderView, stripAlloc } from "./b2b-views";
import { ageInvoices } from "./credit";

const id = (v: unknown) => String(v);
type Scope = { customerId?: string };
const scoped = (s: Scope) => (s.customerId ? { customerId: s.customerId } : {});

/**
 * Everything read on the B2B side, for the buyer (scoped to one customer at the query, always) and for staff (any customer). The
 * derived figures — what an invoice has been paid, what is outstanding, what is overdue — are computed here from allocations and
 * due dates on every read; there is no stored balance to drift.
 */
export function createB2BReads(deps: { media: MediaService; now?: () => Date; /** Runs before anything time-dependent is read (quotation expiry), so what is shown is what is true now. */ refresh?: () => Promise<unknown> }) {
  const { media } = deps;
  const clock = deps.now ?? (() => new Date());
  const fresh = async () => void (await deps.refresh?.());

  // ---- documents ------------------------------------------------------------------------------------------
  const purchaseOrders = async (s: Scope & { status?: string; q?: string } = {}): Promise<B2BPurchaseOrder[]> => {
    await fresh();
    const filter: Record<string, unknown> = { ...scoped(s), ...(s.status ? { status: { $in: s.status.split(",") } } : {}) };
    if (s.q) filter.$or = [{ poNo: new RegExp(s.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, { customerName: new RegExp(s.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, { customerPoRef: new RegExp(s.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }];
    return (await PurchaseOrderModel.find(filter).sort({ createdAt: -1 }).limit(200).lean()).map((d) => poView(d as never));
  };
  const purchaseOrder = async (poId: string, s: Scope = {}) => {
    await fresh();
    if (!Types.ObjectId.isValid(poId)) throw new NotFoundError("Purchase order", poId);
    const d = await PurchaseOrderModel.findOne({ _id: poId, ...scoped(s) }).lean();
    if (!d) throw new NotFoundError("Purchase order", poId);
    return poView(d as never);
  };

  // A DRAFT quotation is prepared but not yet sent — a buyer-scoped read (`s.customerId` set, i.e. the portal) never shows it.
  const quotations = async (s: Scope & { status?: string } = {}): Promise<B2BQuotation[]> => {
    await fresh();
    const filter: Record<string, unknown> = { ...scoped(s), ...(s.customerId ? { status: { $ne: "DRAFT" } } : {}) };
    const docs = await QuotationModel.find(filter).sort({ issuedAt: -1 }).limit(200).lean();
    const pos = new Map((await PurchaseOrderModel.find({ _id: { $in: docs.map((d) => d.purchaseOrderId) } }).select("poNo customerName").lean()).map((p) => [id(p._id), p]));
    const now = clock();
    const views = docs.map((d) => quotationView(d as never, { poNo: pos.get(id(d.purchaseOrderId))?.poNo ?? "", customerName: pos.get(id(d.purchaseOrderId))?.customerName ?? "", now }));
    return s.status ? views.filter((v) => s.status!.split(",").includes(v.status)) : views;
  };
  const quotation = async (quoteId: string, s: Scope = {}) => {
    await fresh();
    if (!Types.ObjectId.isValid(quoteId)) throw new NotFoundError("Quotation", quoteId);
    const d = await QuotationModel.findOne({ _id: quoteId, ...scoped(s) }).lean();
    if (!d || (s.customerId && d.status === "DRAFT")) throw new NotFoundError("Quotation", quoteId);
    const po = await PurchaseOrderModel.findById(d.purchaseOrderId).select("poNo customerName").lean();
    return quotationView(d as never, { poNo: po?.poNo ?? "", customerName: po?.customerName ?? "", now: clock() });
  };

  const invoiceStubs = async (orderIds: unknown[]) => {
    const invs = await InvoiceModel.find({ salesOrderId: { $in: orderIds } }).sort({ sequence: 1 }).select("invoiceNo totals.total salesOrderId").lean();
    const by = new Map<string, { id: string; invoiceNo: string; total: number }[]>();
    for (const i of invs) by.set(id(i.salesOrderId), [...(by.get(id(i.salesOrderId)) ?? []), { id: id(i._id), invoiceNo: i.invoiceNo, total: i.totals.total }]);
    return by;
  };
  const salesOrders = async (s: Scope & { status?: string } = {}): Promise<B2BSalesOrder[]> => {
    const docs = await SalesOrderModel.find({ ...scoped(s), ...(s.status ? { status: { $in: s.status.split(",") } } : {}) }).sort({ createdAt: -1 }).limit(200).lean();
    const inv = await invoiceStubs(docs.map((d) => d._id));
    return docs.map((d) => salesOrderView(d as never, inv.get(id(d._id)) ?? []));
  };
  const salesOrder = async (soId: string, s: Scope = {}) => {
    if (!Types.ObjectId.isValid(soId)) throw new NotFoundError("Sales order", soId);
    const d = await SalesOrderModel.findOne({ _id: soId, ...scoped(s) }).lean();
    if (!d) throw new NotFoundError("Sales order", soId);
    return salesOrderView(d as never, (await invoiceStubs([d._id])).get(id(d._id)) ?? []);
  };

  const invoicesOf = async (filter: Record<string, unknown>, opts: { withAllocations?: boolean } = {}): Promise<B2BInvoice[]> => {
    const docs = await InvoiceModel.find(filter).sort({ issueDate: -1, invoiceNo: -1 }).limit(300).lean();
    const paid = await paidByInvoice(docs.map((d) => d._id));
    const allocs = opts.withAllocations ? await allocationViews({ invoiceId: { $in: docs.map((d) => d._id) } }) : [];
    const today = businessDay(clock());
    return docs.map((d) => invoiceView(d as never, paid.get(id(d._id)) ?? 0, allocs.filter((a) => a._invoiceId === id(d._id)).map(stripAlloc), today));
  };
  const invoices = (s: Scope & { status?: string } = {}) => invoicesOf({ ...scoped(s) }).then((v) => (s.status ? v.filter((i) => s.status!.split(",").includes(i.status)) : v));
  const invoice = async (invoiceId: string, s: Scope = {}) => {
    if (!Types.ObjectId.isValid(invoiceId)) throw new NotFoundError("Invoice", invoiceId);
    const [v] = await invoicesOf({ _id: invoiceId, ...scoped(s) }, { withAllocations: true });
    if (!v) throw new NotFoundError("Invoice", invoiceId);
    return v;
  };

  const payments = async (s: Scope & { status?: string } = {}): Promise<B2BPayment[]> => {
    const docs = await B2BPaymentModel.find({ ...scoped(s), ...(s.status ? { status: { $in: s.status.split(",") } } : {}) }).sort({ createdAt: -1 }).limit(300).lean();
    const allocs = await allocationViews({ paymentId: { $in: docs.map((d) => d._id) } });
    const names = new Map((await CustomerModel.find({ _id: { $in: docs.map((d) => d.customerId) } }).select("name").lean()).map((c) => [id(c._id), c.name]));
    return docs.map((d) => paymentView(d as never, names.get(id(d.customerId)) ?? "", allocs.filter((a) => a._paymentId === id(d._id)).map(stripAlloc)));
  };

  // ---- account & credit -----------------------------------------------------------------------------------
  async function account(customerId: string): Promise<B2BAccount> {
    const ctx = await customerContext(customerId, clock());
    const c = (await CustomerModel.findById(customerId).lean())!;
    const [sp, group] = await Promise.all([ctx.profile.salespersonId ? UserModel.findById(ctx.profile.salespersonId).select("name email phone").lean() : null, c.customerGroupId ? CustomerGroupModel.findById(c.customerGroupId).select("name").lean() : null]);
    const { salespersonId: _omit, ...profile } = ctx.profile;
    return {
      customer: { id: ctx.customer.id, name: ctx.customer.name, ...(ctx.customer.gstin ? { gstin: ctx.customer.gstin } : {}), ...(ctx.customer.email ? { email: ctx.customer.email } : {}), ...(ctx.customer.phone ? { phone: ctx.customer.phone } : {}) },
      ...(ctx.customer.billingAddress ? { billingAddress: ctx.customer.billingAddress } : {}),
      shippingAddresses: ctx.customer.shippingAddresses,
      profile: { contacts: profile.contacts ?? [], creditLimit: profile.creditLimit, paymentTermsDays: profile.paymentTermsDays, ...(profile.priceListCode ? { priceListCode: profile.priceListCode } : {}), ...(profile.territory ? { territory: profile.territory } : {}), creditHold: profile.creditHold, blockOnOverdue: profile.blockOnOverdue },
      ...(ctx.priceList ? { priceList: { code: ctx.priceList.code, name: ctx.priceList.name } } : {}),
      ...(group ? { groupName: group.name } : {}),
      ...(sp ? { salesperson: { name: sp.name, ...(sp.email ? { email: sp.email } : {}), ...(sp.phone ? { phone: sp.phone } : {}) } } : {}),
      position: await creditFor(customerId, ctx),
    };
  }

  async function outstanding(customerId: string): Promise<B2BOutstanding> {
    const ctx = await customerContext(customerId, clock());
    const [position, unpaid, pay] = await Promise.all([creditFor(customerId, ctx), invoicesOf({ customerId, status: "ISSUED" }, { withAllocations: true }), payments({ customerId })]);
    const open = unpaid.filter((i) => i.balance > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return {
      position,
      ageing: ageInvoices(open.map((i) => ({ balance: i.balance, dueDate: i.dueDate })), ctx.today),
      invoices: open,
      unappliedPayments: pay.filter((p) => p.status === "VERIFIED").reduce((s, p) => s + p.unallocated, 0),
      pendingPayments: pay.filter((p) => p.status === "PENDING_VERIFICATION").reduce((s, p) => s + p.amount, 0),
    };
  }

  async function dashboard(customerId: string): Promise<B2BDashboard> {
    const [acct, pos, quotes, orders, out, pay] = await Promise.all([account(customerId), purchaseOrders({ customerId }), quotations({ customerId }), salesOrders({ customerId }), outstanding(customerId), payments({ customerId })]);
    const liveQuotes = quotes.filter((q) => q.status === "QUOTED");
    const overdue = out.invoices.filter((i) => i.status === "OVERDUE");
    const p = acct.position;
    const actions: B2BDashboard["actions"] = [];
    if (liveQuotes.length) actions.push({ kind: "QUOTATION", message: `${liveQuotes.length} quotation${liveQuotes.length > 1 ? "s" : ""} waiting for your answer`, href: "/quotations" });
    if (overdue.length) actions.push({ kind: "OVERDUE", message: `${overdue.length} overdue invoice${overdue.length > 1 ? "s" : ""} — ₹${(p.overdue / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, href: "/outstanding" });
    if (p.onHold) actions.push({ kind: "CREDIT", message: "Your account is on credit hold — contact your salesperson", href: "/account" });
    else if (p.available < 0) actions.push({ kind: "CREDIT", message: `You're ₹${(-p.available / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })} over your credit limit`, href: "/outstanding" });
    if (pay.some((x) => x.status === "PENDING_VERIFICATION")) actions.push({ kind: "PAYMENT", message: "Payments waiting to be confirmed by us", href: "/payments" });
    return {
      account: acct,
      counts: {
        openPurchaseOrders: pos.filter((x) => ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATION", "APPROVED"].includes(x.status)).length,
        quotationsAwaitingYou: liveQuotes.length,
        ordersInProgress: orders.filter((o) => ["DRAFT", "CONFIRMED", "PARTIALLY_ALLOCATED", "ALLOCATED", "PARTIALLY_FULFILLED"].includes(o.status)).length,
        unpaidInvoices: out.invoices.length,
        overdueInvoices: overdue.length,
        paymentsPending: pay.filter((x) => x.status === "PENDING_VERIFICATION").length,
      },
      actions,
      recentOrders: orders.slice(0, 5),
      dueSoon: out.invoices.slice(0, 5),
    };
  }

  // ---- the wholesale catalogue ----------------------------------------------------------------------------
  async function catalogue(customerId: string, q: PortalCatalogueQuery): Promise<B2BCatalogueResult> {
    const ctx = await customerContext(customerId, clock());
    const state = buyerStateFor(ctx);
    const products = await ProductModel.find({ isActive: true, b2bEnabled: true }).lean();
    const variants = await ProductVariantModel.find({ productId: { $in: products.map((p) => p._id) }, isActive: true }).lean();
    const cats = await ProductCategoryModel.find({}).lean();
    const catName = new Map(cats.map((c) => [id(c._id), c]));
    const stock = await stockCounts(products.map((p) => p._id));
    const bySize = new Map<string, typeof variants>();
    for (const v of variants) bySize.set(id(v.productId), [...(bySize.get(id(v.productId)) ?? []), v]);

    const hits: SkuHit[] = products.flatMap((p) => {
      const sizes = bySize.get(id(p._id));
      return sizes ? sizes.map((v) => ({ product: p as never, variant: v as never, sku: v.sku, soldBySize: false })) : [{ product: p as never, sku: p.sku, soldBySize: false }];
    });
    const all: (B2BCatalogueItem & { _catId?: string; _tags: string[] })[] = hits.map((h) => ({
      ...catalogueItem(h, priceFor(ctx, h, state).price, stock.get(stockKey(h)) ?? 0, { category: h.product.categoryId ? catName.get(id(h.product.categoryId))?.name : undefined, metal: ctx.world.metals.get(id(h.product.metalId))?.name }, media),
      _catId: h.product.categoryId ? id(h.product.categoryId) : undefined,
      _tags: ((h.product as unknown as { tags?: string[] }).tags ?? []) as string[],
    }));

    const needle = q.q?.toLowerCase();
    const inScope = needle ? all.filter((i) => i.sku.toLowerCase().includes(needle) || i.name.toLowerCase().includes(needle) || i._tags.some((t) => t.toLowerCase().includes(needle))) : all;
    const catIds = (() => {
      if (!q.category) return null;
      const root = cats.find((c) => c.slug === q.category);
      if (!root) return new Set<string>();
      const out = new Set([id(root._id)]);
      for (let grew = true; grew; ) { grew = false; for (const c of cats) if (c.parentId && out.has(id(c.parentId)) && !out.has(id(c._id))) { out.add(id(c._id)); grew = true; } }
      return out;
    })();
    const metalCode = (i: B2BCatalogueItem) => [...ctx.world.metals.values()].find((m) => m.name === i.metal)?.code;
    let items = inScope.filter((i) => (!catIds || (i._catId && catIds.has(i._catId))) && (!q.metal || metalCode(i) === q.metal) && (!q.purity || i.purity === q.purity) && (!q.availability || (q.availability === "in" ? i.available > 0 : i.available === 0)));
    const priceOf = (i: B2BCatalogueItem) => (i.price.status === "AVAILABLE" ? i.price.unitTaxable : Number.MAX_SAFE_INTEGER);
    items = items.sort((a, b) => (q.sort === "name" ? a.name.localeCompare(b.name) : q.sort === "price-asc" ? priceOf(a) - priceOf(b) : q.sort === "price-desc" ? (b.price.status === "AVAILABLE" ? priceOf(b) : -1) - (a.price.status === "AVAILABLE" ? priceOf(a) : -1) : q.sort === "stock" ? b.available - a.available : a.sku.localeCompare(b.sku)));

    const count = <K extends string>(rows: (K | undefined)[]) => { const m = new Map<K, number>(); for (const r of rows) if (r) m.set(r, (m.get(r) ?? 0) + 1); return m; };
    const catCounts = count(inScope.map((i) => (i._catId ? catName.get(i._catId)?.slug : undefined)));
    const metalCounts = count(inScope.map(metalCode));
    const purityCounts = count(inScope.map((i) => i.purity));
    const start = (q.page - 1) * q.pageSize;
    return {
      items: items.slice(start, start + q.pageSize).map(({ _catId: _c, _tags: _t, ...i }) => i),
      total: items.length,
      page: q.page,
      pageSize: q.pageSize,
      facets: {
        categories: cats.filter((c) => catCounts.has(c.slug)).map((c) => ({ name: c.name, slug: c.slug, count: catCounts.get(c.slug)! })),
        metals: [...ctx.world.metals.values()].filter((m) => metalCounts.has(m.code)).map((m) => ({ code: m.code, name: m.name, count: metalCounts.get(m.code)! })),
        purities: [...purityCounts].map(([code, n]) => ({ code, count: n })),
      },
    };
  }

  // ---- seller: the wholesale accounts ---------------------------------------------------------------------
  async function customers(): Promise<{ id: string; name: string; gstin?: string; territory?: string; groupName?: string; salesperson?: string; position: CreditPosition; isActive: boolean; paymentTermsDays: number; priceListCode?: string }[]> {
    const list = await CustomerModel.find({ type: "B2B" }).sort({ name: 1 }).lean();
    const users = new Map((await UserModel.find({ _id: { $in: list.map((c) => c.b2b?.salespersonId).filter(Boolean) } }).select("name").lean()).map((u) => [id(u._id), u.name]));
    const groups = new Map((await CustomerGroupModel.find({}).select("name").lean()).map((g) => [id(g._id), g.name]));
    const out = [];
    for (const c of list) {
      if (!c.b2b) continue;
      const ctx = { profile: c.b2b as never, today: businessDay(clock()) };
      out.push({ id: id(c._id), name: c.name, ...(c.gstin ? { gstin: c.gstin } : {}), ...(c.b2b.territory ? { territory: c.b2b.territory } : {}), ...(c.customerGroupId && groups.get(id(c.customerGroupId)) ? { groupName: groups.get(id(c.customerGroupId))! } : {}), ...(c.b2b.salespersonId && users.get(id(c.b2b.salespersonId)) ? { salesperson: users.get(id(c.b2b.salespersonId))! } : {}), position: await creditFor(c._id, ctx), isActive: c.isActive, paymentTermsDays: c.b2b.paymentTermsDays, ...(c.b2b.priceListCode ? { priceListCode: c.b2b.priceListCode } : {}) });
    }
    return out;
  }

  /** Change a wholesale account's terms. Credit limit, hold and terms are the levers of the credit rule, so every change is on the audit log with before and after. */
  async function updateProfile(customerId: string, actor: Actor, input: UpdateB2BProfileInput): Promise<B2BAccount> {
    const c = await CustomerModel.findById(customerId);
    if (!c || c.type !== "B2B" || !c.b2b) throw new NotFoundError("B2B customer", customerId);
    const before = { creditLimit: c.b2b.creditLimit, paymentTermsDays: c.b2b.paymentTermsDays, creditHold: c.b2b.creditHold, blockOnOverdue: c.b2b.blockOnOverdue, priceListCode: c.b2b.priceListCode, territory: c.b2b.territory };
    const set: Record<string, unknown> = {};
    const unset: Record<string, 1> = {};
    const b2bFields = ["contacts", "creditLimit", "paymentTermsDays", "priceListCode", "salespersonId", "territory", "creditHold", "blockOnOverdue"] as const;
    for (const k of b2bFields) {
      const v = input[k];
      if (v === undefined) continue;
      if (v === null) unset[`b2b.${k}`] = 1;
      else set[`b2b.${k}`] = k === "salespersonId" ? new Types.ObjectId(v as string) : v;
    }
    for (const k of ["gstin", "billingAddress", "shippingAddresses"] as const) if (input[k] !== undefined) set[k] = input[k];
    if (input.customerGroupId !== undefined) (input.customerGroupId === null ? (unset.customerGroupId = 1) : (set.customerGroupId = new Types.ObjectId(input.customerGroupId)));
    await CustomerModel.updateOne({ _id: c._id }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) });
    await audit(actor, AUDIT_ACTIONS.B2B_PROFILE_UPDATED, "Customer", c.id, { customer: c.name, before, changed: Object.keys({ ...set, ...unset }) , after: { creditLimit: input.creditLimit, paymentTermsDays: input.paymentTermsDays, creditHold: input.creditHold, blockOnOverdue: input.blockOnOverdue, priceListCode: input.priceListCode, territory: input.territory } });
    return account(customerId);
  }

  return { purchaseOrders, purchaseOrder, quotations, quotation, salesOrders, salesOrder, invoices, invoice, payments, account, outstanding, dashboard, catalogue, customers, updateProfile, allocations: AllocationModel };
}
export type B2BReads = ReturnType<typeof createB2BReads>;
export type { Customer };
