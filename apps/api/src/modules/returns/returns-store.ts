import { Types, type ClientSession } from "mongoose";
import type { ReturnHistoryEntry } from "@jewellery/types";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { recordAudit, type AuditAction } from "../audit/audit.service";
import { checkReturnAction, type ReturnAction } from "./returns-status";
import { ReturnModel, type ReturnDocument } from "./returns.models";

/** Whoever is acting — ERP staff for everything except `request`, which a guest/buyer may also trigger (see order-context.ts). */
export interface Actor {
  id: string;
  name: string;
  email?: string;
}

export const nextNo = async () => formatDocumentNumber("RET", await nextSequence("returns-RET"));
export const oid = (v: string) => new Types.ObjectId(v);

export const entry = (status: string, actor: Actor, at: Date, note?: string): Omit<ReturnHistoryEntry, "at"> & { at: Date } => ({
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
/** Apply a NAMED action to a return — a compare-and-set on the status actually read, so of two racing actions exactly one wins. */
export async function applyReturn(id: string | Types.ObjectId, action: ReturnAction, actor: Actor, o: MoveOpts = {}): Promise<ReturnDocument | null> {
  const cur = await ReturnModel.findById(id).session(o.session ?? null);
  if (!cur) return null;
  const to = checkReturnAction(action, cur.status);
  return ReturnModel.findOneAndUpdate(
    { _id: cur._id, status: cur.status },
    { $set: { status: to, ...(o.set ?? {}) }, $push: { history: entry(to, actor, o.at ?? new Date(), o.note) } },
    { new: true, session: o.session }
  );
}

export const audit = (actor: Actor, action: AuditAction, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) =>
  recordAudit({ action, outcome: "SUCCESS", actorId: actor.id, ...(actor.email ? { actorEmail: actor.email } : {}), targetType, targetId, metadata });
