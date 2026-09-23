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

## 7. Pricing — **implemented** (rules & lists in Phase 1; the pricing engine and `TaxRule` shape in Phase 2)

### `pricingRules`
Explicit typed scope fields (not a generic `scope`/`scopeRefId`), each independently optional. A rule applies only when **every** scope field it sets matches the calculation.
- **Scope:** `customerId` *(new, Phase 2 — customer-specific pricing)*, `customerGroupId`, `priceListId`, `categoryId`, `customerType`, `metalId`, `purity`, `channel` (`ERP | B2C | B2B | BOTH`). Tier for resolution = the most specific of customer → group → price list → category, else default (business-rules.md §1.4).
- **Making:** `makingChargeType` = `PERCENTAGE | PER_GRAM | FIXED | PER_PIECE` (was `PERCENTAGE | FLAT | PER_GRAM`), `makingChargeValue` — a percent for `PERCENTAGE`, **integer paise** for the others.
- **Wastage:** `wastageType` = `PERCENTAGE | FIXED_WEIGHT | NONE` (was `PERCENTAGE | PER_GRAM`), `wastageValue` — percent, or grams (≤ 3 decimals) for `FIXED_WEIGHT`, absent for `NONE`.
- **Discount:** `{ type: PERCENTAGE | FLAT, value, appliesTo?: TOTAL | MAKING_CHARGES }` — `FLAT` is integer paise.
- `priority` (higher wins, **inside a tier only**), `validFrom` (inclusive), `validTo` (**exclusive**; open-ended if unset), `isActive`.
- A rule must set at least one of making / wastage / discount (Zod `superRefine`). Types with money values must be whole paise; percentages 0–100 with ≤ 6 decimals.
- **Resolution contract** lives in `packages/pricing-engine` (`resolvePricingRules`) — the old `resolveApplicableRule` in `apps/api` was removed so there is one implementation. See architecture.md §5.
- **Update contract:** a partial update is re-validated against the *merged* document (`assertValidMergedPricingRule`), and, if the rule is active, checked for **ambiguity** against the other active rules (`assertNoAmbiguousPricingRule` → 409). Switching a type without its value ("12,000 paise per gram" → `PERCENTAGE`) is caught by the merged check.
- *Migration note:* no production data existed when the type vocabulary changed (`FLAT → FIXED`, `PER_GRAM` wastage → `FIXED_WEIGHT`); a real deployment would need a one-off rewrite of stored `makingChargeType`/`wastageType`.

### `taxRules` — shape defined in Phase 2, collection in Phase 3 (see below)
`TaxRule` (`packages/types/src/tax-rule.ts`): `hsnCode`, `intraState { cgst, sgst }`, `interState { igst }`, `validFrom`, `validTo` (exclusive), `isActive`. The validation schema rejects a rule whose CGST + SGST ≠ IGST (a data-entry mistake under GST). No Mongoose model or CRUD yet: the engine consumes the shape, and the playground supplies it by hand.

### `taxRules` — **implemented** (Phase 3; the admin UI arrives with Phase 7)
Collection behind the `TaxRule` shape above (`apps/api/src/modules/compliance`): `hsnCode`, intra-state CGST+SGST, inter-state IGST (CGST+SGST must equal IGST), `validFrom` / `validTo` (exclusive), `isActive`. The storefront resolves the rule effective *now* for the configured HSN; none active means designs are `ON_REQUEST` (`PRICING_NOT_CONFIGURED`), never a guessed rate.

### `storefrontContent` — new (Phase 3, one document)
The business's own storefront words and curation: `brandName`, `tagline`, `announcements[]`, `hero`, `story`, `trust[]`, `policies { shipping, returns, care, delivery }`, `featuredCollections[]`, `featuredProducts[]` (slugs), `contact { email, phone }`, `pricing { hsnCode }`. Every editorial field is optional and absent means "not shown". Validated by `storefrontContentSchema`.

### `newsletterSubscriptions` — new (Phase 3)
`email` (unique, lower-cased), `subscribedAt`. Addresses are stored; nothing is sent yet.

### `orders` — **implemented** (Phase 3.5)
`orderNo` (unique `ORD-000123`), `channel` (`B2C`), `status` (12 values), `customer {userId?, fullName, email, phone}`, `shippingAddress`, `delivery {code, label, fee, estimate?}`, `items[]` (`productId`, `variantId?`, `slug`, `sku`, `name`, `quantity`, `priceSnapshotId`, and the frozen `unitPrice`, `lineTotal`, `taxableValue`, `gst`), `totals {taxableValue, gst, deliveryFee, total}`, `supplyType`, `idempotencyKey` (unique), `requestHash`, `holdExpiresAt`, `allocations[] {lineId, itemIds[]}` (the pieces held/sold — mutable fulfilment state), `paymentId` (the attempt that paid), `placedAt`, `paidAt`, `cancelledAt`, `cancelReason`, `statusHistory[]`. **Immutable at the Mongoose layer:** `orderNo`, `customer`, `shippingAddress`, `delivery`, `items`, `totals`, `supplyType`, `idempotencyKey`, `requestHash`, `placedAt`; orders are never deleted. Indexes: `{status, holdExpiresAt}`, `customer.email`, `{customer.userId, placedAt}`.

