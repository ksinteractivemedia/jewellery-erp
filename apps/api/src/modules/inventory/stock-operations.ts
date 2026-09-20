import { Types } from "mongoose";
import type { InventoryItem, InventoryStatus, StockAdjustment, StockTransfer } from "@jewellery/types";
import {
  requestAdjustmentSchema,
  updateInventoryItemDetailsSchema,
  type RequestAdjustmentInput,
  type UpdateInventoryItemDetailsInput,
} from "@jewellery/validation";
import { AuthorizationError, ConflictError, ConcurrentModificationError, DomainValidationError, DuplicateIdentifierError, NotFoundError } from "../../shared/errors";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { toDTO } from "../../shared/to-dto";
import { LocationModel } from "../organization/location.model";
import { InventoryItemModel } from "./inventory-item.model";
import { assertIdentifiersFree, translateDuplicateKey } from "./inventory-item.service";
import { postInSession, withInventoryTransaction, type PostedInventoryTransaction } from "./inventory-transaction.service";
import { STOCK_LOCATION_TYPES } from "./movement-rules";
import { StockAdjustmentModel } from "./stock-adjustment.model";
import { StockTransferModel } from "./stock-transfer.model";
import { assertLegalTransition } from "./status-transitions";
import { calculateNetWeight } from "./weight-calculations";

/** Who is acting. `performedBy` lands on the Transaction; `channel` says which front door the stock event came through. */
export interface OpContext {
  performedBy: string;
  channel?: "ERP" | "B2C" | "B2B";
}
const chan = (ctx: OpContext) => ctx.channel ?? "ERP";

/** Attribution for system work (the reservation-expiry sweep) — a reserved, recognisable id, not a real user. */
export const SYSTEM_ACTOR_ID = "000000000000000000000000";

const lines = (itemIds: string[], extra: Record<string, unknown> = {}) => itemIds.map((itemId) => ({ itemId, ...extra }));

// --- reservation ------------------------------------------------------------------------------

export function reserveItems(
  ctx: OpContext,
  input: { itemIds: string[]; referenceType?: "ORDER" | "CUSTOMER_PURCHASE_ORDER" | "MANUAL"; referenceId: string; expiresAt?: Date; reason?: string }
): Promise<PostedInventoryTransaction> {
  const referenceType = input.referenceType ?? "ORDER";
  return withInventoryTransaction((session) =>
    postInSession(session, {
      type: "RESERVATION",
      channel: chan(ctx),
      referenceType,
      referenceId: input.referenceId,
      performedBy: ctx.performedBy,
      reason: input.reason,
      lines: lines(input.itemIds, { reservation: { referenceType, referenceId: input.referenceId, expiresAt: input.expiresAt } }),
    })
  );
}

export function releaseItems(
  ctx: OpContext,
  input: { itemIds: string[]; referenceId: string; referenceType?: "ORDER" | "CUSTOMER_PURCHASE_ORDER" | "MANUAL"; force?: boolean; reason?: string }
): Promise<PostedInventoryTransaction> {
  const referenceType = input.referenceType ?? "ORDER";
  return withInventoryTransaction((session) =>
    postInSession(session, {
      type: "RELEASE_RESERVATION",
      channel: chan(ctx),
      referenceType,
      referenceId: input.referenceId,
      performedBy: ctx.performedBy,
      reason: input.reason,
      lines: lines(input.itemIds, { reservation: { referenceType, referenceId: input.referenceId }, overrideReservation: input.force === true }),
    })
  );
}

/** Reservations past their expiry (checkout abandoned) go back on the shelf. Idempotent; safe to run on a schedule. */
export async function releaseExpiredReservations(now: Date = new Date()): Promise<{ released: number; skipped: number }> {
  const stale = await InventoryItemModel.find({ status: "RESERVED", "reservation.expiresAt": { $lte: now } }).select("_id reservation").lean();
  let released = 0;
  let skipped = 0;
  for (const item of stale) {
    try {
      await releaseItems({ performedBy: SYSTEM_ACTOR_ID }, {
        itemIds: [String(item._id)],
        referenceId: String(item.reservation!.referenceId),
        referenceType: item.reservation!.referenceType,
        reason: "Reservation expired",
      });
      released++;
    } catch {
      skipped++; // changed under us (sold, released by hand) — the sweep must never fail the batch
    }
  }
  return { released, skipped };
}

