# Progress

Update this file at the end of every major phase (see [CLAUDE.md](../CLAUDE.md)). Newest entry on top.

## Phase 0.5 — Design system foundation (2026-09-20)

**Status: complete.**

Scaffolded the monorepo (pnpm workspaces) and built the shared design system ahead of schedule, since it blocks all three frontends and the plan called for it before business screens. No business functionality was built — no ERP screens, no storefront flows, no API.

Produced:
- **Monorepo root** — `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, `.gitignore`.
- **`packages/config`** — shared Tailwind preset (`tailwind-preset.cjs`) mapping semantic color/typography/radius/shadow/motion tokens to Tailwind utilities, and the base `tsconfig`.
- **`packages/ui`** — the shared component library (67 components) plus `src/styles/tokens.css` (light/dark CSS variable tokens) and `src/lib/format.ts` (currency/weight/percentage formatting). Covers: primitives (Button, Input, Textarea, Select, Combobox, SearchInput, DatePicker, CurrencyInput, WeightInput, PercentageInput, Checkbox, Label, FormField, FormSection), layout/nav (PageHeader, SectionHeader, Breadcrumb, Tabs, CommandPalette), data (Table, DataTable with mobile stacked-card fallback, Pagination), feedback (Dialog, ConfirmDialog, Drawer, DropdownMenu, Tooltip, Toast/Toaster, Alert, EmptyState, Skeleton), ERP shell (Sidebar, Topbar, ERPLayout, MobileNavigation, FilterBar, DataToolbar, BulkActionBar, DetailPanel), jewellery-specific display (MetalRateDisplay, WeightDisplay/WeightBreakdown, CurrencyDisplay, PurityBadge, InventoryStatusBadge, StockLocationBadge, PriceBreakdown, MarginDisplay, HUIDDisplay, OrderStatusBadge, CreditLimitIndicator), and storefront (StoreHeader/Footer, ProductCard/Grid/Gallery, ProductPrice(+Breakdown), CollectionHero, FilterDrawer, CartDrawer, WishlistButton, TrustBadge, ReviewSummary, CheckoutSummary).
- **`apps/erp`** — minimal Next.js 14 (App Router) shell whose only purpose right now is hosting the design-system showcase: `/showcase` (tokens, typography, all primitives/badges/cards/data/nav/overlays), `/showcase/storefront` (full storefront composition), `/showcase/erp-shell` (Sidebar+Topbar+ERPLayout composition). No real ERP screens yet.
- Brand palette wired end-to-end as CSS variables (`#FF9900` primary + the black/charcoal/white/off-white/cream/grey/soft-grey neutrals), with light mode and a working dark mode (system-preference media query + explicit `data-theme` override, verified via the in-page toggle).
- Fonts: Fraunces (display/editorial) + Plus Jakarta Sans (UI/data), loaded via `next/font/google`.

Verified: `pnpm typecheck` clean on both packages, `next build` succeeds (static export of all 5 routes), and all three showcase routes were driven with a headless-Chromium script (Playwright) in light and dark mode — zero console/page errors after fixing one bug found this way (duplicate React keys from placeholder `href="#"` values in the showcase's own mock nav data, not a component defect). Screenshots reviewed for visual QA (spacing, dark-mode contrast, restrained use of the orange accent); one polish fix made as a result — `InventoryStatusBadge`'s `RESERVED` state was reassigned from tone `primary` to tone `info` so the brand orange stays reserved for actual brand/primary actions rather than doubling as a status color.

Not done yet, deliberately: `packages/types`, `packages/validation`, `packages/pricing-engine`, `apps/api`, `apps/b2c-store`, `apps/b2b-portal` — these are Phase 1+ per the sequence below.

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

- [ ] **Phase 1 — Core domain.** Monorepo and design system are done (Phase 0.5) — this phase adds `packages/types`, `packages/validation`, and `apps/api` (DB connection, auth module, error/audit middleware) plus Catalog + Inventory modules (`Product`, `InventoryItem`, `InventoryLedger`, `Transaction`, `Location`) with real ERP CRUD screens built on the existing `packages/ui`. No pricing yet (fixed/manual price entry only) — goal is a correct, ledger-driven inventory before pricing complexity is layered on.
- [ ] **Phase 2 — Pricing engine.** `packages/pricing-engine`, `MetalRate`, `PricingRule`, `PriceSnapshot`, `/pricing/preview` API, wired into ERP product/catalogue views for live price display. Heavy unit test investment here (see test-plan.md) before anything depends on it.
- [ ] **Phase 3 — B2C storefront MVP.** Public catalogue browsing, cart, checkout with online payment (placeholder/sandbox gateway), order creation with reservation, order confirmation → invoice + shipment stub.
- [ ] **Phase 4 — B2B portal.** Customer/CustomerGroup, CreditAccount, private catalogue with negotiated pricing, PurchaseOrder-based ordering, offline payment mode, credit-limit approval workflow.
- [ ] **Phase 5 — Invoicing & payments.** Invoice generation from confirmed orders, Payment + PaymentAllocation, outstanding/overdue reporting for both channels.
- [ ] **Phase 6 — Manufacturing & job work.** ProductionOrder, material issue/receipt, JobWorkOrder + reconciliation workflow, discrepancy review.
- [ ] **Phase 7 — Compliance.** TaxRule engine (GST/CGST/SGST/IGST resolution), HUID/hallmarking tracking and enforcement, HSN-driven tax on invoices, compliance reporting.
- [ ] **Phase 8 — Polish & hardening.** Full design-system pass (dark mode ERP, empty/loading/error states everywhere), reporting dashboards, BullMQ notification jobs, performance pass (indexing, load test on reservation concurrency), security review.

Each phase should end with: docs/progress.md updated, docs/architecture.md updated if architecture changed, tests/test-plan.md updated, and a brief summary of what shipped vs. what's deferred.
