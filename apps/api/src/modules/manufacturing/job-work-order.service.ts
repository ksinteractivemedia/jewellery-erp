import { Types } from "mongoose";
import type { JobWorkOrder } from "@jewellery/types";
import type { CreateJobWorkOrderInput, ReturnJobWorkInput } from "@jewellery/validation";
import { ConflictError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { requireProductById } from "../catalog/product.repository";
import { requireLocationById } from "../organization/location.repository";
import { requireSupplierById } from "../suppliers/supplier.repository";
import { InventoryItemModel, createInventoryItem, createTransaction, insertLedgerEntry, postInSession, withInventoryTransaction } from "../inventory";
import { DISCREPANCY_TOLERANCE_GRAMS, buildBom, reconcile } from "./manufacturing-core";
import { jobWorkOrderView } from "./manufacturing-views";
import { applyJobWork, audit, nextNo, oid, type Actor } from "./manufacturing-store";
import { JobWorkOrderModel, type JobWorkOrderDocument } from "./manufacturing.models";

export async function createJobWorkOrder(actor: Actor, input: CreateJobWorkOrderInput): Promise<JobWorkOrder> {
  const vendor = await requireSupplierById(input.vendorId);
  const location = await requireLocationById(input.locationId);
  if (location.type !== "JOB_WORKER") throw new DomainValidationError(`${location.name} is not a job worker location.`);
  const product = input.productId ? await requireProductById(input.productId) : undefined;
  const bom = await buildBom(input.bom);
  const now = new Date();
  const doc = await JobWorkOrderModel.create({
    jobWorkOrderNo: await nextNo("JW"),
    status: "DRAFT",
    vendorId: oid(input.vendorId),
    vendorName: vendor.name,
    ...(input.productId ? { productId: oid(input.productId) } : {}),
    ...(input.variantId ? { variantId: oid(input.variantId) } : {}),
    ...(product ? { designName: product.name } : {}),
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    bom,
    makingCharges: input.makingCharges,
    ...(input.expectedOutputDescription ? { expectedOutputDescription: input.expectedOutputDescription } : {}),
    locationId: oid(input.locationId),
    locationName: location.name,
    ...(input.deliveryAddress ? { deliveryAddress: input.deliveryAddress } : {}),
    history: [{ status: "DRAFT", at: now, by: oid(actor.id), byName: actor.name }],
  });
  return jobWorkOrderView(doc.toObject());
}

/** Moves the chosen AVAILABLE items — whole, never split — out to the job worker's location in one ledger transaction. */
export async function issueJobWork(id: string, actor: Actor, itemIds: string[]): Promise<JobWorkOrder> {
  const order = await requireJobWorkOrder(id);
  const items = await InventoryItemModel.find({ _id: { $in: itemIds } });
  if (items.length !== itemIds.length) throw new NotFoundError("Inventory item", itemIds.join(","));
  for (const item of items) if (item.status !== "AVAILABLE") throw new ConflictError(`${item.itemCode} is not available to issue (it is ${item.status.toLowerCase()}).`);
  const issuedGrossWeight = items.reduce((s, i) => s + i.grossWeight, 0);

  await withInventoryTransaction(async (session) => {
    await postInSession(session, {
      type: "JOBWORK_ISSUE",
      channel: "ERP",
      referenceType: "JOB_WORK_ORDER",
      referenceId: order.id,
      performedBy: actor.id,
      reason: `Issued to ${order.jobWorkOrderNo}`,
      lines: items.map((i) => ({ itemId: String(i._id), destinationLocationId: String(order.locationId) })),
    });
    const moved = await applyJobWork(order._id, "issue", actor, {
      session,
      set: { issuedItems: items.map((i) => ({ itemId: i._id, itemCode: i.itemCode, grossWeight: i.grossWeight, fromLocationId: i.locationId })), issuedGrossWeight },
    });
    if (!moved) throw new ConflictError("This job work order changed — please look again.");
  });
  await audit(actor, AUDIT_ACTIONS.MANUFACTURING_JOB_WORK_ISSUED, "JobWorkOrder", order.id, { jobWorkOrderNo: order.jobWorkOrderNo, items: items.length, issuedGrossWeight, vendor: order.vendorName });
  return jobWorkOrderView((await requireJobWorkOrder(id)).toObject());
}

/**
 * One return event: finished pieces received, unused material returned (whole), and/or wastage
 * recorded. May be partial — more can come back later — or `final: true` to close the order. The
 * reconciliation is cumulative and only checked for a non-trivial discrepancy on the closing return
 * (a partial return legitimately hasn't accounted for everything yet — that isn't a discrepancy).
 */
export async function returnJobWork(id: string, actor: Actor, input: ReturnJobWorkInput): Promise<JobWorkOrder> {
  const order = await requireJobWorkOrder(id);
  const issuedIds = new Set(order.issuedItems.map((i) => String(i.itemId)));
  const alreadyReturned = new Set(order.returnedItems.map((i) => String(i.itemId)));
  for (const rid of input.returnedItemIds) {
    if (!issuedIds.has(rid)) throw new DomainValidationError(`Item ${rid} was not issued on this order.`);
    if (alreadyReturned.has(rid)) throw new ConflictError(`Item ${rid} has already been returned.`);
  }

  const finishedGrossWeightNow = input.finishedPieces.reduce((s, p) => s + p.grossWeight * p.quantity, 0);
  const returnedItemsNow = await InventoryItemModel.find({ _id: { $in: input.returnedItemIds } });
  const returnedGrossWeightNow = returnedItemsNow.reduce((s, i) => s + i.grossWeight, 0);

  const cumulative = {
    returnedGrossWeight: (order.reconciliation?.returnedGrossWeight ?? 0) + returnedGrossWeightNow,
    finishedGrossWeight: (order.reconciliation?.finishedGrossWeight ?? 0) + finishedGrossWeightNow,
    wastageGrossWeight: (order.reconciliation?.wastageGrossWeight ?? 0) + input.wastage,
  };
  // A shortfall (issued > returned+finished+wastage) only means something once the order is being closed — a partial
  // return legitimately hasn't accounted for everything yet (more is still expected). An excess (issued < accounted-for)
  // is never legitimate at any point — more material can't come back than was issued — so that's checked on every return.
  const computed = reconcile({ issuedGrossWeight: order.issuedGrossWeight, ...cumulative, discrepancyNote: input.discrepancyNote });
  if (computed.discrepancyGrossWeight < -DISCREPANCY_TOLERANCE_GRAMS) {
    throw new DomainValidationError(
      `Issued ${order.issuedGrossWeight} g but returned + finished + wastage now total ${(cumulative.returnedGrossWeight + cumulative.finishedGrossWeight + cumulative.wastageGrossWeight).toFixed(3)} g — ${Math.abs(computed.discrepancyGrossWeight)} g more than was issued. Check the weights entered for this return.`
    );
  }
  const reconciliation = input.final ? computed : { ...computed, hasDiscrepancy: false };
  if (input.final && computed.hasDiscrepancy && !input.discrepancyNote) {
    throw new DomainValidationError(
      `Issued ${order.issuedGrossWeight} g but returned + finished + wastage only account for ${(cumulative.returnedGrossWeight + cumulative.finishedGrossWeight + cumulative.wastageGrossWeight).toFixed(3)} g (${computed.discrepancyGrossWeight} g unaccounted for) — add a note explaining the discrepancy to close this order.`
    );
  }

  const finishedRefs: { itemId: Types.ObjectId; itemCode: string; grossWeight: number }[] = [];
  await withInventoryTransaction(async (session) => {
    if (input.finishedPieces.length) {
      const txn = await createTransaction({ type: "JOBWORK_RECEIPT", channel: "ERP", referenceType: "JOB_WORK_ORDER", referenceId: order.id, performedBy: actor.id, reason: `Finished goods received from ${order.jobWorkOrderNo}` }, session);
      for (const piece of input.finishedPieces) {
        for (let i = 0; i < piece.quantity; i++) {
          const item = await createInventoryItem(
            {
              ...(order.productId ? { productId: String(order.productId) } : {}),
              ...(order.variantId ? { variantId: String(order.variantId) } : {}),
              type: "FINISHED_JEWELLERY",
              serialization: "UNIT",
              grossWeight: piece.grossWeight,
              stoneWeight: piece.stoneWeight,
              metalId: String(order.bom.metalId),
              purity: order.bom.purity,
              ...(piece.huid ? { huid: piece.huid } : {}),
              locationId: String(order.locationId),
              status: "AVAILABLE",
              cost: order.makingCharges,
              quantity: 1,
              manufacturingInfo: { jobWorkOrderId: order.id, manufacturedDate: new Date() },
            } as never,
            session,
            { ledgerSeq: 1 }
          );
          await insertLedgerEntry(
            {
              transactionId: txn.id,
              itemId: item.id,
              movementType: "JOBWORK_RECEIPT",
              sequence: 1,
              quantity: item.quantity,
              grossWeight: item.grossWeight,
              netWeight: item.netWeight,
              fineWeight: item.fineWeight,
              balanceAfter: { quantity: item.quantity, grossWeight: item.grossWeight, stoneWeight: item.stoneWeight, netWeight: item.netWeight, fineWeight: item.fineWeight },
              toStatus: item.status,
              destinationLocationId: item.locationId,
            },
            session
          );
          finishedRefs.push({ itemId: new Types.ObjectId(item.id), itemCode: item.itemCode, grossWeight: item.grossWeight });
        }
      }
    }
    if (returnedItemsNow.length) {
      await postInSession(session, {
        type: "JOBWORK_RECEIPT",
        channel: "ERP",
        referenceType: "JOB_WORK_ORDER",
        referenceId: order.id,
        performedBy: actor.id,
        reason: `Unused material returned from ${order.jobWorkOrderNo}`,
        // Back to wherever it lived before issue — never into the job worker's location itself, which isn't a stock location.
        lines: returnedItemsNow.map((i) => ({ itemId: String(i._id), toStatus: "AVAILABLE" as const, destinationLocationId: String(order.issuedItems.find((x) => String(x.itemId) === String(i._id))!.fromLocationId) })),
      });
    }
    const target = input.final ? "RETURNED" : "PARTIALLY_RETURNED";
    const moved = await applyJobWork(order._id, "returnGoods", actor, {
      session,
      target,
      note: input.final ? "Closed" : "Partial return",
      set: { reconciliation },
      push: {
        finishedItems: { $each: finishedRefs },
        returnedItems: { $each: returnedItemsNow.map((i) => ({ itemId: i._id, itemCode: i.itemCode, grossWeight: i.grossWeight })) },
      },
    });
    if (!moved) throw new ConflictError("This job work order changed — please look again.");
  });

  await audit(actor, AUDIT_ACTIONS.MANUFACTURING_JOB_WORK_RETURNED, "JobWorkOrder", order.id, { jobWorkOrderNo: order.jobWorkOrderNo, final: input.final, ...reconciliation });
  return jobWorkOrderView((await requireJobWorkOrder(id)).toObject());
}

export async function cancelJobWork(id: string, actor: Actor, reason?: string): Promise<JobWorkOrder> {
  const updated = await applyJobWork(id, "cancel", actor, { note: reason });
  if (!updated) throw new NotFoundError("Job work order", id);
  await audit(actor, AUDIT_ACTIONS.MANUFACTURING_CANCELLED, "JobWorkOrder", updated.id, { jobWorkOrderNo: updated.jobWorkOrderNo, reason });
  return jobWorkOrderView(updated.toObject());
}

export async function requireJobWorkOrder(id: string): Promise<JobWorkOrderDocument> {
  const doc = await JobWorkOrderModel.findById(id);
  if (!doc) throw new NotFoundError("Job work order", id);
  return doc;
}
export async function getJobWorkOrder(id: string): Promise<JobWorkOrder> {
  return jobWorkOrderView((await requireJobWorkOrder(id)).toObject());
}
export async function listJobWorkOrders(filter: { status?: string; vendorId?: string } = {}): Promise<JobWorkOrder[]> {
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = { $in: filter.status.split(",") };
  if (filter.vendorId) query.vendorId = oid(filter.vendorId);
  const docs = await JobWorkOrderModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
  return docs.map((d) => jobWorkOrderView(d as never));
}
