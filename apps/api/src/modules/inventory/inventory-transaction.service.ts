import mongoose, { Types, type ClientSession } from "mongoose";
import type { InventoryItem, InventoryLedgerEntry, InventoryStatus, MovementType, Transaction } from "@jewellery/types";
import { postInventoryTransactionSchema, type CreateInventoryItemInput, type PostInventoryTransactionInput } from "@jewellery/validation";
import {
  ConcurrentModificationError,
  DomainValidationError,
  DuplicateIdentifierError,
  IllegalTransitionError,
  InsufficientStockError,
  NotFoundError,
  ReservationConflictError,
} from "../../shared/errors";
import { toDTO } from "../../shared/to-dto";
import { LocationModel } from "../organization/location.model";
import { InventoryItemModel } from "./inventory-item.model";
import { createInventoryItem, translateDuplicateKey } from "./inventory-item.service";
import { insertLedgerEntry, listLedgerForItem } from "./inventory-ledger.repository";
import { MOVEMENT_RULES, allowedTargets, isCreationMovement } from "./movement-rules";
import { assertLegalTransition } from "./status-transitions";
import { createTransaction } from "./transaction.repository";
import { calculateNetWeight, deriveWeights, roundWeight } from "./weight-calculations";

export interface PostedInventoryTransaction {
  transaction: Transaction;
  entries: InventoryLedgerEntry[];
}

/**
 * Runs `fn` in one MongoDB transaction, retrying on transient conflicts (which is how a losing
 * writer in a race learns the world changed). `fn` may therefore run more than once: it must derive
 * everything from what it reads inside the session, never from captured mutable state.
 */
export async function withInventoryTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

/** Public entry: post one Transaction header + one ledger entry per line, atomically. */
export function postInventoryTransaction(input: PostInventoryTransactionInput): Promise<PostedInventoryTransaction> {
  return withInventoryTransaction((session) => postInSession(session, input));
}

/**
 * The only path that changes an InventoryItem's status/location/weight/quantity after creation
 * (business-rules.md §2.1). Callers that must combine the ledger write with other documents (a
 * transfer, an adjustment approval) call this inside their own `withInventoryTransaction`.
 *
 * Per line: the movement rule (movement-rules.ts) and the status graph (status-transitions.ts) must
 * both allow it; weights/quantity may never go negative; the write is a compare-and-set on the item's
 * `ledgerSeq`, so of two concurrent movements on one item exactly one commits and the other fails
 * with a typed error; and the ledger entry carries the item's balance after the movement.
 */