// --- sale & return ----------------------------------------------------------------------------

/** A piece is sold: AVAILABLE, or RESERVED *for this same order*, → SOLD. */
export function sellItems(
  ctx: OpContext,
  input: { itemIds: string[]; referenceType: "ORDER" | "INVOICE" | "CUSTOMER_PURCHASE_ORDER"; referenceId: string; reason?: string }
): Promise<PostedInventoryTransaction> {
  return withInventoryTransaction((session) =>
    postInSession(session, {
      type: "SALE",
      channel: chan(ctx),
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      performedBy: ctx.performedBy,
      reason: input.reason,
      // The claimant is the order the sale belongs to — a hold for anyone else refuses the sale.
      lines: lines(input.itemIds, { reservation: { referenceType: input.referenceType === "INVOICE" ? "ORDER" : input.referenceType, referenceId: input.referenceId } }),
    })
  );
}

/** A sold piece comes back (SOLD → RETURNED) into the location that received it. */
export function returnItems(
  ctx: OpContext,
  input: { itemIds: string[]; destinationLocationId: string; referenceType?: "ORDER" | "INVOICE" | "CUSTOMER_PURCHASE_ORDER"; referenceId?: string; reason?: string }
): Promise<PostedInventoryTransaction> {
  return withInventoryTransaction((session) =>
    postInSession(session, {
      type: "RETURN",
      channel: chan(ctx),
      referenceType: input.referenceType ?? "MANUAL",
      referenceId: input.referenceId,
      performedBy: ctx.performedBy,
      reason: input.reason,
      lines: lines(input.itemIds, { toStatus: "RETURNED", destinationLocationId: input.destinationLocationId }),
    })
  );
}

/** Inspection outcome for a returned piece: back on the shelf, or written down as damaged. */
export function inspectReturnedItems(
  ctx: OpContext,
  input: { itemIds: string[]; outcome: "AVAILABLE" | "DAMAGED"; destinationLocationId: string; reason?: string }
): Promise<PostedInventoryTransaction> {
  return withInventoryTransaction((session) =>
    postInSession(session, {
      type: "RETURN",
      channel: chan(ctx),
      referenceType: "MANUAL",
      performedBy: ctx.performedBy,
      reason: input.reason ?? "Return inspected",
      lines: lines(input.itemIds, { toStatus: input.outcome, destinationLocationId: input.destinationLocationId }),
    })
  );
}

// --- partner movements (workshop, job worker, hallmarking centre, repairer) -------------------

export function movePartner(
  ctx: OpContext,
  input: {
    type: "MANUFACTURING_ISSUE" | "MANUFACTURING_RECEIPT" | "JOBWORK_ISSUE" | "JOBWORK_RECEIPT" | "REPAIR_OUT" | "REPAIR_IN" | "HALLMARKING_OUT" | "HALLMARKING_IN";
    itemIds: string[];
    destinationLocationId: string;
    reason?: string;
    hallmarkResults?: { itemId: string; huid: string }[];
  }
): Promise<PostedInventoryTransaction> {
  const huidByItem = new Map((input.hallmarkResults ?? []).map((r) => [r.itemId, r.huid]));
  for (const id of huidByItem.keys()) if (!input.itemIds.includes(id)) throw new DomainValidationError("hallmark result for an item that is not part of this movement");
  return withInventoryTransaction((session) =>
    postInSession(session, {
      type: input.type,
      channel: chan(ctx),
      referenceType: "MANUAL",
      performedBy: ctx.performedBy,
      reason: input.reason,
      lines: input.itemIds.map((itemId) => ({ itemId, destinationLocationId: input.destinationLocationId, ...(huidByItem.has(itemId) ? { huid: huidByItem.get(itemId) } : {}) })),
    })
  );
}

// --- transfers --------------------------------------------------------------------------------

async function requireStockLocation(id: string, session: import("mongoose").ClientSession, label: string) {
  const location = await LocationModel.findById(id).session(session).lean();
  if (!location) throw new NotFoundError("Location", id);
  if (!location.isActive) throw new DomainValidationError(`${label} ${location.name} is not active`);
  if (!STOCK_LOCATION_TYPES.includes(location.type)) throw new DomainValidationError(`${label} ${location.name} is a ${location.type} — transfers are between stores, warehouses, counters and vaults`);
  return location;
}

