import { Types, type ClientSession } from "mongoose";
import type { PurchaseHistoryEntry } from "@jewellery/types";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { recordAudit, type AuditAction } from "../audit/audit.service";
import { PO_ACTION_TARGETS, IllegalProcurementTransitionError, assertPoMove, checkPoAction, checkRequisitionAction, type PoAction, type RequisitionAction } from "./procurement-status";
import { PurchaseOrderModel, PurchaseRequisitionModel, type PurchaseOrderDocument, type PurchaseRequisitionDocument } from "./procurement.models";
import type { SupplierPurchaseOrderStatus } from "@jewellery/types";

/** Whoever is acting — always staff; the purchasing workflow has no external-party login (unlike the B2B portal). */
export interface Actor {
  id: string;
  name: string;
  email?: string;
}

export const nextNo = async (prefix: "PR" | "SPO" | "GRN" | "SPY") => formatDocumentNumber(prefix, await nextSequence(`procurement-${prefix}`));
export const oid = (v: string) => new Types.ObjectId(v);

export const entry = (status: string, actor: Actor | "SYSTEM", at: Date, note?: string): Omit<PurchaseHistoryEntry, "at"> & { at: Date } => ({
  status,
  at,
  by: actor === "SYSTEM" ? "000000000000000000000000" : actor.id,
  ...(actor !== "SYSTEM" ? { byName: actor.name } : { byName: "System" }),
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
const update = (to: string, actor: Actor | "SYSTEM", o: MoveOpts) => ({
  $set: { status: to, ...(o.set ?? {}) },
  ...(o.unset?.length ? { $unset: Object.fromEntries(o.unset.map((k) => [k, 1])) } : {}),
  $push: { history: entry(to, actor, o.at ?? new Date(), o.note), ...(o.push ?? {}) },
});

/**
 * Apply a NAMED action to a purchase requisition. The write is a compare-and-set on the status the
 * document was actually read at, so of two racing actions exactly one wins — the loser gets `null`
 * and must look again. Nothing else in the module writes a requisition's status.
 */
export async function applyRequisition(prId: string | Types.ObjectId, action: RequisitionAction, actor: Actor | "SYSTEM", o: MoveOpts = {}): Promise<PurchaseRequisitionDocument | null> {
  const cur = await PurchaseRequisitionModel.findById(prId).session(o.session ?? null);
  if (!cur) return null;
  const to = checkRequisitionAction(action, cur.status);
  return PurchaseRequisitionModel.findOneAndUpdate({ _id: cur._id, status: cur.status }, update(to, actor, o), { new: true, session: o.session });
}

/** Same for a purchase order. `target` is required for `receive`, whose end status (PARTIALLY_RECEIVED or RECEIVED) depends on the numbers. */
export async function applyPo(poId: string | Types.ObjectId, action: PoAction, actor: Actor | "SYSTEM", o: MoveOpts & { target?: SupplierPurchaseOrderStatus } = {}): Promise<PurchaseOrderDocument | null> {
  const cur = await PurchaseOrderModel.findById(poId).session(o.session ?? null);
  if (!cur) return null;
  const ruleTo = checkPoAction(action, cur.status);
  const to = o.target ?? ruleTo;
  if (!PO_ACTION_TARGETS[action].includes(to)) throw new IllegalProcurementTransitionError("purchase order", action, `${cur.status} (to ${to})`, PO_ACTION_TARGETS[action]);
  assertPoMove(action, cur.status, to);
  return PurchaseOrderModel.findOneAndUpdate({ _id: cur._id, status: cur.status }, update(to, actor, o), { new: true, session: o.session });
}

/** Every sensitive purchasing action is written to the audit log with who, what and why (CLAUDE.md rule 9). */
export const audit = (actor: Actor, action: AuditAction, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) =>
  recordAudit({ action, outcome: "SUCCESS", actorId: actor.id, ...(actor.email ? { actorEmail: actor.email } : {}), targetType, targetId, metadata });
