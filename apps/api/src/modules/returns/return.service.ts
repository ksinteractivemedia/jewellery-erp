import type { Return, ReturnChannel } from "@jewellery/types";
import type { InspectReturnInput, ReceiveReturnInput, RequestReturnByOrderLinesInput, RequestReturnInput, SettleReturnInput } from "@jewellery/validation";
import { ConflictError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { InventoryItemModel, postInSession, withInventoryTransaction } from "../inventory";
import { resolveOrderContext } from "./order-context";
import { applyReturn, audit, nextNo, oid, type Actor } from "./returns-store";
import { returnView } from "./returns-views";
import { ReturnModel, type ReturnDocument } from "./returns.models";

/**
 * A return must identify the exact InventoryItem it's against — never just "one of this SKU" — and
 * every one of those pieces must have actually been sold on the named order (business-rules.md §2.3:
 * an order holds and sells specific pieces, so returning one is checking the same specific piece
 * back in). Nothing here ever touches `Product.quantity` — there is no such field; stock only moves
 * through the ledger (CLAUDE.md rule 2).
 */
export async function requestReturn(actor: Actor, channel: ReturnChannel, input: RequestReturnInput): Promise<Return> {
  const ctx = await resolveOrderContext(channel, input.orderId);
  const unsold = input.itemIds.filter((id) => !ctx.soldItemIds.has(id));
  if (unsold.length) throw new DomainValidationError(`these pieces were not sold on order ${ctx.orderNo}: ${unsold.join(", ")}`);

  const items = await InventoryItemModel.find({ _id: { $in: input.itemIds } }).lean();
  if (items.length !== input.itemIds.length) throw new NotFoundError("Inventory item", input.itemIds.find((id) => !items.some((i) => String(i._id) === id)) ?? "");
  const notSold = items.filter((i) => i.status !== "SOLD");
  if (notSold.length) throw new ConflictError(`${notSold.map((i) => i.itemCode).join(", ")} ${notSold.length === 1 ? "is" : "are"} not currently marked sold — check whether it was already returned.`);
  const already = await ReturnModel.exists({ "lines.itemId": { $in: input.itemIds }, status: { $nin: ["REJECTED", "CANCELLED"] } });
  if (already) throw new ConflictError("One or more of these pieces already has an open return.");

  const now = new Date();
  const lines = items.map((i) => {
    const lineRef = ctx.lineRefForItem.get(String(i._id))!;
    const info = ctx.lineInfo.get(lineRef);
    if (!info) throw new DomainValidationError(`could not find the order line ${i.itemCode} was sold on`);
    return { itemId: i._id, itemCode: i.itemCode, sku: info.sku, name: info.name, orderLineRef: lineRef, ...(i.huid ? { huid: i.huid } : {}), grossWeight: i.grossWeight, unitPrice: info.unitPrice };
  });

  const doc = await ReturnModel.create({
    returnNo: await nextNo(),
    channel,
    status: "REQUESTED",
    orderId: oid(input.orderId),
    orderNo: ctx.orderNo,
    customer: { ...(ctx.customer.id ? { id: oid(ctx.customer.id) } : {}), name: ctx.customer.name, email: ctx.customer.email, phone: ctx.customer.phone },
    reason: input.reason,
    ...(input.reasonNote ? { reasonNote: input.reasonNote } : {}),
    lines,
    refundableTotal: lines.reduce((sum, l) => sum + l.unitPrice, 0),
    history: [{ status: "REQUESTED", at: now, by: oid(actor.id), byName: actor.name }],
  });
  await audit(actor, AUDIT_ACTIONS.RETURN_REQUESTED, "Return", doc.id, { returnNo: doc.returnNo, orderNo: ctx.orderNo, channel, items: lines.length, reason: input.reason });
  return returnView(doc.toObject());
}

/**
 * The customer-facing entry point: a shopper/buyer names their own order LINES, never an internal
 * InventoryItem id (they don't have one to name) — resolved here from the order's own record of which
 * exact piece was sold on which line, then delegated to the same validated path as everything else.
 */
export async function requestReturnForOrderLines(actor: Actor, channel: ReturnChannel, orderId: string, input: RequestReturnByOrderLinesInput): Promise<Return> {
  const ctx = await resolveOrderContext(channel, orderId);
  const wanted = new Set(input.lineRefs);
  const itemIds = [...ctx.lineRefForItem.entries()].filter(([, lineRef]) => wanted.has(lineRef)).map(([itemId]) => itemId);
  if (itemIds.length === 0) throw new DomainValidationError("none of those lines were sold on this order");
  return requestReturn(actor, channel, { orderId, itemIds, reason: input.reason, ...(input.reasonNote ? { reasonNote: input.reasonNote } : {}) });
}

export async function approveReturn(id: string, actor: Actor, note?: string): Promise<Return> {
  const updated = await applyReturn(id, "approve", actor, { note });
  if (!updated) throw new NotFoundError("Return", id);
  await audit(actor, AUDIT_ACTIONS.RETURN_APPROVED, "Return", updated.id, { returnNo: updated.returnNo, note });
  return returnView(updated.toObject());
}

export async function rejectReturn(id: string, actor: Actor, reason: string): Promise<Return> {
  const updated = await applyReturn(id, "reject", actor, { note: reason, set: { rejectedReason: reason } });
  if (!updated) throw new NotFoundError("Return", id);
  await audit(actor, AUDIT_ACTIONS.RETURN_REJECTED, "Return", updated.id, { returnNo: updated.returnNo, reason });
  return returnView(updated.toObject());
}

/**
 * The piece is physically back: ledgered SOLD → RETURNED, into the location it's received at. The
 * HUID and weight are checked against what the order actually sold (business-rules.md §17.2) — a
 * mismatch on the HUID is refused outright (this cannot be the same piece); a weight that has moved
 * needs a note, same discipline as a goods receipt's weight-discrepancy check (§14.4).
 */
export async function receiveReturn(id: string, actor: Actor, input: ReceiveReturnInput): Promise<Return> {
  const { destinationLocationId } = input;
  const ret = await requireReturn(id);
  if (ret.status !== "APPROVED") throw new ConflictError(`Return ${ret.returnNo} is ${ret.status.toLowerCase()} — only an approved return can be received.`);
  const byItemId = new Map(input.lines.map((l) => [l.itemId, l]));
  const returnItemIds = new Set(ret.lines.map((l) => String(l.itemId)));
  for (const l of input.lines) if (!returnItemIds.has(l.itemId)) throw new ConflictError(`Item ${l.itemId} is not on this return.`);
  const missing = ret.lines.filter((l) => !byItemId.has(String(l.itemId)));
  if (missing.length) throw new ConflictError(`Every piece on this return must be received together — missing: ${missing.map((l) => l.itemCode).join(", ")}.`);

  for (const l of ret.lines) {
    const rl = byItemId.get(String(l.itemId))!;
    if (rl.observedHuid && l.huid && rl.observedHuid.toUpperCase() !== l.huid.toUpperCase()) {
      throw new ConflictError(`${l.itemCode} was sold with HUID ${l.huid} — the piece presented reads ${rl.observedHuid}. This cannot be received as the same item.`);
    }
    if (rl.observedGrossWeight !== undefined && Math.abs(rl.observedGrossWeight - l.grossWeight) > 0.5 && !rl.weightDiscrepancyNote) {
      throw new DomainValidationError(`${l.itemCode} weighed ${l.grossWeight} g at sale, now reads ${rl.observedGrossWeight} g — a note is needed to receive it at this weight.`);
    }
  }

  await withInventoryTransaction(async (session) => {
    await postInSession(session, {
      type: "RETURN",
      channel: "ERP",
      referenceType: "RETURN",
      referenceId: ret.id,
      performedBy: actor.id,
      reason: `Received on ${ret.returnNo}`,
      lines: ret.lines.map((l) => ({ itemId: String(l.itemId), toStatus: "RETURNED" as const, destinationLocationId })),
    });
    const updatedLines = ret.lines.map((l) => {
      const rl = byItemId.get(String(l.itemId))!;
      return { itemId: l.itemId, itemCode: l.itemCode, sku: l.sku, name: l.name, orderLineRef: l.orderLineRef, huid: l.huid, grossWeight: l.grossWeight, unitPrice: l.unitPrice, weightDiscrepancyNote: rl.weightDiscrepancyNote };
    });
    const moved = await applyReturn(ret._id, "receive", actor, { session, set: { lines: updatedLines, receivedAt: new Date() } });
    if (!moved) throw new ConflictError("This return changed — please look again.");
  });
  await audit(actor, AUDIT_ACTIONS.RETURN_RECEIVED, "Return", ret.id, { returnNo: ret.returnNo, items: ret.lines.length });
  return returnView((await requireReturn(id)).toObject());
}

/**
 * Per-piece inspection outcome: ledgered RETURNED → AVAILABLE (resellable) or DAMAGED — never
 * silently back on the shelf without a condition being recorded.
 */
export async function inspectReturn(id: string, actor: Actor, input: InspectReturnInput): Promise<Return> {
  const ret = await requireReturn(id);
  if (ret.status !== "RECEIVED") throw new ConflictError(`Return ${ret.returnNo} is ${ret.status.toLowerCase()} — only a received return can be inspected.`);
  const byItemId = new Map(input.lines.map((l) => [l.itemId, l]));
  const returnItemIds = new Set(ret.lines.map((l) => String(l.itemId)));
  for (const l of input.lines) if (!returnItemIds.has(l.itemId)) throw new ConflictError(`Item ${l.itemId} is not on this return.`);
  const missing = ret.lines.filter((l) => !byItemId.has(String(l.itemId)));
  if (missing.length) throw new ConflictError(`Every piece on this return must be inspected together — missing: ${missing.map((l) => l.itemCode).join(", ")}.`);

  const items = await InventoryItemModel.find({ _id: { $in: ret.lines.map((l) => l.itemId) } }).lean();
  const locationOf = new Map(items.map((i) => [String(i._id), String(i.locationId)]));

  await withInventoryTransaction(async (session) => {
    await postInSession(session, {
      type: "RETURN",
      channel: "ERP",
      referenceType: "RETURN",
      referenceId: ret.id,
      performedBy: actor.id,
      reason: `Inspected on ${ret.returnNo}`,
      lines: ret.lines.map((l) => {
        const rl = byItemId.get(String(l.itemId))!;
        return { itemId: String(l.itemId), toStatus: rl.condition === "GOOD" ? ("AVAILABLE" as const) : ("DAMAGED" as const), destinationLocationId: locationOf.get(String(l.itemId))! };
      }),
    });
    const updatedLines = ret.lines.map((l) => {
      const rl = byItemId.get(String(l.itemId))!;
      return { itemId: l.itemId, itemCode: l.itemCode, sku: l.sku, name: l.name, orderLineRef: l.orderLineRef, huid: l.huid, grossWeight: l.grossWeight, unitPrice: l.unitPrice, weightDiscrepancyNote: l.weightDiscrepancyNote, condition: rl.condition, conditionNote: rl.conditionNote };
    });
    const moved = await applyReturn(ret._id, "inspect", actor, { session, set: { lines: updatedLines, inspectedAt: new Date() } });
    if (!moved) throw new ConflictError("This return changed — please look again.");
  });
  await audit(actor, AUDIT_ACTIONS.RETURN_INSPECTED, "Return", ret.id, { returnNo: ret.returnNo, conditions: input.lines.map((l) => ({ itemId: l.itemId, condition: l.condition })) });
  return returnView((await requireReturn(id)).toObject());
}

/** No stock movement — just the financial record of how the return was made whole. */
export async function settleReturn(id: string, actor: Actor, input: SettleReturnInput): Promise<Return> {
  const now = new Date();
  const updated = await applyReturn(id, "settle", actor, {
    note: `${input.method} ${(input.amount / 100).toFixed(2)}`,
    set: { settlement: { method: input.method, amount: input.amount, reference: input.reference, note: input.note, recordedAt: now, recordedByName: actor.name } },
  });
  if (!updated) throw new NotFoundError("Return", id);
  await audit(actor, AUDIT_ACTIONS.RETURN_SETTLED, "Return", updated.id, { returnNo: updated.returnNo, method: input.method, amount: input.amount });
  return returnView(updated.toObject());
}

export async function cancelReturn(id: string, actor: Actor, reason?: string): Promise<Return> {
  const updated = await applyReturn(id, "cancel", actor, { note: reason });
  if (!updated) throw new NotFoundError("Return", id);
  await audit(actor, AUDIT_ACTIONS.RETURN_CANCELLED, "Return", updated.id, { returnNo: updated.returnNo, reason });
  return returnView(updated.toObject());
}

export async function requireReturn(id: string): Promise<ReturnDocument> {
  const doc = await ReturnModel.findById(id);
  if (!doc) throw new NotFoundError("Return", id);
  return doc;
}
export async function getReturn(id: string): Promise<Return> {
  return returnView((await requireReturn(id)).toObject());
}
