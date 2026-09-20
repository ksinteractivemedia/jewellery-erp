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

As of the last update to this file, no `apps/` or `packages/` code exists yet — see [docs/progress.md](docs/progress.md) for current phase.

## Working conventions

- Inspect existing code before adding new modules; avoid unnecessary rewrites.
- Implement incrementally, phase by phase (see docs/progress.md for the sequence). Don't jump ahead to later-phase features.
- Run type checking/lint/tests before considering a change done; don't claim something works without verifying it.
- Update docs/progress.md (and architecture/test-plan docs if they changed) at the end of every major phase.
- Don't over-engineer: no abstraction, config flag, or "future-proofing" without a concrete current need.
- Brand accent color `#FF9900` is used deliberately as a signal, not a dominant fill — see docs/design-system.md.
