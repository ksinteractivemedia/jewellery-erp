import type { AuditLogEntry } from "./auth";
import type { Grams, Id, Paise } from "./common";
import type { HallmarkStatus, InventoryItem, InventoryItemKind, InventoryStatus } from "./inventory-item";
import type { LedgerBalance } from "./inventory-ledger";
import type { LocationType } from "./location";
import type { MetalOption } from "./catalog";
import type { MovementType, ReferenceType } from "./transaction";
import type { AdjustmentStatus, StockAdjustment } from "./stock-adjustment";
import type { StockTransfer, TransferStatus } from "./stock-transfer";
import type { ProductVariant } from "./product-variant";

export interface LocationRef {
  id: Id;
  name: string;
  code: string;
  type: LocationType;
}

export interface InventoryProductRef {
  id: Id;
  sku: string;
  name: string;
  imageUrl?: string;
}

/**
 * One row of the inventory table. `availableForSale` is derived on the server (AVAILABLE, finished
 * jewellery, not held) so the rule lives in one place; `reservedForOrder` is the order holding it.
 */
export interface InventoryListItem {
  id: Id;
  itemCode: string;
  barcode?: string;
  huid?: string;
  hallmarkStatus: HallmarkStatus;
  type: InventoryItemKind;
  serialization: InventoryItem["serialization"];
  product?: InventoryProductRef;
  variantSku?: string;
  metal: { id: Id; code: string; name: string };
  purity: string;
  grossWeight: Grams;
  stoneWeight: Grams;
  netWeight: Grams;
  fineWeight: Grams;
  quantity: number;
  location: LocationRef;
  status: InventoryStatus;
  availableForSale: boolean;
  reservedForOrder?: Id;
  cost: Paise;
  updatedAt: Date;
}

export interface InventoryTotals {
  count: number;
  quantity: number;
  grossWeight: Grams;
  netWeight: Grams;
  fineWeight: Grams;
  cost: Paise;
}

export interface InventoryListResult {
  items: InventoryListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Over the whole filtered set (not just this page) — "what am I looking at, in grams and rupees". */
  totals: InventoryTotals;
}

/**
 * Indicative asset valuation — never a selling price (that is the pricing engine's job, Phase 2).
 * `costPaise` is book cost; `metalValuePaise` is fine weight × today's metal rate (no making,
 * stone or tax). Absent when no rate is on file, with the reason in `metalValueNote`.
 */
export interface ItemValuation {
  costPaise: Paise;
  metalValuePaise?: Paise;
  ratePerGramPaise?: Paise;
  ratePurity?: string;
  rateEffectiveFrom?: Date;
  metalValueNote?: string;
}

export interface InventoryItemDetail extends InventoryItem {
  availableForSale: boolean;
  reservedForOrder?: Id;
  product?: InventoryProductRef & { categoryName?: string };
  variant?: Pick<ProductVariant, "id" | "sku" | "attributes">;
  metal: { id: Id; code: string; name: string };
  location: LocationRef;
  valuation: ItemValuation;
}

export interface LedgerRow {
  id: Id;
  sequence: number;
  transactionId: Id;
  createdAt: Date;
  movementType: MovementType;
  itemId: Id;
  itemCode: string;
  productName?: string;
  quantity: number;
  grossWeight: Grams;
  netWeight: Grams;
  fineWeight: Grams;
  balanceAfter: LedgerBalance;
  fromStatus?: InventoryStatus;
  toStatus: InventoryStatus;
  sourceLocation?: { id: Id; name: string };
  destinationLocation?: { id: Id; name: string };
  performedBy: { id: Id; name: string };
  reason?: string;
  referenceType: ReferenceType;
  referenceId?: Id;
  channel: string;
}

export interface LedgerResult {
  rows: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
}

export type StockGroupBy = "location" | "sku" | "purity" | "metal";

export interface StockSummaryRow {
  key: string;
  label: string;
  sublabel?: string;
  /** Distinct records (UNIT pieces and BATCH lots) in owned stock. */
  pieces: number;
  quantity: number;
  grossWeight: Grams;
  netWeight: Grams;
  fineWeight: Grams;
  cost: Paise;
  /** Sellable right now. */
  availablePieces: number;
  byStatus: Partial<Record<InventoryStatus, number>>;
}

export interface StockSummary {
  groupBy: StockGroupBy;
  rows: StockSummaryRow[];
  totals: InventoryTotals;
}

export interface TransferView extends StockTransfer {
  fromLocation: LocationRef;
  toLocation: LocationRef;
  dispatchedByName?: string;
}

export interface AdjustmentView extends StockAdjustment {
  requestedByName?: string;
  decidedByName?: string;
  /** Current state of the item, so an approver sees what the request is being applied to. */
  current?: { status: InventoryStatus; grossWeight: Grams; stoneWeight: Grams; quantity: number; ledgerSeq: number };
  /** True when the item has moved since the request — approving would be refused. */
  stale: boolean;
}

export interface InventoryMeta {
  locations: LocationRef[];
  metals: MetalOption[];
  usedPurities: string[];
}

export type ScanMatchedBy = "ITEM_CODE" | "BARCODE" | "HUID" | "SERIAL_NUMBER";
export interface ScanResolution {
  /** What the scanned text was parsed as (before lookup). */
  code: string;
  format: "QR_URI" | "PLAIN";
  matchedBy?: ScanMatchedBy;
  item?: InventoryListItem;
}

export type { AdjustmentStatus, TransferStatus, AuditLogEntry };
