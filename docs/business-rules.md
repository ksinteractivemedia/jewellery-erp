# Business Rules

These are the rules the system must enforce regardless of which channel (ERP/B2C/B2B) initiates the action. "Why" is included wherever the rule is non-obvious, so it isn't accidentally relaxed later. Cross-reference: [data-model.md](./data-model.md), [architecture.md](./architecture.md).

## 1. Pricing

1.1. **There is exactly one pricing engine** (`packages/pricing-engine`). ERP manual sale, B2C checkout, and B2B order pricing all call it with different inputs (customer group, pricing rules in effect), never different code.
   - Why: jewellery pricing (metal rate × net weight + making charge + wastage + stone value − discount + tax) is complex and error-prone; a second implementation will drift and produce two different prices for the same item.

1.2. **A product's price is not stored — it is computed on demand** from the current `MetalRate`, the product's weight/purity, and applicable `PricingRule`s. There is no "price" field on `Product` that must be kept in sync.

1.3. **Once a price is used in a commercial document (order line, invoice line), it is captured as an immutable `PriceSnapshot`** and never recalculated from current rates.
   - Why: today's gold rate must never retroactively change yesterday's invoice.

1.4. **B2B customers may have negotiated prices or a customer/group-specific price list**, expressed as `PricingRule`s scoped to a `Customer`, `CustomerGroup` or `PriceList`, and they outrank general rules.
   - **Implemented (Phase 2).** Which rule governs a calculation is fixed by `resolvePricingRules` in `packages/pricing-engine`, in this order: **tier** (customer-specific → customer group → price list → category → default; a rule's tier is the most specific "who" it names) → higher `priority` (breaks ties *inside* a tier only — a loud default never beats a quiet customer rule) → more specific scope (metal, purity, customer type, channel…) → later `validFrom` → lowest id. A rule applies only if **every** scope field it sets matches. Effective dating is `validFrom` inclusive, `validTo` exclusive, so back-to-back rules never overlap or gap.
   - Making, wastage and discount are resolved **independently**. A wastage of `NONE` is an explicit choice (a customer's "no wastage" overrides a default 2%); absence means "not defined here".
   - The result never depends on the order rules are supplied. If the final id tie-break decides anything it is reported as an `AMBIGUOUS_RULES` warning, and `apps/api` refuses to save a rule that would create such a tie (`assertNoAmbiguousPricingRule`).

1.5. **Price overrides (manual discount at time of sale) must be recorded with who approved it and why**, as part of the `PriceSnapshot`/`Transaction`, not as a silent adjustment.

1.6. **Tax (GST/CGST/SGST/IGST) is computed by a configurable `TaxRule`**, resolved from HSN code and effective date — never hardcoded as a fixed percentage in code.
   - **Implemented (Phase 2):** a rule carries `intraState { cgst, sgst }` and `interState { igst }`; the engine only decides *which side applies* by comparing seller and buyer state (case-insensitive), and each component is rounded on its own as printed on the invoice. `resolveTaxRule` picks the active rule for the HSN with the latest `validFrom` and **refuses** two rules starting on the same instant. The `taxRules` collection/CRUD is Phase 7 — until then rules are typed in (playground) or passed in.

1.7. **A pricing rule's cross-field validity (at least one of makingCharge/wastage/discount set, percentage values within 0–100, `validTo` after `validFrom`) is re-checked against the merged document on every update, not just the incoming patch.** A patch that looks valid in isolation (e.g. "clear `makingChargeType`") can still leave the persisted rule doing nothing at all if it had no other calculation dimension — `assertValidMergedPricingRule` in `pricing-rule.validation.ts` is the enforcement point. *(Implemented Phase 1.)*

1.8. **Order of calculation and the basis of each charge** (`calculatePrice`):
   - `metalValue` = **net** weight × the rate *for the piece's purity*. A rate is quoted for one purity (usually 24K); another purity's rate is `rate × fineness ÷ quotedFineness`. Metal is valued from net weight directly — never through the 3-decimal *fine* weight, which would introduce up to ₹3 of rounding drift on a 22K piece. `fineWeight` is derived/verified and reported.
   - `wastage`: `PERCENTAGE` of net weight, or `FIXED_WEIGHT` grams for the line; the wastage weight is then valued exactly like metal. `NONE` = nothing.
   - `making`: `PERCENTAGE` of the **metal value only** (not of wastage, stones or the subtotal); `PER_GRAM` paise per gram of **net** weight; `FIXED` paise for the whole line; `PER_PIECE` paise × pieces.
   - `subtotal` = metal + wastage + making + stones. `discount` (`PERCENTAGE` or `FLAT`, applying to the `TOTAL` subtotal or to `MAKING_CHARGES` only) comes off it → `taxableValue`. GST is charged on `taxableValue`; `finalAmount` = taxable + tax.
   - Weights, stone value and cost are **line totals**; `pieces` matters only for `PER_PIECE` making.

1.9. **Money is exact.** Integer paise, integer milligrams, BigInt arithmetic, one rounding per component (half away from zero). Inputs with more precision than the field allows (a fourth decimal on a weight, a fractional paisa) are refused, not rounded. Float noise (`0.1 + 0.2`) is tolerated because it is not real precision. A wrong number of paise here is a wrong invoice, so no shortcut through floating point is acceptable.

1.10. **The engine refuses instead of guessing.** Stone weight ≥ gross, a supplied net/fine weight that disagrees with gross − stone / net × fineness, a rate for a different metal, a fixed wastage above the net weight, and a flat discount larger than the amount it applies to are all errors — a flat discount is *not* clamped, because clamping would quietly sell a piece for nothing when ₹50,000 is typed for ₹5,000. Each error names the offending field.

1.11. **No making-charge rule is a warning, not a silent zero.** `priceItem` still prices, but returns `NO_MAKING_RULE` so the caller (and later the order flow) can decide whether that is acceptable. A sale below cost returns `BELOW_COST`.

1.12. **Cost and margin are internal.** The breakdown can carry `estimatedCost`, `grossMargin` and `marginPercentage` (taxable value − cost). The playground endpoint therefore requires `pricing.manage`, not `pricing.view`. Any channel that shows a price to a customer or to staff without cost visibility must strip these fields (a dedicated cost-visibility permission is still to be added).

1.13. **The internal pricing playground is a what-if tool, not a pricing path.** It reads stored rules and the metal master, calls the engine and returns the breakdown; it stores nothing, audits nothing (nothing was sold or changed) and is not connected to any order. A hand-entered value in it is an *override* of one dimension and is labelled as such in the response.

## 2. Inventory

2.1. **Inventory quantity/status is never mutated directly.** Every change to an `InventoryItem`'s status, location, or weight goes through an `InventoryLedger` entry tied to a `Transaction`. Direct field writes to inventory state outside this path are a bug.
   - Why: without a ledger there is no audit trail for "where did this piece go" and no way to reconcile physical stock against system stock — both are non-negotiable in a jewellery business.
   - **Implemented (Phase 1):** enforced two ways, not just by convention. (a) The repository layer (`inventory-item.repository.ts`) exposes no generic update path for `status`/`locationId`/weights/`quantity` — only `inventory-transaction.service.ts`'s `postInventoryTransaction`/`receiveNewInventoryItem` can change them, both inside one MongoDB session so the item mutation and its ledger entry commit or roll back together. (b) `InventoryLedger` and `Transaction` documents themselves reject any update/delete at the Mongoose layer (`appendOnlyPlugin`) — see rule 2.1a below.

2.1a. **`InventoryLedger` and `Transaction` are append-only from the application's perspective, enforced at the schema layer.** Any `updateOne`/`updateMany`/`findOneAndUpdate`/`deleteOne`/`deleteMany`/`findOneAndDelete`/`replaceOne`, or re-`save()`ing an already-persisted document, throws `ImmutableRecordError` — it is not merely undocumented or discouraged. `MetalRate` (§ pricing) uses the same enforcement, since a rate history that can be silently rewritten is as bad as an inventory ledger that can be. *(Implemented Phase 1; see `append-only.plugin.ts` and `append-only.plugin.test.ts`.)*

2.2. **Finished jewellery is individually serialized** (one `InventoryItem` per physical piece, carrying its own gross/stone/net/fine weight, HUID, cost). **Raw material and loose stones are tracked as fungible batches** (weight/quantity on a batch-style `InventoryItem`), not one document per gram.
   - **Implemented (Phase 1):** `netWeight`/`fineWeight` are always derived — `grossWeight − stoneWeight` and `netWeight × fineness` respectively (`weight-calculations.ts`) — and rejected as direct input (`createInventoryItemSchema` has no such fields). `fineness` is resolved from `Metal.purityOptions` at creation time and stored as a snapshot on the item, so a later correction to the purity table never rewrites a past item's recorded fineness. Loose stones held as raw material before being set are `StoneInventory`, a separate collection from `InventoryItem` (different attributes — carat/clarity/certificate vs. gross/net/fine weight/HUID) — see data-model.md §5 for the known gap this leaves (stone status changes aren't yet ledger-tracked the same way).

2.3. **An order reserves specific inventory, not a quantity.** Reservation is an atomic, guarded status transition (`AVAILABLE` → `RESERVED`) recorded as a `RESERVATION` entry that names the holder (`reservation.referenceId`, `reservedBy`, optional `expiresAt`). Only individual pieces are held; a batch is drawn down, not reserved.
   - **Implemented (Phase 1.7):** of N simultaneous reservations of one piece exactly one wins and the rest get a typed conflict (tested with real parallel transactions). A `SALE` of a held piece is accepted only for the order that holds it (`RESERVED_FOR_OTHER` otherwise). Releasing needs the holding order *and*, over HTTP, being the person who placed the hold — an order id is not a secret — unless the caller holds `inventory.approve_adjustment` (`force`).

2.4. **Reserved inventory is released automatically** if the order is cancelled or its reservation window expires (configurable timeout for unpaid B2C orders).
   - **Implemented (Phase 1.7):** `releaseExpiredReservations()` — idempotent, per-item transactions, attributed to a system actor, skips anything that changed underneath. *Not yet scheduled* (BullMQ, Phase 3).

2.5. **Every inventory status must have a legal set of transitions** (e.g. `AVAILABLE → RESERVED → SOLD`, `AVAILABLE → WITH_JOB_WORKER → AVAILABLE`, never `SOLD → AVAILABLE` without an explicit `RETURN` transaction). Illegal transitions are rejected at the service layer, not just discouraged in the UI.
   - **Implemented:** two layers, both checked before any write. The *status graph* (`status-transitions.ts`) says what is physically possible; the *movement rules* (`movement-rules.ts`) say which named event may cause it (`SALE` can't run from `IN_TRANSIT`; `TRANSFER_IN` only completes a `TRANSFER_OUT`; you can't hallmark a sold piece) and which kind of location each accepts (`JOBWORK_ISSUE` → a job worker, `HALLMARKING_OUT` → a hallmarking centre, `*_IN`/`*_RECEIPT`/`TRANSFER_*` → a stock location). A test proves the rules never allow what the graph forbids. `MELTING` is terminal — melted metal re-enters as a *new* item.

2.6. **Every movement is a ledger entry with a reconstructable before/after.** Each entry carries a per-item `sequence` (gap-free, unique), signed deltas and the item's `balanceAfter`, and the item's cached state is only ever the last entry's. `reconcileItem`/`reconcileAll` replay the ledger and report any item whose cache disagrees (sequence gaps, broken status chain, balance ≠ previous + delta, edited cache) — intended as a scheduled integrity job (architecture.md risk #3).

2.7. **No negative stock.** A batch's quantity and weights can never go below zero; a withdrawal larger than what is on hand is refused (`INSUFFICIENT_STOCK`) with nothing written, including inside a multi-line movement. A unit piece cannot be sold, reserved or transferred twice.

2.8. **Concurrent operations are safe by construction, not by luck.** Every write is a compare-and-set on the item's `ledgerSeq` inside a MongoDB transaction, with a unique `(itemId, sequence)` ledger index behind it: two writers on one item cannot both commit. The loser retries, sees the new state, and fails with a typed error (`ILLEGAL_TRANSITION`, `RESERVED_FOR_OTHER`, `CONFLICT`, `CONCURRENT_MODIFICATION`). Unrelated items don't block each other.

2.9. **A HUID is a piece's legal identity.** Exactly six letters/digits, case-insensitive (`ab12cd` = `AB12CD`), unique across all items, set once and never changed. Duplicates are refused with a typed error (`DUPLICATE_IDENTIFIER`) naming the value — including when two requests race. A HUID can arrive at receipt, by editing identifiers, or from `HALLMARKING_IN`; any of them marks the piece hallmarked. Item codes and barcodes are unique too.

2.10. **Weights must be plausible scale readings.** Positive, finite, at most 3 decimals, below a sane ceiling; stone weight non-negative and less than gross for a metal piece. Net and fine are derived. Rejected at the schema *and* again in the service (a re-weigh that would leave no net metal is refused).

2.11. **Corrections are requested and approved by different people.** A stock adjustment (re-weigh, mark damaged, write off) is a *request* that changes nothing. Someone holding `inventory.approve_adjustment` who is **not the requester** approves it; approval is refused if the piece has moved since the request. Writes to the ledger as `ADJUSTMENT` (or `SCRAP`/`MELTING`); rejection leaves stock untouched. Everything is audited.

2.12. **Custody with partners keeps the piece ours.** Issuing to a job worker / repairer / hallmarking centre / workshop moves status and location but not ownership; the piece stays in owned stock and valuation. `SOLD` and `MELTING` are the only statuses outside "owned stock".

2.13. **Transfers are two-step and never lose a piece in between.** Dispatch (`TRANSFER_OUT`: `AVAILABLE → IN_TRANSIT`, location = destination) is all-or-nothing — one ineligible piece stops the whole dispatch. A piece in transit is counted neither as available at the source nor as available at the destination; it can be received (all or part) or cancelled back to the source.

2.14. **Valuation is not a price.** The item detail shows book `cost` and an *indicative metal value* (fine weight × the current rate for that purity, or derived from another purity's rate by fineness), explicitly excluding making, stones and tax. Selling prices come from the pricing engine (Phase 2), never from here.

2.15. **Scanning identifies; it never acts.** A scanned/typed code is parsed (QR payload `JERP:ITEM:<code>`, item code, barcode, serial, HUID) and resolved to at most one item. Resolution is a read; every stock-changing step that follows is a normal audited operation with its own permission.

## 3. Orders (B2C & B2B, shared model)

3.1. **Order is a single model with a `channel` discriminator** (`B2C` / `B2B`), not two parallel implementations, because both eventually generate invoices and shipments against the same inventory.

3.2. **B2C orders require online payment before confirmation**; inventory is reserved at order creation and released if payment fails/expires. *(Implemented Phase 3.5 — see §11.)*

3.3. **B2B orders may reference a `PurchaseOrder`** raised by the customer and may be confirmed with **offline/deferred payment**, subject to credit rules (§4).

3.4. **An order cannot be confirmed if any line's inventory reservation fails** (item sold/reserved elsewhere in the interim) — the customer/staff must resolve (swap item, back-order, or remove line) before confirmation proceeds.

## 4. B2B credit & pricing

4.1. **Every B2B `Customer` has a `CreditAccount`**: credit limit, payment terms (e.g. net 30), current outstanding, overdue amount, computed available credit (`limit − outstanding`).

4.2. **An order that would push outstanding beyond the credit limit is blocked pending approval**, not silently allowed. Approval workflow and threshold are configurable per customer/customer group, not hardcoded.

4.3. **Outstanding balance is derived from invoices minus allocated payments**, not manually tracked as a single mutable number — payment allocation against specific invoices must be explicit (supports partial payments across multiple invoices).

4.4. **Overdue is computed from invoice due date vs. today**, using the customer's payment terms; it is a read-time calculation, not a stored flag that can go stale.

## 5. Manufacturing & job work

5.1. **A production order issues raw material via a `Transaction`/ledger entry** (status `AVAILABLE → IN_MANUFACTURING`) and receives finished goods back via another (`IN_MANUFACTURING → AVAILABLE`, creating new `InventoryItem`(s) for the finished pieces with their own weights/HUID).

5.2. **Wastage and process loss are recorded explicitly as ledger entries**, not inferred by subtracting issued from received after the fact — the reconciliation is a check, not the source of the number.

5.3. **Job work must reconcile**: `issued material = returned material + finished jewellery weight + recorded wastage + recorded loss/discrepancy`. Any residual discrepancy beyond a configurable tolerance must be flagged for manual review before the job work order can be closed.
   - Why: this is the single most common source of disputes with third-party job workers; the system must make the reconciliation explicit and auditable rather than a spreadsheet side-calculation.

5.4. **Material issued to a job worker changes inventory status to `WITH_JOB_WORKER`, not `SOLD` or removed** — it remains an asset of the business until received back or written off.

## 6. Compliance

6.1. **HUID and hallmarking status are properties of the physical `InventoryItem`**, not the `Product`, since two pieces of the same design may hallmark at different times. Items above the configurable hallmarking-mandatory threshold cannot be marked `AVAILABLE` for B2C sale without a recorded HUID (configurable — mandatory thresholds change over time and by category).

6.2. **GST/HSN/CGST/SGST/IGST logic lives entirely in configurable `TaxRule` records**, versioned by effective date. Tax code must never hardcode a rate or a CGST/SGST-vs-IGST decision — that decision (intra-state vs. inter-state) is itself data-driven from buyer/seller state.

6.3. **Every financial and inventory-affecting action is attributable**: `Transaction` records the acting `User`, timestamp, and channel. This is the baseline audit trail for compliance and dispute resolution.

## 7. Identity & access

7.1. **A `User`'s password is never stored or handled as plaintext, and never leaves the auth service as a hash either.** bcrypt (cost 12), hashed only in `user.service.ts`; the public `User` DTO has no password/lockout fields (`toSafeUser` strips them on every read). One policy for every place a password is set: ≥10 characters, a letter and a digit, ≤72 bytes (bcrypt's hard limit — longer would silently truncate). *(Implemented.)*

7.2. **Permissions are `module.action` registry entries; roles reference them by id.** Adding a grantable action is a data + catalog change (`PERMISSIONS`), not scattered string checks. The 13 system roles and their permission sets are defined in code (`role-matrix.ts`) and re-synced at boot. *(Implemented.)*

7.3. **Authorization is enforced by the backend on every request, from live data.** Permissions are read from the database per request, never trusted from the token or the client. Frontend permission checks exist only to hide what a user can't use. *(Implemented; verified by hand-crafting API calls as a `VIEWER`.)*

7.4. **No role names in controllers.** Routes declare required permissions/policies (`requirePermission`, `authorize`). Separation of duties is expressed in the matrix and asserted by tests (e.g. only `INVENTORY_MANAGER`+admins hold `inventory.approve_adjustment`, only `B2B_MANAGER`+admins `b2b.override_credit`, only `ACCOUNTANT`+admins `accounting.create_payment`, `VIEWER` is strictly `*.view`).

7.5. **No privilege escalation through user management.** You may only grant a role whose permissions you already hold, and only manage a user whose permissions you already hold; you can't change your own roles or deactivate yourself; only `SUPER_ADMIN` holds `settings.manage_roles`, and custom roles can only contain permissions their author holds. System roles are read-only over the API. *(Implemented.)*

7.6. **A session ends the moment it should.** Logout, logout-all, password change/reset, user deactivation, admin revocation and refresh-token reuse all revoke server-side sessions, and revocation is checked on every request — a still-unexpired access token dies with its session. Refresh tokens are single-use; reuse revokes the session.

7.7. **Authentication failures don't reveal which part was wrong.** Unknown email, wrong password, inactive and locked accounts return the same 401; password-reset requests return the same 202 for any email. The audit log (not the response) records the true reason. Accounts lock after repeated failures; login and reset endpoints are rate-limited.

7.8. **Sensitive operations are audited, and the audit trail can't be edited.** Authentication events, authorization denials, user/role administration and reading the audit log are recorded with actor, target, IP, user agent and request id — append-only, credentials scrubbed. Every future stock adjustment, price override, credit override and payment must add its own audit entry when its controller is built (`auditRequest`/`recordAudit`).

## 7A. Catalogue (Product Master)

7A.1. **A Product is a design, not a piece.** It has no quantity, no piece-level status and no ledger. The physical jewellery is an `InventoryItem`; its stock only ever changes through `InventoryLedger`. Creating, editing, bulk-updating or deleting a Product never creates or alters an `InventoryItem`. The product detail page may *show* piece counts, but only to callers holding `inventory.view` (it is a different domain with its own permission).

7A.2. **`isActive` ≠ stock status.** Active/inactive says whether the design is offered at all; `b2cEnabled`/`b2bEnabled` say which channels may show it (both default off). Availability of a specific piece is `InventoryItem.status`.

7A.3. **SKUs are unique across products *and* variants and never change.** They're referenced by inventory, invoices and barcodes. Compared case-insensitively (stored uppercase).

7A.4. **Purity must be valid for the metal.** It's checked against the metal's active `purityOptions` (reference data, never a hardcoded list) whenever the metal or the purity changes.

7A.5. **Images are validated by content, not by name.** Only PNG/JPEG/WebP (by leading bytes) up to 5 MB; SVG and anything script-capable is refused; the stored key/extension is server-generated. Products can only reference keys that were actually uploaded. Product media is public read (storefronts and `<img>` can't send a bearer token) but immutable and unguessable; **upload requires `catalog.manage`**.

7A.6. **A product with inventory can't be hard-deleted** (nor a variant). The catalogue definition is history once a piece exists — deactivate instead. Categories with children or products can't be deleted; deleting a collection only detaches it.

7A.7. **Catalogue reads need `catalog.view`; every catalogue write (including bulk and upload) needs `catalog.manage` and is audited** with actor, target and changed fields (`catalog.*` audit actions). Bulk actions are capped at 200 ids and only touch rows that would actually change.

## 8. Cross-cutting

8.1. **No business logic in React components.** Pricing, credit checks, inventory transitions, tax computation live in `apps/api` services (and `packages/pricing-engine`/`packages/validation`), never duplicated in `apps/erp`, `apps/b2c-store`, or `apps/b2b-portal`.

8.2. **Historical documents (invoices, past ledger entries, past price snapshots) are never edited in place.** Corrections happen via new offsetting transactions (credit note, adjustment entry), preserving the audit trail.

8.3. **Mock/sample data is never mixed into production service code.** Where mock data is needed during UI development, it must be clearly isolated (e.g. a `*.mock.ts` file or a seed script) and never reachable from a real request path.

8.4. **Every ref field crosses the API boundary as a plain string, never a raw Mongoose `ObjectId`.** `apps/api/src/shared/to-dto.ts` converts recursively (including inside embedded arrays) at every repository function's return — so `packages/types`' `id: string` contract is actually true at runtime, not just in the type layer. *(Implemented Phase 1.)*

## 9. Dashboard

9.1. **No invented metrics.** Every dashboard figure is computed from data the system actually holds. Where the module that owns a metric does not exist yet, its section reports `NOT_CONNECTED` and says what it needs — it is never shown as zero, and never estimated. A zero means "we looked and there was none".

9.2. **Sample data is labelled wherever it appears.** A development adapter may feed sections that have no backend, but only in development, only through the same aggregators a real provider will use, and every figure it supplies is marked `SAMPLE` (banner, section badge, tile marker). Production registers no adapter. The sample facts follow fixed arithmetic patterns, never a random source.

9.3. **Definitions.** *Revenue* = taxable value, before GST. *Orders* = distinct orders, not order lines. *Gross margin* = revenue − cost. A KPI's *change* compares the selected range with the equally long period immediately before it, and is absent (not zero) when that period had no sales. *Today's revenue* is the current business day whatever range is selected. *Outstanding* = unpaid invoice balance; *overdue* = the part past its due date (an invoice is not overdue on the instant it falls due); *credit utilisation* = drawn ÷ extended, and may exceed 100%.

9.4. **A business day is a calendar day in the business timezone (IST), not in UTC.** Ranges are inclusive of both ends; a range is at most 366 days.

9.5. **Snapshots do not follow the date range.** Stock position, queues and alerts describe the present; each section states whether it covers a date range or the current position, and which filters it applied.

9.6. **Stock definitions.** *Owned stock* = every status except SOLD and MELTING (incl. pieces at job workers, hallmarking, repair and in transit). *Available pieces* = finished jewellery, AVAILABLE, not reserved. *Stock value* = book cost of owned stock, with the indicative metal value at today's rate beside it (a metal without a rate is excluded and named; with no rates at all the value is absent, not zero). *Gold / Silver stock* is shown as fine weight, with net weight and piece count.

9.7. **"Pending" operations are pieces, not orders.** Job work, hallmarking and repairs are counted as pieces currently in that status (the system has no job-work-order entity yet), each with how long it has been there, measured from the ledger entry that put it there. Attention thresholds (transfers in transit > 3 days; pieces away > 14 days) are operational judgement calls kept in one place and returned in the response so the screen states them.

9.8. **Alerts come from real state** — stock adjustments awaiting approval (and those that can no longer be approved because the piece moved), overdue transfers, pieces away too long, reservations that lapsed but still hold stock, returns awaiting inspection, damaged pieces awaiting a decision. An empty list is a real answer.

9.9. **Cost-derived figures follow visibility, on the server.** Gross margin needs `accounting.view`; without it the API returns `{ restricted: true }` and no margin figure — hiding it in the UI would not be enough.

## 10. Storefront

10.1. **A dynamic price is presented as dynamic.** Where the price is calculated from today's metal rate, the storefront says so ("Live price", "calculated now"), shows the breakdown, and never presents a stored tag price. The price is inclusive of GST, shown as one figure with GST itemised in the breakdown.

10.2. **The storefront never guesses a price.** If the engine cannot price a piece — no weight, stones without a stone value, no rate for the metal/purity, no making rule, no active GST rule — the piece is `ON_REQUEST` with the reason, it cannot be bought, and its structured data carries no offer. "Price on request" is a real answer, not an error.

10.3. **No invented claims.** No reviews, ratings, testimonials, stock-scarcity claims, or policy text exist unless the business wrote them (`StorefrontContent`); development seed text is marked as sample. Structured data never includes `aggregateRating`.

10.4. **Availability is real stock.** In stock / low stock / out of stock come from unreserved, available finished pieces; a design sold by size is available if any size is, and a bag line needs a size. A bag quantity is capped at what is actually available and re-checked by the server quote.

10.5. **Nothing is bought that cannot be fulfilled.** Checkout is a guest flow that holds real stock and takes payment through a provider (§11); with no payment provider configured it says online ordering is unavailable. Accounts and order history are not built and say so.

10.6. **Price filters and sorts act on live prices** (in whole rupees in the URL, paise in the API); on-request pieces are excluded from a price range and sort last.

10.7. **The bag and wishlist hold identifiers only** (slug, size, quantity) on the device — never a price.

## 11. Checkout, orders & payment

11.1. **The backend recalculates everything before payment.** Price, stock, delivery fee, GST split and total come from the server. A price, discount, total or stock level in a request is refused. The only customer-supplied figure is the total they saw, used to detect change.

11.2. **A price change is never silent.** If the server's total differs from the one the customer agreed to, no order is created; they are shown the new total and must accept it explicitly.

11.3. **Stock is held before payment** (`RESERVATION`, 20 min by default) in the same transaction that makes the order payable, and released if payment fails for good, the order is cancelled, or the hold expires. A piece is `SOLD` (ledger `SALE`) only when payment is captured.

11.4. **An order's money and lines are frozen** — one immutable `PriceSnapshot` per line (engine inputs and output, rate and its effective time). Metal-rate changes never change an existing order; corrections are refunds or new documents.

11.5. **Only the provider can say a payment succeeded.** The browser's redirect proves nothing; the API asks the provider, or verifies a signed webhook. Reports are idempotent and never move a payment backwards; a duplicate webhook has no effect.

11.6. **Money that can't be honoured goes back.** A capture for an order that is cancelled, already paid, out of stock or short/over-paid is refunded automatically. A refund never exceeds what was captured.

11.7. **Cancellation.** Before payment: free. After payment and before packing: full refund, pieces come back for inspection before resale. After packing: a return, not a cancellation.

11.8. **Guests are supported; an order is opened only with its access token** — a wrong token is indistinguishable from no such order.

11.9. **No gateway, no order.** With no payment provider configured, the storefront neither takes orders nor holds stock.

11.10. **Order statuses:** DRAFT, PENDING_PAYMENT, PAYMENT_FAILED, PAID, CONFIRMED, PACKED, SHIPPED, DELIVERED, CANCELLED, RETURN_REQUESTED, RETURNED, REFUNDED. **Payment statuses:** PENDING, AUTHORIZED, CAPTURED, FAILED, REFUNDED, PARTIALLY_REFUNDED. Transitions are defined once (`order-status.ts`).
