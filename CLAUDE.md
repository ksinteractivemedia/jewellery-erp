# CLAUDE.md

Persistent instructions for working on this repository. Read this before making changes. Detailed docs live in `docs/` and `tests/` — this file is the index and the non-negotiable rules; don't duplicate their content here, link to it.

## What this is

A production-grade Jewellery ERP + Commerce platform for an Indian jewellery business, with three interfaces sharing one backend and one MongoDB database:

1. **ERP / admin** (`apps/erp`) — internal operations
2. **B2C storefront** (`apps/b2c-store`) — direct-to-consumer commerce
3. **B2B wholesale portal** (`apps/b2b-portal`) — retailer/wholesaler ordering with credit terms

## Read these before touching the relevant area

- [docs/architecture.md](docs/architecture.md) — system design, monorepo layout, module boundaries, pricing/ledger patterns, risks
- [docs/business-rules.md](docs/business-rules.md) — the rules that must hold regardless of channel
- [docs/data-model.md](docs/data-model.md) — MongoDB collections and relationships
- [docs/design-system.md](docs/design-system.md) — tokens, typography, component rules
- [docs/progress.md](docs/progress.md) — what phase we're in, what's done, what's next
- [tests/test-plan.md](tests/test-plan.md) — testing strategy per phase

## Non-negotiable architectural rules

1. **One pricing engine.** `packages/pricing-engine`, pure functions, no I/O. ERP, B2C, B2B all call the same code with different inputs — never re-implement price math per channel.
2. **Never mutate inventory quantity/status directly.** Every stock change goes through an `InventoryLedger` entry tied to a `Transaction`. `InventoryItem.status`/`location` are derived caches updated inside the same DB transaction as the ledger write.
3. **Separate `Product` (catalogue definition) from `InventoryItem` (physical piece) from `InventoryLedger`/`Transaction` (events) from `PricingRule` (rule) from `PriceSnapshot` (immutable historical values).** A product's price can change daily; an invoice's historical price never changes retroactively.
4. **No business logic in React components.** Pricing, credit checks, inventory transitions, tax computation live in `apps/api` services and shared packages, not in `apps/erp`/`apps/b2c-store`/`apps/b2b-portal` components.
5. **Modular monolith, not microservices.** One `apps/api` process with clear module boundaries (`src/modules/*`), each exposing a small public interface. Don't split into services without a proven need.
6. **Compliance/tax rules are configurable data (`TaxRule`, effective-dated), never hardcoded** percentages or CGST/SGST-vs-IGST branching in application code.
7. **Mock data is isolated, never mixed into production service code paths.**
8. **Any `packages/ui` component using a hook, or attaching a handler to a raw host element it renders, needs its own `"use client"`** — ERP pages are Server Components by default, so a component that only worked by accident (because every past caller happened to be a Client Component) will crash the first time a Server Component renders it. See docs/design-system.md §5 for the full rule, including why `DataTable`-style components with function-valued props (column render functions) still need a small local Client Component wrapper at the call site even once they're marked `"use client"` themselves.
9. **Authorization is enforced by the backend, from live data, via permissions — never role names, never the frontend.** Protect every route with `requirePermission(PERMISSIONS.X)` / `authorize(policy)` behind `authenticate`; the permission vocabulary is `PERMISSIONS` in `packages/types`, the role matrix lives only in `apps/api/src/modules/auth/rbac/role-matrix.ts`. Frontend checks (`useAuth().can`, `<RequirePermission>`, nav filtering) are UX only. Any new sensitive mutation (stock adjustment, price/credit override, payment, user/role change) must be audited (`recordAudit` / `auditRequest`) and must not let a caller grant more than they hold. See docs/architecture.md §7 and business-rules.md §7.
10. **Never put a credential where it can be read back.** Passwords only as bcrypt hashes (`toSafeUser` strips them from every DTO); refresh/reset tokens only as SHA-256 hashes of their secret; the access token only in SPA memory; audit metadata goes through `sanitizeAuditMetadata`.

## Tech stack

- **Frontend:** React, TypeScript, Next.js, Tailwind CSS, shadcn/ui, TanStack Query, Zustand (where needed), React Hook Form, Zod, Lucide icons
- **Backend:** Node.js, TypeScript, Express, Mongoose
- **Database:** MongoDB (replica set — required for multi-document transactions used by the ledger)
- **Infra:** Redis, BullMQ, S3-compatible object storage
- **Monorepo:** pnpm workspaces; `apps/*` depend on `packages/*`, never the reverse

## Repository layout (proposed — see docs/architecture.md §2)

```
apps/{api, erp, b2c-store, b2b-portal}
packages/{types, validation, pricing-engine, ui, config}
docs/  tests/
```

As of the last update to this file: `packages/{config,ui,types,validation,pricing-engine}` and `apps/api` (domain/data layer + authentication, RBAC, audit log, the catalogue/media endpoints, and the inventory domain — ledger, transfers, reservation, adjustments) exist; `apps/erp` has real login/route guards, the Product Master screens, the Inventory screens (stock, detail, ledger, transfers, adjustments), an internal Pricing Playground (`/pricing/playground`) and the Dashboard (`/`); `apps/b2c-store` is a real storefront on the public `/api/store/*` API (browsing, live-priced catalogue, bag, wishlist, SEO, and guest checkout with orders and payments through a provider abstraction — **only a dev SANDBOX gateway exists, and there are no customer accounts, reviews or staff order/fulfilment screens yet**); `apps/b2b-portal` is a real wholesale portal on `/api/portal/*` (catalogue with customer/group/price-list pricing, quick order, cart → purchase order, quotations and negotiation, orders, invoices, offline payments, outstanding) with the seller's side in the ERP under B2B (`/api/b2b/*`) — **credit is enforced by the backend, and payments only settle invoices when verified and allocated; no CSV/Excel import, partial fulfilment, credit notes or e-invoicing yet**. `packages/pricing-engine` is exercised by the playground (`POST /api/pricing/preview`) and by the storefront's live prices — checkout prices real orders and stores an immutable `PriceSnapshot` per order line. The dashboard's inventory/operations/alerts/activity sections are live; its Sales and B2B sections say *not connected* in production and are fed by an isolated, labelled `SAMPLE` adapter only under `dev:memory` (see docs/architecture.md §5A). Run every suite with `pnpm test`. See [docs/progress.md](docs/progress.md) for current phase.

## Working conventions

- Inspect existing code before adding new modules; avoid unnecessary rewrites.
- Implement incrementally, phase by phase (see docs/progress.md for the sequence). Don't jump ahead to later-phase features.
- Run type checking/lint/tests before considering a change done; don't claim something works without verifying it.
- Update docs/progress.md (and architecture/test-plan docs if they changed) at the end of every major phase.
- Don't over-engineer: no abstraction, config flag, or "future-proofing" without a concrete current need.
- Brand accent color `#FF9900` is used deliberately as a signal, not a dominant fill — see docs/design-system.md.
