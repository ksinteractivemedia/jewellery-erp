# Data Model

Status: proposed, pre-implementation. Field lists are indicative — exact Mongoose schemas are written at implementation time, but the shape and relationships below are load-bearing (see [business-rules.md](./business-rules.md) for why). Cross-reference: [architecture.md](./architecture.md) §4 for the catalogue/physical-item/event distinction this model is built around.

Naming convention: MongoDB collections in `camelCase`, plural. `_id` is an ObjectId unless noted. Money amounts stored as integer paise (avoid float rounding on currency); weights stored in grams as decimals (Mongoose `Decimal128`, not `Number`, to avoid floating-point drift on fine metal weight).

## 1. Catalog

### `products`
Catalogue/design definition — not a physical piece.
- `sku` (unique, indexed)
- `name`, `description`, `images[]` (S3 keys), `categoryId`, `collectionIds[]`
- `metalType` (GOLD | SILVER | PLATINUM), `purity` (e.g. 22K, 18K, 925), `defaultGrossWeight`, `defaultNetWeight` (guidance only — actual values live on `InventoryItem`)
- `stoneDetails[]` (type, weight, quality) — design-level default
- `pricingRuleTags[]` — which `pricingRules` categories apply (e.g. making-charge tier)
- `status` (DRAFT | ACTIVE | DISCONTINUED)
- `channelVisibility` (B2C, B2B, BOTH)
- timestamps

### `categories`, `productCollections`
Standard tree/tag structures for merchandising and navigation. Not to be confused with MongoDB "collections" the storage concept — `productCollections` is the marketing grouping (e.g. "Bridal", "Festive").

## 2. Inventory

### `inventoryItems`
One document per physical piece (finished jewellery) or one per fungible batch (raw material/loose stones).
- `itemCode` (unique, indexed) — internal inventory item ID
- `productId` (ref `products`, null for pure raw material not yet tied to a design)
- `type` (FINISHED_JEWELLERY | RAW_MATERIAL | SEMI_FINISHED | LOOSE_STONE)
- `serialization` (UNIT | BATCH) — UNIT = one physical piece, BATCH = fungible weight/qty
- `grossWeight`, `stoneWeight`, `netMetalWeight`, `fineMetalWeight` (Decimal128, grams)
- `metalType`, `purity`
- `huid` (string, indexed, sparse — only hallmarked gold items)
- `hallmarkingStatus` (NOT_APPLICABLE | PENDING | HALLMARKED)
- `stoneDetails[]` (type, weight, clarity/grade, certificate ref)
- `locationId` (ref `locations`)
- `status` (see business-rules.md §2.5 for legal transitions): `AVAILABLE | RESERVED | SOLD | RETURNED | DAMAGED | UNDER_REPAIR | IN_MANUFACTURING | WITH_JOB_WORKER | IN_TRANSIT | HALLMARKING | SCRAP | MELTING`
- `cost` (paise) — landed/manufacturing cost, for margin reporting (never shown to customers)
- `manufacturingInfo` { productionOrderId, jobWorkOrderId, manufacturedDate }
- `quantity` (for BATCH serialization; 1 for UNIT)
- timestamps
- Indexes: `{ status: 1, locationId: 1 }`, `{ huid: 1 }` sparse unique, `{ productId: 1 }`

### `inventoryLedger`
Append-only. Never updated or deleted.
- `transactionId` (ref `transactions`)
- `inventoryItemId` (ref `inventoryItems`)
- `movementType` (PURCHASE | GOODS_RECEIPT | SALE | RETURN | EXCHANGE | TRANSFER | ADJUSTMENT | MANUFACTURING_ISSUE | MANUFACTURING_RECEIPT | JOB_WORK_ISSUE | JOB_WORK_RECEIPT | HALLMARKING_OUT | HALLMARKING_IN | REPAIR_OUT | REPAIR_IN | SCRAP | MELTING)
- `fromStatus`, `toStatus`, `fromLocationId`, `toLocationId`
- `weightDelta` (signed, grams) — for batch items; null/0 for unit items (whole-item movement)
- `quantityDelta` (signed) — for batch items
- `createdAt` (immutable, no `updatedAt`)
- Indexes: `{ inventoryItemId: 1, createdAt: 1 }`, `{ transactionId: 1 }`

### `locations`
Stores, warehouses, counters, job-worker "virtual locations".
- `name`, `type` (STORE | WAREHOUSE | COUNTER | JOB_WORKER | IN_TRANSIT_VIRTUAL), `address`, `isActive`

