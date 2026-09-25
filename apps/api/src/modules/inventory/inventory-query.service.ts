import { Types, type FilterQuery } from "mongoose";
import type {
  AdjustmentView,
  AuditLogEntry,
  InventoryItemDetail,
  InventoryListItem,
  InventoryListResult,
  InventoryMeta,
  InventoryStatus,
  InventoryTotals,
  LedgerResult,
  LedgerRow,
  LocationRef,
  ScanResolution,
  StockSummary,
  StockSummaryRow,
  TransferView,
} from "@jewellery/types";
import { parseScanCode, type InventoryListQuery, type LedgerQuery, type StockSummaryQuery } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { deepStringifyObjectIds, toDTO, toDTOList } from "../../shared/to-dto";
import { AuditLogModel } from "../audit/audit-log.model";
import { UserModel } from "../auth/user.model";
import { ProductCategoryModel } from "../catalog/product-category.model";
import { ProductVariantModel } from "../catalog/product-variant.model";
import { ProductModel } from "../catalog/product.model";
import type { MediaService } from "../media/media.service";
import { MetalModel } from "../metals/metal.model";
import { MetalRateModel } from "../metals/metal-rate.model";
import { LocationModel } from "../organization/location.model";
import { InventoryItemModel, type InventoryItemAttrs } from "./inventory-item.model";
import { InventoryLedgerModel } from "./inventory-ledger.model";
import { OWNED_STATUSES, isAvailableForSale } from "./movement-rules";
import { StockAdjustmentModel } from "./stock-adjustment.model";
import { StockTransferModel } from "./stock-transfer.model";
import { TransactionModel } from "./transaction.model";
import { buildValuation } from "./valuation";

type Lean = InventoryItemAttrs & { _id: import("mongoose").Types.ObjectId; createdAt: Date; updatedAt: Date };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const id = (v: unknown) => String(v);
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const EMPTY_TOTALS: InventoryTotals = { count: 0, quantity: 0, grossWeight: 0, netWeight: 0, fineWeight: 0, cost: 0 };

