import { Types, type ClientSession } from "mongoose";
import type { HallmarkingHistoryEntry } from "@jewellery/types";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { recordAudit, type AuditAction } from "../audit/audit.service";
import { checkHallmarkingAction, type HallmarkingAction } from "./hallmarking-status";
import { HallmarkingBatchModel, type HallmarkingBatchDocument } from "./hallmarking.models";

/** Whoever is acting — always staff, same as every other workflow module (no external-party login here). */
export interface Actor {
  id: string;
  name: string;
  email?: string;
}

export const nextNo = async () => formatDocumentNumber("HM", await nextSequence("hallmarking-HM"));
export const oid = (v: string) => new Types.ObjectId(v);

export const entry = (status: string, actor: Actor, at: Date, note?: string): Omit<HallmarkingHistoryEntry, "at"> & { at: Date } => ({
  status,
  at,
  by: actor.id,
  byName: actor.name,
  ...(note ? { note } : {}),
});

interface MoveOpts {
  note?: string;
  at?: Date;
  session?: ClientSession;
  set?: Record<string, unknown>;
}
/** Apply a NAMED action to a hallmarking batch — a compare-and-set on the status actually read, so of two racing actions exactly one wins. */
export async function applyHallmarking(id: string | Types.ObjectId, action: HallmarkingAction, actor: Actor, o: MoveOpts = {}): Promise<HallmarkingBatchDocument | null> {
  const cur = await HallmarkingBatchModel.findById(id).session(o.session ?? null);
  if (!cur) return null;
  const to = checkHallmarkingAction(action, cur.status);
  return HallmarkingBatchModel.findOneAndUpdate(
    { _id: cur._id, status: cur.status },
    { $set: { status: to, ...(o.set ?? {}) }, $push: { history: entry(to, actor, o.at ?? new Date(), o.note) } },
    { new: true, session: o.session }
  );
}

/** Every sensitive hallmarking action is written to the audit log with who, what and why (CLAUDE.md rule 9). */
export const audit = (actor: Actor, action: AuditAction, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) =>
  recordAudit({ action, outcome: "SUCCESS", actorId: actor.id, ...(actor.email ? { actorEmail: actor.email } : {}), targetType, targetId, metadata });
