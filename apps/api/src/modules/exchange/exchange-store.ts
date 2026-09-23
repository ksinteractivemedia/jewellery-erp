import { Types, type ClientSession } from "mongoose";
import type { ExchangeHistoryEntry } from "@jewellery/types";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { recordAudit, type AuditAction } from "../audit/audit.service";
import { checkExchangeAction, type ExchangeAction } from "./exchange-status";
import { ExchangeModel, type ExchangeDocument } from "./exchange.models";

export interface Actor {
  id: string;
  name: string;
  email?: string;
}

export const nextNo = async () => formatDocumentNumber("EXC", await nextSequence("exchange-EXC"));
export const oid = (v: string) => new Types.ObjectId(v);

export const entry = (status: string, actor: Actor, at: Date, note?: string): Omit<ExchangeHistoryEntry, "at"> & { at: Date } => ({
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
export async function applyExchange(id: string | Types.ObjectId, action: ExchangeAction, actor: Actor, o: MoveOpts = {}): Promise<ExchangeDocument | null> {
  const cur = await ExchangeModel.findById(id).session(o.session ?? null);
  if (!cur) return null;
  const to = checkExchangeAction(action, cur.status);
  return ExchangeModel.findOneAndUpdate(
    { _id: cur._id, status: cur.status },
    { $set: { status: to, ...(o.set ?? {}) }, $push: { history: entry(to, actor, o.at ?? new Date(), o.note) } },
    { new: true, session: o.session }
  );
}

export const audit = (actor: Actor, action: AuditAction, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) =>
  recordAudit({ action, outcome: "SUCCESS", actorId: actor.id, ...(actor.email ? { actorEmail: actor.email } : {}), targetType, targetId, metadata });
