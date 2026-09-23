import type { Return } from "@jewellery/types";
import { returnView } from "./returns-views";
import { ReturnModel } from "./returns.models";

export async function listReturns(filter: { status?: string; channel?: string; orderId?: string } = {}): Promise<Return[]> {
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = { $in: filter.status.split(",") };
  if (filter.channel) query.channel = filter.channel;
  if (filter.orderId) query.orderId = filter.orderId;
  const docs = await ReturnModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
  return docs.map((d) => returnView(d as never));
}

/** For a guest (order token) or a B2B buyer — only their own returns, never someone else's by guessing an id. */
export async function listReturnsForCustomer(customerId: string): Promise<Return[]> {
  const docs = await ReturnModel.find({ "customer.id": customerId }).sort({ createdAt: -1 }).limit(100).lean();
  return docs.map((d) => returnView(d as never));
}
export async function listReturnsForOrder(orderId: string): Promise<Return[]> {
  const docs = await ReturnModel.find({ orderId }).sort({ createdAt: -1 }).lean();
  return docs.map((d) => returnView(d as never));
}

/** Counts by status — the queue the ERP dashboard and the returns screen's tabs show. */
export async function returnsDashboard(): Promise<{ counts: Record<string, number> }> {
  const rows = await ReturnModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
  const counts: Record<string, number> = { REQUESTED: 0, APPROVED: 0, REJECTED: 0, RECEIVED: 0, INSPECTED: 0, SETTLED: 0, CANCELLED: 0 };
  for (const r of rows) counts[r._id] = r.count;
  return { counts };
}
