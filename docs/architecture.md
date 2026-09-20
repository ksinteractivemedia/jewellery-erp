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
  catalog/         Product (catalogue definition), Category, ProductCollection
  inventory/       InventoryItem, InventoryLedger, Location, reservation logic
  pricing/         MetalRate, PricingRule, PriceSnapshot — wraps packages/pricing-engine
  customers/       Customer, CustomerGroup, CreditAccount (B2B)
  orders/          Order, OrderLine, Cart — unified B2C + B2B (channel-discriminated)
  procurement/     Supplier, SupplierPurchaseOrder, GoodsReceipt
  manufacturing/   ProductionOrder, MaterialIssue/Receipt, JobWorkOrder, Reconciliation
  invoicing/       Invoice, Payment, PaymentAllocation
  compliance/      TaxRule (GST/HSN), HallmarkingRecord, HUID tracking
  media/           S3-backed asset upload/serving
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

## 5. Pricing engine

`packages/pricing-engine` is a pure, framework-free TypeScript package:

```
input:  { product, inventoryItem, metalRate, purity, pricingRules[], customerGroup?, quantity }
output: { metalValue, makingCharge, wastage, stoneValue, subtotal, discount, taxBreakdown, total, ruleTrace }
```

- Same function is called by ERP (manual sale / quote), B2C (checkout), and B2B (order from PO / negotiated price).
- No channel-specific branching lives in the engine's public API — channel differences (e.g. B2B negotiated price list, B2C dynamic promo) are expressed as **inputs** (which `PricingRule`s apply), not as separate code paths.
- Deterministic and side-effect free → easy to unit test exhaustively and to snapshot-test against known-good calculations (critical given this is money).
- `apps/api` is the only caller that persists a `PriceSnapshot`; frontends may call a `/pricing/preview` API endpoint for live display, but never compute price locally.

## 6. Inventory ledger and concurrency

- Every stock-affecting action inserts a `Transaction` + one or more `InventoryLedger` entries in a single MongoDB multi-document transaction (requires a replica set — even a single-node replica set in dev).
- `InventoryItem.status`/`location` are **derived, cached fields** updated inside the same DB transaction as the ledger insert — never mutated independently. The ledger is the source of truth; the cached field exists purely so reads don't need to replay history.
- Reservation (B2C/B2B order confirmation) uses an atomic `findOneAndUpdate` guarded by `status: 'AVAILABLE'` to prevent two simultaneous orders from reserving the same physical piece; the loser gets a typed "item no longer available" error to handle in UI (swap item / refund).
- Fungible raw material (gold bars, loose stones before allocation) is tracked by weight/quantity on batch-style `InventoryItem`s rather than one document per gram; the same ledger model applies, just with weight deltas instead of a unit count.

## 7. Auth & multi-channel access

- One `User`/`Role`/`Permission` model shared by ERP staff, B2B customer users, and B2C customers (discriminated by `userType`).
- ERP and B2B portal: session-based or JWT auth with role-based permissions (staff roles: admin, sales, inventory, accounts, manufacturing; B2B roles: buyer, approver).
- B2C storefront: standard customer auth (email/OTP or password), plus guest checkout.
- API is the single auth boundary; frontends never talk to MongoDB directly.

## 8. Infrastructure

- **MongoDB** — primary store, replica set (required for transactions).
- **Redis** — current metal rate cache, session store, rate limiting, BullMQ backing store.
- **BullMQ** — invoice PDF generation, email/SMS notifications, hallmarking reminders, price-list recalculation on rate change, report generation.
- **S3-compatible storage** — product images, certificates (HUID/hallmark), invoice PDFs, KYC documents for B2B onboarding.

## 9. Architectural risks

1. **MongoDB transactions require a replica set.** Must be true in every environment including local dev, or the ledger-consistency guarantees silently disappear. Mitigate: document this in setup, use a single-node replica set locally, verify in CI.
2. **Reservation race conditions.** Two customers checking out the same one-of-a-kind piece concurrently. Mitigated by atomic guarded updates (see §6), but must be load-tested before launch.
3. **Ledger read performance at scale.** Deriving "current state" by replaying the ledger doesn't scale; the derived cache field is essential and must never drift from the ledger. Add a periodic reconciliation job that recomputes cached state from the ledger and alerts on mismatch.
4. **Pricing engine drift.** If any frontend or module ever computes a price outside `packages/pricing-engine`, B2C/B2B/ERP will silently disagree. Mitigate with lint rule / code review discipline + the engine being the only place with metal-rate math; treat any duplicate price math found in review as a bug, not a style issue.
5. **Job-work / manufacturing reconciliation correctness.** Issued vs. returned vs. finished vs. wastage vs. discrepancy is easy to get subtly wrong and hard to unit-test end-to-end. Needs its own dedicated test suite (see test-plan.md) before it's trusted for real material.
6. **Compliance rules change over time** (GST rates, HUID thresholds). Hardcoding any of this creates a migration/backfill headache later — must be versioned/effective-dated configuration from day one, not deferred as "config later."
7. **Schema evolution on financial data.** Once real invoices/ledger entries exist, Mongoose schema changes must be additive/backward-compatible; no destructive migrations on financial collections.
8. **Three frontends sharing one auth/API surface** with very different trust levels (public storefront vs. internal ERP). Requires deliberate API-level authorization checks per route, not reliance on "the ERP UI just doesn't show that button."
9. **Scope size.** This is a large domain. The biggest execution risk is over-building shared abstractions before the second real use case exists. Default to the simplest thing that satisfies the stated rule (ledger-based inventory, one pricing engine, immutable snapshots) and resist adding flexibility nothing has asked for yet.

## 10. What "done" looks like for the architecture phase

No code. This document, plus [business-rules.md](./business-rules.md), [data-model.md](./data-model.md), [design-system.md](./design-system.md), [progress.md](./progress.md) and [../tests/test-plan.md](../tests/test-plan.md), reviewed and agreed, before any `apps/`/`packages/` folder is created.
