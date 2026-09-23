import { Types } from "mongoose";
import type { GoodsReceipt } from "@jewellery/types";
import { isLedgerTracked, isWeightTracked } from "@jewellery/types";
import type { ReceiveGoodsInput } from "@jewellery/validation";
import { ConflictError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { LocationModel } from "../organization/location.model";
import { STOCK_LOCATION_TYPES } from "../inventory/movement-rules";
import { roundWeight } from "../inventory/weight-calculations";
import { createInventoryItem, createTransaction, insertLedgerEntry, withInventoryTransaction } from "../inventory";
import { lineIsClosed, roundPaise, WEIGHT_DISCREPANCY_TOLERANCE_PERCENT } from "./procurement-core";
import { goodsReceiptView } from "./procurement-views";
import { OverReceiptError, PurityMismatchError } from "./procurement.errors";
import { checkPoAction, purchaseOrderStatusFor } from "./procurement-status";
import { applyPo, audit, nextNo, oid, type Actor } from "./procurement-store";
import { GoodsReceiptModel, PurchaseOrderModel, type GoodsReceiptLineAttrs, type PurchaseLineAttrs } from "./procurement.models";
import { requirePurchaseOrder } from "./purchase-order.service";

const EPS = 0.001; // a gram of float slop — never enough to matter, always enough to avoid a false "over-receipt" on an exact match

/** What this receipt line means for the PO line it targets: checked BEFORE anything is written, so a bad line refuses cleanly with nothing half-posted. */
function prepareLine(poLine: PurchaseLineAttrs, rl: ReceiveGoodsInput["lines"][number]) {
  if (lineIsClosed(poLine)) throw new ConflictError(`${poLine.description} has already been fully received.`);
  const ledgerTracked = isLedgerTracked(poLine.purchaseType);
  const weightTracked = isWeightTracked(poLine.purchaseType);
  if (ledgerTracked && rl.purity && poLine.purity && rl.purity.toUpperCase() !== poLine.purity.toUpperCase()) throw new PurityMismatchError(poLine.description, poLine.purity, rl.purity);
  if (ledgerTracked && rl.grossWeight === undefined) throw new DomainValidationError(`${poLine.description}: a scale weight is required to receive this line.`);

  let hasWeightDiscrepancy = false;
  let variancePercent: number | undefined;
  if (weightTracked) {
    const ordered = poLine.grossWeight ?? 0;
    const outstanding = roundWeight(ordered - poLine.receivedGrossWeight);
    const newTotal = roundWeight(poLine.receivedGrossWeight + rl.grossWeight!);
    if (newTotal > ordered + EPS) throw new OverReceiptError(poLine.description, rl.grossWeight!, outstanding, "g");
    // Compared against what THIS shipment was expected to weigh (the delivery note), not the line's full ordered total — a line
    // received across several shipments is not "off" just because one delivery is smaller than the whole order.
    if (rl.expectedGrossWeight !== undefined && rl.expectedGrossWeight > 0) {
      const variance = (Math.abs(rl.grossWeight! - rl.expectedGrossWeight) / rl.expectedGrossWeight) * 100;
      if (variance > WEIGHT_DISCREPANCY_TOLERANCE_PERCENT) {
        if (!rl.discrepancyNote) {
          throw new DomainValidationError(
            `${poLine.description}: the delivery note said ${rl.expectedGrossWeight} g but the scale reads ${rl.grossWeight} g (${variance.toFixed(1)}% off) — add a note explaining the discrepancy to receive it as weighed.`
          );
        }
        hasWeightDiscrepancy = true;
        variancePercent = Math.round(variance * 10) / 10;
      }
    }
  } else {
    const outstanding = poLine.quantity - poLine.receivedQuantity;
    if (poLine.receivedQuantity + rl.quantity > poLine.quantity) throw new OverReceiptError(poLine.description, rl.quantity, outstanding, "pcs");
  }

  const fineWeight = weightTracked && rl.grossWeight !== undefined && poLine.fineness !== undefined ? roundWeight(rl.grossWeight * poLine.fineness) : undefined;
  const value = weightTracked ? roundPaise((fineWeight ?? 0) * (poLine.ratePerGram ?? 0)) : roundPaise((poLine.ratePerUnit ?? 0) * rl.quantity);
  return { ledgerTracked, weightTracked, purity: rl.purity ?? poLine.purity, fineWeight, value, hasWeightDiscrepancy, variancePercent };
}

/**
 * Posts a goods receipt against an APPROVED (or already PARTIALLY_RECEIVED) purchase order. Every
 * ledger-tracked line creates its InventoryItem(s) and a PURCHASE_RECEIPT ledger entry inside ONE
 * inventory transaction (business-rules.md §2.1 — stock is never created outside the ledger); a
 * CONSUMABLE line is recorded on the receipt but never becomes an InventoryItem (see procurement.ts).
 * A line may be received more than once (partial receipts); receiving beyond what is still
 * outstanding, at the wrong purity, or with an unexplained weight discrepancy is refused before
 * anything is written.
 */
export async function receiveGoods(poId: string, actor: Actor, input: ReceiveGoodsInput): Promise<GoodsReceipt> {
  const po = await requirePurchaseOrder(poId);
  checkPoAction("receive", po.status);

  const prepared = input.lines.map((rl) => {
    const poLine = po.lines[rl.purchaseOrderLineIndex];
    if (!poLine) throw new NotFoundError("Purchase order line", String(rl.purchaseOrderLineIndex));
    return { rl, poLine, ...prepareLine(poLine, rl) };
  });

  const locationIds = [...new Set(prepared.map((p) => p.rl.locationId))];
  const locations = new Map((await LocationModel.find({ _id: { $in: locationIds } })).map((l) => [String(l._id), l]));
  for (const locId of locationIds) {
    const loc = locations.get(locId);
    if (!loc) throw new NotFoundError("Location", locId);
    if (!loc.isActive) throw new DomainValidationError(`Location ${loc.name} is not active.`);
    if (!STOCK_LOCATION_TYPES.includes(loc.type)) throw new DomainValidationError(`Stock cannot be received into ${loc.name} (${loc.type}).`);
  }

  const grnId = new Types.ObjectId();
  const grnNo = await nextNo("GRN");

  // Simulate this receipt's effect on every PO line (touched or not) to derive the PO's new status — computed from the same
  // in-memory numbers the transaction below will write, so there is no window where the lines show progress the status hasn't caught up to.
  const touched = new Map(prepared.map((p) => [p.rl.purchaseOrderLineIndex, p]));
  const linesAfter = po.lines.map((l, i) => {
    const p = touched.get(i);
    // Explicit fields only — never spread a live Mongoose subdocument (it silently drops nested-typed fields; see fulfilment.service.ts's own note on this).
    return {
      purchaseType: l.purchaseType,
      quantity: l.quantity,
      grossWeight: l.grossWeight,
      receivedQuantity: l.receivedQuantity + (p && !p.weightTracked ? p.rl.quantity : 0),
      receivedGrossWeight: l.receivedGrossWeight + (p && p.weightTracked ? p.rl.grossWeight! : 0),
    };
  });
  const target = purchaseOrderStatusFor({
    linesOrdered: linesAfter.length,
    linesFullyReceived: linesAfter.filter((l) => lineIsClosed(l)).length,
    anyReceived: linesAfter.some((l) => l.receivedQuantity > 0 || l.receivedGrossWeight > 0),
  });

  const { grnLines } = await withInventoryTransaction(async (session) => {
    const transaction = await createTransaction({ type: "PURCHASE_RECEIPT", channel: "ERP", referenceType: "GOODS_RECEIPT", referenceId: grnId.toHexString(), performedBy: actor.id, reason: `${grnNo} against ${po.poNo}` }, session);

    const grnLines: GoodsReceiptLineAttrs[] = [];
    for (const p of prepared) {
      const { rl, poLine, ledgerTracked, weightTracked, purity, fineWeight, value, hasWeightDiscrepancy, variancePercent } = p;
      const inventoryItemIds: Types.ObjectId[] = [];

      if (ledgerTracked) {
        const kind = poLine.purchaseType === "STONE" ? "LOOSE_STONE" : poLine.purchaseType === "FINISHED_JEWELLERY" ? "FINISHED_JEWELLERY" : "RAW_MATERIAL";
        // Finished jewellery arrives as individual pieces; a metal/stone lot is received as one batch — see procurement.ts.
        const pieces = kind === "FINISHED_JEWELLERY" ? rl.quantity : 1;
        const perPieceGross = rl.grossWeight!;
        const perPieceCost = Math.round(value / pieces);
        for (let i = 0; i < pieces; i++) {
          const costHere = i === pieces - 1 ? value - perPieceCost * (pieces - 1) : perPieceCost; // last piece absorbs the rounding remainder
          const item = await createInventoryItem(
            {
              type: kind,
              serialization: kind === "FINISHED_JEWELLERY" ? "UNIT" : "BATCH",
              grossWeight: perPieceGross,
              stoneWeight: 0,
              metalId: String(poLine.metalId!),
              purity: purity!,
              locationId: rl.locationId,
              cost: Math.max(costHere, 0),
              quantity: 1,
            },
            session,
            { ledgerSeq: 1 }
          );
          await insertLedgerEntry(
            {
              transactionId: transaction.id,
              itemId: item.id,
              movementType: "PURCHASE_RECEIPT",
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
          inventoryItemIds.push(new Types.ObjectId(item.id));
        }
      }

      grnLines.push({
        purchaseOrderLineIndex: rl.purchaseOrderLineIndex,
        purchaseType: poLine.purchaseType,
        description: poLine.description,
        ...(poLine.metalId ? { metalId: poLine.metalId } : {}),
        ...(purity ? { purity } : {}),
        ...(poLine.fineness !== undefined ? { fineness: poLine.fineness } : {}),
        quantity: rl.quantity,
        ...(rl.grossWeight !== undefined ? { grossWeight: rl.grossWeight } : {}),
        ...(rl.expectedGrossWeight !== undefined ? { expectedGrossWeight: rl.expectedGrossWeight } : {}),
        ...(fineWeight !== undefined ? { fineWeight } : {}),
        ...(poLine.ratePerGram !== undefined ? { ratePerGram: poLine.ratePerGram } : {}),
        ...(poLine.ratePerUnit !== undefined ? { ratePerUnit: poLine.ratePerUnit } : {}),
        value,
        ...(rl.lotNumber ? { lotNumber: rl.lotNumber } : {}),
        locationId: new Types.ObjectId(rl.locationId),
        hasWeightDiscrepancy,
        ...(variancePercent !== undefined ? { variancePercent } : {}),
        ...(rl.discrepancyNote ? { discrepancyNote: rl.discrepancyNote } : {}),
        inventoryItemIds,
      });

      // Progress the PO line's cumulative received amount within the same transaction.
      const path = `lines.${rl.purchaseOrderLineIndex}`;
      await PurchaseOrderModel.updateOne(
        { _id: po._id },
        { $inc: { [`${path}.receivedQuantity`]: weightTracked ? 0 : rl.quantity, [`${path}.receivedGrossWeight`]: weightTracked ? rl.grossWeight! : 0 } },
        { session }
      );
    }

    const [grn] = await GoodsReceiptModel.create(
      [{ _id: grnId, grnNo, purchaseOrderId: po._id, poNo: po.poNo, supplierId: po.supplierId, supplierName: po.supplierName, receivedDate: input.receivedDate, lines: grnLines, ...(input.notes ? { notes: input.notes } : {}), receivedById: oid(actor.id), receivedByName: actor.name }],
      { session }
    );
    await PurchaseOrderModel.updateOne({ _id: po._id }, { $push: { goodsReceiptIds: grn._id } }, { session });
    // Still the named `receive` action, checked against the graph (assertPoMove) — a derived target is never applied blindly,
    // and the compare-and-set is on the PO's ORIGINAL status, so a concurrent change to it aborts this whole transaction.
    const moved = await applyPo(po._id, "receive", actor, { target, note: `${grnNo} posted`, session });
    if (!moved) throw new ConflictError("This purchase order changed while the receipt was being posted — please look again.");
    return { grnLines };
  });

  const discrepancies = grnLines.filter((l) => l.hasWeightDiscrepancy).map((l) => ({ description: l.description, variancePercent: l.variancePercent }));
  await audit(actor, AUDIT_ACTIONS.PROCUREMENT_GOODS_RECEIPT_POSTED, "GoodsReceipt", grnId.toHexString(), { grnNo, poNo: po.poNo, lines: grnLines.length, discrepancies });

  const grnDoc = await GoodsReceiptModel.findById(grnId);
  if (!grnDoc) throw new NotFoundError("Goods receipt", grnId.toHexString());
  return goodsReceiptView(grnDoc.toObject());
}

export async function requireGoodsReceipt(grnId: string) {
  const doc = await GoodsReceiptModel.findById(grnId);
  if (!doc) throw new NotFoundError("Goods receipt", grnId);
  return doc;
}

export async function getGoodsReceipt(grnId: string): Promise<GoodsReceipt> {
  return goodsReceiptView((await requireGoodsReceipt(grnId)).toObject());
}

export async function listGoodsReceipts(filter: { purchaseOrderId?: string } = {}): Promise<GoodsReceipt[]> {
  const query: Record<string, unknown> = {};
  if (filter.purchaseOrderId) query.purchaseOrderId = oid(filter.purchaseOrderId);
  const docs = await GoodsReceiptModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
  return docs.map((d) => goodsReceiptView(d as never));
}
