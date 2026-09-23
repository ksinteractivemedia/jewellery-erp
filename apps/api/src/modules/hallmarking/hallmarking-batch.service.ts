import type { HallmarkingBatch } from "@jewellery/types";
import type { CreateHallmarkingBatchInput, ReceiveHallmarkingBatchInput } from "@jewellery/validation";
import { businessDay } from "../dashboard/range";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { InventoryItemModel, postInSession, withInventoryTransaction } from "../inventory";
import { requireAssayingCentre } from "./assaying-centre.service";
import { checkLineOutcome } from "./hallmarking-status";
import { hallmarkingBatchView } from "./hallmarking-views";
import { applyHallmarking, audit, nextNo, oid, type Actor } from "./hallmarking-store";
import { HallmarkingBatchModel, type HallmarkingBatchDocument } from "./hallmarking.models";

/** Earmarks items to send — nothing physically moves yet (they stay AVAILABLE) until the batch is dispatched. */
export async function createHallmarkingBatch(actor: Actor, input: CreateHallmarkingBatchInput): Promise<HallmarkingBatch> {
  const centre = await requireAssayingCentre(input.assayingCentreId);
  const items = await InventoryItemModel.find({ _id: { $in: input.itemIds } });
  if (items.length !== input.itemIds.length) throw new NotFoundError("Inventory item", input.itemIds.join(","));
  for (const item of items) if (item.status !== "AVAILABLE") throw new ConflictError(`${item.itemCode} is not available to send (it is ${item.status.toLowerCase()}).`);

  const now = new Date();
  const doc = await HallmarkingBatchModel.create({
    hallmarkingNo: await nextNo(),
    status: "PENDING",
    assayingCentreId: oid(input.assayingCentreId),
    assayingCentreName: centre.name,
    ...(input.expectedReturnDate ? { expectedReturnDate: input.expectedReturnDate } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    lines: items.map((i) => ({ itemId: i._id, itemCode: i.itemCode, purity: i.purity, grossWeight: i.grossWeight, fromLocationId: i.locationId })),
    history: [{ status: "PENDING", at: now, by: oid(actor.id), byName: actor.name }],
  });
  return hallmarkingBatchView(doc.toObject());
}

/** Sends the batch: every item moves AVAILABLE -> HALLMARKING in one ledger transaction, destined for the centre's own location. */
export async function dispatchHallmarkingBatch(id: string, actor: Actor): Promise<HallmarkingBatch> {
  const batch = await requireHallmarkingBatch(id);
  const centre = await requireAssayingCentre(String(batch.assayingCentreId));
  const itemIds = batch.lines.map((l) => String(l.itemId));
  const items = await InventoryItemModel.find({ _id: { $in: itemIds } });
  for (const item of items) if (item.status !== "AVAILABLE") throw new ConflictError(`${item.itemCode} is no longer available to send (it is ${item.status.toLowerCase()}).`);

  await withInventoryTransaction(async (session) => {
    await postInSession(session, {
      type: "HALLMARKING_OUT",
      channel: "ERP",
      referenceType: "MANUAL",
      referenceId: batch.id,
      performedBy: actor.id,
      reason: `Sent to ${centre.name} on ${batch.hallmarkingNo}`,
      lines: items.map((i) => ({ itemId: String(i._id), destinationLocationId: String(centre.locationId) })),
    });
    const moved = await applyHallmarking(batch._id, "dispatch", actor, { session, set: { sentDate: businessDay(new Date()) } });
    if (!moved) throw new ConflictError("This hallmarking batch changed — please look again.");
  });
  await audit(actor, AUDIT_ACTIONS.HALLMARKING_DISPATCHED, "HallmarkingBatch", batch.id, { hallmarkingNo: batch.hallmarkingNo, centre: centre.name, items: items.length });
  return hallmarkingBatchView((await requireHallmarkingBatch(id)).toObject());
}

export async function arriveHallmarkingBatch(id: string, actor: Actor, notes?: string): Promise<HallmarkingBatch> {
  const updated = await applyHallmarking(id, "arrive", actor, { note: notes });
  if (!updated) throw new NotFoundError("Hallmarking batch", id);
  return hallmarkingBatchView(updated.toObject());
}

/**
 * The batch comes back: every item moves HALLMARKING -> AVAILABLE, back to wherever it was sent
 * *from* (never into the centre's own location, which isn't a stock location — the same pattern
 * manufacturing/job-work returns use). A HUID, if the centre actually applied one, is recorded per
 * piece here; uniqueness is enforced by the one shared rule everywhere a HUID is set
 * (inventory-transaction.service.ts) — never re-implemented here.
 */
export async function receiveHallmarkingBatch(id: string, actor: Actor, input: ReceiveHallmarkingBatchInput): Promise<HallmarkingBatch> {
  const batch = await requireHallmarkingBatch(id);
  const byItemId = new Map(input.lines.map((l) => [l.itemId, l]));
  const batchItemIds = new Set(batch.lines.map((l) => String(l.itemId)));
  for (const l of input.lines) if (!batchItemIds.has(l.itemId)) throw new ConflictError(`Item ${l.itemId} is not on this hallmarking batch.`);
  // The whole shipment travels together (the same whole-item-only rule as every other movement in this
  // module) — a receipt that named only some of the batch's pieces would still flip the batch to
  // RECEIVED while the omitted pieces stay stuck in HALLMARKING status/location. Never partial: every
  // piece on the batch must be accounted for (with a HUID, or without one if it came back unmarked).
  const missing = batch.lines.filter((l) => !byItemId.has(String(l.itemId)));
  if (missing.length) throw new ConflictError(`Every piece on this batch must be receipted together — missing: ${missing.map((l) => l.itemCode).join(", ")}.`);

  await withInventoryTransaction(async (session) => {
    await postInSession(session, {
      type: "HALLMARKING_IN",
      channel: "ERP",
      referenceType: "MANUAL",
      referenceId: batch.id,
      performedBy: actor.id,
      reason: `Received back from ${batch.assayingCentreName} on ${batch.hallmarkingNo}`,
      lines: batch.lines
        .filter((l) => byItemId.has(String(l.itemId)))
        .map((l) => {
          const rl = byItemId.get(String(l.itemId))!;
          return { itemId: String(l.itemId), destinationLocationId: String(l.fromLocationId), ...(rl.huid ? { huid: rl.huid } : {}) };
        }),
    });
    // Explicit fields only — never spread a live Mongoose subdocument (it silently drops nested-typed fields; see fulfilment.service.ts's own note on this).
    const updatedLines = batch.lines.map((l) => {
      const rl = byItemId.get(String(l.itemId));
      return {
        itemId: l.itemId,
        itemCode: l.itemCode,
        purity: l.purity,
        grossWeight: l.grossWeight,
        fromLocationId: l.fromLocationId,
        huid: rl?.huid ?? l.huid,
        certificateNumber: rl?.certificateNumber ?? l.certificateNumber,
        hallmarkDate: rl?.hallmarkDate ?? l.hallmarkDate,
        outcome: l.outcome,
        failureReason: l.failureReason,
      };
    });
    const moved = await applyHallmarking(batch._id, "receive", actor, { session, set: { lines: updatedLines } });
    if (!moved) throw new ConflictError("This hallmarking batch changed — please look again.");
  });
  await audit(actor, AUDIT_ACTIONS.HALLMARKING_RECEIVED, "HallmarkingBatch", batch.id, { hallmarkingNo: batch.hallmarkingNo, lines: input.lines.length, withHuid: input.lines.filter((l) => l.huid).length });
  return hallmarkingBatchView((await requireHallmarkingBatch(id)).toObject());
}

export async function verifyHallmarkingLine(id: string, itemId: string, actor: Actor, notes?: string): Promise<HallmarkingBatch> {
  const batch = await requireHallmarkingBatch(id);
  const line = batch.lines.find((l) => String(l.itemId) === itemId);
  if (!line) throw new NotFoundError("Hallmarking line", itemId);
  checkLineOutcome(batch.status, line.outcome);
  const updated = await HallmarkingBatchModel.findOneAndUpdate(
    { _id: batch._id, "lines.itemId": oid(itemId) },
    { $set: { "lines.$.outcome": "VERIFIED" }, $push: { history: { status: "VERIFIED", at: new Date(), by: oid(actor.id), byName: actor.name, note: notes ? `${line.itemCode}: ${notes}` : line.itemCode } } },
    { new: true }
  );
  if (!updated) throw new ConflictError("This hallmarking batch changed — please look again.");
  await audit(actor, AUDIT_ACTIONS.HALLMARKING_VERIFIED, "HallmarkingBatch", batch.id, { hallmarkingNo: batch.hallmarkingNo, itemCode: line.itemCode, huid: line.huid, notes });
  return hallmarkingBatchView(updated.toObject());
}

export async function failHallmarkingLine(id: string, itemId: string, actor: Actor, failureReason: string): Promise<HallmarkingBatch> {
  const batch = await requireHallmarkingBatch(id);
  const line = batch.lines.find((l) => String(l.itemId) === itemId);
  if (!line) throw new NotFoundError("Hallmarking line", itemId);
  checkLineOutcome(batch.status, line.outcome);
  const updated = await HallmarkingBatchModel.findOneAndUpdate(
    { _id: batch._id, "lines.itemId": oid(itemId) },
    { $set: { "lines.$.outcome": "FAILED", "lines.$.failureReason": failureReason }, $push: { history: { status: "FAILED", at: new Date(), by: oid(actor.id), byName: actor.name, note: `${line.itemCode}: ${failureReason}` } } },
    { new: true }
  );
  if (!updated) throw new ConflictError("This hallmarking batch changed — please look again.");
  await audit(actor, AUDIT_ACTIONS.HALLMARKING_FAILED, "HallmarkingBatch", batch.id, { hallmarkingNo: batch.hallmarkingNo, itemCode: line.itemCode, failureReason });
  return hallmarkingBatchView(updated.toObject());
}

/** Only before dispatch — nothing has physically moved yet, so there is nothing to reverse. */
export async function cancelHallmarkingBatch(id: string, actor: Actor, reason?: string): Promise<HallmarkingBatch> {
  const updated = await applyHallmarking(id, "cancel", actor, { note: reason });
  if (!updated) throw new NotFoundError("Hallmarking batch", id);
  await audit(actor, AUDIT_ACTIONS.HALLMARKING_CANCELLED, "HallmarkingBatch", updated.id, { hallmarkingNo: updated.hallmarkingNo, reason });
  return hallmarkingBatchView(updated.toObject());
}

export async function requireHallmarkingBatch(id: string): Promise<HallmarkingBatchDocument> {
  const doc = await HallmarkingBatchModel.findById(id);
  if (!doc) throw new NotFoundError("Hallmarking batch", id);
  return doc;
}
export async function getHallmarkingBatch(id: string): Promise<HallmarkingBatch> {
  return hallmarkingBatchView((await requireHallmarkingBatch(id)).toObject());
}
export async function listHallmarkingBatches(filter: { status?: string } = {}): Promise<HallmarkingBatch[]> {
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = { $in: filter.status.split(",") };
  const docs = await HallmarkingBatchModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
  return docs.map((d) => hallmarkingBatchView(d as never));
}
