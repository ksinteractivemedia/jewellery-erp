import { RepairOrderModel } from "./repair.models";

export async function repairDashboard(): Promise<{ counts: Record<string, number> }> {
  const rows = await RepairOrderModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]);
  const counts: Record<string, number> = { INTAKE: 0, INSPECTED: 0, ESTIMATED: 0, APPROVED: 0, DECLINED: 0, IN_PROGRESS: 0, QC_PENDING: 0, QC_FAILED: 0, READY: 0, DELIVERED: 0, CANCELLED: 0 };
  for (const r of rows) counts[r._id] = r.count;
  return { counts };
}