export function createInventoryQueryService(deps: { media: MediaService }) {
  const { media } = deps;

  // ---- name resolution ------------------------------------------------------------------------
  async function locationMap(ids: unknown[]) {
    const rows = await LocationModel.find({ _id: { $in: ids } }).select("name code type").lean();
    return new Map(rows.map((l): [string, LocationRef] => [id(l._id), { id: id(l._id), name: l.name, code: l.code, type: l.type }]));
  }
  async function userNames(ids: unknown[]) {
    const rows = await UserModel.find({ _id: { $in: ids } }).select("name").lean();
    return new Map(rows.map((u) => [id(u._id), u.name as string]));
  }

  async function itemContext(rows: Lean[]) {
    const [locations, metals, products, variants] = await Promise.all([
      locationMap(rows.map((r) => r.locationId)),
      MetalModel.find({ _id: { $in: rows.map((r) => r.metalId) } }).select("code name").lean(),
      ProductModel.find({ _id: { $in: rows.map((r) => r.productId).filter(Boolean) } }).select("sku name images").lean(),
      ProductVariantModel.find({ _id: { $in: rows.map((r) => r.variantId).filter(Boolean) } }).select("sku").lean(),
    ]);
    return { locations, metals: new Map(metals.map((m) => [id(m._id), m])), products: new Map(products.map((p) => [id(p._id), p])), variants: new Map(variants.map((v) => [id(v._id), v])) };
  }

  const toListItem = (r: Lean, ctx: Awaited<ReturnType<typeof itemContext>>): InventoryListItem => {
    const product = r.productId ? ctx.products.get(id(r.productId)) : undefined;
    const metal = ctx.metals.get(id(r.metalId));
    const location = ctx.locations.get(id(r.locationId));
    return {
      id: id(r._id),
      itemCode: r.itemCode,
      barcode: r.barcode ?? undefined,
      huid: r.huid ?? undefined,
      hallmarkStatus: r.hallmarkStatus,
      type: r.type,
      serialization: r.serialization,
      product: product ? { id: id(product._id), sku: product.sku, name: product.name, imageUrl: product.images[0] ? media.urlFor(product.images[0].key) : undefined } : undefined,
      variantSku: r.variantId ? ctx.variants.get(id(r.variantId))?.sku : undefined,
      metal: { id: id(r.metalId), code: metal?.code ?? "?", name: metal?.name ?? "Unknown" },
      purity: r.purity,
      grossWeight: r.grossWeight,
      stoneWeight: r.stoneWeight,
      netWeight: r.netWeight,
      fineWeight: r.fineWeight,
      quantity: r.quantity,
      location: location ?? { id: id(r.locationId), name: "Unknown", code: "?", type: "WAREHOUSE" },
      status: r.status as InventoryStatus,
      availableForSale: isAvailableForSale(r as never),
      reservedForOrder: r.reservation ? id(r.reservation.referenceId) : undefined,
      cost: r.cost,
      updatedAt: r.updatedAt,
    };
  };

  // ---- filters -------------------------------------------------------------------------------
  type F = Pick<InventoryListQuery, "q" | "status" | "locationId" | "metalId" | "purity" | "type" | "productId" | "hallmarkStatus" | "availableForSale" | "hasHuid">;

  async function buildFilter(q: F): Promise<FilterQuery<InventoryItemAttrs>> {
    const and: FilterQuery<InventoryItemAttrs>[] = [];
    if (q.status?.length) and.push({ status: { $in: q.status } });
    // ObjectIds, not strings: `find` would cast for us but `aggregate` (totals, summaries) does not.
    if (q.locationId) and.push({ locationId: new Types.ObjectId(q.locationId) });
    if (q.metalId) and.push({ metalId: new Types.ObjectId(q.metalId) });
    if (q.purity) and.push({ purity: q.purity });
    if (q.type) and.push({ type: q.type });
    if (q.productId) and.push({ productId: new Types.ObjectId(q.productId) });
    if (q.hallmarkStatus) and.push({ hallmarkStatus: q.hallmarkStatus });
    if (q.hasHuid !== undefined) and.push(q.hasHuid ? { huid: { $exists: true, $ne: null } } : { $or: [{ huid: { $exists: false } }, { huid: null }] });
    if (q.availableForSale) and.push({ status: "AVAILABLE", type: "FINISHED_JEWELLERY", reservation: { $exists: false }, quantity: { $gt: 0 } });
    else if (q.availableForSale === false) and.push({ $nor: [{ status: "AVAILABLE", type: "FINISHED_JEWELLERY", reservation: { $exists: false }, quantity: { $gt: 0 } }] });

    // Search: every word must match a code/label/HUID, the item's purity, or its product's SKU/name (or a variant's SKU).
    for (const word of (q.q ?? "").split(/\s+/).filter(Boolean).slice(0, 6)) {
      const re = new RegExp(escapeRegex(word), "i");
      const [products, variants] = await Promise.all([
        ProductModel.find({ $or: [{ sku: re }, { name: re }, { tags: re }] }).select("_id").limit(500).lean(),
        ProductVariantModel.find({ sku: re }).select("_id").limit(500).lean(),
      ]);
      and.push({ $or: [{ itemCode: re }, { barcode: re }, { serialNumber: re }, { huid: re }, { productId: { $in: products.map((p) => p._id) } }, { variantId: { $in: variants.map((v) => v._id) } }] });
    }
    return and.length ? { $and: and } : {};
  }

  async function totalsFor(filter: FilterQuery<InventoryItemAttrs>): Promise<InventoryTotals> {
    const [t] = await InventoryItemModel.aggregate<InventoryTotals & { _id: null }>([
      { $match: filter },
      { $group: { _id: null, count: { $sum: 1 }, quantity: { $sum: "$quantity" }, grossWeight: { $sum: "$grossWeight" }, netWeight: { $sum: "$netWeight" }, fineWeight: { $sum: "$fineWeight" }, cost: { $sum: "$cost" } } },
    ]);
    return t ? { count: t.count, quantity: t.quantity, grossWeight: r3(t.grossWeight), netWeight: r3(t.netWeight), fineWeight: r3(t.fineWeight), cost: t.cost } : EMPTY_TOTALS;
  }

  return {
    async list(query: InventoryListQuery): Promise<InventoryListResult> {
      const filter = await buildFilter(query);
      const dir = query.order === "asc" ? 1 : -1;
      const [totals, rows] = await Promise.all([
        totalsFor(filter),
        InventoryItemModel.find(filter)
          .sort({ [query.sort]: dir, _id: dir })
          .collation(query.sort === "itemCode" ? { locale: "en", strength: 2, numericOrdering: true } : { locale: "simple" })
          .skip((query.page - 1) * query.pageSize)
          .limit(query.pageSize)
          .lean<Lean[]>(),
      ]);
      const ctx = await itemContext(rows);
      return { items: rows.map((r) => toListItem(r, ctx)), total: totals.count, page: query.page, pageSize: query.pageSize, totals };
    },

    async detail(itemId: string): Promise<InventoryItemDetail> {
      const doc = await InventoryItemModel.findById(itemId);
      if (!doc) throw new NotFoundError("InventoryItem", itemId);
      const item = toDTO<InventoryItemDetail>(doc)!;
      const lean = doc.toObject() as unknown as Lean;
      const ctx = await itemContext([lean]);
      const row = toListItem(lean, ctx);

      const product = lean.productId ? await ProductModel.findById(lean.productId).select("categoryId").lean() : null;
      const category = product?.categoryId ? await ProductCategoryModel.findById(product.categoryId).select("name").lean() : null;
      const variant = lean.variantId ? await ProductVariantModel.findById(lean.variantId).lean() : null;

      // Rate for this purity if quoted, else the latest quote for any purity of the metal, scaled by fineness.
      const metal = await MetalModel.findById(lean.metalId).lean();
      const fin = (p: string) => metal?.purityOptions.find((o) => o.code === p)?.fineness ?? null;
      // Tiebroken on _id too (insertion order) — two rows sharing an effectiveFrom must still resolve deterministically, same as findCurrentRate().
      const rate =
        (await MetalRateModel.findOne({ metalId: lean.metalId, purity: lean.purity, effectiveFrom: { $lte: new Date() } }).sort({ effectiveFrom: -1, _id: -1 }).lean()) ??
        (await MetalRateModel.findOne({ metalId: lean.metalId, effectiveFrom: { $lte: new Date() } }).sort({ effectiveFrom: -1, _id: -1 }).lean());
      const valuation = buildValuation(lean, rate as never, rate ? fin(rate.purity) : null);

      return {
        ...item,
        availableForSale: row.availableForSale,
        reservedForOrder: row.reservedForOrder,
        product: row.product ? { ...row.product, categoryName: category?.name } : undefined,
        variant: variant ? { id: id(variant._id), sku: variant.sku, attributes: Object.fromEntries(Object.entries(variant.attributes ?? {})) } : undefined,
        metal: row.metal,
        location: row.location,
        valuation,
      };
    },

    /** Owned-stock roll-ups by location / SKU / purity / metal, with a per-status breakdown. */
    async summary(query: StockSummaryQuery): Promise<StockSummary> {
      const filter = await buildFilter(query);
      const scoped: FilterQuery<InventoryItemAttrs> = { $and: [filter, ...(query.scope === "owned" ? [{ status: { $in: OWNED_STATUSES } }] : [])] };
      const keyExpr =
        query.groupBy === "location" ? "$locationId"
        : query.groupBy === "metal" ? "$metalId"
        : query.groupBy === "purity" ? { metalId: "$metalId", purity: "$purity" }
        : { productId: { $ifNull: ["$productId", null] }, variantId: { $ifNull: ["$variantId", null] } };

      const raw = await InventoryItemModel.aggregate<{ _id: unknown; pieces: number; quantity: number; grossWeight: number; netWeight: number; fineWeight: number; cost: number; available: number; statuses: { s: InventoryStatus; n: number }[] }>([
        { $match: scoped },
        {
          $group: {
            _id: { key: keyExpr, status: "$status" },
            n: { $sum: 1 }, quantity: { $sum: "$quantity" }, grossWeight: { $sum: "$grossWeight" }, netWeight: { $sum: "$netWeight" }, fineWeight: { $sum: "$fineWeight" }, cost: { $sum: "$cost" },
            available: { $sum: { $cond: [{ $and: [{ $eq: ["$status", "AVAILABLE"] }, { $eq: ["$type", "FINISHED_JEWELLERY"] }, { $not: ["$reservation"] }] }, 1, 0] } },
          },
        },
        {
          $group: {
            _id: "$_id.key",
            pieces: { $sum: "$n" }, quantity: { $sum: "$quantity" }, grossWeight: { $sum: "$grossWeight" }, netWeight: { $sum: "$netWeight" }, fineWeight: { $sum: "$fineWeight" }, cost: { $sum: "$cost" }, available: { $sum: "$available" },
            statuses: { $push: { s: "$_id.status", n: "$n" } },
          },
        },
      ]);

      const [locations, metals, products, variants] = await Promise.all([
        query.groupBy === "location" ? locationMap(raw.map((r) => r._id)) : new Map<string, LocationRef>(),
        MetalModel.find({}).select("code name").lean(),
        ProductModel.find({}).select("sku name").lean(),
        ProductVariantModel.find({}).select("sku").lean(),
      ]);
      const metalName = (mid: unknown) => metals.find((m) => id(m._id) === id(mid))?.name ?? "Unknown metal";

      const rows: StockSummaryRow[] = raw.map((r) => {
        const k = r._id as Record<string, unknown> | unknown;
        let key: string, label: string, sublabel: string | undefined;
        if (query.groupBy === "location") {
          const l = locations.get(id(k)); key = id(k); label = l?.name ?? "Unknown"; sublabel = l?.type.replace(/_/g, " ").toLowerCase();
        } else if (query.groupBy === "metal") {
          key = id(k); label = metalName(k);
        } else if (query.groupBy === "purity") {
          const p = k as { metalId: unknown; purity: string }; key = `${id(p.metalId)}:${p.purity}`; label = `${metalName(p.metalId)} ${p.purity}`;
        } else {
          const p = k as { productId: unknown; variantId: unknown };
          const product = p.productId ? products.find((x) => id(x._id) === id(p.productId)) : undefined;
          const variant = p.variantId ? variants.find((x) => id(x._id) === id(p.variantId)) : undefined;
          key = `${p.productId ? id(p.productId) : "none"}:${p.variantId ? id(p.variantId) : ""}`;
          label = variant?.sku ?? product?.sku ?? "No product";
          sublabel = product?.name ?? "Material or piece not linked to a catalogue product";
        }
        const byStatus: Partial<Record<InventoryStatus, number>> = {};
        for (const s of r.statuses) byStatus[s.s] = s.n;
        return { key, label, sublabel, pieces: r.pieces, quantity: r.quantity, grossWeight: r3(r.grossWeight), netWeight: r3(r.netWeight), fineWeight: r3(r.fineWeight), cost: r.cost, availablePieces: r.available, byStatus };
      });
      rows.sort((a, b) => b.fineWeight - a.fineWeight || a.label.localeCompare(b.label));
      const totals = rows.reduce<InventoryTotals>((t, r) => ({ count: t.count + r.pieces, quantity: t.quantity + r.quantity, grossWeight: r3(t.grossWeight + r.grossWeight), netWeight: r3(t.netWeight + r.netWeight), fineWeight: r3(t.fineWeight + r.fineWeight), cost: t.cost + r.cost }), EMPTY_TOTALS);
      return { groupBy: query.groupBy, rows, totals };
    },

    async ledger(query: LedgerQuery): Promise<LedgerResult> {
      const filter: FilterQuery<unknown> = {};
      if (query.itemId) filter.itemId = query.itemId;
      if (query.movementType?.length) filter.movementType = { $in: query.movementType };
      if (query.transactionId) filter.transactionId = query.transactionId;
      if (query.locationId) filter.$or = [{ sourceLocationId: query.locationId }, { destinationLocationId: query.locationId }];
      if (query.from || query.to) filter.createdAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
      if (query.referenceId || query.performedBy) {
        const txFilter: Record<string, unknown> = {};
        if (query.referenceId) txFilter.referenceId = query.referenceId;
        if (query.performedBy) txFilter.performedBy = query.performedBy;
        filter.transactionId = { $in: (await TransactionModel.find(txFilter).select("_id").lean()).map((t) => t._id) };
      }
      const dir = query.order === "asc" ? 1 : -1;
      const [total, entries] = await Promise.all([
        InventoryLedgerModel.countDocuments(filter),
        InventoryLedgerModel.find(filter).sort(query.itemId ? { sequence: dir } : { createdAt: dir, _id: dir }).skip((query.page - 1) * query.pageSize).limit(query.pageSize).lean(),
      ]);

      const [transactions, items, locs] = await Promise.all([
        TransactionModel.find({ _id: { $in: entries.map((e) => e.transactionId) } }).lean(),
        InventoryItemModel.find({ _id: { $in: entries.map((e) => e.itemId) } }).select("itemCode productId").lean(),
        locationMap(entries.flatMap((e) => [e.sourceLocationId, e.destinationLocationId].filter(Boolean))),
      ]);
      const [users, products] = await Promise.all([
        userNames(transactions.map((t) => t.performedBy)),
        ProductModel.find({ _id: { $in: items.map((i) => i.productId).filter(Boolean) } }).select("name").lean(),
      ]);
      const txMap = new Map(transactions.map((t) => [id(t._id), t]));
      const itemMap = new Map(items.map((i) => [id(i._id), i]));
      const productName = new Map(products.map((p) => [id(p._id), p.name]));
      const loc = (v: unknown) => (v ? { id: id(v), name: locs.get(id(v))?.name ?? "Unknown" } : undefined);

      const rows: LedgerRow[] = entries.map((e) => {
        const tx = txMap.get(id(e.transactionId));
        const item = itemMap.get(id(e.itemId));
        return {
          id: id(e._id),
          sequence: e.sequence,
          transactionId: id(e.transactionId),
          createdAt: e.createdAt,
          movementType: e.movementType,
          itemId: id(e.itemId),
          itemCode: item?.itemCode ?? "?",
          productName: item?.productId ? productName.get(id(item.productId)) : undefined,
          quantity: e.quantity,
          grossWeight: e.grossWeight,
          netWeight: e.netWeight,
          fineWeight: e.fineWeight,
          balanceAfter: e.balanceAfter,
          fromStatus: e.fromStatus,
          toStatus: e.toStatus,
          sourceLocation: loc(e.sourceLocationId),
          destinationLocation: loc(e.destinationLocationId),
          performedBy: { id: tx ? id(tx.performedBy) : "", name: tx ? (users.get(id(tx.performedBy)) ?? (id(tx.performedBy) === "0".repeat(24) ? "System" : "Unknown user")) : "Unknown" },
          reason: tx?.reason ?? undefined,
          referenceType: tx?.referenceType ?? "MANUAL",
          referenceId: tx?.referenceId ? id(tx.referenceId) : undefined,
          channel: tx?.channel ?? "ERP",
        };
      });
      return { rows, total, page: query.page, pageSize: query.pageSize };
    },

    /** Audit entries that touched this item (operator, request, outcome) — distinct from the stock ledger. */
    async itemAudit(itemId: string): Promise<AuditLogEntry[]> {
      const docs = await AuditLogModel.find({ $or: [{ targetType: "inventory_item", targetId: itemId }, { "metadata.itemIds": itemId }] }).sort({ _id: -1 }).limit(100);
      return toDTOList<AuditLogEntry>(docs).map((d) => deepStringifyObjectIds(d));
    },

    async meta(): Promise<InventoryMeta> {
      const [locations, metals, purities] = await Promise.all([
        LocationModel.find({ isActive: true }).sort({ name: 1 }).lean(),
        MetalModel.find({ isActive: true }).sort({ name: 1 }).lean(),
        InventoryItemModel.distinct("purity"),
      ]);
      return {
        locations: locations.map((l) => ({ id: id(l._id), name: l.name, code: l.code, type: l.type })),
        metals: metals.map((m) => ({ id: id(m._id), code: m.code, name: m.name, purities: m.purityOptions.filter((o) => o.isActive).map((o) => o.code) })),
        usedPurities: (purities as string[]).sort(),
      };
    },

    /** Resolves scanned/typed text (QR payload, item code, barcode, serial, HUID) to at most one item. */
    async resolveScan(code: string): Promise<ScanResolution> {
      const parsed = parseScanCode(code);
      if (!parsed) return { code, format: "PLAIN" };
      const fieldFor = { ITEM_CODE: "itemCode", BARCODE: "barcode", SERIAL_NUMBER: "serialNumber", HUID: "huid" } as const;
      for (const lookup of parsed.lookups) {
        const field = fieldFor[lookup];
        const value = lookup === "ITEM_CODE" || lookup === "HUID" ? parsed.value.toUpperCase() : parsed.value;
        const doc = await InventoryItemModel.findOne({ [field]: value }).lean<Lean>();
        if (doc) {
          const ctx = await itemContext([doc]);
          return { code: parsed.value, format: parsed.format, matchedBy: lookup, item: toListItem(doc, ctx) };
        }
      }
      return { code: parsed.value, format: parsed.format };
    },

    async locations(): Promise<LocationRef[]> {
      return (await this.meta()).locations;
    },

    // ---- transfers & adjustments -----------------------------------------------------------
    async listTransfers(q: { status?: string; locationId?: string; page: number; pageSize: number }): Promise<{ transfers: TransferView[]; total: number }> {
      const filter: FilterQuery<unknown> = {};
      if (q.status) filter.status = q.status;
      if (q.locationId) filter.$or = [{ fromLocationId: q.locationId }, { toLocationId: q.locationId }];
      const [total, docs] = await Promise.all([StockTransferModel.countDocuments(filter), StockTransferModel.find(filter).sort({ dispatchedAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize)]);
      return { transfers: await this.decorateTransfers(docs), total };
    },
    async getTransfer(transferId: string): Promise<TransferView> {
      const doc = await StockTransferModel.findById(transferId);
      if (!doc) throw new NotFoundError("StockTransfer", transferId);
      return (await this.decorateTransfers([doc]))[0]!;
    },
    async decorateTransfers(docs: InstanceType<typeof StockTransferModel>[]): Promise<TransferView[]> {
      const [locs, users] = await Promise.all([locationMap(docs.flatMap((d) => [d.fromLocationId, d.toLocationId])), userNames(docs.map((d) => d.dispatchedBy))]);
      const unknown = (v: unknown): LocationRef => ({ id: id(v), name: "Unknown", code: "?", type: "WAREHOUSE" });
      return docs.map((d) => ({ ...toDTO<TransferView>(d)!, fromLocation: locs.get(id(d.fromLocationId)) ?? unknown(d.fromLocationId), toLocation: locs.get(id(d.toLocationId)) ?? unknown(d.toLocationId), dispatchedByName: users.get(id(d.dispatchedBy)) }));
    },

    async listAdjustments(q: { status?: string; itemId?: string; page: number; pageSize: number }): Promise<{ adjustments: AdjustmentView[]; total: number }> {
      const filter: FilterQuery<unknown> = {};
      if (q.status) filter.status = q.status;
      if (q.itemId) filter.itemId = q.itemId;
      const [total, docs] = await Promise.all([StockAdjustmentModel.countDocuments(filter), StockAdjustmentModel.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize)]);
      const [users, items] = await Promise.all([userNames(docs.flatMap((d) => [d.requestedBy, d.decidedBy].filter(Boolean))), InventoryItemModel.find({ _id: { $in: docs.map((d) => d.itemId) } }).select("status grossWeight stoneWeight quantity ledgerSeq").lean()]);
      const itemMap = new Map(items.map((i) => [id(i._id), i]));
      return {
        total,
        adjustments: docs.map((d) => {
          const cur = itemMap.get(id(d.itemId));
          return {
            ...toDTO<AdjustmentView>(d)!,
            requestedByName: users.get(id(d.requestedBy)),
            decidedByName: d.decidedBy ? users.get(id(d.decidedBy)) : undefined,
            current: cur ? { status: cur.status as InventoryStatus, grossWeight: cur.grossWeight, stoneWeight: cur.stoneWeight, quantity: cur.quantity, ledgerSeq: cur.ledgerSeq } : undefined,
            stale: d.status === "PENDING" && !!cur && cur.ledgerSeq !== d.expectedLedgerSeq,
          };
        }),
      };
    },
  };
}
export type InventoryQueryService = ReturnType<typeof createInventoryQueryService>;
