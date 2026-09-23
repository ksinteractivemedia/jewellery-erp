import type { HallmarkingBatch, HallmarkingDashboard } from "@jewellery/types";
import { hallmarkingBatchView } from "./hallmarking-views";
import { oid } from "./hallmarking-store";
import { HallmarkingBatchModel } from "./hallmarking.models";

/** Counts by EFFECTIVE status (a line's own outcome once it has one, otherwise its batch's shared stage) — what the dashboard's tabs show. */
export async function hallmarkingDashboard(): Promise<HallmarkingDashboard> {
  const docs = await HallmarkingBatchModel.find({ status: { $ne: "CANCELLED" } }).lean();
  const counts = { pending: 0, inTransit: 0, atCentre: 0, received: 0, verified: 0, failed: 0 };
  for (const d of docs) {
    const batch = hallmarkingBatchView(d as never);
    for (const line of batch.lines) {
      if (line.effectiveStatus === "PENDING") counts.pending++;
      else if (line.effectiveStatus === "IN_TRANSIT") counts.inTransit++;
      else if (line.effectiveStatus === "AT_CENTRE") counts.atCentre++;
      else if (line.effectiveStatus === "RECEIVED") counts.received++;
      else if (line.effectiveStatus === "VERIFIED") counts.verified++;
      else if (line.effectiveStatus === "FAILED") counts.failed++;
    }
  }
  return { counts };
}

/** Every batch this piece has ever been part of, newest first — the "Hallmarking History" the item detail screen must show. */
export async function itemHallmarkingHistory(itemId: string): Promise<HallmarkingBatch[]> {
  const docs = await HallmarkingBatchModel.find({ "lines.itemId": oid(itemId) }).sort({ createdAt: -1 }).lean();
  return docs.map((d) => hallmarkingBatchView(d as never));
}
