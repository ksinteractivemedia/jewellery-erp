import type { ReturnChannel } from "@jewellery/types";
import { NotFoundError } from "../../shared/errors";
import { CustomerModel } from "../customers/customer.model";
import { OrderModel } from "../orders/order.model";
import { SalesOrderModel } from "../b2b/b2b.models";

/**
 * What a return needs to know about the order it's against, resolved from the order itself —
 * never trusted from the request. `soldItemIds`/`lineRefForItem` come from the order's own
 * `allocations` (the one place, for either channel, that says which exact `InventoryItem` was sold
 * against which line — business-rules.md §2.3), not from the request body.
 */
export interface OrderLineInfo {
  sku: string;
  name: string;
  unitPrice: number;
}

export interface OrderContext {
  orderNo: string;
  customer: { id?: string; name: string; email?: string; phone?: string };
  soldItemIds: Set<string>;
  lineRefForItem: Map<string, string>;
  /** What the order itself says was bought on a given line — sku/name/price frozen at the time of sale, never re-derived from the current catalogue. */
  lineInfo: Map<string, OrderLineInfo>;
}

async function b2cContext(orderId: string): Promise<OrderContext> {
  const order = await OrderModel.findById(orderId).lean();
  if (!order) throw new NotFoundError("Order", orderId);
  const lineRefForItem = new Map<string, string>();
  for (const a of order.allocations) for (const itemId of a.itemIds) lineRefForItem.set(String(itemId), String(a.lineId));
  const lineInfo = new Map<string, OrderLineInfo>(order.items.map((i) => [String(i._id), { sku: i.sku, name: i.name, unitPrice: i.unitPrice }]));
  return {
    orderNo: order.orderNo,
    customer: { ...(order.customer.userId ? { id: String(order.customer.userId) } : {}), name: order.customer.fullName, email: order.customer.email, phone: order.customer.phone },
    soldItemIds: new Set(lineRefForItem.keys()),
    lineRefForItem,
    lineInfo,
  };
}

async function b2bContext(orderId: string): Promise<OrderContext> {
  const so = await SalesOrderModel.findById(orderId).lean();
  if (!so) throw new NotFoundError("Sales order", orderId);
  const lineRefForItem = new Map<string, string>();
  for (const a of so.allocations) for (const itemId of a.itemIds) lineRefForItem.set(String(itemId), String(a.lineIndex));
  const lineInfo = new Map<string, OrderLineInfo>(so.lines.map((l, idx) => [String(idx), { sku: l.sku, name: l.name, unitPrice: l.unitTotal / Math.max(l.quantity, 1) }]));
  const customerDoc = await CustomerModel.findById(so.customerId).select("email phone").lean();
  return {
    orderNo: so.soNo,
    customer: { id: String(so.customerId), name: so.customerName, ...(customerDoc?.email ? { email: customerDoc.email } : {}), ...(customerDoc?.phone ? { phone: customerDoc.phone } : {}) },
    soldItemIds: new Set(lineRefForItem.keys()),
    lineRefForItem,
    lineInfo,
  };
}

export function resolveOrderContext(channel: ReturnChannel, orderId: string): Promise<OrderContext> {
  return channel === "B2C" ? b2cContext(orderId) : b2bContext(orderId);
}
