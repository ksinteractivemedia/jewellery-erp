import { createCustomer } from "../src/modules/customers/customer.repository";
import { createCustomerGroup } from "../src/modules/customers/customer-group.repository";
import { ProductModel } from "../src/modules/catalog/product.model";
import { MetalModel } from "../src/modules/metals/metal.model";
import { createPriceList } from "../src/modules/pricing/price-list.repository";
import { createPricingRule } from "../src/modules/pricing/pricing-rule.repository";
import { createUser } from "../src/modules/auth/user.service";
import { InvoiceModel, type B2BModule } from "../src/modules/b2b";
import type { Actor } from "../src/modules/b2b";
import { addDays, businessDay } from "../src/modules/dashboard/range";
import { ProductVariantModel } from "../src/modules/catalog/product-variant.model";
import { stockCounts } from "../src/modules/b2b/b2b-core";

const addr = (city: string, state: string, postalCode: string) => ({ line1: `Shop 12, Zaveri Bazaar`, city, state, postalCode, country: "India" });

/**
 * DEVELOPMENT SEED: two wholesale accounts with buyer logins, a price list and tiered rules, and a spread of documents in every
 * stage (a PO awaiting review, a quotation awaiting the customer, an order held for credit, a partly paid invoice, an overdue one),
 * all created through the real services so the numbers are the real ones. Sample names and terms; the business sets its own.
 */
