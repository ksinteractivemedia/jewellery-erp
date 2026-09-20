import mongoose, { Types } from "mongoose";
import type { InventoryItem, InventoryLedgerEntry, Transaction } from "@jewellery/types";
import { postInventoryTransactionSchema, type CreateInventoryItemInput, type PostInventoryTransactionInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO } from "../../shared/to-dto";
import { createInventoryItem } from "./inventory-item.service";
import { InventoryItemModel } from "./inventory-item.model";
import { insertLedgerEntry, listLedgerForItem } from "./inventory-ledger.repository";
import { assertLegalTransition } from "./status-transitions";
import { createTransaction } from "./transaction.repository";
import { roundWeight } from "./weight-calculations";

export interface PostedInventoryTransaction {
  transaction: Transaction;
  entries: InventoryLedgerEntry[];
}

/**
 * The only path that changes an InventoryItem's status/location/weight/quantity after
 * creation (business-rules.md §2.1). Posts one Transaction header + one InventoryLedger
 * entry per line, atomically, in a single MongoDB session — everything commits together
 * or nothing does. Every status change is checked against status-transitions.ts before
 * anything is written.
 *
 * Weight/quantity semantics: a UNIT item's own weight never changes as it moves between
 * statuses/locations (it's the same physical piece), so its ledger line records the
 * item's current weight as an informational amount and `quantity` is always 1. A BATCH
 * item's weight/quantity genuinely change as material is issued/received against it, so
 * `weightDelta`/`quantityDelta` are applied to the item's own totals. Batch raw material
 * has no stone component, so gross == net for a batch delta; fine weight is derived from
 * the item's already-recorded fineness (see weight-calculations.ts).
 */
export async function postInventoryTransaction(input: PostInventoryTransactionInput): Promise<PostedInventoryTransaction> {
  const parsed = postInventoryTransactionSchema.parse(input);
  const session = await mongoose.startSession();

  try {
    let result!: PostedInventoryTransaction;

    await session.withTransaction(async () => {
      const transaction = await createTransaction(
        {
          type: parsed.type,
          channel: parsed.channel,
          referenceType: parsed.referenceType,
          referenceId: parsed.referenceId,
          performedBy: parsed.performedBy,
          reason: parsed.reason,
        },
        session
      );

      const entries: InventoryLedgerEntry[] = [];

      for (const line of parsed.lines) {
        const itemDoc = await InventoryItemModel.findById(line.itemId).session(session);
        if (!itemDoc) throw new NotFoundError("InventoryItem", line.itemId);

        const fromStatus = itemDoc.status;
        const fromLocationId = itemDoc.locationId;
        assertLegalTransition(fromStatus, line.toStatus);

        const isUnit = itemDoc.serialization === "UNIT";
        const movementType = line.movementType ?? parsed.type;
        const quantityDelta = isUnit ? 1 : line.quantityDelta ?? 0;
        const weightDelta = isUnit ? 0 : line.weightDelta ?? 0;
        const fineDelta = isUnit ? 0 : roundWeight(weightDelta * itemDoc.fineness);

        itemDoc.status = line.toStatus;
        if (line.destinationLocationId) {
          itemDoc.locationId = new Types.ObjectId(line.destinationLocationId);
        }
        if (!isUnit) {
          itemDoc.grossWeight = roundWeight(itemDoc.grossWeight + weightDelta);
          itemDoc.netWeight = roundWeight(itemDoc.netWeight + weightDelta);
          itemDoc.fineWeight = roundWeight(itemDoc.fineWeight + fineDelta);
          itemDoc.quantity = itemDoc.quantity + quantityDelta;
        }
        await itemDoc.save({ session });

        const entry = await insertLedgerEntry(
          {
            transactionId: transaction.id,
            itemId: line.itemId,
            movementType,
            quantity: quantityDelta,
            grossWeight: isUnit ? itemDoc.grossWeight : weightDelta,
            netWeight: isUnit ? itemDoc.netWeight : weightDelta,
            fineWeight: isUnit ? itemDoc.fineWeight : fineDelta,
            fromStatus,
            toStatus: line.toStatus,
            sourceLocationId: String(fromLocationId),
            destinationLocationId: line.destinationLocationId ?? String(fromLocationId),
          },
          session
        );
        entries.push(entry);
      }

      result = { transaction, entries };
    });

    return result;
  } finally {
    await session.endSession();
  }
}

export interface ReceiveNewInventoryItemInput {
  item: CreateInventoryItemInput;
  performedBy: string;
  channel: "ERP" | "B2C" | "B2B";
  referenceType: "SUPPLIER_PURCHASE_ORDER" | "GOODS_RECEIPT" | "MANUAL" | "PRODUCTION_ORDER" | "JOB_WORK_ORDER";
  referenceId?: string;
  reason?: string;
}

/**
 * Creates a brand-new InventoryItem and its first ledger entry atomically — the "stock
 * enters the business" case, where there is no prior status/location (sourceLocationId
 * is intentionally omitted; see inventory-ledger.ts).
 */
export async function receiveNewInventoryItem(input: ReceiveNewInventoryItemInput): Promise<{
  item: InventoryItem;
  transaction: Transaction;
  entry: InventoryLedgerEntry;
}> {
  const session = await mongoose.startSession();
  try {
    let result!: { item: InventoryItem; transaction: Transaction; entry: InventoryLedgerEntry };

    await session.withTransaction(async () => {
      const item = await createInventoryItem(input.item, session);

      const transaction = await createTransaction(
        {
          type: "GOODS_RECEIPT",
          channel: input.channel,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          performedBy: input.performedBy,
          reason: input.reason,
        },
        session
      );

      const entry = await insertLedgerEntry(
        {
          transactionId: transaction.id,
          itemId: item.id,
          movementType: "GOODS_RECEIPT",
          quantity: item.quantity,
          grossWeight: item.grossWeight,
          netWeight: item.netWeight,
          fineWeight: item.fineWeight,
          toStatus: item.status,
          destinationLocationId: item.locationId,
        },
        session
      );

      result = { item, transaction, entry };
    });

    return result;
  } finally {
    await session.endSession();
  }
}

/** Convenience read: the fully resolved ledger trail for one item, oldest first. */
export async function getItemHistory(itemId: string) {
  return listLedgerForItem(itemId);
}