### `transactions`
The business event that produced one or more ledger entries. See architecture.md §4.
- `type` (mirrors `movementType` categories at a coarser grain, e.g. SALE, PURCHASE, TRANSFER, JOB_WORK, MANUFACTURING, ADJUSTMENT)
- `channel` (ERP | B2C | B2B)
- `refDocType`/`refDocId` (polymorphic ref to `orders`, `invoices`, `productionOrders`, `jobWorkOrders`, `supplierPurchaseOrders`, etc.)
- `performedBy` (ref `users`)
- `notes`
- `createdAt` (immutable)

## 3. Pricing

### `metalRates`
- `metalType`, `purity`, `ratePerGram` (paise), `effectiveFrom`, `source` (manual entry / feed)
- Indexed by `{ metalType, purity, effectiveFrom: -1 }` — "current rate" = latest `effectiveFrom <= now`

### `pricingRules`
- `type` (MAKING_CHARGE | WASTAGE | STONE_VALUATION | DISCOUNT | TAX_OVERRIDE | MARGIN)
- `scope` (GLOBAL | CATEGORY | PRODUCT | CUSTOMER_GROUP | CUSTOMER)
- `scopeRefId` (nullable — id of the category/product/customerGroup/customer this rule targets)
- `calculation` (PERCENTAGE | FLAT | PER_GRAM | TIERED — with tier config)
- `value`, `priority` (higher wins on conflict), `effectiveFrom`, `effectiveTo` (nullable = open-ended)
- `channel` (B2C | B2B | BOTH)

### `priceSnapshots`
Immutable once created. Embedded on `orderLines`/`invoiceLines` (denormalized copy) and also kept standalone for audit/reporting.
- `metalRateUsed` (value + which `metalRates` doc), `purity`, `netWeightUsed`, `metalValue`
- `makingCharge`, `wastageValue`, `stoneValue`, `subtotal`
- `discountApplied` { amount, ruleId, approvedBy? }
- `taxBreakdown` { cgst, sgst, igst, hsn }
- `total`
- `ruleTrace[]` — which `pricingRules` were applied, in what order (debuggability/audit)
- `snapshotAt`, `transactionId`

### `customerPriceLists`
B2B negotiated pricing, resolved as `pricingRules` scoped to `CUSTOMER`/`CUSTOMER_GROUP` — this collection is a convenience view for ERP staff to manage a customer's list in bulk; it materializes into `pricingRules` rows rather than being a second pricing source read at checkout.

## 4. Customers

### `customers`
Unified B2C/B2B with discriminator.
- `type` (B2C | B2B), `name`, `email`, `phone`, `gstin` (B2B), `billingAddress`, `shippingAddresses[]`
- `customerGroupId` (ref `customerGroups`, mainly B2B)
- `channelUserId` (ref `users`, for portal login)

### `customerGroups`
- `name`, `type` (B2B tiering, e.g. "Retailer", "Distributor"), default pricing-rule scope target

### `creditAccounts` (B2B only)
- `customerId`, `creditLimit` (paise), `paymentTermsDays`, `outstanding` (derived/cached, reconciled from invoices+payments), `overdueAmount` (derived), `approvalThreshold` (paise — orders above this need approval regardless of remaining credit)

## 5. Orders

### `orders`
- `orderNumber` (unique), `channel` (B2C | B2B), `customerId`
- `status` (DRAFT | PENDING_PAYMENT | CONFIRMED | RESERVATION_FAILED | FULFILLED | CANCELLED)
- `purchaseOrderId` (ref `purchaseOrders`, B2B only, nullable)
- `lines[]` (embedded `orderLines`): `{ inventoryItemId, productId, priceSnapshot, quantity }`
- `paymentMode` (ONLINE | OFFLINE | CREDIT)
- `approval` { required: bool, approvedBy, approvedAt } — for B2B credit-threshold cases
- `shippingAddress`, timestamps

### `carts` (B2C)
- `customerId`/`sessionId`, `lines[]`, `expiresAt` (TTL index — abandoned cart cleanup, does not affect ledger since nothing is reserved until checkout)

### `purchaseOrders` (customer-issued, B2B)
- `poNumber`, `customerId`, `lines[]` (requested items/qty), `status`, `attachedDocument` (S3 ref, since these are often PDF/scanned POs from the retailer)

## 6. Procurement (business as buyer)

### `suppliers`
- `name`, `gstin`, `contact`, `paymentTerms`

### `supplierPurchaseOrders`
- Distinct from customer `purchaseOrders` — this is the business buying raw material/finished goods from a supplier.
- `poNumber`, `supplierId`, `lines[]` (expected item/weight/rate), `status`

