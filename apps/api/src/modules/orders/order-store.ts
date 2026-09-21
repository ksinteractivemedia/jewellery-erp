import type { ClientSession } from "mongoose";
import { Types } from "mongoose";
import type { OrderStatus } from "@jewellery/types";
import { OrderModel, type OrderDocument } from "./order.model";
import { assertOrderTransition } from "./order-status";

export interface MoveOptions {
  reason?: string;
  at?: Date;
  session?: ClientSession;
  /** Extra mutable fields to set in the same write (paidAt, paymentId …). */
  set?: Record<string, unknown>;
  unset?: string[];
}

/**
 * Move an order along its lifecycle: the transition must be legal, and the write is a compare-and-set on the status we
 * read, so of two racing movers (a webhook and an expiry sweep, say) exactly one wins and the other gets `null` and must
 * look again. The history line records where it came from and why. Nothing else in the codebase writes `status`.
 */
export async function moveOrder(orderId: string | Types.ObjectId, to: OrderStatus, allowedFrom: readonly OrderStatus[], opts: MoveOptions = {}): Promise<OrderDocument | null> {
  const current = await OrderModel.findById(orderId).session(opts.session ?? null);
  if (!current || !allowedFrom.includes(current.status)) return null;
  assertOrderTransition(current.status, to);
  const at = opts.at ?? new Date();
  return OrderModel.findOneAndUpdate(
    { _id: current._id, status: current.status },
    {
      $set: { status: to, ...(opts.set ?? {}) },
      ...(opts.unset?.length ? { $unset: Object.fromEntries(opts.unset.map((k) => [k, 1])) } : {}),
      $push: { statusHistory: { from: current.status, to, at, ...(opts.reason ? { reason: opts.reason } : {}) } },
    },
    { new: true, session: opts.session }
  );
}