const transferDto = (doc: unknown) => toDTO<StockTransfer>(doc as never)!;

/**
 * Dispatch: every piece must be AVAILABLE and physically at the source. One MongoDB transaction
 * creates the transfer and posts TRANSFER_OUT (AVAILABLE → IN_TRANSIT, location = destination).
 * If any piece isn't eligible, nothing at all is dispatched.
 */
export async function createTransfer(ctx: OpContext, input: { fromLocationId: string; toLocationId: string; itemIds: string[]; notes?: string }): Promise<StockTransfer> {
  if (input.fromLocationId === input.toLocationId) throw new DomainValidationError("source and destination must differ");
  const transferNo = formatDocumentNumber("TRF", await nextSequence("stockTransfer"));

  return withInventoryTransaction(async (session) => {
    await requireStockLocation(input.fromLocationId, session, "Source");
    await requireStockLocation(input.toLocationId, session, "Destination");
    const items = await InventoryItemModel.find({ _id: { $in: input.itemIds } }).session(session).lean();
    if (items.length !== input.itemIds.length) throw new NotFoundError("InventoryItem", input.itemIds.find((id) => !items.some((i) => String(i._id) === id)) ?? "");
    const misplaced = items.filter((i) => String(i.locationId) !== input.fromLocationId);
    if (misplaced.length) throw new ConflictError(`${misplaced.map((i) => i.itemCode).join(", ")} ${misplaced.length === 1 ? "is" : "are"} not at the source location`);

    const transferId = new Types.ObjectId();
    await postInSession(session, {
      type: "TRANSFER_OUT",
      channel: chan(ctx),
      referenceType: "STOCK_TRANSFER",
      referenceId: String(transferId),
      performedBy: ctx.performedBy,
      reason: input.notes,
      lines: lines(input.itemIds, { destinationLocationId: input.toLocationId }),
    });
    const [doc] = await StockTransferModel.create(
      [{
        _id: transferId,
        transferNo,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        status: "IN_TRANSIT",
        lines: items.map((i) => ({ itemId: i._id, itemCode: i.itemCode, state: "PENDING" })),
        notes: input.notes,
        dispatchedBy: ctx.performedBy,
        dispatchedAt: new Date(),
      }],
      { session }
    );
    return transferDto(doc);
  });
}

function settle(doc: InstanceType<typeof StockTransferModel>, by: string) {
  const pending = doc.lines.filter((l) => l.state === "PENDING").length;
  if (pending === 0) {
    doc.status = doc.lines.some((l) => l.state === "RECEIVED") ? "RECEIVED" : "CANCELLED";
    doc.closedBy = new Types.ObjectId(by);
    doc.closedAt = new Date();
  }
}

/** Receipt at the destination: TRANSFER_IN (IN_TRANSIT → AVAILABLE). May be partial; the transfer closes when nothing is pending. */
export function receiveTransfer(ctx: OpContext, transferId: string, itemIds?: string[]): Promise<StockTransfer> {
  return withInventoryTransaction(async (session) => {
    const doc = await StockTransferModel.findById(transferId).session(session);
    if (!doc) throw new NotFoundError("StockTransfer", transferId);
    if (doc.status !== "IN_TRANSIT") throw new ConflictError(`Transfer ${doc.transferNo} is already ${doc.status.toLowerCase()}`);
    const pending = doc.lines.filter((l) => l.state === "PENDING");
    const chosen = itemIds ? pending.filter((l) => itemIds.includes(String(l.itemId))) : pending;
    if (itemIds && chosen.length !== itemIds.length) throw new DomainValidationError("some pieces are not pending on this transfer");
    if (chosen.length === 0) throw new DomainValidationError("nothing left to receive");

    await postInSession(session, {
      type: "TRANSFER_IN",
      channel: chan(ctx),
      referenceType: "STOCK_TRANSFER",
      referenceId: transferId,
      performedBy: ctx.performedBy,
      lines: lines(chosen.map((l) => String(l.itemId)), { destinationLocationId: String(doc.toLocationId) }),
    });
    for (const line of chosen) Object.assign(doc.lines.find((l) => String(l.itemId) === String(line.itemId))!, { state: "RECEIVED", resolvedAt: new Date() });
    settle(doc, ctx.performedBy);
    await doc.save({ session });
    return transferDto(doc);
  });
}

