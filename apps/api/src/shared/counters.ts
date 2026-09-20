import { Schema, model } from "mongoose";

const counterSchema = new Schema<{ _id: string; seq: number }>({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });
const CounterModel = model<{ _id: string; seq: number }>("Counter", counterSchema);

/**
 * Atomic, monotonic per-key counter for human-facing document numbers (JE-000123, TRF-000045).
 * Deliberately called *outside* any business transaction: it must never make unrelated
 * operations conflict with each other, and the price is that a rolled-back operation leaves a
 * gap in the numbering — acceptable for reference numbers, unlike gaps in the ledger.
 */
export async function nextSequence(key: string): Promise<number> {
  const doc = await CounterModel.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return doc.seq;
}

export const formatDocumentNumber = (prefix: string, n: number) => `${prefix}-${String(n).padStart(6, "0")}`;