export async function postInSession(session: ClientSession, input: PostInventoryTransactionInput): Promise<PostedInventoryTransaction> {
  const parsed = postInventoryTransactionSchema.parse(input);
  const transaction = await createTransaction(
    { type: parsed.type, channel: parsed.channel, referenceType: parsed.referenceType, referenceId: parsed.referenceId, performedBy: parsed.performedBy, reason: parsed.reason },
    session
  );

  const explicitDestinations = [...new Set(parsed.lines.map((l) => l.destinationLocationId).filter((id): id is string => Boolean(id)))];
  const locations = new Map((await LocationModel.find({ _id: { $in: explicitDestinations } }).session(session).lean()).map((l) => [String(l._id), l]));

  const entries: InventoryLedgerEntry[] = [];
  for (const line of parsed.lines) {
    const movementType: MovementType = line.movementType ?? parsed.type;
    const rule = MOVEMENT_RULES[movementType];
    const doc = await InventoryItemModel.findById(line.itemId).session(session);
    if (!doc) throw new NotFoundError("InventoryItem", line.itemId);
    if (line.expectedLedgerSeq !== undefined && line.expectedLedgerSeq !== doc.ledgerSeq) throw new ConcurrentModificationError("InventoryItem", doc.itemCode);

    // --- which status change is this? -------------------------------------------------------
    const from = doc.status as InventoryStatus;
    const isAdjustment = movementType === "ADJUSTMENT";
    const targets = allowedTargets(movementType, from);
    const to: InventoryStatus = line.toStatus ?? (isAdjustment ? from : (targets[0] as InventoryStatus));
    if (isAdjustment) {
      if (to !== from) assertLegalTransition(from, to);
    } else {
      if (!targets.includes(to)) throw new IllegalTransitionError(from, to ?? "(none)", movementType);
      assertLegalTransition(from, to);
    }

    // --- where does it end up? ---------------------------------------------------------------
    let destinationId = String(doc.locationId);
    if (line.destinationLocationId) {
      const location = locations.get(line.destinationLocationId);
      if (!location) throw new NotFoundError("Location", line.destinationLocationId);
      if (!location.isActive) throw new DomainValidationError(`Location ${location.name} is not active`);
      if (rule.destination && !rule.destination.includes(location.type)) {
        throw new DomainValidationError(`${movementType} cannot use ${location.name} (${location.type}) — expected ${rule.destination.join(" / ")}`);
      }
      destinationId = line.destinationLocationId;
    } else if (rule.destination && movementType !== "PURCHASE_RECEIPT") {
      // Custody moves must say where the piece goes — never silently leave it at the partner or in transit.
      throw new DomainValidationError(`${movementType} needs a destination location`);
    }

    // --- weights & quantity ------------------------------------------------------------------
    const isUnit = doc.serialization === "UNIT";
    const before = { quantity: doc.quantity, grossWeight: doc.grossWeight, stoneWeight: doc.stoneWeight, netWeight: doc.netWeight, fineWeight: doc.fineWeight };
    const after = { ...before };
    const hasWeightEdit = line.setGrossWeight !== undefined || line.setStoneWeight !== undefined;

    if (isUnit) {
      if (line.quantityDelta !== undefined || line.weightDelta !== undefined) throw new DomainValidationError("a unit item moves as a whole piece — use setGrossWeight/setStoneWeight to correct its weight");
      if (hasWeightEdit) {
        if (!isAdjustment) throw new DomainValidationError("weights can only be changed by an ADJUSTMENT");
        after.grossWeight = roundWeight(line.setGrossWeight ?? doc.grossWeight);
        after.stoneWeight = roundWeight(line.setStoneWeight ?? doc.stoneWeight);
        after.netWeight = calculateNetWeight(after.grossWeight, after.stoneWeight);
        if (doc.type !== "LOOSE_STONE" && after.netWeight <= 0) throw new DomainValidationError("net weight must be positive — stone weight cannot equal or exceed gross weight");
        after.fineWeight = deriveWeights(after.grossWeight, after.stoneWeight, doc.fineness).fineWeight;
      }
    } else {
      if (hasWeightEdit) throw new DomainValidationError("a batch is corrected with weightDelta/quantityDelta, not absolute weights");
      const dW = line.weightDelta ?? 0;
      const dQ = line.quantityDelta ?? 0;
      after.grossWeight = roundWeight(doc.grossWeight + dW);
      after.netWeight = roundWeight(doc.netWeight + dW);
      after.fineWeight = roundWeight(doc.fineWeight + roundWeight(dW * doc.fineness));
      after.quantity = doc.quantity + dQ;
      if (after.quantity < 0 || after.grossWeight < 0 || after.netWeight < 0 || after.fineWeight < 0) {
        throw new InsufficientStockError(`${doc.itemCode} has ${before.quantity} / ${before.grossWeight} g on hand — cannot take ${Math.abs(dQ)} / ${Math.abs(dW)} g`);
      }
    }
    if (isAdjustment && to === from && !hasWeightEdit && line.weightDelta === undefined && line.quantityDelta === undefined) {
      throw new DomainValidationError("an adjustment must change something");
    }

    // --- reservation ownership ---------------------------------------------------------------
    const set: Record<string, unknown> = { status: to, locationId: new Types.ObjectId(destinationId) };
    const unset: Record<string, 1> = {};
    if (movementType === "RESERVATION") {
      if (!isUnit) throw new DomainValidationError("only individual pieces can be reserved");
      if (!line.reservation) throw new DomainValidationError("a reservation needs the order it is held for");
      set.reservation = {
        referenceType: line.reservation.referenceType,
        referenceId: new Types.ObjectId(line.reservation.referenceId),
        reservedAt: new Date(),
        reservedBy: new Types.ObjectId(parsed.performedBy),
        ...(line.reservation.expiresAt ? { expiresAt: line.reservation.expiresAt } : {}),
      };
    } else if (from === "RESERVED") {
      const holder = doc.reservation ? String(doc.reservation.referenceId) : undefined;
      if (!line.overrideReservation && holder !== line.reservation?.referenceId) {
        throw new ReservationConflictError(`${doc.itemCode} is reserved for a different order`);
      }
      unset.reservation = 1;
    }

    // --- hallmark side effects ---------------------------------------------------------------
    if (movementType === "HALLMARKING_OUT" && doc.hallmarkStatus === "NOT_APPLICABLE") set.hallmarkStatus = "PENDING";
    if (movementType === "HALLMARKING_IN" && line.huid) {
      if (doc.huid && doc.huid !== line.huid) throw new DuplicateIdentifierError("HUID", `${doc.huid} (already set; a HUID cannot change)`);
      if (!doc.huid && (await InventoryItemModel.exists({ huid: line.huid, _id: { $ne: doc._id } }).session(session))) throw new DuplicateIdentifierError("HUID", line.huid);
      set.huid = line.huid;
      set.hallmarkStatus = "HALLMARKED";
    }
    Object.assign(set, isUnit && !hasWeightEdit ? {} : { grossWeight: after.grossWeight, stoneWeight: after.stoneWeight, netWeight: after.netWeight, fineWeight: after.fineWeight, quantity: after.quantity });

    // --- compare-and-set write ---------------------------------------------------------------
    let updated;
    try {
      updated = await InventoryItemModel.findOneAndUpdate(
        { _id: doc._id, ledgerSeq: doc.ledgerSeq },
        { $set: set, $inc: { ledgerSeq: 1 }, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
        { new: true, session }
      );
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) translateDuplicateKey(error);
      throw error;
    }
    if (!updated) throw new ConcurrentModificationError("InventoryItem", doc.itemCode);

    entries.push(
      await insertLedgerEntry(
        {
          transactionId: transaction.id,
          itemId: line.itemId,
          movementType,
          sequence: updated.ledgerSeq,
          quantity: after.quantity - before.quantity,
          grossWeight: roundWeight(after.grossWeight - before.grossWeight),
          netWeight: roundWeight(after.netWeight - before.netWeight),
          fineWeight: roundWeight(after.fineWeight - before.fineWeight),
          balanceAfter: { quantity: after.quantity, grossWeight: after.grossWeight, stoneWeight: after.stoneWeight, netWeight: after.netWeight, fineWeight: after.fineWeight },
          fromStatus: from,
          toStatus: to,
          sourceLocationId: String(doc.locationId),
          destinationLocationId: destinationId,
        },
        session
      )
    );
  }
  return { transaction, entries };
}

