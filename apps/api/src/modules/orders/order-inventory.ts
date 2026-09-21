import type { ClientSession } from "mongoose";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import { postInSession, withInventoryTransaction } from "../inventory/inventory-transaction.service";
import { releaseItems, SYSTEM_ACTOR_ID } from "../inventory/stock-operations";
import { ConcurrentModificationError, IllegalTransitionError, InsufficientStockError, NotFoundError, ReservationConflictError } from "../../shared/errors";
import type { OrderDocument } from "./order.model";

/** Storefront stock movements are done by the system on the customer's behalf; the order id is the audit trail. */
const ACTOR = SYSTEM_ACTOR_ID;

const allocated = (order: Pick<OrderDocument, "allocations">): string[] => order.allocations.flatMap((a) => a.itemIds.map(String));

/** The errors that mean "that piece is no longer ours to sell" — as opposed to a bug or an outage. */
export const isStockConflict = (e: unknown) =>
  e instanceof ReservationConflictError || e instanceof IllegalTransitionError || e instanceof ConcurrentModificationError || e instanceof InsufficientStockError || e instanceof NotFoundError;

/**
 * Pieces for a bag: for each design (and size) the oldest available, unreserved pieces, skipping any in `avoid`. Returns null if
 * there are not enough — the caller decides what that means (an issue in verification, STOCK_CHANGED at placing).
 */
export async function pickPieces(needs: { productId: string; variantId?: string; quantity: number }[], avoid: Set<string> = new Set()): Promise<string[][] | null> {
  const out: string[][] = [];
  const taken = new Set(avoid);
  for (const need of needs) {
    const rows = await InventoryItemModel.find({
      productId: need.productId,
      variantId: need.variantId ?? null, // null also matches a piece with no size recorded
      status: "AVAILABLE",
      type: "FINISHED_JEWELLERY",
      reservation: { $exists: false },
      quantity: { $gt: 0 },
    })
      .sort({ createdAt: 1, _id: 1 })
      .limit(need.quantity + taken.size)
      .select("_id")
      .lean();
    const ids = rows.map((r) => String(r._id)).filter((id) => !taken.has(id)).slice(0, need.quantity);
    if (ids.length < need.quantity) return null;
    ids.forEach((id) => taken.add(id));
    out.push(ids);
  }
  return out;
}

/** Hold pieces for an order. `inSession` lets the caller commit the hold together with its own order write. */
export function holdPieces(session: ClientSession, orderId: string, itemIds: string[], expiresAt: Date) {
  return postInSession(session, {
    type: "RESERVATION",
    channel: "B2C",
    referenceType: "ORDER",
    referenceId: orderId,
    performedBy: ACTOR,
    reason: "Held for an online checkout",
    lines: itemIds.map((itemId) => ({ itemId, reservation: { referenceType: "ORDER", referenceId: orderId, expiresAt } })),
  });
}

/** Pieces that are still held (RESERVED) for this very order — an expiry sweep may already have freed some. */
async function stillHeld(order: Pick<OrderDocument, "id" | "allocations">): Promise<string[]> {
  const ids = allocated(order);
  if (!ids.length) return [];
  const rows = await InventoryItemModel.find({ _id: { $in: ids }, status: "RESERVED", "reservation.referenceId": order.id }).select("_id").lean();
  return rows.map((r) => String(r._id));
}

/** Give back what the order is still holding. Idempotent: pieces already freed are simply not touched. */
export async function releaseHeldPieces(order: Pick<OrderDocument, "id" | "allocations">, reason: string): Promise<number> {
  const held = await stillHeld(order);
  if (held.length) await releaseItems({ performedBy: ACTOR, channel: "B2C" }, { itemIds: held, referenceId: order.id, referenceType: "ORDER", reason });
  return held.length;
}

/** The pieces are sold: RESERVED-for-this-order (or still AVAILABLE if the hold lapsed unnoticed) → SOLD. Throws a stock conflict if anyone else has them. */
export function sellPieces(session: ClientSession, order: Pick<OrderDocument, "id" | "allocations">) {
  return postInSession(session, {
    type: "SALE",
    channel: "B2C",
    referenceType: "ORDER",
    referenceId: order.id,
    performedBy: ACTOR,
    reason: "Online order paid",
    lines: allocated(order).map((itemId) => ({ itemId, reservation: { referenceType: "ORDER", referenceId: order.id } })),
  });
}

/**
 * A paid order is cancelled: the pieces come back SOLD → RETURNED, where they physically are. They are then inspected in the
 * ERP (the "returns awaiting inspection" queue) before they go back on sale — a piece is never silently resellable.
 */
export async function returnSoldPieces(order: Pick<OrderDocument, "id" | "allocations">, reason: string) {
  return withInventoryTransaction(async (session) => {
    const items = await InventoryItemModel.find({ _id: { $in: allocated(order) }, status: "SOLD" }).session(session);
    if (!items.length) return;
    await postInSession(session, {
      type: "RETURN",
      channel: "B2C",
      referenceType: "ORDER",
      referenceId: order.id,
      performedBy: ACTOR,
      reason,
      lines: items.map((i) => ({ itemId: String(i._id), toStatus: "RETURNED" as const, destinationLocationId: String(i.locationId) })),
    });
  });
}

