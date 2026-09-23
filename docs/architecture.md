# Architecture

Status: proposed, pre-implementation. See [progress.md](./progress.md) for what actually exists.

## 1. System overview

One backend, one database, three frontends, one source of truth.

```
                    ┌─────────────────────┐
                    │   apps/api (Express)│
                    │  modular monolith    │
                    └──────────┬───────────┘
              ┌────────────────┼────────────────┐
     ┌────────▼───────┐ ┌──────▼───────┐ ┌───────▼────────┐
     │ apps/erp        │ │ apps/b2c-store│ │ apps/b2b-portal│
     │ internal admin  │ │ storefront    │ │ wholesale portal│
     └─────────────────┘ └───────────────┘ └────────────────┘
              │                 │                    │
              └────────── shared packages ────────────┘
                 types · validation · pricing-engine · ui · config

     MongoDB (primary store) · Redis (cache, sessions, rate limits)
     BullMQ (background jobs on Redis) · S3-compatible storage (media/docs)
```

**Why a modular monolith, not microservices:** the three channels share one pricing engine, one inventory ledger and one customer/order model. Splitting that into services before there is a proven scaling need would force distributed transactions for things that are naturally one transaction today (e.g. "reserve inventory + create order + snapshot price"). We get service-like boundaries via **modules** (folders with their own models/services/routes and an explicit public interface), so a future extraction is possible without a rewrite.

## 2. Monorepo layout

```
apps/
  api/              Express + Mongoose backend — the single backend for all three channels
  erp/              Next.js internal admin (operational, data-dense, light+dark)
  b2c-store/        Next.js B2C storefront (editorial/luxury, light only)
  b2b-portal/       Next.js B2B wholesale portal (operational, light+dark)

packages/
  types/            Shared domain TypeScript types/interfaces + DTOs (no runtime logic)
  validation/       Zod schemas — single source of truth for input validation,
                     shared between frontend forms (RHF) and backend request validation
  pricing-engine/   The ONE pricing engine. Pure functions, no I/O, no framework deps.
                     Consumed by apps/api at request time and (read-only, for live
                     price preview) by frontends via the API — never re-implemented client-side.
  ui/               Design-system component library (shadcn/ui based), design tokens
  config/           Shared tsconfig, eslint, tailwind preset, constants
```

Package manager: **pnpm workspaces**. No Turborepo/Nx initially — three Next.js apps and one API are small enough that plain workspace scripts are sufficient; revisit if build times become a problem.

Rule: `apps/*` may depend on `packages/*`. `packages/*` never depend on `apps/*`. `pricing-engine` and `validation` have zero dependency on Express or Next.js so they can run in either runtime (and in tests) unmodified.

## 3. Backend module boundaries (apps/api)

```
apps/api/src/modules/
  auth/            Users, roles, permissions — shared identity across all 3 channels
  catalog/         Product (catalogue definition), Variant, Category, ProductCollection — **implemented** (product/taxonomy/variant services)
  inventory/       InventoryItem, InventoryLedger, Transaction, StockTransfer, StockAdjustment, movement rules, queries — **implemented**
  pricing/         MetalRate, PricingRule, PriceSnapshot — wraps packages/pricing-engine
  customers/       Customer, CustomerGroup, CreditAccount (B2B)
  orders/          Order, OrderLine, Cart — unified B2C + B2B (channel-discriminated)
  suppliers/       Supplier (master data) — **implemented**
  procurement/     PurchaseRequisition, PurchaseOrder, GoodsReceipt, SupplierInvoice, SupplierPayment/Allocation — **implemented** (Phase 5, docs/data-model.md §7A); calls suppliers/ and inventory/, never the reverse
  manufacturing/   ProductionOrder, JobWorkOrder, material reconciliation — **implemented** (Phase 6, docs/data-model.md §7B); calls catalog/, suppliers/ and inventory/, never the reverse
  hallmarking/     AssayingCentre, HallmarkingBatch, HUID tracking — **implemented** (Phase 7, docs/data-model.md §7C); calls inventory/, never the reverse
  returns/         Return (B2C and B2B) — **implemented** (Phase 8, docs/data-model.md §7D); calls inventory/, orders/ and b2b/ (read-only, to resolve which item an order sold), never the reverse
  exchange/        Exchange (old jewellery for new) — **implemented** (Phase 8, docs/data-model.md §7D); calls inventory/ and metals/, never the reverse
  repair/          RepairOrder — **implemented** (Phase 8, docs/data-model.md §7D); calls inventory/, never the reverse
  accounting/      ChartOfAccount, AccountingEntry, CreditNote, DebitNote — the first accounting layer — **implemented** (Phase 9, docs/data-model.md §7E); called BY b2b/ and procurement/ (never the reverse) at the moment an invoice/payment/note actually posts — see architecture.md §5E
  invoicing/       (superseded by accounting/ — invoices themselves remain B2BInvoice/SupplierInvoice, each channel's own; this module never separately existed)
  compliance/      TaxRule (GST/HSN) — the rest of "compliance" (HUID/hallmarking) moved into its own hallmarking/ module above once built, rather than staying a placeholder here
  media/           MediaStorage port (local disk / memory / future S3 adapter), image validation, upload service — **implemented**
  notifications/   BullMQ queues/workers (email, SMS, webhooks)
  shared/          DB connection, error types, middleware, audit logging
```

