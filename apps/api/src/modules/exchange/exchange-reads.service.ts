import { ExchangeModel } from "./exchange.models";

export async function exchangeDashboard(): Promise<{ counts: Record<string, number> }> {
  const rows = await ExchangeModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
  const counts: Record<string, number> = { DRAFT: 0, ASSESSED: 0, COMPLETED: 0, CANCELLED: 0 };
  for (const r of rows) counts[r._id] = r.count;
  return { counts };
}
