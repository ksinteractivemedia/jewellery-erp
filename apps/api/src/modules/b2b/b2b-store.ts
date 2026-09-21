import { Types, type ClientSession } from "mongoose";
import type { B2BHistoryEntry, PurchaseOrderStatus, SalesOrderStatus } from "@jewellery/types";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { recordAudit, type AuditAction } from "../audit/audit.service";
import { assertPoTransition, assertSoTransition } from "./b2b-status";
import { PurchaseOrderModel, SalesOrderModel, type PurchaseOrderDocument, type SalesOrderDocument } from "./b2b.models";

/** Who is doing it. A buyer acts as CUSTOMER (their own account only); staff act as SELLER. */
export interface Actor {
  id: string;
  name: string;
  email?: string;
  kind: "CUSTOMER" | "SELLER";
}

export const nextNo = async (prefix: "BPO" | "QT" | "SO" | "INV" | "PAY") => formatDocumentNumber(prefix, await nextSequence(`b2b-${prefix}`));
export const oid = (v: string) => new Types.ObjectId(v);

export const entry = (status: string, actor: Actor | "SYSTEM", at: Date, note?: string): Omit<B2BHistoryEntry, "at"> & { at: Date } => ({
  status,
  at,
  by: actor === "SYSTEM" ? "SYSTEM" : actor.kind,
  ...(actor !== "SYSTEM" ? { actorName: actor.name } : {}),
  ...(note ? { note } : {}),
});

interface MoveOpts {
  note?: string;
  at?: Date;
  session?: ClientSession;
  set?: Record<string, unknown>;
  unset?: string[];
}

/** Move a purchase order along its lifecycle: legal transitions only, compare-and-set on the status read, history recorded. Null means it wasn't in an allowed state (or someone else moved it first). */
export async function movePo(poId: string | Types.ObjectId, to: PurchaseOrderStatus, from: readonly PurchaseOrderStatus[], actor: Actor | "SYSTEM", o: MoveOpts = {}): Promise<PurchaseOrderDocument | null> {
  const cur = await PurchaseOrderModel.findById(poId).session(o.session ?? null);
  if (!cur || !from.includes(cur.status)) return null;
  assertPoTransition(cur.status, to);
  return PurchaseOrderModel.findOneAndUpdate(
    { _id: cur._id, status: cur.status },
    { $set: { status: to, ...(o.set ?? {}) }, ...(o.unset?.length ? { $unset: Object.fromEntries(o.unset.map((k) => [k, 1])) } : {}), $push: { history: entry(to, actor, o.at ?? new Date(), o.note) } },
    { new: true, session: o.session }
  );
}
export async function moveSo(soId: string | Types.ObjectId, to: SalesOrderStatus, from: readonly SalesOrderStatus[], actor: Actor | "SYSTEM", o: MoveOpts = {}): Promise<SalesOrderDocument | null> {
  const cur = await SalesOrderModel.findById(soId).session(o.session ?? null);
  if (!cur || !from.includes(cur.status)) return null;
  assertSoTransition(cur.status, to);
  return SalesOrderModel.findOneAndUpdate(
    { _id: cur._id, status: cur.status },
    { $set: { status: to, ...(o.set ?? {}) }, ...(o.unset?.length ? { $unset: Object.fromEntries(o.unset.map((k) => [k, 1])) } : {}), $push: { history: entry(to, actor, o.at ?? new Date(), o.note) } },
    { new: true, session: o.session }
  );
}

/** Every sensitive B2B action is written to the audit log with who, what and why (CLAUDE.md rule 9). */
export const audit = (actor: Actor, action: AuditAction, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) =>
  recordAudit({ action, outcome: "SUCCESS", actorId: actor.id, ...(actor.email ? { actorEmail: actor.email } : {}), targetType, targetId, metadata });
