import type { InventoryItem, InventoryLedgerEntry, StockAdjustment, StockTransfer } from "@jewellery/types";
import { PERMISSIONS } from "@jewellery/types";
import {
  adjustmentDecisionSchema,
  cancelTransferSchema,
  createInventoryItemSchema,
  createTransferSchema,
  partnerMovementSchema,
  receiveTransferSchema,
  releaseItemsSchema,
  requestAdjustmentSchema,
  reserveItemsSchema,
  updateInventoryItemDetailsSchema,
  type CreateInventoryItemInput,
} from "@jewellery/validation";
import { z } from "zod";
import { AuthorizationError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { auditAs } from "../audit/audit-as";
import type { RequestMeta } from "../auth/auth.service";
import type { AuthContext } from "../auth/authorization.service";
import { InventoryItemModel } from "./inventory-item.model";
import { receiveNewInventoryItem, type PostedInventoryTransaction } from "./inventory-transaction.service";
import {
  approveAdjustment,
  cancelTransfer,
  createTransfer,
  inspectReturnedItems,
  movePartner,
  receiveTransfer,
  rejectAdjustment,
  releaseItems,
  requestAdjustment,
  reserveItems,
  updateItemIdentifiers,
} from "./stock-operations";

const ctxOf = (actor: AuthContext) => ({ performedBy: actor.userId, channel: "ERP" as const });
const itemsMeta = (posted: PostedInventoryTransaction, extra: Record<string, unknown> = {}) => ({
  transactionId: posted.transaction.id,
  itemIds: posted.entries.map((e) => e.itemId),
  count: posted.entries.length,
  ...extra,
});

/**
 * HTTP-facing stock operations: input validation, the permission-dependent decisions the routes
 * can't express (forcing a release), and the audit entry for each. The stock rules themselves live
 * in stock-operations.ts / inventory-transaction.service.ts, which Orders and Production will call directly.
 */
export function createInventoryService() {
  return {
    async receiveItem(actor: AuthContext, body: Record<string, unknown>, meta: RequestMeta): Promise<{ item: InventoryItem; entry: InventoryLedgerEntry }> {
      const { reason, ...rest } = z.object({ reason: z.string().trim().max(500).optional() }).passthrough().parse(body);
      const item = createInventoryItemSchema.parse(rest) as unknown as CreateInventoryItemInput;
      const result = await receiveNewInventoryItem({ item, performedBy: actor.userId, channel: "ERP", referenceType: "MANUAL", reason });
      await auditAs(actor, meta, AUDIT_ACTIONS.INVENTORY_ITEM_RECEIVED, "inventory_item", result.item.id, {
        itemIds: [result.item.id], itemCode: result.item.itemCode, locationId: result.item.locationId, grossWeight: result.item.grossWeight, purity: result.item.purity, transactionId: result.transaction.id,
      });
      return { item: result.item, entry: result.entry };
    },

    async updateIdentifiers(actor: AuthContext, itemId: string, body: unknown, meta: RequestMeta): Promise<InventoryItem> {
      const parsed = updateInventoryItemDetailsSchema.parse(body);
      const item = await updateItemIdentifiers(itemId, parsed);
      await auditAs(actor, meta, AUDIT_ACTIONS.INVENTORY_IDENTIFIERS_UPDATED, "inventory_item", itemId, { itemIds: [itemId], fields: Object.keys(parsed) });
      return item;
    },

    async reserve(actor: AuthContext, body: unknown, meta: RequestMeta) {
      const input = reserveItemsSchema.parse(body);
      const expiresAt = input.expiresInMinutes ? new Date(Date.now() + input.expiresInMinutes * 60_000) : undefined;
      const posted = await reserveItems(ctxOf(actor), { ...input, expiresAt });
      await auditAs(actor, meta, AUDIT_ACTIONS.INVENTORY_RESERVED, "inventory_transaction", posted.transaction.id, itemsMeta(posted, { referenceId: input.referenceId, expiresAt }));
      return posted;
    },

    async release(actor: AuthContext, body: unknown, meta: RequestMeta) {
      const input = releaseItemsSchema.parse(body);
      // Breaking someone else's hold is an override — it needs the same authority as approving an adjustment.
      const canOverride = actor.permissions.has(PERMISSIONS.INVENTORY_APPROVE_ADJUSTMENT);
      if (input.force && !canOverride) throw new AuthorizationError("Releasing another order's reservation needs approval authority");
      // An order id is not a secret (any viewer can read it), so knowing it is not enough: you release your own holds.
      if (!input.force && !canOverride) {
        const held = await InventoryItemModel.find({ _id: { $in: input.itemIds }, status: "RESERVED" }).select("itemCode reservation").lean();
        const notYours = held.filter((i) => String(i.reservation?.reservedBy) !== actor.userId);
        if (notYours.length) throw new AuthorizationError(`${notYours.map((i) => i.itemCode).join(", ")} ${notYours.length === 1 ? "was" : "were"} reserved by someone else — only they, or a manager, can release ${notYours.length === 1 ? "it" : "them"}`);
      }
      const posted = await releaseItems(ctxOf(actor), input);
      await auditAs(actor, meta, AUDIT_ACTIONS.INVENTORY_RELEASED, "inventory_transaction", posted.transaction.id, itemsMeta(posted, { referenceId: input.referenceId, forced: input.force }));
      return posted;
    },

    async movePartner(actor: AuthContext, body: unknown, meta: RequestMeta) {
      const input = partnerMovementSchema.parse(body);
      const posted = await movePartner(ctxOf(actor), input);
      await auditAs(actor, meta, AUDIT_ACTIONS.INVENTORY_MOVED, "inventory_transaction", posted.transaction.id, itemsMeta(posted, { movement: input.type, destinationLocationId: input.destinationLocationId }));
      return posted;
    },

    async inspectReturn(actor: AuthContext, body: unknown, meta: RequestMeta) {
      const input = z.object({ itemIds: partnerMovementSchema.shape.itemIds, outcome: z.enum(["AVAILABLE", "DAMAGED"]), destinationLocationId: partnerMovementSchema.shape.destinationLocationId, reason: z.string().trim().max(500).optional() }).parse(body);
      const posted = await inspectReturnedItems(ctxOf(actor), input);
      await auditAs(actor, meta, AUDIT_ACTIONS.INVENTORY_RETURN_INSPECTED, "inventory_transaction", posted.transaction.id, itemsMeta(posted, { outcome: input.outcome }));
      return posted;
    },

    async createTransfer(actor: AuthContext, body: unknown, meta: RequestMeta): Promise<StockTransfer> {
      const transfer = await createTransfer(ctxOf(actor), createTransferSchema.parse(body));
      await auditAs(actor, meta, AUDIT_ACTIONS.INVENTORY_TRANSFER_DISPATCHED, "stock_transfer", transfer.id, { transferNo: transfer.transferNo, itemIds: transfer.lines.map((l) => l.itemId), from: transfer.fromLocationId, to: transfer.toLocationId });
      return transfer;
    },
    async receiveTransfer(actor: AuthContext, id: string, body: unknown, meta: RequestMeta): Promise<StockTransfer> {
      const { itemIds } = receiveTransferSchema.parse(body ?? {});
      const transfer = await receiveTransfer(ctxOf(actor), id, itemIds);
      await auditAs(actor, meta, AUDIT_ACTIONS.INVENTORY_TRANSFER_RECEIVED, "stock_transfer", id, { transferNo: transfer.transferNo, itemIds: itemIds ?? transfer.lines.map((l) => l.itemId), status: transfer.status });
      return transfer;
    },
    async cancelTransfer(actor: AuthContext, id: string, body: unknown, meta: RequestMeta): Promise<StockTransfer> {
      const { reason } = cancelTransferSchema.parse(body ?? {});
      const transfer = await cancelTransfer(ctxOf(actor), id, reason);
      await auditAs(actor, meta, AUDIT_ACTIONS.INVENTORY_TRANSFER_CANCELLED, "stock_transfer", id, { transferNo: transfer.transferNo, itemIds: transfer.lines.filter((l) => l.state === "RETURNED").map((l) => l.itemId), reason });
      return transfer;
    },

    async requestAdjustment(actor: AuthContext, body: unknown, meta: RequestMeta): Promise<StockAdjustment> {
      const adj = await requestAdjustment(ctxOf(actor), requestAdjustmentSchema.parse(body));
      await auditAs(actor, meta, AUDIT_ACTIONS.INVENTORY_ADJUSTMENT_REQUESTED, "stock_adjustment", adj.id, { adjustmentNo: adj.adjustmentNo, itemIds: [adj.itemId], reason: adj.reason, toStatus: adj.toStatus });
      return adj;
    },
    async approveAdjustment(actor: AuthContext, id: string, body: unknown, meta: RequestMeta): Promise<StockAdjustment> {
      const { note } = adjustmentDecisionSchema.parse(body ?? {});
      const adj = await approveAdjustment(ctxOf(actor), id, note);
      await auditAs(actor, meta, AUDIT_ACTIONS.INVENTORY_ADJUSTMENT_APPROVED, "stock_adjustment", id, { adjustmentNo: adj.adjustmentNo, itemIds: [adj.itemId], transactionId: adj.transactionId, requestedBy: adj.requestedBy });
      return adj;
    },
    async rejectAdjustment(actor: AuthContext, id: string, body: unknown, meta: RequestMeta): Promise<StockAdjustment> {
      const { note } = adjustmentDecisionSchema.parse(body ?? {});
      const adj = await rejectAdjustment(ctxOf(actor), id, note);
      await auditAs(actor, meta, AUDIT_ACTIONS.INVENTORY_ADJUSTMENT_REJECTED, "stock_adjustment", id, { adjustmentNo: adj.adjustmentNo, itemIds: [adj.itemId], note });
      return adj;
    },
  };
}
export type InventoryService = ReturnType<typeof createInventoryService>;