### `goodsReceipts`
- `supplierPurchaseOrderId`, `receivedLines[]` (actual weight/qty/item received — creates `inventoryItems` + `PURCHASE`/`GOODS_RECEIPT` ledger entries), `discrepancyNotes`

## 7. Manufacturing & job work

### `productionOrders`
- `orderNumber`, `productId` (target design), `plannedQuantity`, `status`
- `materialIssues[]` (ref `transactions` of type MANUFACTURING_ISSUE)
- `materialReceipts[]` (ref `transactions` of type MANUFACTURING_RECEIPT — finished `inventoryItems` created)
- `wastageRecorded`, `processLossRecorded`
- `qualityCheck` { status, checkedBy, notes }

### `jobWorkOrders`
- `jobWorkerId` (ref `locations` type JOB_WORKER, or a dedicated `jobWorkers` collection if they need more profile fields than a location)
- `issuedLines[]` (material issued — weight/qty per item)
- `returnedLines[]` (material returned as-is)
- `finishedLines[]` (finished jewellery received — new `inventoryItems`)
- `wastageRecorded`, `lossRecorded`, `reconciliationStatus` (BALANCED | DISCREPANCY_PENDING_REVIEW | CLOSED)
- `reconciliationNotes`, `closedBy`, `closedAt`

## 8. Invoicing

### `invoices`
- `invoiceNumber` (unique, sequential per compliance requirements), `orderId`, `customerId`, `channel`
- `lines[]` (embedded `invoiceLines`, each carrying its own `priceSnapshot` — copied from the order line at invoice time, not re-fetched)
- `taxBreakdown` (aggregate), `total`
- `status` (ISSUED | PARTIALLY_PAID | PAID | OVERDUE | CANCELLED — `OVERDUE` is a derived display status, not authoritative)
- `dueDate` (computed from customer payment terms at issue time, then fixed)

### `payments`
- `customerId`, `amount`, `mode` (ONLINE | CASH | CHEQUE | BANK_TRANSFER), `reference`, `receivedAt`

### `paymentAllocations`
- `paymentId`, `invoiceId`, `amountAllocated` — supports one payment covering multiple invoices or partial payment of one invoice; `invoice.outstanding` is derived by summing allocations against it, never stored as a directly-editable field.

## 9. Compliance

### `taxRules`
- `hsnCode`, `gstRate`, `cgstRate`, `sgstRate`, `igstRate`, `effectiveFrom`, `effectiveTo`
- Resolution logic (in `pricing-engine`/`compliance` module, not hardcoded per-call): intra-state → CGST+SGST, inter-state → IGST, selected by comparing buyer/seller state at resolution time against the rule effective on the transaction date.

### `hallmarkingRecords`
- `inventoryItemId`, `huid`, `hallmarkingCenter`, `certifiedAt`, `certificateDocument` (S3 ref)

## 10. Auth & audit

### `users`
- `email`/`phone`, `passwordHash`, `userType` (STAFF | B2B_BUYER | B2C_CUSTOMER), `roleIds[]`, `customerId` (nullable — links B2B/B2C users to their `customers` record)

### `roles`, `permissions`
- Standard RBAC. Roles reference a set of permission keys; checked at the API route/service layer.

### `auditLogs`
- `entityType`, `entityId`, `action`, `performedBy`, `before`, `after`, `at` — general-purpose audit trail for anything not already covered by `transactions` (e.g. edits to `products`, `pricingRules`, `users`).

## 11. Relationships at a glance

```
Product ──< InventoryItem >── Location
              │  ▲
              │  └── InventoryLedger >── Transaction ──< PriceSnapshot
              │                              │
OrderLine ────┴── (embeds) PriceSnapshot     ├── Order ── Customer ── CreditAccount
InvoiceLine ──── (embeds) PriceSnapshot      ├── SupplierPurchaseOrder ── GoodsReceipt
                                              ├── ProductionOrder
                                              └── JobWorkOrder
```

## 12. Notes on immutability & indexing

- Collections that are append-only / immutable once written: `inventoryLedger`, `transactions`, `priceSnapshots` (as embedded copies on order/invoice lines), `auditLogs`. Application code should never expose an update path for these beyond corrective new entries.
- `Decimal128` for all weight and money fields; money stored as integer paise via `Decimal128`/`Number` (paise avoids the need for decimals at all — prefer plain integer `Number` for money, `Decimal128` for weights where gram-level fractional precision matters).
- Every collection with a customer- or channel-facing query path needs a compound index reflecting that query (e.g. `orders: { customerId: 1, createdAt: -1 }`, `inventoryItems: { status: 1, productId: 1 }`) — to be finalized per-query at implementation time, not guessed upfront.