/** Cancel: every piece still pending goes back to the source (TRANSFER_IN at the origin). Received pieces stay where they arrived. */
export function cancelTransfer(ctx: OpContext, transferId: string, reason?: string): Promise<StockTransfer> {
  return withInventoryTransaction(async (session) => {
    const doc = await StockTransferModel.findById(transferId).session(session);
    if (!doc) throw new NotFoundError("StockTransfer", transferId);
    if (doc.status !== "IN_TRANSIT") throw new ConflictError(`Transfer ${doc.transferNo} is already ${doc.status.toLowerCase()}`);
    const pending = doc.lines.filter((l) => l.state === "PENDING");
    await postInSession(session, {
      type: "TRANSFER_IN",
      channel: chan(ctx),
      referenceType: "STOCK_TRANSFER",
      referenceId: transferId,
      performedBy: ctx.performedBy,
      reason: reason ? `Transfer cancelled: ${reason}` : "Transfer cancelled — returned to source",
      lines: lines(pending.map((l) => String(l.itemId)), { destinationLocationId: String(doc.fromLocationId) }),
    });
    for (const line of pending) Object.assign(doc.lines.find((l) => String(l.itemId) === String(line.itemId))!, { state: "RETURNED", resolvedAt: new Date() });
    settle(doc, ctx.performedBy);
    await doc.save({ session });
    return transferDto(doc);
  });
}

// --- adjustments (request → approval by someone else → ledger) ---------------------------------

export async function requestAdjustment(ctx: OpContext, input: RequestAdjustmentInput): Promise<StockAdjustment> {
  const parsed = requestAdjustmentSchema.parse(input);
  const adjustmentNo = formatDocumentNumber("ADJ", await nextSequence("stockAdjustment"));
  const item = await InventoryItemModel.findById(parsed.itemId).lean();
  if (!item) throw new NotFoundError("InventoryItem", parsed.itemId);

  // Reject an impossible request up front — an approver shouldn't be asked to approve something that can never apply.
  if (parsed.toStatus && parsed.toStatus !== item.status) assertLegalTransition(item.status, parsed.toStatus);
  if (item.serialization === "UNIT") {
    if (parsed.quantityDelta !== undefined || parsed.weightDelta !== undefined) throw new DomainValidationError("a unit piece is re-weighed with gross/stone weight, not deltas");
    const gross = parsed.grossWeight ?? item.grossWeight;
    const stone = parsed.stoneWeight ?? item.stoneWeight;
    const net = calculateNetWeight(gross, stone);
    if (item.type !== "LOOSE_STONE" && net <= 0) throw new DomainValidationError("net weight must be positive");
  } else if (parsed.grossWeight !== undefined || parsed.stoneWeight !== undefined) {
    throw new DomainValidationError("a batch is corrected with quantity/weight deltas");
  }
  if (parsed.toStatus === item.status && parsed.grossWeight === undefined && parsed.stoneWeight === undefined && parsed.quantityDelta === undefined && parsed.weightDelta === undefined) {
    throw new DomainValidationError(`the item is already ${item.status}`);
  }

  const doc = await StockAdjustmentModel.create({
    adjustmentNo,
    itemId: item._id,
    itemCode: item.itemCode,
    status: "PENDING",
    reason: parsed.reason,
    expectedLedgerSeq: item.ledgerSeq,
    toStatus: parsed.toStatus,
    grossWeight: parsed.grossWeight,
    stoneWeight: parsed.stoneWeight,
    quantityDelta: parsed.quantityDelta,
    weightDelta: parsed.weightDelta,
    requestedBy: ctx.performedBy,
  });
  return toDTO<StockAdjustment>(doc)!;
}

/**
 * Four-eyes: the approver must be a different person from the requester, and the item must be exactly
 * as it was when the request was made (`expectedLedgerSeq`) — otherwise the correction may no longer be
 * the right one. Approval posts the ledger entry and closes the request in one transaction.
 */
