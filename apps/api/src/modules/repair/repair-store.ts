import { Types, type ClientSession } from "mongoose";
import type { RepairHistoryEntry } from "@jewellery/types";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { recordAudit, type AuditAction } from "../audit/audit.service";
import { checkRepairAction, type RepairAction } from "./repair-status";
import { RepairOrderModel, type RepairOrderDocument } from "./repair.models";

export interface Actor {
  id: string;
  name: string;
  email?: string;
}

export const nextNo = async () => formatDocumentNumber("REP", await nextSequence("repair-REP"));
export const oid = (v: string) => new Types.ObjectId(v);

export const entry = (status: string, actor: Actor, at: Date, note?: string): Omit<RepairHistoryEntry, "at"> & { at: Date } => ({
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
export async function applyRepair(id: string | Types.ObjectId, action: RepairAction, actor: Actor, o: MoveOpts = {}): Promise<RepairOrderDocument | null> {
  const cur = await RepairOrderModel.findById(id).session(o.session ?? null);
  if (!cur) return null;
  const to = checkRepairAction(action, cur.status);
  return RepairOrderModel.findOneAndUpdate(
    { _id: cur._id, status: cur.status },
    { $set: { status: to, ...(o.set ?? {}) }, $push: { history: entry(to, actor, o.at ?? new Date(), o.note) } },
    { new: true, session: o.session }
  );
}

export const audit = (actor: Actor, action: AuditAction, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) =>
  recordAudit({ action, outcome: "SUCCESS", actorId: actor.id, ...(actor.email ? { actorEmail: actor.email } : {}), targetType, targetId, metadata });