Each module exposes a small `index.ts` (its "public interface" — services other modules may call) and keeps its Mongoose models private to the module where practical. Cross-module calls go through service functions, not direct model imports, so module boundaries stay real even inside one process.

## 4. Core architectural pattern: catalogue vs. physical item vs. event

This is the rule the whole system is built around (see business-rules.md for the "why"):

| Entity | Role | Mutable? |
|---|---|---|
| `Product` | Catalogue/design definition (style, default metal, default weight range, images, current list price basis) | Yes — this is "today's" definition |
| `InventoryItem` | One physical piece (or one fungible batch, for raw material) with its own weights, purity, HUID, cost, status | Status/location change only via a ledger entry |
| `InventoryLedger` | Append-only log of every stock movement | Never — insert only |
| `Transaction` | The business event that caused one or more ledger entries (a sale, a purchase, a transfer, a job-work issue...) | Never after posting |
| `PricingRule` | Configurable rule for computing a price (making charge %, wastage %, margin, tax) | Yes, versioned by effective date |
| `PriceSnapshot` | The fully-resolved price breakdown captured at the moment of a transaction | Never — immutable once created |

A `Product`'s price can change every day with the gold rate. An `Invoice`'s price must never change retroactively. This is why every commercial document line (`OrderLine`, `InvoiceLine`) embeds a `PriceSnapshot` rather than a reference to live pricing.

## 5. Pricing engine — **implemented** (Phase 2)

`packages/pricing-engine` is a pure, framework-free TypeScript package. Its only dependency is *types* from `@jewellery/types`; a test (`independence.test.ts`) fails the build if a source file imports a framework or database, reads a clock, or draws a random number. Everything a price depends on is an input — including the date rules are evaluated `asOf` — so the same input always yields the same breakdown to the paisa, with no database.

Public surface (`src/index.ts`):

| Function | Job |
|---|---|
| `calculatePrice(input)` | Pure arithmetic once rules are chosen. Returns the **complete** breakdown (below), never just a total. |
| `resolvePricingRules(rules, ctx)` | Picks the rule governing each of *making / wastage / discount*, by a **total order** (below), with a trace of what it beat. |
| `priceItem(request)` | `resolvePricingRules` + `calculatePrice`; accepts hand-entered `overrides`. The one call every channel makes. |
| `resolveTaxRule(rules, {hsnCode, asOf})` | The effective `TaxRule` for an HSN code on a date; refuses to guess between rules starting on the same instant. |
| `findAmbiguousRules(rules)` | Save-time guard: pairs of rules that could apply to one sale and tie on everything but id. `apps/api` refuses to save such a rule. |
| `valueOfMetal(...)` | The one metal-value formula; stock valuation (`inventory/valuation.ts`) calls it too, so a valuation and a price can't disagree about a gram of metal. |

```
input:  metal, purity(+fineness), gross/stone/net/fine weight, pieces, metal rate quote, stone value, cost?,
        making / wastage / discount terms (or, for priceItem: candidate rules + customer context), tax terms, seller & buyer state
output: metalValue, wastageWeight, wastageValue, makingCharges, stoneValue, subtotal, discount, taxableValue,
        taxes{ supplyType, cgst, sgst, igst, rates }, totalTax, finalAmount, estimatedCost, grossMargin, marginPercentage,
        rules{ making, wastage, discount → terms + source }, warnings[]
```

