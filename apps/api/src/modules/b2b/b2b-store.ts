import { Types, type ClientSession } from "mongoose";
import type { B2BHistoryEntry, SalesOrderStatus } from "@jewellery/types";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { recordAudit, type AuditAction } from "../audit/audit.service";
import { IllegalB2BTransitionError, SO_ACTION_TARGETS, assertSoMove, checkPoAction, checkQuotationAction, checkSoAction, type PoAction, type QuotationAction, type SoAction } from "./b2b-status";
import { PurchaseOrderModel, QuotationModel, SalesOrderModel, type PurchaseOrderDocument, type QuotationDocument, type SalesOrderDocument } from "./b2b.models";

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
  push?: Record<string, unknown>;
}
const update = (to: string, actor: Actor | "SYSTEM", cur: string, o: MoveOpts) => ({
  $set: { status: to, ...(o.set ?? {}) },
  ...(o.unset?.length ? { $unset: Object.fromEntries(o.unset.map((k) => [k, 1])) } : {}),
  $push: { history: entry(to, actor, o.at ?? new Date(), o.note), ...(o.push ?? {}) },
});

/**
 * Apply a NAMED action to a purchase order. The action must be allowed from the status the order is actually in (else a 409 that
 * says where it may start from), and the write is a compare-and-set on that status, so of two racing actions exactly one wins —
 * the loser gets `null` and must look again. Nothing else in the codebase writes a purchase order's status.
 */
export async function applyPo(poId: string | Types.ObjectId, action: PoAction, actor: Actor | "SYSTEM", o: MoveOpts = {}): Promise<PurchaseOrderDocument | null> {
  const cur = await PurchaseOrderModel.findById(poId).session(o.session ?? null);
  if (!cur) return null;
  const to = checkPoAction(action, cur.status);
  return PurchaseOrderModel.findOneAndUpdate({ _id: cur._id, status: cur.status }, update(to, actor, cur.status, o), { new: true, session: o.session });
}

/** Same for a sales order. `target` is required for the derived actions (allocate, invoice), whose end status depends on the numbers. */
export async function applySo(soId: string | Types.ObjectId, action: SoAction, actor: Actor | "SYSTEM", o: MoveOpts & { target?: SalesOrderStatus } = {}): Promise<SalesOrderDocument | null> {
  const cur = await SalesOrderModel.findById(soId).session(o.session ?? null);
  if (!cur) return null;
  const ruleTo = checkSoAction(action, cur.status);
  const to = o.target ?? ruleTo;
  if (!SO_ACTION_TARGETS[action].includes(to)) throw new IllegalB2BTransitionError("sales order", action, `${cur.status} (to ${to})`, SO_ACTION_TARGETS[action]);
  assertSoMove(action, cur.status, to);
  return SalesOrderModel.findOneAndUpdate({ _id: cur._id, status: cur.status }, update(to, actor, cur.status, o), { new: true, session: o.session });
}

/** Same for a quotation (no history array: its conversation is the message thread). */
export async function applyQuotation(quoteId: string | Types.ObjectId, action: QuotationAction, o: { session?: ClientSession; set?: Record<string, unknown>; push?: Record<string, unknown> } = {}): Promise<QuotationDocument | null> {
  const cur = await QuotationModel.findById(quoteId).session(o.session ?? null);
  if (!cur) return null;
  const to = checkQuotationAction(action, cur.status);
  return QuotationModel.findOneAndUpdate({ _id: cur._id, status: cur.status }, { $set: { status: to, ...(o.set ?? {}) }, ...(o.push ? { $push: o.push } : {}) }, { new: true, session: o.session });
}

/** Every sensitive B2B action is written to the audit log with who, what and why (CLAUDE.md rule 9). */
export const audit = (actor: Actor, action: AuditAction, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) =>
  recordAudit({ action, outcome: "SUCCESS", actorId: actor.id, ...(actor.email ? { actorEmail: actor.email } : {}), targetType, targetId, metadata });
