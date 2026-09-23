import { Types, type ClientSession } from "mongoose";
import type { ManufacturingHistoryEntry, JobWorkOrderStatus } from "@jewellery/types";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { recordAudit, type AuditAction } from "../audit/audit.service";
import { JOB_WORK_ACTION_TARGETS, IllegalManufacturingTransitionError, assertJobWorkMove, checkJobWorkAction, checkProductionAction, type JobWorkAction, type ProductionAction } from "./manufacturing-status";
import { JobWorkOrderModel, ProductionOrderModel, type JobWorkOrderDocument, type ProductionOrderDocument } from "./manufacturing.models";

/** Whoever is acting — always staff, same as procurement (no external-party login for this module). */
export interface Actor {
  id: string;
  name: string;
  email?: string;
}

export const nextNo = async (prefix: "MO" | "JW") => formatDocumentNumber(prefix, await nextSequence(`manufacturing-${prefix}`));
export const oid = (v: string) => new Types.ObjectId(v);

export const entry = (status: string, actor: Actor | "SYSTEM", at: Date, note?: string): Omit<ManufacturingHistoryEntry, "at"> & { at: Date } => ({
  status,
  at,
  by: actor === "SYSTEM" ? "000000000000000000000000" : actor.id,
  byName: actor === "SYSTEM" ? "System" : actor.name,
  ...(note ? { note } : {}),
});

interface MoveOpts {
  note?: string;
  at?: Date;
  session?: ClientSession;
  set?: Record<string, unknown>;
  push?: Record<string, unknown>;
}
const update = (to: string, actor: Actor | "SYSTEM", o: MoveOpts) => ({
  $set: { status: to, ...(o.set ?? {}) },
  $push: { history: entry(to, actor, o.at ?? new Date(), o.note), ...(o.push ?? {}) },
});

/** Apply a NAMED action to a production order — a compare-and-set on the status actually read, so of two racing actions exactly one wins. */
export async function applyProduction(id: string | Types.ObjectId, action: ProductionAction, actor: Actor | "SYSTEM", o: MoveOpts = {}): Promise<ProductionOrderDocument | null> {
  const cur = await ProductionOrderModel.findById(id).session(o.session ?? null);
  if (!cur) return null;
  const to = checkProductionAction(action, cur.status);
  return ProductionOrderModel.findOneAndUpdate({ _id: cur._id, status: cur.status }, update(to, actor, o), { new: true, session: o.session });
}

/** Same for a job work order. `target` is required for `returnGoods`, whose end status (PARTIALLY_RETURNED or RETURNED) depends on whether the return is final. */
export async function applyJobWork(id: string | Types.ObjectId, action: JobWorkAction, actor: Actor | "SYSTEM", o: MoveOpts & { target?: JobWorkOrderStatus } = {}): Promise<JobWorkOrderDocument | null> {
  const cur = await JobWorkOrderModel.findById(id).session(o.session ?? null);
  if (!cur) return null;
  const ruleTo = checkJobWorkAction(action, cur.status);
  const to = o.target ?? ruleTo;
  if (!JOB_WORK_ACTION_TARGETS[action].includes(to)) throw new IllegalManufacturingTransitionError("job work order", action, `${cur.status} (to ${to})`, JOB_WORK_ACTION_TARGETS[action]);
  assertJobWorkMove(action, cur.status, to);
  return JobWorkOrderModel.findOneAndUpdate({ _id: cur._id, status: cur.status }, update(to, actor, o), { new: true, session: o.session });
}

/** Every sensitive manufacturing action is written to the audit log with who, what and why (CLAUDE.md rule 9). */
export const audit = (actor: Actor, action: AuditAction, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) =>
  recordAudit({ action, outcome: "SUCCESS", actorId: actor.id, ...(actor.email ? { actorEmail: actor.email } : {}), targetType, targetId, metadata });
