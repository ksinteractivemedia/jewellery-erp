# Data Model

Status: **Phase 1 implemented** for the sections marked so below (see [progress.md](./progress.md)) — those reflect the actual Mongoose schemas in `apps/api/src/modules/*`, not a proposal. Sections marked "proposed" are still just a sketch, written at Phase 0 and not yet built. Cross-reference: [architecture.md](./architecture.md) §4 for the catalogue/physical-item/event distinction this model is built around, and [business-rules.md](./business-rules.md) for the rules these schemas exist to enforce.

Naming convention: MongoDB collections in `camelCase`, plural. `_id` is an ObjectId; every model's `toJSON`/`toObject` transform (`apps/api/src/shared/mongoose.helpers.ts`) renames it to `id` (string) and drops `__v`, so the wire shape always matches the plain interfaces in `packages/types`.

**Revised decision on numeric types (supersedes Phase 0's Decimal128 proposal):** both money and weights are stored as plain `Number`, not `Decimal128`. Money is integer paise (no fractional unit, so no float risk at all). Weights are grams to 3 decimal places — `Decimal128` was the original proposal to guard against float drift, but at jewellery-shop scale (values well under 10⁶, 3 decimal places, no chained summation of millions of rows) a plain JS double has no meaningful drift risk, while `Decimal128` forces every arithmetic site through string/`Decimal128` conversions with no native operators. `weight-calculations.ts` rounds to 3 decimals at every derivation point specifically so this stays true in practice. If a future phase proves this wrong (e.g. bulk gold-bar reconciliation at higher precision), revisit then — see architecture.md §9 risk #9 on not over-building for problems that haven't appeared yet.

## 1. Organization — **implemented**

### `companies`
The legal business entity. Almost always one document.
- `name`, `legalName`, `gstin` (unique, sparse), `pan`, `address` (embedded), `contactEmail`, `contactPhone`, `isActive`
- Repository: `apps/api/src/modules/organization/company.repository.ts`

### `branches`
A showroom/office under a `Company`. GSTIN is per-branch (Indian GST registration is state-wise), not inherited from the company.
- `companyId` (ref `companies`), `name`, `code`, `gstin`, `address`, `contactPhone`, `isActive`
- Index: `{ companyId: 1, code: 1 }` unique — a branch code only needs to be unique within its own company (verified by `uniqueness.test.ts`).

### `locations`
A stock-keeping point within a `Branch` — refines Phase 0's sketch by scoping locations to a branch rather than floating free.
- `branchId` (ref `branches`), `name`, `code`, `type` (`STORE | WAREHOUSE | COUNTER | VAULT | MANUFACTURING_UNIT | JOB_WORKER | HALLMARKING_CENTER | REPAIR_CENTER`; `IN_TRANSIT_VIRTUAL` is kept in the enum but unused — transit is a status with a destination, see §6). **Stock locations** (`STORE`, `WAREHOUSE`, `COUNTER`, `VAULT`) hold our stock; the others are *partners* holding it on our behalf, and each partner movement is bound to its own kind of partner location, `isActive`
- Index: `{ branchId: 1, code: 1 }` unique.

## 2. Auth — **implemented**

### `permissions`
- `key` (unique, `module.action`, e.g. `inventory.approve_adjustment` — dot format; Phase 1's `module:action` was replaced), `module`, `action`, `description`. Canonical list: `PERMISSIONS` in `packages/types/src/rbac.ts` (32 keys), synced by `syncRbac()`.

### `roles`
- `name` (unique), `description`, `permissionIds[]` (ref `permissions`), `isSystem`, `isActive`. The 13 system roles (`SUPER_ADMIN … VIEWER`) are overwritten from `role-matrix.ts` at boot; custom roles (`isSystem: false`) are created via API and never touched by sync. An inactive role contributes no permissions.

### `users`
- `email` (unique, sparse), `phone` (unique, sparse), `name`, `passwordHash`, `userType`, `roleIds[]`, `customerId`, `branchId`, `isActive`, `lastLoginAt`
- Auth state (never in the `User` DTO): `failedLoginAttempts`, `lockedUntil`, `passwordChangedAt`.

### `sessions`
One row per login ("token family") — also the revocation list, read on every request.
- `userId`, `refreshTokenHash` (SHA-256 of the secret; the token itself is never stored), `previousRefreshTokenHash` (the token just rotated away from — presenting it = reuse), `lastUsedAt`, `idleExpiresAt`, `absoluteExpiresAt`, `revokedAt`, `revokedReason` (`LOGOUT | LOGOUT_ALL | PASSWORD_CHANGED | PASSWORD_RESET | REUSE_DETECTED | EXPIRED | USER_DEACTIVATED | ADMIN_REVOKED`), `ip`, `userAgent`, `purgeAt`
- Indexes: `{ userId: 1 }`; TTL on `purgeAt` (absolute expiry + 30 days).

### `passwordResetTokens`
- `userId`, `tokenHash` (SHA-256 of the secret), `expiresAt` (30 min), `usedAt`, `ip`. Single-use; a new request marks older unused tokens used. TTL index purges a day after expiry.

### `auditLogs` — **append-only**
- `action` (`auth.login`, `authz.denied`, `user.roles_changed`, … — see `AUDIT_ACTIONS`), `outcome` (`SUCCESS | FAILURE | DENIED`), `actorId`, `actorEmail`, `targetType`, `targetId`, `metadata` (credential-scrubbed, ≤4 KB), `ip`, `userAgent`, `requestId`, `createdAt` (no `updatedAt`)
- Indexes: `{ createdAt: -1 }`, `{ actorId, createdAt }`, `{ action, createdAt }`, `{ targetType, targetId, createdAt }`. Uses `appendOnlyPlugin` like `inventoryLedger`.
- Supersedes Phase 0's `auditLogs` sketch (`before`/`after` snapshots): role/permission changes record `previousRoleIds`/`newRoleIds` (or `before`/`after` key lists) in `metadata` instead. Domain-level before/after snapshots for product/pricing edits remain a later addition.

## 3. Customers & Suppliers — **implemented**

### `customerGroups`
- `name` (unique), `description`, `isActive`

### `customers`
Unified B2C/B2B, per architecture.md §4's pattern of one model with a discriminator.
- `type` (`B2C | B2B`), `name`, `email`, `phone`, `gstin`, `customerGroupId`, `billingAddress`, `shippingAddresses[]`, `channelUserId` (ref `users`), `isActive`
- Indexes: `{ type: 1, email: 1 }` and `{ type: 1, phone: 1 }`, both unique with a partial filter (`$type: "string"`) — a customer's contact details aren't required, but when present can't collide with another customer of the same channel type.

### `suppliers`
- `name`, `gstin` (unique, sparse), `contactName`, `contactEmail`, `contactPhone`, `address`, `paymentTermsDays`, `isActive`

## 4. Catalog — **implemented**

### `productCategories`
- `name`, `slug` (unique), `description`, `parentId` (self-ref, tree), `isActive`
- A category is the product's single *structural* home. Moving one can't create a cycle (walked up the parent chain in `taxonomy.service`); it can't be deleted while it has children or products.

### `productCollections` — new (Product Master)
- `name`, `slug` (unique), `description`, `isActive`
- A curated, marketing-facing grouping ("Bridal Edit"). A product belongs to **many**; membership lives on the product (`collectionIds[]`), not on the collection. Deleting a collection just `$pull`s it from its products.

### `products` — the catalogue/design definition (never a physical piece)
- Identity: `sku` (unique, uppercase, **immutable after create**, one namespace shared with variant SKUs), `name`, `slug` (unique; derived from the name on create — `-2`, `-3`… suffix on a derived clash, `409` on an explicit clash)
- Classification: `categoryId`, `collectionIds[]`, `metalId` (ref `metals`), `purity` (must be one of that metal's active `purityOptions` — re-checked when either changes), `tags[]` (trimmed, lowercased, de-duplicated, ≤ 20)
- Design guidance only: `defaultGrossWeight`, `defaultNetWeight` (net ≤ gross), `stoneDetails[]`. The real weights live on each `InventoryItem`.
- Content: `description`, `images[]` = `{ key, alt? }` (ordered, first = primary, ≤ 12; `key` is an opaque storage key, **never a URL** — the API resolves URLs per environment), `videos[]` (external `https` links, ≤ 5; linked, not uploaded)
- Availability: `isActive` (is the design offered at all), `b2cEnabled`, `b2bEnabled` (default **off** — a new design is not published to a channel by accident)
- Audit: `createdBy`, `updatedBy`
- **Removed from Phase 1:** `status` (`DRAFT|ACTIVE|DISCONTINUED`), `channelVisibility`, `hasVariants` and `defaultPurity`. `status` collided with `InventoryItem.status` (the state of a *physical piece*) — the exact confusion this model exists to prevent; `channelVisibility` is now the two explicit flags; `hasVariants` is derivable (`variants.length`); `defaultPurity` is just `purity`.
- Indexes: `{categoryId,isActive}`, `{collectionIds}`, `{metalId}`, `{tags}`, `{updatedAt:-1}`, unique `sku`/`slug`.
- A `Product` has **no quantity and no piece-level status**. Stock is `InventoryItem`, changed only through `InventoryLedger`. The Product Master module never writes either (asserted by a test).
- Hard delete is only allowed while no `InventoryItem` references the product (its variants go with it); after that the definition is history — deactivate instead.
- Dropped Phase 0's `pricingRuleTags[]` — `PricingRule` references `metalId`/`categoryId` directly (see §7).

### `productVariants` — new since Phase 0
A sellable variation of a `Product` (ring size, bangle size) with its own SKU. Inherits the product's imagery and metal.
- `productId` (ref `products`), `sku` (unique, immutable, same namespace as product SKUs), `attributes` (`Map<string,string>`, ≤ 10, e.g. `{ size: "14" }`), `defaultGrossWeight`, `defaultNetWeight`, `isActive`
- **Removed:** `images[]` (variants use the product's). Can't be deleted while an `InventoryItem` references it.

### Media (not a collection)
Image bytes are stored outside MongoDB behind the `MediaStorage` port (`apps/api/src/modules/media`): local disk in dev, an S3-compatible adapter in production. Keys are server-generated (`products/<uuid>.<png|jpg|webp>`); the type is decided from the file's leading bytes, never the client's filename or Content-Type.

## 5. Metals & Stones — **implemented**

### `metals`
Reference data — `GOLD`/`SILVER`/`PLATINUM`/... are data, never a hardcoded enum, so a new metal or purity standard is a data change, not a code change.
- `code` (unique), `name`, `symbol`, `purityOptions[]` (embedded: `{ code, fineness, label, isActive }` — e.g. `{ code: "22K", fineness: 0.916 }`), `isActive`
- `resolveFineness(metalId, purityCode)` (`metal.repository.ts`) is the one lookup `weight-calculations.ts` needs; it throws rather than defaulting if the purity isn't a recognized, active option for that metal.

### `metalRates`
Historical, append-only (business-rules.md §1.3's sibling rule — a wrong rate is corrected with a new document, never an edit).
- `metalId`, `purity` (the purity this rate is quoted for), `ratePerGram` (paise), `effectiveFrom`, `source` (`MANUAL | FEED`), `createdBy`
- Index: `{ metalId: 1, purity: 1, effectiveFrom: -1 }` — "current rate" = the latest row with `effectiveFrom <= now`.
- Enforced immutable at the Mongoose layer by the same `appendOnlyPlugin` as the ledger (§6) — verified in `append-only.plugin.test.ts`.

### `stones`
Master data for a stone type.
- `name` (unique), `category` (`PRECIOUS | SEMI_PRECIOUS | ORGANIC`), `defaultUnit` (`CARAT | GRAM | PIECE`), `isActive`

### `stoneInventory` — new since Phase 0
A lot of loose stones held as raw material, before being set into a piece. Deliberately a separate collection from `inventoryItems`, not a sub-case of it — carat/clarity/color/certificate attributes don't overlap with a metal piece's gross/net/fine weight and HUID.
- `stoneId`, `itemCode` (unique), `shape`, `size`, `caratWeight`, `clarity`, `color`, `certificateNumber`, `certificateAuthority`, `cost` (paise), `quantity`, `unit`, `locationId`, `status` (`AVAILABLE | RESERVED | ISSUED_TO_MANUFACTURING | SOLD | RETURNED | DAMAGED`)
- **Known simplification:** status/location changes go through a guarded `findOneAndUpdate` (`changeStoneInventoryStatus`), not the full `InventoryLedger`/`Transaction` machinery in §6 — loose stones don't yet get the same append-only audit trail as metal pieces. Candidate for unification in a later phase if the business needs the same rigor here; tracked so it isn't mistaken for an oversight.

## 6. Inventory — **implemented** (Phase 1.7 rebuilt the ledger contract; see progress.md)

### `inventoryItems`
One document per physical piece (`UNIT`) or one fungible batch (`BATCH` — raw material, before allocation). Never just a quantity (architecture.md §4, business-rules.md §2.2). **Not a Product**: a `Product` is the catalogue design; this is the piece that was made from it.
- Identity: `itemCode` (unique; server-allocated `JE-000123` when not supplied), `barcode` (unique, sparse), `serialNumber` (unique, sparse), `huid` (unique, sparse, **6 alphanumerics, stored uppercase, set once and never changed**) — four distinct identifiers, not aliases of each other. The SKU is the product's/variant's (`productId`/`variantId`, both optional — raw material has neither).
- `type` (`FINISHED_JEWELLERY | RAW_MATERIAL | SEMI_FINISHED | LOOSE_STONE`), `serialization` (`UNIT | BATCH`)
- `grossWeight`, `stoneWeight`, `netWeight`, `fineWeight` — **net and fine are always derived, never accepted as input**: `netWeight = grossWeight − stoneWeight`, `fineWeight = netWeight × fineness` (`weight-calculations.ts`). Input must be a scale weight: finite, > 0, ≤ 3 decimals; stone < gross for any metal piece (a piece with zero net metal is not a metal piece).
- `metalId`, `purity`, `fineness` — fineness is a **snapshot** from `Metal.purityOptions` at creation, so a later purity-table correction never rewrites a past item.
- `hallmarkStatus` (`NOT_APPLICABLE | PENDING | HALLMARKED`; a HUID implies HALLMARKED), `stoneDetails[]`
- `locationId`, `status` (12 values), `cost` (paise, never customer-facing), `quantity` (1 for `UNIT`)
- `reservation` (optional): `{ referenceType, referenceId, reservedAt, reservedBy, expiresAt? }` — *who holds it and for which order*. Set only by a `RESERVATION` entry; cleared only by `RELEASE_RESERVATION` or `SALE`. This is `reservedForOrder`; **`availableForSale` is derived** (`AVAILABLE`, finished, un-held, quantity > 0 — `isAvailableForSale`, one definition), not stored.
- `ledgerSeq`: number of ledger entries posted for this item. **Every movement compare-and-sets it** (`findOneAndUpdate({ _id, ledgerSeq: n }, { …, $inc: { ledgerSeq: 1 } })`) and stamps the new value on its ledger entry — so two writers racing on one item cannot both win.
- `manufacturingInfo` (optional)
- Indexes: `{ status, locationId }`, `{ locationId, status, metalId }`, `{ productId }`, `{ metalId, purity }`, `{ updatedAt: -1 }`, sparse `{ reservation.expiresAt }`, plus the unique identifier indexes.
- **status / locationId / weights / quantity / reservation are derived caches — nothing outside `inventory-transaction.service.ts` writes them after creation.** A silent edit is *detectable*: `reconcileItem` replays the ledger and reports any item whose cache disagrees (tested).

### `transactions`
The business event behind one or more ledger entries. Append-only.
- `type` (a `MovementType`), `channel`, `referenceType` (`ORDER | INVOICE | CUSTOMER_PURCHASE_ORDER | SUPPLIER_PURCHASE_ORDER | GOODS_RECEIPT | PRODUCTION_ORDER | JOB_WORK_ORDER | STOCK_TRANSFER | ADJUSTMENT | MANUAL`), `referenceId`, `performedBy` (ref `users`; `000000000000000000000000` = the system, e.g. the reservation-expiry sweep), `reason`
- Indexes: `{ referenceType, referenceId }`, `{ performedBy, createdAt: -1 }`

### `inventoryLedger`
Append-only. One line per item per transaction.
- **`movementType` (18):** `PURCHASE_RECEIPT, SALE, RETURN, TRANSFER_OUT, TRANSFER_IN, RESERVATION, RELEASE_RESERVATION, MANUFACTURING_ISSUE, MANUFACTURING_RECEIPT, JOBWORK_ISSUE, JOBWORK_RECEIPT, REPAIR_OUT, REPAIR_IN, HALLMARKING_OUT, HALLMARKING_IN, ADJUSTMENT, SCRAP` + `MELTING` (a status with no other route in). Replaces Phase 1's `PURCHASE / GOODS_RECEIPT / TRANSFER / EXCHANGE / JOB_WORK_*`.
- `sequence` — 1, 2, 3… per item, gap-free; **unique with `itemId`** (a hard stop for two writers claiming one slot).
- `quantity`, `grossWeight`, `netWeight`, `fineWeight` — **signed deltas, consistently** (Phase 1 mixed absolute and delta semantics for `UNIT` items; that ambiguity is gone). A unit's status/location move has `0`; a receipt is `+`; a re-weigh is the difference.
- **`balanceAfter`** `{ quantity, grossWeight, stoneWeight, netWeight, fineWeight }` — the item's totals right after the entry, so any past state is *read*, not recomputed.
- `fromStatus` (absent only on a first entry), `toStatus`, `sourceLocationId`, **`destinationLocationId` (always set = where the item is after this entry)**, so an item's location at any moment is its latest entry's destination. During a transfer the destination is the *receiving* location and the status `IN_TRANSIT` ("on its way to B").
- Indexes: unique `{ itemId, sequence }`, `{ createdAt: -1 }`, `{ movementType, createdAt: -1 }`, `{ destinationLocationId, createdAt: -1 }`, `{ sourceLocationId, createdAt: -1 }`, `{ transactionId }`

Who/why/what-for (`performedBy`, `reason`, `referenceType/Id`, `channel`) stay on `Transaction`, one join away — a multi-piece event is one Transaction with many lines. Enforcement of immutability is `appendOnlyPlugin` (unchanged; see business-rules.md §2.1a).

**The movement rules table** (`movement-rules.ts`) says which (from → to) pairs each named movement may perform, which destination *kinds* it accepts, and which may create stock; it is checked in addition to the physical status graph (`status-transitions.ts`), and a test asserts no rule permits what the graph forbids.

**The only write path:** `postInSession` / `postInventoryTransaction` (moves), `receiveNewInventoryItem` (creates + entry #1). Every operation — reserve, release, sell, return, partner moves, transfers, adjustments — runs inside `withInventoryTransaction` (one MongoDB session, retried on transient conflicts), so the Transaction, every ledger entry, the item update and any related document (transfer, adjustment) commit together or not at all.

### `stockTransfers` — new
A movement between two **stock locations**, in two ledger steps (`TRANSFER_OUT` at dispatch, `TRANSFER_IN` at receipt).
- `transferNo` (unique `TRF-000123`), `fromLocationId`, `toLocationId`, `status` (`IN_TRANSIT | RECEIVED | CANCELLED`), `lines[]` `{ itemId, itemCode, state: PENDING | RECEIVED | RETURNED, resolvedAt }`, `notes`, `dispatchedBy/At`, `closedBy/At`
- Receipt may be partial; cancel returns every pending line to the source (`TRANSFER_IN` at the origin). The transfer closes when nothing is pending: `RECEIVED` if any piece was received, else `CANCELLED`.

### `stockAdjustments` — new
A *request* to correct an item (found damaged, re-weighed, written off), applied only when someone else approves.
- `adjustmentNo` (unique `ADJ-000123`), `itemId`, `itemCode`, `status` (`PENDING | APPROVED | REJECTED`), `reason` (required), `expectedLedgerSeq` (the item as it was when requested), the requested change (`toStatus` | `grossWeight`/`stoneWeight` for units | `quantityDelta`/`weightDelta` for batches), `requestedBy`, `decidedBy/At`, `decisionNote`, `transactionId` (the ledger event that applied it)
- Approval by the requester is refused; approval when the item has moved since (`ledgerSeq ≠ expectedLedgerSeq`) is refused; approval posts `ADJUSTMENT` (or `SCRAP` / `MELTING` for those targets) and closes the request in one transaction.

### `counters` — new (internal)
`{ _id: key, seq }` — atomic allocation of `JE-`, `TRF-`, `ADJ-` numbers. Called outside business transactions on purpose (no contention; a rolled-back operation leaves a gap in a *reference number*, never in the ledger).

## 7. Pricing — **implemented** (rules & lists only — the pricing engine itself is Phase 2)

### `pricingRules`
Redesigned from Phase 0's generic `scope`/`scopeRefId` sketch into the explicit typed fields this phase asked for — more concrete, better type safety, and every scoping dimension is independently optional (narrower scope + higher `priority` wins; see `pricing-rule.validation.ts`).
- `name`, `customerType`, `customerGroupId`, `priceListId`, `metalId`, `purity`, `categoryId`, `channel` (`ERP | B2C | B2B | BOTH`)
- `makingChargeType`/`makingChargeValue` (`PERCENTAGE | FLAT | PER_GRAM`), `wastageType`/`wastageValue` (`PERCENTAGE | PER_GRAM`), `discount` (`{ type: PERCENTAGE | FLAT, value }`) — a rule must set at least one of these three (enforced by a Zod `.refine`, tested in `pricing-rule.validation.test.ts`)
- `priority` (higher wins), `validFrom`, `validTo` (open-ended if unset), `isActive`
- **Resolution contract** (`resolveApplicableRule` in `pricing-rule.validation.ts`, for Phase 2's pricing engine to call): filter to rules effective as of the transaction date, pick highest `priority`, break ties by specificity (more scoping fields set wins), then by most recent `validFrom`.
- **Update contract:** a partial update's cross-field business rules (at least one calculation dimension, percentage bounds, date ordering) are re-validated against the *merged* document, not just the patch — `assertValidMergedPricingRule` — so a patch that looks fine in isolation can't leave the persisted rule invalid.

### `priceLists`
Versionable, effective-dated (this phase's explicit requirement).
- `code` (stable across versions), `name`, `version`, `customerGroupId`, `customerId`, `channel`, `effectiveFrom`, `effectiveTo`, `isActive`
- Index: `{ code: 1, version: 1 }` unique.
- **Versioning contract:** editing a live price list never mutates it. `createNewVersion(code, effectiveFrom)` atomically closes the current version (`effectiveTo = new effectiveFrom`) and inserts `version + 1` in one session. `findCurrentPriceList(code, asOf)` is the one read path anything should use to resolve "the price list in effect right now."

## 8. Not yet implemented (still Phase 0 proposals)

Orders (`orders`, `carts`, `purchaseOrders`), Procurement (`supplierPurchaseOrders`, `goodsReceipts`), Manufacturing & job work (`productionOrders`, `jobWorkOrders`), Invoicing (`invoices`, `payments`, `paymentAllocations`), Compliance (`taxRules`, `hallmarkingRecords`), `priceSnapshots`, `creditAccounts` are all still exactly as sketched in the original Phase 0 draft of this document — see [progress.md](./progress.md) for which phase builds each one. None of this phase's new collections change those sketches; `PriceSnapshot` in particular still works exactly as originally described once Phase 2 builds it (immutable, embedded on order/invoice lines, referencing the `PricingRule`s that produced it).

## 9. Relationships at a glance (updated for Product Master)

```
Company ── Branch ── Location
                         │
Metal ── MetalRate       │
  │                      │
  └── Product ── ProductVariant        (catalogue definitions)
       │  ╲                │
       │   ProductCategory (1) · ProductCollection (many)
         │                │
         └──────┬─────────┘
                │
         InventoryItem ── Location
              │  ▲
              │  └── InventoryLedger >── Transaction
              │
Stone ── StoneInventory ── Location

CustomerGroup ── Customer ── User (channelUserId)
Role ── Permission
User ── Role, Branch

PricingRule ── Metal, ProductCategory, CustomerGroup, PriceList
PriceList (versioned by code) ── CustomerGroup, Customer
```

## 10. Notes on immutability & indexing (updated)

- Append-only (enforced at the Mongoose layer, not just by convention): `inventoryLedger`, `transactions`, `metalRates`, `auditLogs`. `priceSnapshots` (Phase 2) will use the same `appendOnlyPlugin`.
- Money: integer paise, plain `Number`. Weights: grams to 3 decimals, plain `Number`, rounded at every derivation point — see the revised decision at the top of this document.
- Every `*Id` reference field is stored as a Mongoose `ObjectId` and typed as `string` in `packages/types`; `apps/api/src/shared/to-dto.ts`'s `deepStringifyObjectIds` converts between the two at every repository boundary, recursively (including inside embedded arrays), so nothing outside `apps/api` ever sees a raw `ObjectId`.
- Every collection with an obvious hot query path has a compound index reflecting it (see each section above) — added when the query pattern was known, not guessed upfront, per architecture.md §9 risk #9.