export function approveAdjustment(ctx: OpContext, adjustmentId: string, note?: string): Promise<StockAdjustment> {
  return withInventoryTransaction(async (session) => {
    const adj = await StockAdjustmentModel.findById(adjustmentId).session(session);
    if (!adj) throw new NotFoundError("StockAdjustment", adjustmentId);
    if (adj.status !== "PENDING") throw new ConflictError(`Adjustment ${adj.adjustmentNo} is already ${adj.status.toLowerCase()}`);
    if (String(adj.requestedBy) === ctx.performedBy) throw new AuthorizationError("You cannot approve your own adjustment request");

    const type = adj.toStatus === "SCRAP" ? "SCRAP" : adj.toStatus === "MELTING" ? "MELTING" : "ADJUSTMENT";
    const { transaction } = await postInSession(session, {
      type,
      channel: chan(ctx),
      referenceType: "ADJUSTMENT",
      referenceId: String(adj._id),
      performedBy: ctx.performedBy,
      reason: adj.reason,
      lines: [{
        itemId: String(adj.itemId),
        expectedLedgerSeq: adj.expectedLedgerSeq,
        ...(adj.toStatus ? { toStatus: adj.toStatus as InventoryStatus } : {}),
        ...(adj.grossWeight !== undefined ? { setGrossWeight: adj.grossWeight } : {}),
        ...(adj.stoneWeight !== undefined ? { setStoneWeight: adj.stoneWeight } : {}),
        ...(adj.quantityDelta !== undefined ? { quantityDelta: adj.quantityDelta } : {}),
        ...(adj.weightDelta !== undefined ? { weightDelta: adj.weightDelta } : {}),
      }],
    });
    adj.status = "APPROVED";
    adj.decidedBy = new Types.ObjectId(ctx.performedBy);
    adj.decidedAt = new Date();
    adj.decisionNote = note;
    adj.transactionId = new Types.ObjectId(transaction.id);
    await adj.save({ session });
    return toDTO<StockAdjustment>(adj)!;
  });
}

export async function rejectAdjustment(ctx: OpContext, adjustmentId: string, note?: string): Promise<StockAdjustment> {
  const doc = await StockAdjustmentModel.findOneAndUpdate(
    { _id: adjustmentId, status: "PENDING" },
    { $set: { status: "REJECTED", decidedBy: ctx.performedBy, decidedAt: new Date(), decisionNote: note } },
    { new: true }
  );
  if (!doc) {
    const existing = await StockAdjustmentModel.findById(adjustmentId).lean();
    if (!existing) throw new NotFoundError("StockAdjustment", adjustmentId);
    throw new ConflictError(`Adjustment ${existing.adjustmentNo} is already ${existing.status.toLowerCase()}`);
  }
  return toDTO<StockAdjustment>(doc)!;
}

// --- identifiers (not stock, but still guarded) ------------------------------------------------

/**
 * Barcode / serial / HUID / stone details. A HUID is the piece's legal identity: it can be set once
 * (which also marks the piece HALLMARKED) and never changed. Duplicates are refused with a typed error.
 */
export async function updateItemIdentifiers(itemId: string, input: UpdateInventoryItemDetailsInput): Promise<InventoryItem> {
  const parsed = updateInventoryItemDetailsSchema.parse(input);
  const item = await InventoryItemModel.findById(itemId);
  if (!item) throw new NotFoundError("InventoryItem", itemId);

  if (parsed.huid) {
    if (item.huid && item.huid !== parsed.huid) throw new DuplicateIdentifierError("HUID", `${item.huid} (already set; a HUID cannot be changed)`);
    if (!item.huid) item.set({ huid: parsed.huid, hallmarkStatus: "HALLMARKED" });
  }
  if (parsed.barcode) item.barcode = parsed.barcode;
  if (parsed.serialNumber) item.serialNumber = parsed.serialNumber;
  if (parsed.stoneDetails) item.set("stoneDetails", parsed.stoneDetails);
  await assertIdentifiersFree({ huid: parsed.huid, barcode: parsed.barcode, serialNumber: parsed.serialNumber }, itemId);
  try {
    await item.save();
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) translateDuplicateKey(error);
    throw error;
  }
  return toDTO<InventoryItem>(item)!;
}

export { ConcurrentModificationError };
