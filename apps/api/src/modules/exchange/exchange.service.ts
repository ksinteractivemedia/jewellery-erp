import { valueOfMetal } from "@jewellery/pricing-engine";
import type { Exchange } from "@jewellery/types";
import type { AssessExchangeInput, CompleteExchangeInput, CreateExchangeInput, OldJewelleryAssessmentInput } from "@jewellery/validation";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { receiveNewInventoryItem } from "../inventory";
import { calculateNetWeight, roundWeight } from "../inventory/weight-calculations";
import { requireMetalById, resolveFineness } from "../metals/metal.repository";
import { applyExchange, audit, nextNo, oid, type Actor } from "./exchange-store";
import { exchangeView } from "./exchange-views";
import { ExchangeModel, type ExchangeDocument } from "./exchange.models";

/**
 * Weighs and values the old piece on our own scale and purity table — never on what the customer
 * or a prior receipt claims (`claimedPurity` is recorded purely for reference). Uses the one shared
 * metal-value formula (`valueOfMetal`, packages/pricing-engine) so an exchange credit and a sale
 * price can never disagree about what a gram of metal is worth (CLAUDE.md rule 1).
 */
async function assessOldJewellery(input: OldJewelleryAssessmentInput) {
  const metal = await requireMetalById(input.metalId);
  const fineness = await resolveFineness(input.metalId, input.assessedPurity);
  const netWeight = calculateNetWeight(input.grossWeight, input.stoneWeight);
  if (netWeight <= 0) throw new ConflictError("net weight must be positive — stone weight cannot equal or exceed gross weight");
  const fineWeight = roundWeight(netWeight * fineness);
  const metalValue = valueOfMetal({ weight: netWeight, fineness, ratePerGram: input.ratePerGram, quotedFineness: fineness });
  const valuation = Math.max(0, metalValue - input.deduction);
  return {
    description: input.description,
    metalId: oid(input.metalId),
    metalName: metal.name,
    ...(input.claimedPurity ? { claimedPurity: input.claimedPurity } : {}),
    grossWeight: input.grossWeight,
    stoneWeight: input.stoneWeight,
    netWeight,
    assessedPurity: input.assessedPurity,
    assessedFineness: fineness,
    fineWeight,
    ratePerGram: input.ratePerGram,
    deduction: input.deduction,
    valuation,
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

export async function createExchange(actor: Actor, input: CreateExchangeInput): Promise<Exchange> {
  const oldJewellery = await assessOldJewellery(input.oldJewellery);
  const now = new Date();
  const doc = await ExchangeModel.create({
    exchangeNo: await nextNo(),
    status: "ASSESSED",
    customer: { ...(input.customer.id ? { id: oid(input.customer.id) } : {}), name: input.customer.name, phone: input.customer.phone, email: input.customer.email },
    oldJewellery,
    ...(input.notes ? { notes: input.notes } : {}),
    history: [
      { status: "DRAFT", at: now, by: oid(actor.id), byName: actor.name },
      { status: "ASSESSED", at: now, by: oid(actor.id), byName: actor.name },
    ],
  });
  await audit(actor, AUDIT_ACTIONS.EXCHANGE_CREATED, "Exchange", doc.id, { exchangeNo: doc.exchangeNo, valuation: oldJewellery.valuation });
  return exchangeView(doc.toObject());
}

/** Re-weigh/re-value before the piece is taken in — not a correction, just the job. */
export async function assessExchange(id: string, actor: Actor, input: AssessExchangeInput): Promise<Exchange> {
  const oldJewellery = await assessOldJewellery(input.oldJewellery);
  const updated = await applyExchange(id, "assess", actor, { set: { oldJewellery } });
  if (!updated) throw new NotFoundError("Exchange", id);
  await audit(actor, AUDIT_ACTIONS.EXCHANGE_ASSESSED, "Exchange", updated.id, { exchangeNo: updated.exchangeNo, valuation: oldJewellery.valuation });
  return exchangeView(updated.toObject());
}

/**
 * Takes the old piece in (a real, ledgered `InventoryItem` — `EXCHANGE_IN`, the same creation
 * discipline as a purchase receipt) and records the difference: positive means the customer owes us,
 * negative means we owe the customer — never silently clamped to zero either way.
 */
export async function completeExchange(id: string, actor: Actor, input: CompleteExchangeInput): Promise<Exchange> {
  const ex = await requireExchange(id);
  if (ex.status !== "ASSESSED") throw new ConflictError(`Exchange ${ex.exchangeNo} is ${ex.status.toLowerCase()} — only an assessed exchange can be completed.`);

  const { item } = await receiveNewInventoryItem({
    item: {
      type: "RAW_MATERIAL",
      serialization: "UNIT",
      metalId: String(ex.oldJewellery.metalId),
      purity: ex.oldJewellery.assessedPurity,
      grossWeight: ex.oldJewellery.grossWeight,
      stoneWeight: ex.oldJewellery.stoneWeight,
      locationId: input.locationId,
      status: "AVAILABLE",
      cost: ex.oldJewellery.valuation,
      quantity: 1,
    },
    performedBy: actor.id,
    channel: "ERP",
    referenceType: "MANUAL",
    referenceId: ex.id,
    reason: `Taken in on exchange ${ex.exchangeNo}`,
    movementType: "EXCHANGE_IN",
  });

  const difference = input.newProduct.lineTotal - ex.oldJewellery.valuation;
  const now = new Date();
  const updated = await applyExchange(ex._id, "complete", actor, {
    set: {
      newProduct: input.newProduct,
      oldItemId: item.id,
      ...(input.orderId ? { orderId: oid(input.orderId) } : {}),
      ...(input.orderNo ? { orderNo: input.orderNo } : {}),
      settlement: { difference, method: input.settlement.method, reference: input.settlement.reference, note: input.settlement.note, recordedAt: now, recordedByName: actor.name },
    },
  });
  if (!updated) throw new ConflictError("This exchange changed — please look again.");
  await audit(actor, AUDIT_ACTIONS.EXCHANGE_COMPLETED, "Exchange", updated.id, { exchangeNo: updated.exchangeNo, oldItemCode: item.itemCode, newSku: input.newProduct.sku, difference });
  return exchangeView(updated.toObject());
}

export async function cancelExchange(id: string, actor: Actor, reason?: string): Promise<Exchange> {
  const updated = await applyExchange(id, "cancel", actor, { note: reason });
  if (!updated) throw new NotFoundError("Exchange", id);
  await audit(actor, AUDIT_ACTIONS.EXCHANGE_CANCELLED, "Exchange", updated.id, { exchangeNo: updated.exchangeNo, reason });
  return exchangeView(updated.toObject());
}

export async function requireExchange(id: string): Promise<ExchangeDocument> {
  const doc = await ExchangeModel.findById(id);
  if (!doc) throw new NotFoundError("Exchange", id);
  return doc;
}
export async function getExchange(id: string): Promise<Exchange> {
  return exchangeView((await requireExchange(id)).toObject());
}
export async function listExchanges(filter: { status?: string } = {}): Promise<Exchange[]> {
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = { $in: filter.status.split(",") };
  const docs = await ExchangeModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
  return docs.map((d) => exchangeView(d as never));
}