export interface ReceiveNewInventoryItemInput {
  item: CreateInventoryItemInput;
  performedBy: string;
  channel: "ERP" | "B2C" | "B2B";
  referenceType: "SUPPLIER_PURCHASE_ORDER" | "GOODS_RECEIPT" | "MANUAL" | "PRODUCTION_ORDER" | "JOB_WORK_ORDER";
  referenceId?: string;
  reason?: string;
  /** How the stock entered: bought in, came off the bench, or returned from a job worker. Defaults to PURCHASE_RECEIPT. */
  movementType?: "PURCHASE_RECEIPT" | "MANUFACTURING_RECEIPT" | "JOBWORK_RECEIPT" | "ADJUSTMENT";
}

/**
 * Creates a brand-new InventoryItem and its first ledger entry (sequence 1) atomically — the "stock
 * enters the business" case, where there is no prior status/location.
 */
export async function receiveNewInventoryItem(input: ReceiveNewInventoryItemInput): Promise<{ item: InventoryItem; transaction: Transaction; entry: InventoryLedgerEntry }> {
  const movementType = input.movementType ?? "PURCHASE_RECEIPT";
  if (!isCreationMovement(movementType)) throw new DomainValidationError(`${movementType} cannot bring new stock into the business`);
  const rule = MOVEMENT_RULES[movementType];

  return withInventoryTransaction(async (session) => {
    const location = await LocationModel.findById(input.item.locationId).session(session).lean();
    if (!location) throw new NotFoundError("Location", String(input.item.locationId));
    if (!location.isActive) throw new DomainValidationError(`Location ${location.name} is not active`);
    if (rule.destination && !rule.destination.includes(location.type)) throw new DomainValidationError(`stock cannot be received into ${location.name} (${location.type})`);

    const item = await createInventoryItem(input.item, session, { ledgerSeq: 1 });
    const transaction = await createTransaction(
      { type: movementType, channel: input.channel, referenceType: input.referenceType, referenceId: input.referenceId, performedBy: input.performedBy, reason: input.reason },
      session
    );
    const entry = await insertLedgerEntry(
      {
        transactionId: transaction.id,
        itemId: item.id,
        movementType,
        sequence: 1,
        quantity: item.quantity,
        grossWeight: item.grossWeight,
        netWeight: item.netWeight,
        fineWeight: item.fineWeight,
        balanceAfter: { quantity: item.quantity, grossWeight: item.grossWeight, stoneWeight: item.stoneWeight, netWeight: item.netWeight, fineWeight: item.fineWeight },
        toStatus: item.status,
        destinationLocationId: item.locationId,
      },
      session
    );
    return { item, transaction, entry };
  });
}

/** Convenience read: the ledger trail for one item, oldest first. */
export async function getItemHistory(itemId: string) {
  return listLedgerForItem(itemId);
}

export { toDTO };