export async function seedB2B(deps: { b2b: B2BModule; password: string; staff: { salesManager: Actor; b2bManager: Actor; accountant: Actor; admin: Actor } }) {
  const { b2b, password, staff } = deps;
  const gold = (await MetalModel.findOne({ code: "GOLD" }))!;

  // Offer the catalogue to wholesale, with a few wholesale-specific settings.
  await ProductModel.updateMany({ isActive: true, tags: { $ne: "draft" } }, { $set: { b2bEnabled: true } });
  await ProductModel.updateMany({ sku: { $in: ["GLD-CIN-0001", "GLD-CIN-0002", "SLV-CIN-0001"] } }, { $set: { b2bMinOrderQuantity: 2 } });
  await ProductModel.updateMany({ sku: { $in: ["GLD-RNG-0002", "GLD-EAR-0002", "GLD-BNG-0001", "GLD-PND-0001", "GLD-JHK-0003"] } }, { $set: { b2bMinOrderQuantity: 2 } });
  await ProductModel.updateMany({ sku: "GLD-CHK-0002" }, { $set: { b2bPriceOnRequest: true } }); // a showpiece the business only quotes

  const group = await createCustomerGroup({ name: "Retailers", description: "Independent jewellery retailers" });
  const priceList = await createPriceList({ code: "WS-GOLD", name: "Wholesale — gold", channel: "B2B", effectiveFrom: new Date("2026-01-01") });
  const from = new Date("2026-01-01");
  await createPricingRule({ name: "Wholesale gold — price list", metalId: gold.id, priceListId: priceList.id, makingChargeType: "PERCENTAGE", makingChargeValue: 8, wastageType: "PERCENTAGE", wastageValue: 1, validFrom: from } as never);
  await createPricingRule({ name: "Retailers group", metalId: gold.id, customerGroupId: group.id, makingChargeType: "PERCENTAGE", makingChargeValue: 7.5, wastageType: "PERCENTAGE", wastageValue: 1, validFrom: from } as never);

  const mehta = await createCustomer({
    type: "B2B", name: "Mehta Jewellers", email: "accounts@mehta.example", phone: "9820011111", gstin: "27AABCM1234F1Z5", customerGroupId: group.id,
    billingAddress: addr("Mumbai", "Maharashtra", "400002"), shippingAddresses: [addr("Mumbai", "Maharashtra", "400002"), addr("Pune", "Maharashtra", "411001")],
    b2b: { contacts: [{ name: "Ramesh Mehta", email: "ramesh@mehta.example", phone: "9820011111", designation: "Proprietor", isPrimary: true }, { name: "Neha Mehta", email: "neha@mehta.example", designation: "Purchase", isPrimary: false }], creditLimit: 2_500_000_00, paymentTermsDays: 30, priceListCode: "WS-GOLD", salespersonId: staff.salesManager.id, territory: "Mumbai" },
  } as never);
  const shree = await createCustomer({
    type: "B2B", name: "Shree Gems, Surat", email: "orders@shreegems.example", gstin: "24AAECS9876K1Z2",
    billingAddress: addr("Surat", "Gujarat", "395003"), shippingAddresses: [addr("Surat", "Gujarat", "395003")],
    b2b: { contacts: [{ name: "Kiran Shah", email: "kiran@shreegems.example", designation: "Owner", isPrimary: true }], creditLimit: 400_000_00, paymentTermsDays: 15, salespersonId: staff.salesManager.id, territory: "Gujarat" },
  } as never);
  await createCustomer({ type: "B2B", name: "Old Lane Traders (on hold)", email: "old@lane.example", billingAddress: addr("Jaipur", "Rajasthan", "302001"), shippingAddresses: [addr("Jaipur", "Rajasthan", "302001")], b2b: { creditLimit: 100_000_00, paymentTermsDays: 30, creditHold: true, territory: "Rajasthan" } } as never);

  const buyers = [
    { email: "buyer@mehta.demo.test", name: "Ramesh Mehta", customerId: mehta.id },
    { email: "buyer@shreegems.demo.test", name: "Kiran Shah", customerId: shree.id },
  ];
  const actors: Record<string, Actor> = {};
  for (const b of buyers) {
    const u = await createUser({ email: b.email, name: b.name, password, userType: "B2B_BUYER", customerId: b.customerId } as never, 4);
    actors[b.customerId] = { id: u.id, name: b.name, email: b.email, kind: "CUSTOMER" };
  }
  // Which unsized, offered designs really have stock — chosen from the live inventory so the seed never asks for what isn't there.
  const sized = new Set((await ProductVariantModel.find({}).select("productId").lean()).map((v) => String(v.productId)));
  const offered = (await ProductModel.find({ isActive: true, b2bEnabled: true, b2bPriceOnRequest: { $ne: true } }).sort({ sku: 1 }).lean()).filter((p) => !sized.has(String(p._id)) && p.defaultGrossWeight && !(p.stoneDetails?.length && p.stoneValue === undefined) && p.sku !== "GLD-NCK-0001");
  const counts = await stockCounts(offered.map((p) => p._id));
  const used = new Set<string>();
  const stocked = (quantity: number, howMany: number): [string, number][] => {
    const out: [string, number][] = [];
    for (const p of offered) {
      if (out.length === howMany) break;
      const moq = p.b2bMinOrderQuantity ?? 1;
      if (used.has(p.sku) || (counts.get(`${String(p._id)}:`) ?? 0) < Math.max(quantity, moq)) continue;
      used.add(p.sku);
      out.push([p.sku, Math.max(quantity, moq)]);
    }
    if (out.length < howMany) throw new Error("the inventory seed has too little unsized stock for the wholesale seed");
    return out;
  };
  const po = (customerId: string, rows: [string, number][], over: Record<string, unknown> = {}) =>
    b2b.procurement.createPurchaseOrder(customerId, actors[customerId]!, { lines: rows.map(([sku, quantity]) => ({ sku, quantity })), shippingAddressIndex: 0, submit: true, ...over } as never);

  // Mehta: an old invoice, part-paid and overdue; a recent one, unpaid; both through the real flow.
  const invoiceIt = async (customerId: string, rows: [string, number][], issuedDaysAgo: number) => {
    const p = await po(customerId, rows, { customerPoRef: `PO/${issuedDaysAgo}D` });
    await b2b.procurement.approvePurchaseOrder(p.id, staff.b2bManager);
    const so = await b2b.procurement.convertPurchaseOrder(p.id, staff.b2bManager, { canOverrideCredit: true });
    await b2b.fulfilment.allocate(so.id, staff.b2bManager);
    const inv = await b2b.fulfilment.invoice(so.id, staff.b2bManager);
    const issue = addDays(businessDay(new Date()), -issuedDaysAgo);
    const terms = customerId === mehta.id ? 30 : 15;
    await InvoiceModel.collection.updateOne({ invoiceNo: inv.invoiceNo }, { $set: { issueDate: issue, dueDate: addDays(issue, terms) } });
    return inv;
  };
  const old = await invoiceIt(mehta.id, stocked(2, 2), 48);
  const part = await b2b.payments.record(mehta.id, staff.accountant, { method: "NEFT", amount: Math.floor(old.totals.total / 3), receivedDate: addDays(businessDay(new Date()), -20), reference: "HDFCN26041288", bankName: "HDFC Bank" });
  await b2b.payments.verify(part.id, staff.admin, "Seen on the statement");
  await b2b.payments.allocate(part.id, staff.accountant, [{ invoiceId: old.id, amount: part.amount }]);
  await invoiceIt(mehta.id, stocked(2, 2), 6);
  await b2b.payments.report(mehta.id, actors[mehta.id]!, { method: "RTGS", amount: 150_000_00, receivedDate: businessDay(new Date()), reference: "ICICR26099911", bankName: "ICICI Bank", notes: "Part payment against the older invoice" });

  // A PO waiting for review; a quotation waiting for the customer; an order held for credit.
  await po(mehta.id, stocked(2, 2), { customerPoRef: "PO/FESTIVE-01", notes: "Needed before Dhanteras" });
  const quoted = stocked(1, 1)[0]!;
  const q = await po(mehta.id, [["GLD-CHK-0002", 1], quoted], { customerPoRef: "PO/BRIDAL-07" });
  await b2b.procurement.issueQuotation(q.id, staff.b2bManager, { lines: [{ sku: quoted[0], discountPercent: 3, note: "Bridal season" }], validDays: 10, issue: true, terms: "Delivery in 7 working days. Prices valid until the date shown.", message: "Happy to hold these for you." } as never);
  const big = await po(shree.id, [...stocked(2, 2)].map(([sku, n]) => [sku, n * 40] as [string, number]), { customerPoRef: "SG/2026/031" });
  await b2b.procurement.approvePurchaseOrder(big.id, staff.b2bManager);
  await b2b.procurement.convertPurchaseOrder(big.id, staff.b2bManager, { canOverrideCredit: false });

  return { customers: 3, buyers: buyers.map((b) => b.email) };
}
