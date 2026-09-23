import { Types } from "mongoose";
import type { ProductionOrder } from "@jewellery/types";
import type { CompleteProductionInput, CreateProductionOrderInput, IssueMaterialInput, SubmitForQcInput } from "@jewellery/validation";
import { ConflictError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { requireProductById } from "../catalog/product.repository";
import { requireProductVariantById } from "../catalog/product-variant.repository";
import { requireLocationById } from "../organization/location.repository";
import { InventoryItemModel, createInventoryItem, createTransaction, insertLedgerEntry, postInSession, withInventoryTransaction } from "../inventory";
import { buildBom, reconcile } from "./manufacturing-core";
import { productionOrderView } from "./manufacturing-views";
import { applyProduction, audit, nextNo, oid, type Actor } from "./manufacturing-store";
import { ProductionOrderModel, type ProductionOrderDocument } from "./manufacturing.models";

export async function createProductionOrder(actor: Actor, input: CreateProductionOrderInput): Promise<ProductionOrder> {
  const product = await requireProductById(input.productId);
  const sku = input.variantId ? (await requireProductVariantById(input.variantId)).sku : product.sku;
  const location = await requireLocationById(input.locationId);
  if (location.type !== "MANUFACTURING_UNIT") throw new DomainValidationError(`${location.name} is not a manufacturing unit.`);
  const bom = await buildBom(input.bom);
  const now = new Date();
  const doc = await ProductionOrderModel.create({
    productionOrderNo: await nextNo("MO"),
    status: "DRAFT",
    productId: oid(input.productId),
    ...(input.variantId ? { variantId: oid(input.variantId) } : {}),
    designName: product.name,
    sku,
    quantity: input.quantity,
    bom,
    locationId: oid(input.locationId),
    locationName: location.name,
    history: [{ status: "DRAFT", at: now, by: oid(actor.id), byName: actor.name }],
  });
  return productionOrderView(doc.toObject());
}

/** Moves the chosen AVAILABLE items — whole, never split (see manufacturing-core.ts) — onto the manufacturing floor in one ledger transaction. */
export async function issueMaterial(id: string, actor: Actor, input: IssueMaterialInput): Promise<ProductionOrder> {
  const order = await requireProductionOrder(id);
  const items = await InventoryItemModel.find({ _id: { $in: input.itemIds } });
  if (items.length !== input.itemIds.length) throw new NotFoundError("Inventory item", input.itemIds.join(","));
  for (const item of items) if (item.status !== "AVAILABLE") throw new ConflictError(`${item.itemCode} is not available to issue (it is ${item.status.toLowerCase()}).`);
  const issuedGrossWeight = items.reduce((s, i) => s + i.grossWeight, 0);

  await withInventoryTransaction(async (session) => {
    await postInSession(session, {
      type: "MANUFACTURING_ISSUE",
      channel: "ERP",
      referenceType: "PRODUCTION_ORDER",
      referenceId: order.id,
      performedBy: actor.id,
      reason: `Issued to ${order.productionOrderNo}`,
      lines: items.map((i) => ({ itemId: String(i._id), destinationLocationId: String(order.locationId) })),
    });
    const moved = await applyProduction(order._id, "issueMaterial", actor, {
      session,
      set: { issuedItems: items.map((i) => ({ itemId: i._id, itemCode: i.itemCode, grossWeight: i.grossWeight, fromLocationId: i.locationId })), issuedGrossWeight },
    });
    if (!moved) throw new ConflictError("This production order changed — please look again.");
  });
  await audit(actor, AUDIT_ACTIONS.MANUFACTURING_MATERIAL_ISSUED, "ProductionOrder", order.id, { productionOrderNo: order.productionOrderNo, items: items.length, issuedGrossWeight });
  return productionOrderView((await requireProductionOrder(id)).toObject());
}

export async function startManufacturing(id: string, actor: Actor): Promise<ProductionOrder> {
  const updated = await applyProduction(id, "startManufacturing", actor);
  if (!updated) throw new NotFoundError("Production order", id);
  return productionOrderView(updated.toObject());
}

export async function submitForQc(id: string, actor: Actor, input: SubmitForQcInput): Promise<ProductionOrder> {
  const updated = await applyProduction(id, "submitForQc", actor, { set: { actualGrossWeight: input.actualGrossWeight, actualWastage: input.actualWastage, labourCost: input.labourCost } });
  if (!updated) throw new NotFoundError("Production order", id);
  return productionOrderView(updated.toObject());
}

export async function passQc(id: string, actor: Actor, notes?: string): Promise<ProductionOrder> {
  const now = new Date();
  const updated = await applyProduction(id, "passQc", actor, { note: notes, set: { qc: { status: "PASSED", ...(notes ? { notes } : {}), byName: actor.name, at: now } } });
  if (!updated) throw new NotFoundError("Production order", id);
  await audit(actor, AUDIT_ACTIONS.MANUFACTURING_QC_PASSED, "ProductionOrder", updated.id, { productionOrderNo: updated.productionOrderNo, notes });
  return productionOrderView(updated.toObject());
}

export async function failQc(id: string, actor: Actor, notes: string): Promise<ProductionOrder> {
  const now = new Date();
  const updated = await applyProduction(id, "failQc", actor, { note: notes, set: { qc: { status: "FAILED", notes, byName: actor.name, at: now } } });
  if (!updated) throw new NotFoundError("Production order", id);
  await audit(actor, AUDIT_ACTIONS.MANUFACTURING_QC_FAILED, "ProductionOrder", updated.id, { productionOrderNo: updated.productionOrderNo, notes });
  return productionOrderView(updated.toObject());
}

export async function rework(id: string, actor: Actor): Promise<ProductionOrder> {
  const updated = await applyProduction(id, "rework", actor);
  if (!updated) throw new NotFoundError("Production order", id);
  return productionOrderView(updated.toObject());
}

/**
 * Closes out a QC_PASSED order: creates the finished piece(s) (a real InventoryItem each, ledgered
 * as MANUFACTURING_RECEIPT), returns whichever issued items were never consumed (whole, back to
 * AVAILABLE at their original shelf), and reconciles issued/returned/finished/wastage. A discrepancy
 * beyond tolerance is refused unless explained — never silently absorbed into wastage.
 */
export async function completeProduction(id: string, actor: Actor, input: CompleteProductionInput): Promise<ProductionOrder> {
  const order = await requireProductionOrder(id);
  const issuedIds = new Set(order.issuedItems.map((i) => String(i.itemId)));
  for (const rid of input.returnedItemIds) if (!issuedIds.has(rid)) throw new DomainValidationError(`Item ${rid} was not issued on this order.`);

  const finishedGrossWeight = input.finishedPieces.reduce((s, p) => s + p.grossWeight * p.quantity, 0);
  const returnedItems = await InventoryItemModel.find({ _id: { $in: input.returnedItemIds } });
  const returnedGrossWeight = returnedItems.reduce((s, i) => s + i.grossWeight, 0);
  const reconciliation = reconcile({ issuedGrossWeight: order.issuedGrossWeight, returnedGrossWeight, finishedGrossWeight, wastageGrossWeight: input.wastage, discrepancyNote: input.discrepancyNote });
  if (reconciliation.hasDiscrepancy && !input.discrepancyNote) {
    throw new DomainValidationError(`Issued ${order.issuedGrossWeight} g but returned + finished + wastage only account for ${(returnedGrossWeight + finishedGrossWeight + input.wastage).toFixed(3)} g (${reconciliation.discrepancyGrossWeight} g unaccounted for) — add a note explaining the discrepancy to complete this order.`);
  }

  const finishedRefs: { itemId: Types.ObjectId; itemCode: string; grossWeight: number }[] = [];
  await withInventoryTransaction(async (session) => {
    // One Transaction header for every finished piece this completion creates — a multi-piece event is one Transaction with many lines.
    const txn = await createTransaction({ type: "MANUFACTURING_RECEIPT", channel: "ERP", referenceType: "PRODUCTION_ORDER", referenceId: order.id, performedBy: actor.id, reason: `Finished from ${order.productionOrderNo}` }, session);
    for (const piece of input.finishedPieces) {
      for (let i = 0; i < piece.quantity; i++) {
        const item = await createInventoryItem(
          {
            productId: String(order.productId),
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
            cost: order.labourCost ?? 0,
            quantity: 1,
            manufacturingInfo: { productionOrderId: order.id, manufacturedDate: new Date() },
          } as never,
          session,
          { ledgerSeq: 1 }
        );
        await insertLedgerEntry(
          {
            transactionId: txn.id,
            itemId: item.id,
            movementType: "MANUFACTURING_RECEIPT",
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
    if (returnedItems.length) {
      await postInSession(session, {
        type: "MANUFACTURING_RECEIPT",
        channel: "ERP",
        referenceType: "PRODUCTION_ORDER",
        referenceId: order.id,
        performedBy: actor.id,
        reason: `Unused material returned from ${order.productionOrderNo}`,
        // Back to wherever it lived before issue — never into the manufacturing unit itself, which isn't a stock location.
        lines: returnedItems.map((i) => ({ itemId: String(i._id), toStatus: "AVAILABLE" as const, destinationLocationId: String(order.issuedItems.find((x) => String(x.itemId) === String(i._id))!.fromLocationId) })),
      });
    }
    const returnedRefs = returnedItems.map((i) => ({ itemId: i._id, itemCode: i.itemCode, grossWeight: i.grossWeight }));
    const moved = await applyProduction(order._id, "complete", actor, { session, set: { finishedItems: finishedRefs, returnedItems: returnedRefs, reconciliation } });
    if (!moved) throw new ConflictError("This production order changed — please look again.");
  });

  await audit(actor, AUDIT_ACTIONS.MANUFACTURING_COMPLETED, "ProductionOrder", order.id, { productionOrderNo: order.productionOrderNo, ...reconciliation });
  return productionOrderView((await requireProductionOrder(id)).toObject());
}

/** Cancels an order that never got past QC — whatever was issued and not yet consumed goes back to stock in the same action. */
export async function cancelProduction(id: string, actor: Actor, reason?: string): Promise<ProductionOrder> {
  const order = await requireProductionOrder(id);
  await withInventoryTransaction(async (session) => {
    if (order.issuedItems.length) {
      const stillHeld = await InventoryItemModel.find({ _id: { $in: order.issuedItems.map((i) => i.itemId) }, status: "IN_MANUFACTURING" }).session(session);
      if (stillHeld.length) {
        await postInSession(session, {
          type: "MANUFACTURING_RECEIPT",
          channel: "ERP",
          referenceType: "PRODUCTION_ORDER",
          referenceId: order.id,
          performedBy: actor.id,
          reason: `${order.productionOrderNo} cancelled`,
          lines: stillHeld.map((i) => ({ itemId: String(i._id), toStatus: "AVAILABLE" as const, destinationLocationId: String(order.issuedItems.find((x) => String(x.itemId) === String(i._id))!.fromLocationId) })),
        });
      }
    }
    const moved = await applyProduction(order._id, "cancel", actor, { session, note: reason });
    if (!moved) throw new ConflictError("This production order changed — please look again.");
  });
  await audit(actor, AUDIT_ACTIONS.MANUFACTURING_CANCELLED, "ProductionOrder", order.id, { productionOrderNo: order.productionOrderNo, reason, from: order.status });
  return productionOrderView((await requireProductionOrder(id)).toObject());
}

export async function requireProductionOrder(id: string): Promise<ProductionOrderDocument> {
  const doc = await ProductionOrderModel.findById(id);
  if (!doc) throw new NotFoundError("Production order", id);
  return doc;
}
export async function getProductionOrder(id: string): Promise<ProductionOrder> {
  return productionOrderView((await requireProductionOrder(id)).toObject());
}
export async function listProductionOrders(filter: { status?: string } = {}): Promise<ProductionOrder[]> {
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = { $in: filter.status.split(",") };
  const docs = await ProductionOrderModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
  return docs.map((d) => productionOrderView(d as never));
}
