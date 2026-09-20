# Progress

Update this file at the end of every major phase (see [CLAUDE.md](../CLAUDE.md)). Newest entry on top.

## Phase 0 — Architecture & planning (2026-09-20)

**Status: complete.**

Repository was empty (no commits, no files) at the start of this phase — greenfield, no legacy code to reconcile with.

Produced:
- [CLAUDE.md](../CLAUDE.md) — persistent project instructions/memory
- [architecture.md](./architecture.md) — system overview, monorepo layout, module boundaries, pricing/ledger patterns, risks
- [business-rules.md](./business-rules.md) — pricing, inventory, orders, B2B credit, manufacturing/job work, compliance rules
- [data-model.md](./data-model.md) — MongoDB collections, fields, relationships, indexing notes
- [design-system.md](./design-system.md) — tokens, typography, component inventory, ERP vs. storefront differentiation
- [test-plan.md](../tests/test-plan.md) — testing strategy per phase

No application code exists yet. `apps/` and `packages/` folders have not been created — that is the first deliverable of Phase 1.

## Recommended sequence (not started)

- [ ] **Phase 1 — Scaffold + core domain.** pnpm workspace, `packages/types`/`validation`/`config`, `apps/api` skeleton (DB connection, auth module, error/audit middleware), Catalog + Inventory modules (`Product`, `InventoryItem`, `InventoryLedger`, `Transaction`, `Location`) with basic ERP CRUD screens. No pricing yet (fixed/manual price entry only) — goal is a correct, ledger-driven inventory before pricing complexity is layered on.
- [ ] **Phase 2 — Pricing engine.** `packages/pricing-engine`, `MetalRate`, `PricingRule`, `PriceSnapshot`, `/pricing/preview` API, wired into ERP product/catalogue views for live price display. Heavy unit test investment here (see test-plan.md) before anything depends on it.
- [ ] **Phase 3 — B2C storefront MVP.** Public catalogue browsing, cart, checkout with online payment (placeholder/sandbox gateway), order creation with reservation, order confirmation → invoice + shipment stub.
- [ ] **Phase 4 — B2B portal.** Customer/CustomerGroup, CreditAccount, private catalogue with negotiated pricing, PurchaseOrder-based ordering, offline payment mode, credit-limit approval workflow.
- [ ] **Phase 5 — Invoicing & payments.** Invoice generation from confirmed orders, Payment + PaymentAllocation, outstanding/overdue reporting for both channels.
- [ ] **Phase 6 — Manufacturing & job work.** ProductionOrder, material issue/receipt, JobWorkOrder + reconciliation workflow, discrepancy review.
- [ ] **Phase 7 — Compliance.** TaxRule engine (GST/CGST/SGST/IGST resolution), HUID/hallmarking tracking and enforcement, HSN-driven tax on invoices, compliance reporting.
- [ ] **Phase 8 — Polish & hardening.** Full design-system pass (dark mode ERP, empty/loading/error states everywhere), reporting dashboards, BullMQ notification jobs, performance pass (indexing, load test on reservation concurrency), security review.

Each phase should end with: docs/progress.md updated, docs/architecture.md updated if architecture changed, tests/test-plan.md updated, and a brief summary of what shipped vs. what's deferred.