- **Contract types live in `@jewellery/types`** (`pricing.ts`, `pricing-rule.ts`, `tax-rule.ts`), not in the engine, so the ERP types what the API returns without depending on the engine. The frontends *cannot* compute a price — they don't have the code.
- **Exact arithmetic.** Money is integer paise, weight integer milligrams, percentages/fineness integers scaled by 10⁶; every product/quotient is BigInt, rounded **once**, half away from zero. No float ever touches a paisa, so `subtotal = metal + wastage + making + stones`, `taxable = subtotal − discount`, `totalTax = cgst + sgst + igst`, `final = taxable + totalTax` hold exactly, always.
- **Rule resolution order (deterministic, total):** *tier* — customer-specific → customer group → price list → category → default — then higher `priority` (only inside a tier), then more specific scope, then later `validFrom`, then lowest id. The last step is arbitrary, so it is reported as a warning and `findAmbiguousRules` stops such rules being saved. Each of making / wastage / discount resolves **independently** (a customer's "5% off" rule must not erase the default making charge), and a wastage of `NONE` is a real choice that overrides a default. A test proves the answer is identical for all 120 orderings of a book and 200 shuffles of a larger one.
- **Refuses rather than guesses:** weights that disagree, stone ≥ gross, a rate for another metal, wastage above net weight, a flat discount above what it discounts, an unknown tax state — each a `PricingError` with a field name; the API returns it as a 400.
- Channel differences are **inputs** (`context`, `rules`), never code paths.
- **Callers today:** `apps/api` `POST /api/pricing/preview` (`pricing.manage`) for the internal playground, which reads stored rules and metal master data and writes nothing. **Phase 3.5 now persists a `PriceSnapshot` per order line and prices real B2C orders (§5C);** the rest arrives with the Orders module. When it does, `apps/api` remains the only caller that persists a snapshot; margin and cost fields must be stripped for any caller without cost visibility.

## 5A. ERP dashboard — **implemented** (Phase 2.5)

The dashboard is a composition of independent sections, each with its own API endpoint under `/api/dashboard/*` (`sales`, `b2b`, `inventory`, `operations`, `alerts`, `activity`, plus `meta` for the filter bar). One endpoint per section means a section loads, fails, is permissioned and is retried on its own — one slow query never blanks the page. The ERP composes them and computes none of the figures.

**Honest provenance is part of the contract** (`packages/types/src/dashboard.ts`). Every section answers one of:
- `OK` + `LIVE` — computed now from the database (inventory, operations, alerts, activity);
- `OK` + `SAMPLE` — supplied by a development adapter; the UI labels it;
- `NOT_CONNECTED` — the owning module does not exist yet (Orders, invoicing, B2B, credit). A 200, not an error, and never a zero.

**Providers.** Sales and B2B have no backend yet, so the dashboard module defines what it needs (`SalesProvider`, `B2BProvider`, in `apps/api/src/modules/dashboard/providers.ts`) and registers none in production. When the Orders module ships it supplies a provider that turns orders into normalised facts (`SalesFact`, `B2BFacts`); the figures — totals, previous-period comparison, trend buckets, B2B/B2C split, rankings, receivables, overdue, credit utilisation — are computed by **real, tested aggregators** (`aggregateSales`, `aggregateB2B`) that live in `src/`, not in the adapter.

**The development adapter** (`apps/api/dev-adapters/dashboard-sample.ts`, wired only from `scripts/dev-memory.ts`) fakes only the *facts*, through arithmetic patterns rather than a random source, and feeds the same aggregators — so filters, comparisons and edge cases exercised in development are the real ones. Two tests enforce the isolation structurally: nothing under `src/` may import seed data or the adapter, and nothing that could show a number may draw one at random; the ERP side has a matching guard (no `Math.random`, no rupee literal, no cost/revenue arithmetic in dashboard components). The ERP never knows the adapter exists — it sees one contract and a `provenance` flag.

**Filters.** A date range (`from`/`to`, inclusive *business days*) and a branch/location. The server resolves them: a location wins over its branch, a location outside the named branch is a 400, an unknown one a 404. A section states which filters it *honours* (`scope.honours`) and what it covered (`scope.range`, or none for a snapshot), so stock, queues and alerts — snapshots of now — visibly ignore the date range, and B2B, which is not location-scoped, receives the branch a location belongs to. All filters live in the URL (`range`, `from`, `to`, `branch`, `location`); the ERP takes "today" from `meta.today`, the server's business day, never the browser's clock. Business days are IST (a fixed UTC+5:30, no daylight saving) — `BUSINESS_UTC_OFFSET_MINUTES`; a per-company timezone is a known gap.

**Authorization** is per section and server-side: stock sections need `inventory.view`, sales `sales.view`, B2B `b2b.view`, and gross margin — cost-derived — is withheld by the service from anyone without `accounting.view` (`{ restricted: true }`; the figures are not in the response at all). The page shows a person exactly the sections they may see.

## 5B. B2C storefront — **implemented** (Phase 3)

`apps/b2c-store` (Next.js App Router, port 3001) talks only to the public `/api/store/*` API (`apps/api/src/modules/storefront`); a Next `rewrite` proxies it same-origin, so the browser never needs the API's origin. It contains **no pricing, tax, stock or credit logic** — components render what the API says.

- **One pricing engine, dynamic by contract.** `storefront-pricing.ts` loads the metal rates, active pricing rules and the effective-dated `TaxRule` and calls `priceItem` with the B2C context. The result is a `StorePrice`: `AVAILABLE` (always `dynamic: true`, with breakdown, basis and computed-at) or `ON_REQUEST` with a machine-readable reason. A price is calculated per request and never stored or cached in the storefront; the bag stores slugs and quantities only, and totals come from `POST /cart/quote`.
- **Availability** is derived from the same ledger-backed `InventoryItem` rows the ERP uses (available, finished jewellery, unreserved); for designs sold by size it is the sum over sizes.
- **Content is data** (`StorefrontContent`): announcement, hero, story, trust points, policies, contact and curation come from the business, are validated by `storefrontContentSchema`, and are absent (not defaulted) when unwritten. Reviews are an endpoint that reports "none" — nothing is invented.
- **Rendering.** Server Components fetch (`no-store` for prices and lists; a 30 s revalidate only for the shell content/navigation) and hand the result to Client Components as TanStack Query `initialData`, which then refetch on focus so a displayed price does not go stale. Listing state is the URL (`parseListingParams` / `toApiQuery` / `toSearchString`), so a filtered view is shareable and crawlable.
- **SEO.** `generateMetadata` per route, canonical without filters, `Product` JSON-LD with `offers` only when the price is available (and no `aggregateRating`), `sitemap.xml` from `/api/store/sitemap`, `robots.txt`, noindex on transactional pages. There is intentionally **no root `loading.tsx`**: a Suspense boundary above the page flushes a 200 before `notFound()` can set 404.
- **Rate limiting:** storefront writes (`/cart/quote`, `/newsletter`) share the `storefrontWrite` limiter; reads are `public, max-age=15`.

## 5C. Checkout, orders & payments — **implemented** (Phase 3.5)

`apps/api/src/modules/orders`, behind the public `/api/store` API. Guest checkout is the supported path (the identity model can carry B2C customers, but no B2C sign-in exists yet); a valid B2C bearer token, if present, links the order to the user.

- **Trust boundary.** The browser sends *which pieces, how many, where, how* — nothing else. Request schemas are strict. `verify` and `place` both call one `assess()` that prices with the same pricing engine (`priceDesignWithEvidence`), counts real stock, and applies the business's delivery fee. `agreedTotal` is compared, never used.
- **Order = DRAFT → (hold) → PENDING_PAYMENT.** The draft and its `PriceSnapshot`s are written in one transaction; the ledger `RESERVATION` and the move to PENDING_PAYMENT are one transaction (`withInventoryTransaction` + `postInSession`), so a hold exists exactly when the order is payable. Lost races retry piece selection, then cancel the draft and answer `STOCK_CHANGED`.
- **Snapshots.** Each line points at an append-only `PriceSnapshot` holding the engine's inputs and full output for one unit; the order copies the resulting amounts. The order is immutable (guarded in the model) apart from status, hold, allocations and payment fields, so a later rate change cannot alter it.
- **State machine.** `ORDER_TRANSITIONS` in `order-status.ts`; `moveOrder` is a compare-and-set on the status read, so racing movers (webhook, return, sweep, customer) yield one winner. Payment states move only forward (`canAdvancePayment`).
- **Payments.** `PaymentProvider` is the only thing orders know. Every provider report — webhook, customer return (`fetchStatus`), expiry reconcile — goes through `apply()`. Webhook: signature verified by the adapter → recorded in `PaymentEvent` (unique per provider event) → applied → marked processed; a redelivery is acknowledged and ignored; an event for a payment not yet known is answered 409 so the provider resends. `PaymentProviders` is a registry; production registers none.
- **Capture** runs as one transaction: payment CAPTURED + order PAID→CONFIRMED + ledger `SALE` for the held pieces. If it can't be honoured, `settleCapture` records the capture and refunds (reasons: `STOCK_UNAVAILABLE`, `ORDER_NOT_PAYABLE`, `DUPLICATE_PAYMENT`, `AMOUNT_MISMATCH`). Refunds reserve their amount against the payment *before* the provider is called (guard over pending+succeeded), so racing refunds can't return more than was taken.
- **Cancellation.** Unpaid: CANCELLED, open payments voided, pieces released. Paid (PAID/CONFIRMED): CANCELLED, pieces `RETURN`ed (inspection queue), full refund; REFUNDED once the refund lands (asynchronously if the provider says so). `expireStale` cancels lapsed holds after asking the provider about open payments.
- **Guest access.** `HMAC(accessSecret, "order-access:v1:"+orderId)` as `X-Order-Token`; nothing stored.
- **Config:** `CHECKOUT_RESERVATION_MINUTES` (default 20), `STORE_BASE_URL` (payment pages return here; the browser supplies only a path). Delivery options and the HSN are `StorefrontContent` data.
- **Dev/test:** `dev-adapters/payment-sandbox.ts` — a gateway that behaves like a real one (own authoritative state, signed webhooks, ids, async refunds) plus a hosted payment page. Not importable from `src/`.

## 5D. B2B wholesale — **implemented** (Phase 4)

`apps/api/src/modules/b2b`, exposed twice: the **buyer's portal API** (`/api/portal`, `apps/b2b-portal`) and the **seller's API** (`/api/b2b`, the ERP desk). Same services, different door.

- **Identity and scoping.** A buyer is a `B2B_BUYER` user linked to one `Customer`; `requireBuyer` loads that link from the database and every portal handler passes *that* customer id into the service, so a request cannot name another customer. Staff use the seller API and permissions (no roles named anywhere). Buyer authorisation by identity, not permission, is a deliberate exception to "permissions everywhere": there is no per-buyer role model yet.
- **Pricing.** `priceFor` → `priceDesignWithEvidence(world, design, buyerState, audience)`. The audience carries customer, group and price list, so rule resolution is the engine's (customer → group → price list → category → default); a hand-entered concession is an engine **override**, recorded as such in the snapshot. Nothing in the module does price arithmetic.
- **Documents and lifecycle** (`b2b-status.ts`): PO `DRAFT → SUBMITTED → UNDER_REVIEW → QUOTED ⇄ NEGOTIATING → APPROVED` (or REJECTED / CANCELLED); quotation `ISSUED → ACCEPTED / REVISION_REQUESTED / SUPERSEDED / REJECTED` (EXPIRED derived at read, enforced at accept); sales order `PENDING_CREDIT_APPROVAL | APPROVED → ALLOCATED → INVOICED` (or CANCELLED); payment `PENDING_VERIFICATION → VERIFIED → REVERSED` (or REJECTED). All moves are compare-and-set on the status read.
- **Credit** (`credit.ts`, `commitSalesOrder`): position = limit, outstanding (unpaid invoice balances), committed (approved, uninvoiced orders), overdue; `checkCredit` returns reasons with actions. Enforcement is inside a transaction that first writes `Customer.creditSeq`, so concurrent approvals for one customer conflict and the loser re-reads the winner's commitment.
- **Fulfilment.** `allocate` holds specific pieces with a ledger `RESERVATION` (no expiry) — all lines or none, retrying on lost races; `invoice` posts the ledger `SALE` and issues the invoice in one transaction, taking the CGST/SGST/IGST split from the frozen snapshots (asserted equal to the order's GST).
- **Payments and allocation.** `verify` refuses the recorder; `allocate` writes the payment and each invoice in one transaction (`allocationSeq`) so racing allocations conflict rather than over-apply; `reverse` marks the payment's allocations reversed. Invoice `paid`, `balance`, status and overdue are computed from unreversed allocations and the due date — never stored.
- **Derived, never stored:** outstanding, overdue, available credit, an invoice's paid amount and status, ageing buckets.
- **Read models** (`b2b-reads.service.ts`) serve both doors; the portal catalogue is filtered, sorted and paged in memory (fine for hundreds of designs; needs a price index at thousands).

## 5E. Accounting — **implemented** (Phase 9)

`apps/api/src/modules/accounting`, called from `b2b/` and `procurement/` (never the reverse — accounting knows nothing about sales orders or purchase orders, only about the numbers it's handed). A real double-entry general ledger under the ERP's existing commercial documents, deliberately not a full accounting package: no multi-currency, no cost centres, no budgets, no manual free-form journal entries.

- **One transaction abstraction, the task's own words.** `posting.service.ts`'s `postJournal(session, {referenceType, referenceId, lines: [{role, direction, amount}]})` is the only function that ever writes an `AccountingEntry`: it resolves each line's account by its `SystemAccountRole` (never a hardcoded id — `chart-of-accounts.service.ts`'s `requireSystemAccount`), drops zero-amount lines, and refuses to write anything where debits and credits disagree. `sales-posting.ts` and `purchase-posting.ts` are thin, named wrappers over it (`postSalesInvoice`, `postPaymentReceived`, `postPurchaseInvoice`, `postPaymentMade`) — the same "one engine, different inputs" discipline as the pricing engine (rule 1), applied to bookkeeping.
- **Perpetual inventory, for real.** Because every `InventoryItem` already carries its own `cost` (set once, at receipt, never mutated), a sales posting can debit Cost of Goods Sold and credit Inventory at the *actual* cost of the pieces sold — not a periodic estimate, not a second inventory valuation system. A purchase posting debits Inventory directly for ledger-tracked lines (the ones that become a real `InventoryItem`) and Purchases for `CONSUMABLE` lines (which never do) — procurement's own existing distinction, not re-decided here.
- **No new write path for stock or payments.** Accounting entries are posted *inside* the same database transaction as the document that triggered them (an invoice, a payment allocation, a credit/debit note) — the same session-passing pattern `withInventoryTransaction` already established for the inventory ledger, so "the invoice was created but its accounting entry wasn't" can never happen. `Payment`/`PaymentAllocation`, named in the task's own list of entities, are deliberately **not** new collections: B2B's `B2BPayment`/`PaymentAllocation` and Procurement's `SupplierPayment`/`SupplierPaymentAllocation` already implement exactly that (recorded → verified/allocated → derived paid amount), fully tested, and reimplementing them a third time would be the "recreate Tally" the task explicitly warned against. Allocating either now *also* posts a GL entry, through the one shared function.
- **Append-only, like everything else that matters.** `AccountingEntry` uses the same `appendOnlyPlugin` as `InventoryLedger`/`Transaction`; a reversal (`reverseJournal`) is a new entry with every line's direction flipped, never an edit.
- **Receivables reporting reuses B2B's own math.** `receivables-reads.service.ts` calls B2B's `ageInvoices`/`isOverdue`/`daysOverdue`/`invoiceStatus`/`paidByInvoice` (`b2b/credit.ts`, `b2b/b2b-core.ts`) rather than re-implementing ageing a second time — the only difference from the portal's own per-customer outstanding view is scope. `reports.service.ts`'s trial balance is a proof, not just a report: since `postJournal` never writes an unbalanced entry, it should always foot to zero.

## 6. Inventory ledger and concurrency — **implemented** (Phase 1.7)

**The model.** `Product` is a catalogue design; `InventoryItem` is a physical piece (or batch); `InventoryLedger` is its immutable history; `Transaction` is the business event behind one or more ledger lines. Stock is never a quantity on a product.

**One write path.** Every stock change — receive, reserve, release, sell, return, partner issue/receipt, transfer, adjustment — goes through `postInSession` inside `withInventoryTransaction` (a MongoDB multi-document transaction; a replica set is required, even single-node in dev). The `Transaction`, each ledger entry, the item update and any related document (a `StockTransfer`, a `StockAdjustment`) commit together or not at all. Higher-level operations (`stock-operations.ts`) are in-process functions the Orders/Production modules will call directly; the HTTP layer (`inventory.service.ts`) adds validation, permission-dependent decisions and the audit entry.

**Per-line checks, in order:** the movement rule (which event may cause which status change, into which kind of location — `movement-rules.ts`) → the physical status graph (`status-transitions.ts`) → weights/quantity never negative → reservation ownership → hallmark/HUID side effects → **compare-and-set on `ledgerSeq`** → ledger entry with `sequence` and `balanceAfter`.

**Concurrency, precisely.** Two operations racing on one item both read `ledgerSeq = n`; both try to write `n → n+1`. MongoDB's snapshot isolation makes the second transaction fail with a transient write conflict, `withTransaction` retries its callback, and the retry now sees the winner's state and fails with a *typed* domain error (`ILLEGAL_TRANSITION`, `RESERVED_FOR_OTHER`, `CONFLICT`, `INSUFFICIENT_STOCK`…). Behind that, the unique `(itemId, sequence)` ledger index makes a double-claim of a slot impossible even if something bypassed the check. Callbacks are therefore written to derive everything from what they read *inside* the session — they may run more than once. Counters for document numbers are allocated *outside* the transaction so unrelated operations never contend on them.

**Integrity is checkable.** `replayLedger` (pure) and `reconcileItem`/`reconcileAll` verify sequence continuity, status chaining, `balance = previous + delta`, and that the item's cache equals the last entry. Tests assert it after every scenario and that a direct edit is caught. Wire `reconcileAll` to a schedule when BullMQ lands (risk #3).

**Known limits (deliberate, documented):**
- *Batch (fungible) items* support whole-batch moves and signed weight/quantity deltas, but not a **partial issue that splits a lot** (issuing 10 g of a 100 g bar to manufacturing while 90 g stays available). Today a batch has one status, so `MANUFACTURING_ISSUE` moves the whole lot; correct partial issue needs lot splitting/location-level quantities — that belongs to Phase 6 (manufacturing) and is not faked here. Reservation is refused for batches.
- *StoneInventory* is still not ledger-tracked (unchanged from Phase 1).
- *Cost* is visible to every `inventory.view` holder; there is no separate cost-visibility permission yet.
- *Reservation expiry* is a callable function, not yet a scheduled job.

## 6A. Scanning architecture (no hardware code)

Anything that produces text is a **`ScanSource`** (`apps/erp/lib/inventory/scanner.ts`); every scan takes the same path: `parseScanCode` (shared, pure, in `packages/validation`) → `GET /api/inventory/scan?code=` → an inventory row → the quick view. Today there is one source, the **keyboard wedge** — how USB and Bluetooth-HID barcode scanners present themselves (they "type" the code and press Enter), detected by inter-key timing (< 40 ms gaps, ≥ 4 chars, ignoring focused text fields) so a person typing is never mistaken for a scanner. A phone-camera source (BarcodeDetector/ZXing) or a native bridge would be another `ScanSource` appended to `SCAN_SOURCES`; nothing else changes.

**Codes.** Labels carry the QR payload `JERP:ITEM:<itemCode>` (uppercase + digits + `-` `:` only, so it encodes in a QR's compact alphanumeric mode); 1-D barcodes carry the item code or the item's `barcode`; a HUID scans as its six characters. Resolution tries item code → barcode → serial → HUID (HUID only if the text is six alphanumerics) and returns *at most one item, or none — never an error for an unknown code*. Input is stripped of scanner control characters, length-capped, and restricted to a safe alphabet before it reaches a query. Scanning **identifies; it never acts** — every stock change that follows is a normal permissioned, audited operation.

## 7. Authentication & authorization — **implemented**

One identity model (`User`/`Role`/`Permission`) serves ERP staff, B2B buyers and B2C customers (`userType`). The API is the single auth boundary: every protected route sits behind `authenticate` + a policy, and the frontends never talk to MongoDB.

**Token architecture**
- **Access token** — HS256 JWT, 15 min, claims are *identity only* (`sub`, `sid` session id, `jti`, `iss`, `aud`). Verified with the algorithm pinned to HS256 (no `alg: none`/confusion attacks). Held only in the SPA's memory — never `localStorage` — and sent as `Authorization: Bearer`.
- **Refresh token** — opaque `<sessionId>.<256-bit secret>`, `httpOnly; SameSite=Strict; Path=/api/auth; Secure` (in production) cookie, never in a response body. Only a SHA-256 of the secret is stored. **Single-use with rotation**: each refresh issues a new token and remembers the previous hash; presenting an already-rotated token means it leaked, so the whole session is revoked (reuse detection). Rotation is a compare-and-swap, so of two concurrent refreshes exactly one wins. Idle expiry (7 d, sliding) and absolute expiry (30 d) are both enforced.
- **Why roles/permissions are not in the JWT:** they are resolved from the database on every request, so a role change, role deactivation or user deactivation takes effect on the *next request*, not at token expiry. The cost is ~3 indexed reads per request; a short-TTL cache is the future optimisation, deliberately not built yet.

**Session / token invalidation strategy**
`sessions` rows are the revocation list, checked on every request (so logout is immediate even though the JWT hasn't expired). A session is revoked on: logout, logout-all, password change (all *other* sessions), password reset (all), user deactivation, admin "revoke sessions", refresh-token reuse, idle/absolute expiry. Revoked rows are kept 30 days past expiry for forensics, then purged by a Mongo TTL index.

**Login hardening** — bcrypt (cost 12; 4 only in tests); identical `401 Invalid credentials` for unknown user / wrong password / inactive / locked, with a dummy bcrypt run on unknown accounts so latency doesn't reveal existence; per-account lockout (5 failures → 15 min) *plus* per-IP rate limiting on login and forgot-password (in-memory store: move to Redis before running >1 API instance).

**Password reset** — `POST /forgot-password` always answers `202` with the same body whether or not the email exists. A known, active account gets a random single-use token (30 min, hash stored, older links invalidated) through the `EmailSender` port. `POST /reset-password` verifies the secret *before* consuming the token, then sets the password, clears lockout, revokes every session, and sends a "password changed" notice. The port has console (dev) and in-memory (test) implementations and an `UnconfiguredEmailSender` for production that logs *that* mail wasn't sent but never the link — **a real SES/SMTP transport (via the BullMQ notifications worker, §8) is still to build, so reset cannot complete in production yet.**

**CSRF** — the only cookie-authenticated endpoints are `refresh`/`logout`; they rely on `SameSite=Strict`, an `Origin` allow-list check, and JSON-only bodies. Everything else uses a bearer header, which browsers don't attach automatically.

**Authorization (RBAC)**
- Permissions are `module.action` strings (`inventory.approve_adjustment`), the canonical list is `PERMISSIONS` in `packages/types` (one spelling shared by API, tests and frontend guards — a typo is a compile error). 32 permissions, 13 system roles.
- The role → permission matrix (`apps/api/src/modules/auth/rbac/role-matrix.ts`) is **backend policy as code**, upserted to the database at every boot (`syncRbac`), so a system role can't drift by hand edit. Nothing else in the codebase names a role.
- Routes never check roles. They compose **policies** — predicates over the caller's permissions (`hasAll`/`hasAny`) — via `requirePermission(...)` / `requireAnyPermission(...)` / `authorize(policy)`. A denial is audited and answered `403` before the handler runs.
- **No privilege escalation.** `settings.manage_users` lets you administer users, not mint power: you can only grant roles whose permissions you hold, only manage users whose permissions you hold, never change your own roles, never deactivate yourself. `ADMIN` = `SUPER_ADMIN` minus `settings.manage_roles`, so an `ADMIN` structurally cannot create or modify a `SUPER_ADMIN`. These rules are expressed in permissions, not role names.
- The frontend (`useAuth().can`, `<RequirePermission>`, the filtered sidebar, the forbidden screen) is UX only. `/auth/me` returns the caller's permissions to *drive UI*; bypassing it in devtools yields an empty page and a 403 from the API (verified end-to-end).

**Audit logging** — `auditLogs` is append-only (same Mongoose enforcement as the inventory ledger). Recorded: every login (success/failure with the real reason), logout, refresh reuse, password change/reset request/complete/reject, every authorization denial (who, method, path, missing permission), user create/update/role change/deactivate/session revoke, custom-role changes, and *reading* the audit log itself. Metadata is scrubbed of anything credential-shaped and size-capped. `recordAudit` **fails open** (logs and swallows write errors) so an audit outage can't take down sign-in or become a DoS lever — revisit to fail-closed for financial mutations when those controllers exist. `auditRequest(action)` middleware is available for future sensitive routes (price override, stock adjustment) that don't audit in their service.

**Known limitations** — refresh in two tabs at once is serialised with the Web Locks API (the cookie jar is shared, so this is enough); browsers without it could hit reuse-detection and be signed out (safe failure). B2C/B2B customer login UIs, MFA, and per-branch data scoping are not built.

## 7A. Catalogue & media — **implemented**

- **Layering.** Repositories (parse with the shared Zod schemas, one collection each) → services (`product.service`, `taxonomy.service`, `variant.service`: reference checks, uniqueness across the SKU namespace, cycle/delete guards, audit) → thin routers (`/api/products`, `/api/catalog/{categories,collections}`, `/api/media`) that only declare `requirePermission(catalog.view|catalog.manage)`. No role names anywhere.
- **List endpoint.** One `GET /api/products` does search (every word must match SKU/name/slug/tag or a variant SKU, regex-escaped), filters, case-insensitive sort with a stable `_id` tiebreak, and pagination, returning small row summaries (metal/category/collection names resolved in batched lookups, not N+1). Its query contract (`productListQuerySchema`) is shared: the ERP encodes its URL state with the same schema the API validates with.
- **Media storage port.** `MediaStorage { put, get, exists }`; product code only holds opaque keys. `createLocalDiskStorage` (dev/single node; re-validates keys against traversal) and `createMemoryStorage` (tests, `dev:memory`) exist; **production needs an S3-compatible adapter** — the only thing to write, nothing else changes. Media URLs are built from `API_PUBLIC_URL` at read time so they're environment-correct and never persisted.
- **Frontend.** TanStack Query (cache cleared whenever nobody is signed in), list state in the URL, forms via React Hook Form with a resolver that validates the *API payload* against the API's own Zod schema (one copy of every rule, in `packages/validation`).

## 8. Infrastructure

- **MongoDB** — primary store, replica set (required for transactions).
- **Redis** — current metal rate cache, session store, rate limiting, BullMQ backing store.
- **BullMQ** — invoice PDF generation, email/SMS notifications, hallmarking reminders, price-list recalculation on rate change, report generation.
- **S3-compatible storage** — product images, certificates (HUID/hallmark), invoice PDFs, KYC documents for B2B onboarding.

## 9. Architectural risks

1. **MongoDB transactions require a replica set.** Must be true in every environment including local dev, or the ledger-consistency guarantees silently disappear. Mitigate: document this in setup, use a single-node replica set locally, verify in CI.
2. **Reservation race conditions.** Two customers checking out the same one-of-a-kind piece concurrently. Mitigated by atomic guarded updates (see §6), but must be load-tested before launch.
3. **Ledger read performance at scale.** Deriving "current state" by replaying the ledger doesn't scale; the derived cache field is essential and must never drift from the ledger. Add a periodic reconciliation job that recomputes cached state from the ledger and alerts on mismatch.
4. **Pricing engine drift.** (Mitigated: one engine, frontends hold no price code, stock valuation reuses its formula, and `independence.test.ts` guards its purity.) If any frontend or module ever computes a price outside `packages/pricing-engine`, B2C/B2B/ERP will silently disagree. Mitigate with lint rule / code review discipline + the engine being the only place with metal-rate math; treat any duplicate price math found in review as a bug, not a style issue.
5. **Job-work / manufacturing reconciliation correctness.** Issued vs. returned vs. finished vs. wastage vs. discrepancy is easy to get subtly wrong and hard to unit-test end-to-end. Needs its own dedicated test suite (see test-plan.md) before it's trusted for real material.
6. **Compliance rules change over time** (GST rates, HUID thresholds). Hardcoding any of this creates a migration/backfill headache later — must be versioned/effective-dated configuration from day one, not deferred as "config later."
7. **Schema evolution on financial data.** Once real invoices/ledger entries exist, Mongoose schema changes must be additive/backward-compatible; no destructive migrations on financial collections.
8. **Three frontends sharing one auth/API surface** with very different trust levels (public storefront vs. internal ERP). Requires deliberate API-level authorization checks per route, not reliance on "the ERP UI just doesn't show that button."
9. **Scope size.** This is a large domain. The biggest execution risk is over-building shared abstractions before the second real use case exists. Default to the simplest thing that satisfies the stated rule (ledger-based inventory, one pricing engine, immutable snapshots) and resist adding flexibility nothing has asked for yet.

## 10. What "done" looks like for the architecture phase

No code. This document, plus [business-rules.md](./business-rules.md), [data-model.md](./data-model.md), [design-system.md](./design-system.md), [progress.md](./progress.md) and [../tests/test-plan.md](../tests/test-plan.md), reviewed and agreed, before any `apps/`/`packages/` folder is created.