### `priceSnapshots` — **implemented** (append-only)
`orderId`, `productId`, `variantId?`, `sku`, `computedAt`, `inputs` (metal, purity, fineness, weights, stone value, quoted purity and rate per gram and its effective time, HSN, tax rule id, seller/buyer state, channel, customer type), `breakdown` (the pricing engine's full output for one unit, incl. CGST/SGST/IGST and the rules applied), `unitTotal`.

### `payments` — **implemented**
One per payment attempt: `orderId`, `provider`, `providerRef` (unique with provider), `amount` (= order total), `status` (PENDING · AUTHORIZED · CAPTURED · FAILED · REFUNDED · PARTIALLY_REFUNDED), `capturedAmount`, `capturedAt`, `refundedAmount` (refunds that succeeded), `method`, `failureReason`, `refunds[] {amount, status PENDING|SUCCEEDED|FAILED, reason, idempotencyKey, providerRefundRef}`, `attempt` (unique per order), `idempotencyKey` (unique).

### `paymentEvents` — **implemented**
Every webhook delivery: `provider`, `eventId` (unique together), `type`, `providerRef`, `amount`, `receivedAt`, `processedAt`, `outcome` (APPLIED · IGNORED). The unique key is what makes a redelivered webhook harmless.

### `customers.b2b` — **implemented** (Phase 4)
`contacts[] {name, email?, phone?, designation?, isPrimary}`, `creditLimit` (paise), `paymentTermsDays`, `priceListCode?` (the version in force is resolved at pricing time), `salespersonId?`, `territory?`, `creditHold`, `blockOnOverdue`; plus a top-level, internal `creditSeq` bumped inside the transaction that approves an order (the credit lock). **No stored outstanding or overdue** — derived from invoices and allocations. `products` gain `b2bMinOrderQuantity?` and `b2bPriceOnRequest?`.

### `b2bpurchaseorders`, `b2bquotations`, `b2bsalesorders`, `b2binvoices` — **implemented** (Phase 4)
Each document embeds its lines (`productId`, `variantId?`, `sku`, `name`, `quantity`, `priceOnRequest?`, per-unit and per-line taxable / GST / total in paise, `basis`, `concession?`, `priceSnapshotId?`) and `totals {taxable, gst, total, complete}`. **PO:** `poNo` (`BPO-`), `customerPoRef?`, `status`, `shippingAddress` (copied), `credit` (the check shown at submission), `quotationId?`, `salesOrderId?`, `history[]`. **Quotation:** `quoteNo` (`QT-`), `version` (unique per PO), `validUntil`, `terms?`, `messages[]` (the negotiation thread). **Sales order:** `soNo` (`SO-`), one per PO, `credit {check, override?{reason, at, byId}}`, `allocations[] {lineIndex, itemIds[]}`, `shortfall?`, `invoiceId?`, `history[]`. **Invoice:** `invoiceNo` (`INV-`), one per sales order, `issueDate` / `dueDate` (business days), `taxes {supplyType, cgst, sgst, igst}`, `gstin` snapshot, `allocationSeq`. **Frozen at the Mongoose layer:** quotation, sales-order and invoice commercial fields (lines, totals, parties, numbers, addresses).

### `b2bpayments`, `b2bpaymentallocations` — **implemented** (Phase 4)
**Payment:** `paymentNo` (`PAY-`), `customerId`, `method` (7 offline methods), `amount`, `receivedDate`, `reference?`, `bankName?`, `source` (CUSTOMER | STAFF), `status` (PENDING_VERIFICATION | VERIFIED | REJECTED | REVERSED), `recordedBy*`, `verifiedBy*`, `verifiedAt`, `rejectedReason?`, `allocationSeq`. **Allocation:** `paymentId`, `invoiceId`, `customerId`, `amount`, `createdById`, `reversedAt?`, `reversedReason?` — amounts and parties frozen; only the reversal fields change. An invoice's paid amount is the sum of unreversed allocations. `priceSnapshots` gain `documentType` (ORDER | B2B_QUOTATION | B2B_SALES_ORDER).

### `priceLists`
Versionable, effective-dated (this phase's explicit requirement).
- `code` (stable across versions), `name`, `version`, `customerGroupId`, `customerId`, `channel`, `effectiveFrom`, `effectiveTo`, `isActive`
- Index: `{ code: 1, version: 1 }` unique.
- **Versioning contract:** editing a live price list never mutates it. `createNewVersion(code, effectiveFrom)` atomically closes the current version (`effectiveTo = new effectiveFrom`) and inserts `version + 1` in one session. `findCurrentPriceList(code, asOf)` is the one read path anything should use to resolve "the price list in effect right now."

## 7A. Procurement — **implemented** (Phase 5)

`apps/api/src/modules/procurement`. Like B2B (§7's sibling document, business-rules.md §12), every status change is a named, checked action (`procurement-status.ts`) — nothing writes a status directly.

### `purchaserequisitions`
An internal ask, raised before a supplier is even chosen for some lines.
- `prNo` (`PR-000123`), `status` (`DRAFT | SUBMITTED | APPROVED | REJECTED | CONVERTED | CANCELLED`), `requestedById`/`requestedByName`, `department?`, `reason`, `lines[]` (see below), `totals`, `purchaseOrderId?` (set when converted), `rejectedReason?`, `history[]`.
- Not frozen: a `DRAFT` requisition's lines/reason may be replaced wholesale (`updateDraftRequisition`) up to submission.

### `purchaseorders` (supplier purchase orders — distinct from B2B's own `PurchaseOrder`, the customer's ask to us)
- `poNo` (`SPO-000123`), `status` (`DRAFT | SUBMITTED | APPROVED | PARTIALLY_RECEIVED | RECEIVED | CANCELLED`), `supplierId`/`supplierName`/`supplierGstin` (snapshot), `requisitionId?`, `lines[]`, `totals`, `deliveryLocationId`/`deliveryLocationName`, `billingAddress?`, `expectedDeliveryDate?`, `notes?`, `approvedAt`/`approvedByName`, `rejectedReason?`, `cancelledReason?`, `goodsReceiptIds[]`, `supplierInvoiceIds[]`, `history[]`.
- `PARTIALLY_RECEIVED`/`RECEIVED` are **derived** from the lines' own received-so-far figures (`purchaseOrderStatusFor`), applied through the named `receive` action like B2B's sales-order allocate/invoice — never set directly.
- Cancelling before receipt is clean; cancelling a `PARTIALLY_RECEIVED` order closes out what's left as `CANCELLED` — the goods already received (and their `InventoryItem`s) are untouched, never reversed.

### Purchase line (embedded on a requisition and a purchase order)
`purchaseType` (`GOLD | SILVER | PLATINUM | STONE | FINISHED_JEWELLERY | RAW_MATERIAL | CONSUMABLE`), `description`, `productId?`/`variantId?`, `metalId?`/`purity?`/`fineness?` (required for every type but `CONSUMABLE` — a line always says what metal/purity it is before it's ever received), `quantity`, `grossWeight?` (the ordered total — required and authoritative for a *weight-tracked* type: gold/silver/platinum/raw material/stone), `ratePerGram?`/`ratePerUnit?`, `value` (`fineWeight × ratePerGram`, or `ratePerUnit × quantity` — computed server-side, never accepted as input; deliberately not `packages/pricing-engine`, which resolves a *sales* price through the rule hierarchy, not what we agreed to pay a supplier), `lotNumber?`, `notes?`, `receivedQuantity`/`receivedGrossWeight` (cumulative across every posted receipt).

### `goodsreceipts` — **append-only**
Receiving stock always creates a real `InventoryItem` (or several) and a `PURCHASE_RECEIPT` ledger entry, in the same inventory transaction as the receipt document and the purchase order's updated received-so-far figures and status — business-rules.md §2.1's rule applies here exactly as it does to a sale. A `CONSUMABLE` line is recorded on the receipt but creates no `InventoryItem` (it has no weight/purity/fineness — never forced into a metal-piece shape it doesn't have; a documented simplification, the same kind `StoneInventory` already carries in §5).
- `grnNo` (`GRN-000123`), `purchaseOrderId`/`poNo`, `supplierId`/`supplierName`, `receivedDate`, `lines[]`, `notes?`, `receivedById`/`receivedByName`.
- A line: `purchaseOrderLineIndex`, the purchase-type/description/metal/purity snapshot, `quantity`, `grossWeight?` (the scale reading), `expectedGrossWeight?` (what the delivery note said to expect for *this* shipment — separate from the line's full ordered total, since one line can arrive across several receipts), `fineWeight?` (derived), `value`, `lotNumber?`, `locationId`, `hasWeightDiscrepancy`/`variancePercent?`/`discrepancyNote?`, `inventoryItemIds[]`.
- **Business rules, enforced before anything is written:** receiving beyond what is still outstanding on a line is refused (`OVER_RECEIPT`, 409); receiving at a purity that doesn't match the order is refused (`PURITY_MISMATCH`, 409); a scale reading more than 2% off a *stated* `expectedGrossWeight` is refused unless a `discrepancyNote` explains it, in which case it is posted as weighed and flagged — a genuine partial receipt with no stated expectation is never flagged, since there is nothing to compare it against. Once posted, a goods receipt is never reversed or edited: it is a historical fact about what physically arrived (the same principle as the ledger it feeds). A supplier return, if the business needs one later, is a new movement, not an edit to this one.

### `supplierinvoices`
The supplier's own bill — `supplierInvoiceNo` is their number, not our sequence, and is unique per supplier (the same paper invoice can't be entered twice). `supplierId`/`supplierName`/`supplierGstin`, `purchaseOrderId?`/`poNo?`, `goodsReceiptIds[]`, `invoiceDate`, `dueDate`, `lines[]` (a purchase line minus its receipt-progress fields), `totals` (`subtotal`, `taxAmount`, `total`), `cancelledAt?`/`cancelledReason?`, `history[]`, `allocationSeq` (bumped by every allocation so two racing for one invoice conflict rather than both reading a stale balance — B2B's own `Invoice.allocationSeq` pattern). **`PAID`/`PARTIALLY_PAID`/`UNPAID` are never stored** — derived from unreversed `supplierpaymentallocations` on every read, exactly like B2B's invoices. Frozen at the Mongoose layer except `cancelledAt`/`cancelledReason`/`history`/`allocationSeq`; cancellable only while nothing has been paid against it.

### `supplierpayments`, `supplierpaymentallocations`
Money paid *out*. Simpler than B2B's customer payments (no maker–checker): whoever holds `accounting.create_payment` records it, and the record itself plus the audit log are the control — it is immediately available to allocate, and can be reversed (a stopped cheque, a mis-entry).
- **Payment:** `paymentNo` (`SPY-000123`), `status` (`RECORDED | REVERSED`), `supplierId`/`supplierName`, `method` (7 offline methods, same vocabulary as B2B), `amount`, `paidDate`, `reference?`, `bankName?`, `notes?`, `recordedById`/`recordedByName`, `reversedReason?`/`reversedAt?`, `allocationSeq`.
- **Allocation:** `paymentId`/`paymentNo`, `supplierInvoiceId`/`supplierInvoiceNo`, `supplierId`, `amount`, `createdById`/`createdByName`, `reversedAt?`/`reversedReason?` — amounts and parties frozen; only the reversal fields change. Reversing a payment reverses every unreversed allocation it made in the same transaction, so every invoice it touched is owed again automatically (nothing to recompute).

## 7B. Manufacturing & job work — **implemented** (Phase 6)

`apps/api/src/modules/manufacturing`. The same explicit-action discipline as B2B (§12) and procurement (§14): every status change is a named, checked action (`manufacturing-status.ts`); no stock ever moves except through a real `InventoryLedger` entry (§2.1) — issuing material, receiving a finished piece, and returning unused material are each posted through the ledger, never a direct quantity edit.

### `bom` (embedded on a production order and a job work order, not its own collection)
What the order is meant to consume, fixed at creation: `metalId`, `purity`, `fineness` (snapshot), `expectedGrossWeight`, `expectedWastage`, `stonesRequired[]` (the shared stone-detail shape), `notes?`.

### `productionorders`
Production Order → Material Issue → Manufacturing → QC → Finished Jewellery → Inventory, as explicit statuses: `DRAFT | MATERIAL_ISSUED | IN_PROGRESS | QC_PENDING | QC_PASSED | QC_FAILED | COMPLETED | CANCELLED` (`QC_FAILED` can go back to `IN_PROGRESS` for rework).
- `productionOrderNo` (`MO-000123`), `productId`/`variantId?`/`designName`/`sku` (snapshot), `quantity`, `bom`, `locationId`/`locationName` (must be a `MANUFACTURING_UNIT` location), `issuedItems[]` (each a real `InventoryItem` reference plus its weight *and the location it came from*, so a return knows where to send it back), `issuedGrossWeight`, `actualGrossWeight?`/`actualWastage?`/`labourCost?` (recorded at QC submission), `qc?` (`PASSED`/`FAILED`, notes, who, when), `finishedItems[]`, `returnedItems[]`, `reconciliation?`, `history[]`.
- **Material issue** picks one or more *whole* `AVAILABLE` items (a batch is never split by this module — see the note on `postInSession`'s weight-delta semantics in manufacturing-core.ts; splitting a batch would incorrectly flip the status of the un-issued remainder too, since it's the same document) and posts them as `MANUFACTURING_ISSUE` (`AVAILABLE → IN_MANUFACTURING`, destination a `MANUFACTURING_UNIT`).
- **Completing** a `QC_PASSED` order creates the finished piece(s) — a real `InventoryItem` each (`FINISHED_JEWELLERY`, `manufacturingInfo.productionOrderId` set, `MANUFACTURING_RECEIPT`, `creates: true`) — and, for whichever issued items were never consumed, returns them whole to `AVAILABLE` at the location they were issued *from* (`MANUFACTURING_RECEIPT` again, but on the existing item — its destination must be a real stock location, `STORE`/`WAREHOUSE`/`COUNTER`/`VAULT`, never the manufacturing unit itself).
- **Cancelling** a `MATERIAL_ISSUED`/`IN_PROGRESS`/`QC_FAILED` order returns whatever is still `IN_MANUFACTURING` to stock in the same action — nothing is ever left dangling.

### `jobworkorders`
Issue to a vendor → return (finished goods / unused material / wastage / discrepancy): `DRAFT | ISSUED | PARTIALLY_RETURNED | RETURNED | CANCELLED`.
- `jobWorkOrderNo` (`JW-000123`), `vendorId`/`vendorName` (a `Supplier` — a job worker is a supplier, no separate vendor model), `productId?`/`designName?`, `issueDate`/`dueDate`, `bom`, `makingCharges`, `expectedOutputDescription?`, `locationId`/`locationName` (must be a `JOB_WORKER` location), `deliveryAddress?`, `issuedItems[]`, `issuedGrossWeight`, `finishedItems[]`, `returnedItems[]`, `reconciliation?`, `history[]`.
- **A return is one or more events**, not a single all-at-once step: each may carry finished pieces, unused items returned, and/or a wastage figure, and is marked `final: true` only when nothing more is coming back — the order derives `PARTIALLY_RETURNED` vs `RETURNED` from that flag (not from weight-matching, which would be fragile: a partial return legitimately hasn't accounted for everything yet, and that is not the same thing as a discrepancy).
- The five reconciliation figures accumulate across every return event; **a discrepancy is only checked (and only then must carry a note) on the `final` return** — the one where "everything should now be accounted for" actually means something.

### Material reconciliation (`reconciliation`, embedded on both order types — the shape behind the Reconciliation screen)
`issuedGrossWeight`, `returnedGrossWeight`, `finishedGrossWeight`, `wastageGrossWeight`, `discrepancyGrossWeight` (`issued − returned − finished − wastage`; negative means more came back than went out — never silently clamped to zero), `hasDiscrepancy` (beyond a fixed small tolerance for scale rounding, not a percentage), `discrepancyNote?`. A discrepancy beyond tolerance is refused without a note and flagged once one is given — the same discipline as procurement's goods-receipt weight check (§14.4).

## 7C. Hallmarking — **implemented** (Phase 7)

`apps/api/src/modules/hallmarking`. The same explicit-action discipline as every workflow module above (§7A's `procurement-status.ts`, §7B's `manufacturing-status.ts`): every batch status change is a named, checked action (`hallmarking-status.ts`); every physical movement is a real `InventoryLedger` entry (§2.1), never a direct status/location edit.

### `assayingcentres`
Reference/master data — a new BIS-recognised centre, or one that's closed, is a data change, never a code change (CLAUDE.md's compliance-as-configuration rule, applied here to *where* hallmarking happens rather than *what the tax rate is*).
- `name`, `code` (unique), `bisRegistrationNumber?`, `locationId`/`locationName` (must reference a `HALLMARKING_CENTER`-type location), `address?`, `contactPhone?`/`contactEmail?`, `isActive`.

### `hallmarkingbatches`
Inventory Item → Send to Hallmarking → In Transit → At Hallmarking Centre → Received, as the batch's own shared statuses (`PENDING | IN_TRANSIT | AT_CENTRE | RECEIVED | CANCELLED`) — the whole shipment travels together. Verified/Failed are **per-piece outcomes** once the batch is back, not batch statuses: a shipment of ten pieces can come back with eight verified and two failed at the same time. A line's *effective status* (what every screen and the dashboard show) is its own outcome once it has one, otherwise the batch's shared stage — never stored, always derived (`hallmarking-views.ts`).
- `hallmarkingNo` (`HM-000123`), `status`, `assayingCentreId`/`assayingCentreName` (snapshot), `sentDate?`, `expectedReturnDate?`, `notes?`, `lines[]`, `history[]`.
- A line: `itemId`/`itemCode`, `purity`/`grossWeight` (snapshot at dispatch — a later purity-table correction never rewrites a past request), `fromLocationId` (where the piece lived before it was sent — a return goes back *there*, never into the centre's own location, which isn't a stock location, mirroring §7B's `issuedItems[].fromLocationId`), `huid?`, `certificateNumber?`, `hallmarkDate?`, `outcome?` (`VERIFIED | FAILED`), `failureReason?`.
- **Dispatch** posts every line as `HALLMARKING_OUT` (`AVAILABLE → HALLMARKING`, destination the centre's own location) in one ledger transaction. **Receive** posts `HALLMARKING_IN` (`HALLMARKING → AVAILABLE`, back to each piece's own `fromLocationId`) and, for whichever pieces the centre actually marked, records the HUID/certificate/date; **every piece on the batch must be receipted together** — a receive naming only some of a batch's pieces is refused (409), since nothing else would move the omitted pieces out of `HALLMARKING` and the batch would wrongly read `RECEIVED` regardless. **Cancel** is PENDING-only — nothing has physically moved yet, so there is nothing to reverse.
- **The HUID is unique where applicable** (business-rules.md §16): enforced by the same rule everywhere a HUID is ever set on an `InventoryItem` (`inventory-transaction.service.ts`, shared with the identifiers-edit path elsewhere in inventory) — never re-implemented per module. Stored uppercase, so `ab12cd` and `AB12CD` collide as the same mark.
- A piece can only be `verify`d or `fail`ed once (`checkLineOutcome`): not before the batch is `RECEIVED`, and never a second time once decided.

### `InventoryItem.huid` / `hallmarkStatus` (existing fields, driven by this module)
`hallmarkStatus` moves `NOT_APPLICABLE → PENDING` the moment a piece is first dispatched for hallmarking, and `→ HALLMARKED` the moment a HUID is actually recorded on receipt — a piece that comes back unmarked (rejected, or simply not yet marked) stays `PENDING`, never silently upgraded.

## 7D. Returns, exchange & repair — **implemented** (Phase 8)

`apps/api/src/modules/{returns,exchange,repair}`. The same explicit-action discipline as every workflow module above; every physical movement is a real `InventoryLedger` entry (§2.1), never a status/location edit. Two new `InventoryStatus` values support these: `RETURNED_TO_CUSTOMER` (terminal — a piece handed back at the end of a repair that was never the business's to sell) alongside the existing `RETURNED`/`DAMAGED`/`UNDER_REPAIR`. Three new `MovementType`s: `EXCHANGE_IN` (old jewellery taken in on an exchange — a creation movement, the same shape as `PURCHASE_RECEIPT`), `REPAIR_INTAKE` (a repair piece that wasn't already an `InventoryItem` — created straight into `UNDER_REPAIR`), `REPAIR_RETURN` (hands a repaired piece back to whoever owns it — `UNDER_REPAIR → SOLD` or `UNDER_REPAIR → RETURNED_TO_CUSTOMER`, never back onto sellable `AVAILABLE` stock, which is what distinguishes it from `REPAIR_IN`). `InventoryItem.isCustomerOwned` (new field) marks a piece created by a repair intake that the business never sold and does not own — it can never become `AVAILABLE` and its `cost` is always 0.

### `returns`
One return process, either channel, against the order it was actually sold on.
- `returnNo` (`RET-000123`), `channel` (`B2C | B2B`), `status` (`REQUESTED | APPROVED | REJECTED | RECEIVED | INSPECTED | SETTLED | CANCELLED`), `orderId`/`orderNo` (the `Order` for B2C, the `B2BSalesOrder` for B2B), `customer` (`id?`, `name`, `email?`, `phone?` — resolved from the order, never trusted from the request), `reason` (`DEFECTIVE | WRONG_ITEM | NOT_AS_DESCRIBED | SIZE_ISSUE | CHANGED_MIND | OTHER`), `reasonNote?`, `lines[]`, `rejectedReason?`, `receivedAt?`, `inspectedAt?`, `settlement?`, `refundableTotal` (sum of the lines' `unitPrice`, informational until `SETTLED`), `history[]`.
- A line: `itemId`/`itemCode` (the exact `InventoryItem` sold — never just a SKU), `sku`, `name`, `orderLineRef` (the order's own line id for B2C, the sales order's `lineIndex` as a string for B2B — whichever line this piece was sold on), `huid?`/`grossWeight` (snapshots taken from the item at request time, to check the physical piece against at receipt), `unitPrice` (what the customer paid for this exact piece), `weightDiscrepancyNote?` (set at receipt if the observed weight has moved), `condition?`/`conditionNote?` (set at inspection: `GOOD | DAMAGED | DEFECTIVE`).
- `settlement`: `method` (`REFUND | STORE_CREDIT | ADJUST_INVOICE`), `amount`, `reference?`, `note?`, `recordedAt`, `recordedByName?` — a financial record; no further ledger entry follows it.
- Indexes: `{ orderId, createdAt: -1 }`, `{ "lines.itemId" }`.

### `exchanges`
Old jewellery → assessment → new product → difference, one document per exchange, staff-only.
- `exchangeNo` (`EXC-000123`), `status` (`DRAFT | ASSESSED | COMPLETED | CANCELLED`), `customer` (`id?`, `name`, `phone?`, `email?`), `oldJewellery` (the assessment, below), `newProduct?` (`productId`/`variantId?`/`sku`/`name`/`quantity`/`unitPrice`/`lineTotal` — the new sale itself is a normal `Order`/`B2BSalesOrder`, referenced here only for the paper trail via `orderId?`/`orderNo?`), `oldItemId?` (the `InventoryItem` created once the old piece is actually taken in — unset before `COMPLETED`), `settlement?`, `notes?`, `history[]`.
- `oldJewellery`: `description`, `metalId`/`metalName`, `claimedPurity?` (informational only), `grossWeight`/`stoneWeight`/`netWeight` (derived), `assessedPurity`/`assessedFineness`/`fineWeight` (derived, informational — see business-rules.md §18.2 on why the valuation itself uses net weight directly, the same convention as every other rate in this system), `ratePerGram` (what's credited per gram of net weight *at this purity* — ­quoted for the piece's own assessed purity, not converted from a 24K rate), `deduction`, `valuation` (`= netWeight × ratePerGram − deduction`, floored at zero, computed server-side via `packages/pricing-engine`'s `valueOfMetal`, never accepted as input), `notes?`.
- `settlement`: `difference` (positive = customer owes; negative = business owes; never clamped), `method?`, `reference?`, `note?`, `recordedAt`, `recordedByName?`.
- Index: `{ status, createdAt: -1 }`.

### `repairorders`
Customer → repair intake → inspection → estimate → approval → repair → QC → ready → delivery/pickup.
- `repairNo` (`REP-000123`), `status` (`INTAKE | INSPECTED | ESTIMATED | APPROVED | DECLINED | IN_PROGRESS | QC_PENDING | QC_FAILED | READY | DELIVERED | CANCELLED`), `customer` (`id?`, `name`, `phone`, `email?`), `itemId`/`itemCode`/`itemDescription`, `metalId?`/`purity?`/`huid?` (snapshot from the item, if it already had one), `beforeWeight?`/`afterWeight?` (`grossWeight`/`stoneWeight`/`netWeight`/`at` — the spec's "before weight"/"after weight"), `stoneWork?`, `inspectionNotes?`, `estimate?` (`labourCharge`/`materialsCharge`/`otherCharges`/`total`/`notes?`/`estimatedAt`/`estimatedByName?`), `approval?` (`approved`/`at`/`byName?`/`note?` — the customer's decision, recorded by whoever took the call), `finalCharges?` (defaults to the approved estimate at `recordWork`, may be adjusted there, never after), `qc?` (`result: PASSED|FAILED`/`notes?`/`at`/`byName?`), `dueDate?`, `readyAt?`, `deliveredAt?`, `history[]`.
- Indexes: `{ status, createdAt: -1 }`, `{ itemId }`.

### Relationship to `Order` / `B2BSalesOrder`
A `Return`'s `orderId` is never trusted from the request: `order-context.ts` resolves it from the order/sales-order's own `allocations` (§2.3's "an order holds and sells specific pieces"), which is the one place, for either channel, that already says which exact `InventoryItem` was sold against which line. A customer-facing return request therefore names order *lines* (`lineRefs`), never a raw `InventoryItem` id — the server does the line → item resolution, exactly as it recalculates everything else a customer-facing request touches (business-rules.md §11.1).

## 7E. Accounting — **implemented** (Phase 9)

`apps/api/src/modules/accounting`. The first accounting layer, not a full package: a real double-entry general ledger under the ERP's existing commercial documents, posted by one shared abstraction (`posting.service.ts`'s `postJournal`) rather than re-implemented per channel (business-rules.md §20).

### `chartofaccounts`
- `code` (unique, e.g. `1100`), `name`, `type` (`ASSET | LIABILITY | EQUITY | INCOME | EXPENSE`), `systemRole?` (one of `CASH, BANK, ACCOUNTS_RECEIVABLE, ACCOUNTS_PAYABLE, INVENTORY, SALES, PURCHASES, COST_OF_GOODS_SOLD, GST_PAYABLE, GST_RECEIVABLE, DISCOUNT_GIVEN` — how the posting engine finds an account, never a hardcoded id), `description?`, `isSystem`, `isActive`.
- Index: `{ systemRole: 1, isActive: 1 }` unique, partial on `systemRole` existing and `isActive: true` — at most one active account may hold a role at any moment, so the posting engine's lookup (`requireSystemAccount`) is never ambiguous.
- `syncChartOfAccounts()` upserts the default chart (`DEFAULT_CHART_OF_ACCOUNTS`, code-defined) at every boot — `$setOnInsert` for name/type/description (never overwriting a business's own rename), `$set` only for `systemRole` (so the role → account mapping can't drift by hand edit, the same discipline as `role-matrix.ts`'s system roles).

### `accountingentries` — **append-only**
One balanced journal entry per posting: a header plus its debit/credit lines.
- `journalNo` (`JE-000123`), `date` (business day, IST), `channel` (`B2C | B2B | ERP`), `referenceType` (`SALES_INVOICE | PAYMENT_RECEIVED | PURCHASE_INVOICE | PAYMENT_MADE | CREDIT_NOTE | DEBIT_NOTE | MANUAL`), `referenceId?`, `referenceLabel?` (the commercial document's own number, for display without a join), `narration`, `lines[]` (`accountId`, `accountCode`/`accountName` — a snapshot, so a later account rename never rewrites history — `direction: DEBIT|CREDIT`, `amount`), `totalDebit`, `totalCredit` (always equal — `postJournal` refuses to write anything where they aren't), `performedBy`/`performedByName`.
- Indexes: `{ referenceType, referenceId }`, `{ "lines.accountId", date }`, `{ date }`.
- Enforced immutable at the Mongoose layer by the same `appendOnlyPlugin` as `InventoryLedger`/`Transaction`. A correction is a new entry with every line's direction flipped (`reverseJournal`), never an edit (business-rules.md §20.4).

### `creditnotes`
Reduces what a customer owes. `creditNoteNo` (`CN-000123`), `customerId`/`customerName`, `invoiceId?`/`invoiceNo?`, `returnId?`/`returnNo?` (a future hook for Returns settlement — not wired in this phase), `reason` (`SALES_RETURN | PRICE_ADJUSTMENT | GOODWILL | OTHER`), `reasonNote?`, `taxableValue`, `gst`, `total`, `status` (`ISSUED | CANCELLED`), `issueDate`, `cancelledReason?`, `createdById`/`createdByName`.

### `debitnotes`
The purchase-side mirror — reduces what the business owes a supplier. `debitNoteNo` (`DN-000123`), `supplierId`/`supplierName`, `supplierInvoiceId?`/`supplierInvoiceNo?`, `reason` (`PURCHASE_RETURN | PRICE_ADJUSTMENT | SHORT_SUPPLY | OTHER`), `reasonNote?`, `taxableValue`, `gst`, `total`, `status`, `issueDate`, `cancelledReason?`, `createdById`/`createdByName`.

### `Payment` / `PaymentAllocation` — not new collections
The task named these as entities; this layer deliberately does not duplicate them. B2B's `B2BPayment`/`PaymentAllocation` (§7, Phase 4) and Procurement's `SupplierPayment`/`SupplierPaymentAllocation` (§7A, Phase 5) already implement exactly this — recorded → verified/allocated → derived paid amount, maker–checker on the receivable side — fully tested, per channel. Allocating (or reversing) either now *also* posts a GL entry through the shared `postSalesInvoice`/`postPaymentReceived`/`postPurchaseInvoice`/`postPaymentMade` functions, in the same database transaction as the allocation itself, rather than reimplementing payment tracking a third time.

### Where the ledger is fed from (no new write paths elsewhere)
- `postSalesInvoice` — called from `b2b/fulfilment.service.ts`'s `invoice()`, inside its existing inventory-ledger transaction.
- `postPaymentReceived` / its reversal — called from `b2b/payments.service.ts`'s `allocate()`/`reverse()`.
- `postPurchaseInvoice` / its reversal — called from `procurement/supplier-invoice.service.ts`'s `createSupplierInvoice()`/`cancelSupplierInvoice()`.
- `postPaymentMade` / its reversal — called from `procurement/supplier-payment.service.ts`'s `allocateSupplierPayment()`/`reverseSupplierPayment()`.
- Credit/debit notes post from their own services, standalone documents against a customer/supplier (and optionally an invoice), not tied to any of the above.

## 8. Not yet implemented (still Phase 0 proposals)

Orders (`orders`, `carts`, `purchaseOrders`) — **now implemented**, see §7 (B2C/B2B) and §7A (procurement) — Manufacturing & job work — **now implemented**, see §7B — Hallmarking — **now implemented**, see §7C — Returns, exchange & repair — **now implemented**, see §7D — Accounting (chart of accounts, general ledger, credit/debit notes) — **now implemented**, see §7E — `creditAccounts` (a B2C credit account; B2B's own credit is §7) is still exactly as sketched in the original Phase 0 draft of this document — see [progress.md](./progress.md) for which phase builds each one.

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

Supplier ── PurchaseRequisition ── PurchaseOrder ── GoodsReceipt >── InventoryLedger (PURCHASE_RECEIPT)
                                         │                 │
                                         └── SupplierInvoice ── SupplierPayment ── SupplierPaymentAllocation

Product ── ProductionOrder >── InventoryLedger (MANUFACTURING_ISSUE / MANUFACTURING_RECEIPT)
Supplier ── JobWorkOrder >── InventoryLedger (JOBWORK_ISSUE / JOBWORK_RECEIPT)

Order / B2BSalesOrder ── Return >── InventoryLedger (RETURN: SOLD→RETURNED, RETURNED→AVAILABLE/DAMAGED)
Customer ── Exchange >── InventoryLedger (EXCHANGE_IN)
Customer ── RepairOrder ── InventoryItem >── InventoryLedger (REPAIR_OUT/REPAIR_INTAKE, REPAIR_RETURN)

B2BInvoice ── postSalesInvoice ──┐
SupplierInvoice ── postPurchaseInvoice ──┤
B2BPayment / SupplierPayment (allocate) ──┼──> AccountingEntry >── ChartOfAccount
CreditNote / DebitNote ──┘
```

## 10. Notes on immutability & indexing (updated)

- Append-only (enforced at the Mongoose layer, not just by convention): `inventoryLedger`, `transactions`, `metalRates`, `auditLogs`. `priceSnapshots` (implemented Phase 3.5) uses the same `appendOnlyPlugin`.
- Money: integer paise, plain `Number`. Weights: grams to 3 decimals, plain `Number`, rounded at every derivation point — see the revised decision at the top of this document.
- Every `*Id` reference field is stored as a Mongoose `ObjectId` and typed as `string` in `packages/types`; `apps/api/src/shared/to-dto.ts`'s `deepStringifyObjectIds` converts between the two at every repository boundary, recursively (including inside embedded arrays), so nothing outside `apps/api` ever sees a raw `ObjectId`.
- Every collection with an obvious hot query path has a compound index reflecting it (see each section above) — added when the query pattern was known, not guessed upfront, per architecture.md §9 risk #9.
