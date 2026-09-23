import { Types } from "mongoose";
import type { RepairOrder } from "@jewellery/types";
import type { DecideRepairEstimateInput, DeliverRepairInput, EstimateRepairInput, InspectRepairInput, RecordRepairWorkInput, RepairIntakeInput, RepairQcDecisionInput } from "@jewellery/validation";
import { ConflictError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { InventoryItemModel, postInSession, receiveNewInventoryItem, withInventoryTransaction } from "../inventory";
import { calculateNetWeight } from "../inventory/weight-calculations";
import { resolveFineness } from "../metals/metal.repository";
import { applyRepair, audit, nextNo, oid, type Actor } from "./repair-store";
import { repairOrderView } from "./repair-views";
import { RepairOrderModel, type RepairOrderDocument } from "./repair.models";

const chargesTotal = (c: { labourCharge: number; materialsCharge: number; otherCharges: number }) => c.labourCharge + c.materialsCharge + c.otherCharges;

/**
 * The piece is physically taken in *now* — this is the ledger movement, not a separate later step
 * (unlike hallmarking's dispatch or manufacturing's material issue, there's no "held for later"
 * stage here: a customer hands over a piece and walks out, so intake and the movement into custody
 * are the same moment). Only ever against a piece the business doesn't currently have as sellable
 * stock: one we already sold back to the same customer (`SOLD`), or one we've never held before
 * (`isCustomerOwned`, created fresh via `REPAIR_INTAKE`). Internal repair of our own unsold stock is
 * the pre-existing `REPAIR_OUT`/`REPAIR_IN` pair (business-rules.md §2 partner movements) and does
 * not go through this customer-facing order at all.
 */
export async function intakeRepair(actor: Actor, input: RepairIntakeInput): Promise<RepairOrder> {
  const now = new Date();
  const repairId = new Types.ObjectId();
  let itemId: string;
  let itemCode: string;
  let metalId: string | undefined;
  let purity: string | undefined;
  let huid: string | undefined;
  let before: { grossWeight: number; stoneWeight: number; netWeight: number };

  if (input.itemId) {
    const item = await InventoryItemModel.findById(input.itemId);
    if (!item) throw new NotFoundError("Inventory item", input.itemId);
    if (item.status !== "SOLD") throw new ConflictError(`${item.itemCode} is ${item.status.toLowerCase()} — a repair intake against an existing item only applies to a piece already sold to this customer.`);
    await withInventoryTransaction((session) =>
      postInSession(session, {
        type: "REPAIR_OUT",
        channel: "ERP",
        referenceType: "REPAIR_ORDER",
        referenceId: String(repairId),
        performedBy: actor.id,
        reason: `Taken in for repair`,
        lines: [{ itemId: input.itemId!, destinationLocationId: input.locationId }],
      })
    );
    itemId = String(item._id);
    itemCode = item.itemCode;
    metalId = String(item.metalId);
    purity = item.purity;
    huid = item.huid;
    before = { grossWeight: item.grossWeight, stoneWeight: item.stoneWeight, netWeight: item.netWeight };
  } else {
    if (input.metalId) await resolveFineness(input.metalId, input.purity!); // confirms the metal/purity pair is real before we create anything on it
    const grossWeight = input.grossWeight!;
    const stoneWeight = input.stoneWeight ?? 0;
    const netWeight = calculateNetWeight(grossWeight, stoneWeight);
    if (netWeight <= 0) throw new DomainValidationError("net weight must be positive — stone weight cannot equal or exceed gross weight");
    const { item } = await receiveNewInventoryItem({
      item: {
        type: "FINISHED_JEWELLERY",
        serialization: "UNIT",
        metalId: input.metalId!,
        purity: input.purity!,
        grossWeight,
        stoneWeight,
        ...(input.huid ? { huid: input.huid } : {}),
        locationId: input.locationId,
        status: "UNDER_REPAIR",
        cost: 0,
        quantity: 1,
        isCustomerOwned: true,
      },
      performedBy: actor.id,
      channel: "ERP",
      referenceType: "REPAIR_ORDER",
      referenceId: String(repairId),
      reason: "Customer-owned piece taken in for repair",
      movementType: "REPAIR_INTAKE",
    });
    itemId = item.id;
    itemCode = item.itemCode;
    metalId = input.metalId;
    purity = input.purity;
    huid = item.huid;
    before = { grossWeight, stoneWeight, netWeight };
  }

  const doc = await RepairOrderModel.create({
    _id: repairId,
    repairNo: await nextNo(),
    status: "INTAKE",
    customer: { ...(input.customer.id ? { id: oid(input.customer.id) } : {}), name: input.customer.name, phone: input.customer.phone, email: input.customer.email },
    itemId: oid(itemId),
    itemCode,
    itemDescription: input.itemDescription,
    ...(metalId ? { metalId: oid(metalId) } : {}),
    ...(purity ? { purity } : {}),
    ...(huid ? { huid } : {}),
    beforeWeight: { ...before, at: now },
    ...(input.stoneWork ? { stoneWork: input.stoneWork } : {}),
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    history: [{ status: "INTAKE", at: now, by: oid(actor.id), byName: actor.name, ...(input.notes ? { note: input.notes } : {}) }],
  });
  await audit(actor, AUDIT_ACTIONS.REPAIR_INTAKEN, "RepairOrder", doc.id, { repairNo: doc.repairNo, itemCode, customerOwned: !input.itemId });
  return repairOrderView(doc.toObject());
}

export async function inspectRepair(id: string, actor: Actor, input: InspectRepairInput): Promise<RepairOrder> {
  const updated = await applyRepair(id, "inspect", actor, { set: { ...(input.inspectionNotes ? { inspectionNotes: input.inspectionNotes } : {}), ...(input.stoneWork ? { stoneWork: input.stoneWork } : {}) } });
  if (!updated) throw new NotFoundError("Repair order", id);
  await audit(actor, AUDIT_ACTIONS.REPAIR_INSPECTED, "RepairOrder", updated.id, { repairNo: updated.repairNo });
  return repairOrderView(updated.toObject());
}

/** Re-estimable while nothing has been decided yet — the same "not a correction, it's the job" allowance as exchange assessment. */
export async function estimateRepair(id: string, actor: Actor, input: EstimateRepairInput): Promise<RepairOrder> {
  const total = chargesTotal(input);
  const updated = await applyRepair(id, "estimate", actor, {
    note: `${(total / 100).toFixed(2)}`,
    set: { estimate: { labourCharge: input.labourCharge, materialsCharge: input.materialsCharge, otherCharges: input.otherCharges, total, notes: input.notes, estimatedAt: new Date(), estimatedByName: actor.name } },
  });
  if (!updated) throw new NotFoundError("Repair order", id);
  await audit(actor, AUDIT_ACTIONS.REPAIR_ESTIMATED, "RepairOrder", updated.id, { repairNo: updated.repairNo, total });
  return repairOrderView(updated.toObject());
}

/** The customer's decision on the estimate. Declining hands the piece straight back, unrepaired — the same ledger movement as `deliverRepair`, just earlier and unfixed. */
export async function decideRepairEstimate(id: string, actor: Actor, input: DecideRepairEstimateInput): Promise<RepairOrder> {
  const repair = await requireRepairOrder(id);
  const approval = { approved: input.approved, at: new Date(), byName: input.byName, note: input.note };
  if (input.approved) {
    const updated = await applyRepair(repair._id, "approveEstimate", actor, { set: { approval } });
    if (!updated) throw new ConflictError("This repair order changed — please look again.");
    await audit(actor, AUDIT_ACTIONS.REPAIR_ESTIMATE_DECIDED, "RepairOrder", updated.id, { repairNo: updated.repairNo, approved: true });
    return repairOrderView(updated.toObject());
  }
  const result = await handBackUnrepaired(repair, actor, "declineEstimate", { approval }, input.note ?? "Estimate declined");
  await audit(actor, AUDIT_ACTIONS.REPAIR_ESTIMATE_DECIDED, "RepairOrder", result.id, { repairNo: result.repairNo, approved: false });
  return repairOrderView(result.toObject());
}

export async function startRepair(id: string, actor: Actor): Promise<RepairOrder> {
  const updated = await applyRepair(id, "start", actor);
  if (!updated) throw new NotFoundError("Repair order", id);
  await audit(actor, AUDIT_ACTIONS.REPAIR_STARTED, "RepairOrder", updated.id, { repairNo: updated.repairNo });
  return repairOrderView(updated.toObject());
}

/** The work is done: records the after weight (the spec's "after weight") and what it actually cost, before the QC verdict — the numbers the decision rests on are on the record either way. */
export async function recordRepairWork(id: string, actor: Actor, input: RecordRepairWorkInput): Promise<RepairOrder> {
  const repair = await requireRepairOrder(id);
  const netWeight = calculateNetWeight(input.afterGrossWeight, input.afterStoneWeight);
  const finalCharges = input.finalCharges
    ? { ...input.finalCharges, total: chargesTotal(input.finalCharges) }
    : repair.estimate
      ? { labourCharge: repair.estimate.labourCharge, materialsCharge: repair.estimate.materialsCharge, otherCharges: repair.estimate.otherCharges, total: repair.estimate.total }
      : undefined;
  const updated = await applyRepair(repair._id, "recordWork", actor, {
    set: { afterWeight: { grossWeight: input.afterGrossWeight, stoneWeight: input.afterStoneWeight, netWeight, at: new Date() }, ...(input.stoneWork ? { stoneWork: input.stoneWork } : {}), ...(finalCharges ? { finalCharges } : {}) },
  });
  if (!updated) throw new ConflictError("This repair order changed — please look again.");
  await audit(actor, AUDIT_ACTIONS.REPAIR_WORK_RECORDED, "RepairOrder", updated.id, { repairNo: updated.repairNo, afterGrossWeight: input.afterGrossWeight });
  return repairOrderView(updated.toObject());
}

export async function passRepairQc(id: string, actor: Actor, input: RepairQcDecisionInput): Promise<RepairOrder> {
  const updated = await applyRepair(id, "qcPass", actor, { note: input.notes, set: { qc: { result: "PASSED", notes: input.notes, at: new Date(), byName: actor.name }, readyAt: new Date() } });
  if (!updated) throw new NotFoundError("Repair order", id);
  await audit(actor, AUDIT_ACTIONS.REPAIR_QC_PASSED, "RepairOrder", updated.id, { repairNo: updated.repairNo });
  return repairOrderView(updated.toObject());
}

export async function failRepairQc(id: string, actor: Actor, input: RepairQcDecisionInput): Promise<RepairOrder> {
  const updated = await applyRepair(id, "qcFail", actor, { note: input.notes, set: { qc: { result: "FAILED", notes: input.notes, at: new Date(), byName: actor.name } } });
  if (!updated) throw new NotFoundError("Repair order", id);
  await audit(actor, AUDIT_ACTIONS.REPAIR_QC_FAILED, "RepairOrder", updated.id, { repairNo: updated.repairNo, notes: input.notes });
  return repairOrderView(updated.toObject());
}

export async function reworkRepair(id: string, actor: Actor, note?: string): Promise<RepairOrder> {
  const updated = await applyRepair(id, "rework", actor, { note });
  if (!updated) throw new NotFoundError("Repair order", id);
  return repairOrderView(updated.toObject());
}

/**
 * Hands the repaired piece back: ledgered `REPAIR_RETURN`, `UNDER_REPAIR` → `SOLD` for a piece that
 * was already the customer's (it simply goes back to being a sold, owned-by-them piece) or →
 * `RETURNED_TO_CUSTOMER` for a piece the business never owned — never back into sellable `AVAILABLE`
 * stock, which is what makes this different from the internal `REPAIR_IN` movement.
 */
export async function deliverRepair(id: string, actor: Actor, input: DeliverRepairInput): Promise<RepairOrder> {
  const repair = await requireRepairOrder(id);
  if (repair.status !== "READY") throw new ConflictError(`Repair ${repair.repairNo} is ${repair.status.toLowerCase()} — only a ready repair can be delivered.`);
  const result = await handBackUnrepaired(repair, actor, "deliver", { deliveredAt: new Date() }, input.note ?? "Delivered to customer");
  await audit(actor, AUDIT_ACTIONS.REPAIR_DELIVERED, "RepairOrder", result.id, { repairNo: result.repairNo });
  return repairOrderView(result.toObject());
}

export async function cancelRepair(id: string, actor: Actor, reason?: string): Promise<RepairOrder> {
  const repair = await requireRepairOrder(id);
  const result = await handBackUnrepaired(repair, actor, "cancel", {}, reason ?? "Repair cancelled");
  await audit(actor, AUDIT_ACTIONS.REPAIR_CANCELLED, "RepairOrder", result.id, { repairNo: result.repairNo, reason });
  return repairOrderView(result.toObject());
}

/** Shared by decline / deliver / cancel: whatever the outcome, the piece leaves custody the same way. */
async function handBackUnrepaired(repair: RepairOrderDocument, actor: Actor, action: "declineEstimate" | "deliver" | "cancel", extraSet: Record<string, unknown>, reason: string): Promise<RepairOrderDocument> {
  const item = await InventoryItemModel.findById(repair.itemId);
  if (!item) throw new NotFoundError("Inventory item", String(repair.itemId));
  const toStatus = item.isCustomerOwned ? "RETURNED_TO_CUSTOMER" : "SOLD";
  return withInventoryTransaction(async (session) => {
    await postInSession(session, {
      type: "REPAIR_RETURN",
      channel: "ERP",
      referenceType: "REPAIR_ORDER",
      referenceId: repair.id,
      performedBy: actor.id,
      reason,
      lines: [{ itemId: String(item._id), toStatus }],
    });
    const updated = await applyRepair(repair._id, action, actor, { session, note: reason, set: extraSet });
    if (!updated) throw new ConflictError("This repair order changed — please look again.");
    return updated;
  });
}

export async function requireRepairOrder(id: string): Promise<RepairOrderDocument> {
  const doc = await RepairOrderModel.findById(id);
  if (!doc) throw new NotFoundError("Repair order", id);
  return doc;
}
export async function getRepairOrder(id: string): Promise<RepairOrder> {
  return repairOrderView((await requireRepairOrder(id)).toObject());
}
export async function listRepairOrders(filter: { status?: string } = {}): Promise<RepairOrder[]> {
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = { $in: filter.status.split(",") };
  const docs = await RepairOrderModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
  return docs.map((d) => repairOrderView(d as never));
}
