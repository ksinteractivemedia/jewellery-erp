# Progress

Update this file at the end of every major phase (see [CLAUDE.md](../CLAUDE.md)). Newest entry on top.

## Phase 0.75 — Application shells (2026-09-20)

**Status: complete.**

Built the navigable shell of all three applications on top of the Phase 0.5 design system. No business logic, no data layer, no auth — every screen is either static/placeholder content or client-only interaction state (cart, wishlist). Scoped strictly to navigation, layout and visual identity per this phase's instructions.

**ERP (`apps/erp`)** — real app shell replacing the old showcase-redirect root:
- `lib/nav.ts` is the single source of truth for the full IA (Dashboard; Sales/B2B/Inventory/Purchasing/Production/Metals/Stones groups; standalone Hallmarking/Repairs/Customers/Reports/Accounting/Settings) — 30 nav leaves total, driving the Sidebar, MobileNavigation, breadcrumbs, page titles and the ⌘K command palette from one place.
- `components/app-shell.tsx` composes Sidebar + Topbar + MobileNavigation + PageHeader + CommandPalette, computing active nav state and breadcrumbs from `usePathname()`.
- `components/user-menu.tsx` / `notifications-menu.tsx` — placeholder identity and a few illustrative notification rows (no notification service exists).
- `app/(dashboard)/page.tsx` — polished dashboard with placeholder metrics, recent orders, gold rate, B2B credit, job-work status, quick links (all in one clearly-marked `PLACEHOLDER_*` block).
- `app/(dashboard)/[...slug]/page.tsx` — one catch-all instead of ~29 near-identical files; renders an honest "isn't built yet" state for every real nav destination and a real 404 for anything else.

**B2C storefront (`apps/b2c-store`, new app, port 3001)** — announcement bar, header (search/account/wishlist/cart), hero, 3 editorial collection tiles, 8-product bestseller grid, trust section, footer; plus PDP, wishlist (real client state), account (static), checkout (real cart, honest "payment not wired up" note), and a generic placeholder catch-all for collection/help/company links. Light theme only, per design-system.md.

**B2B portal (`apps/b2b-portal`, new app, port 3002)** — same visual language as B2C (Fraunces/Jakarta Sans, same footer/trust pattern) but reskinned for business use: a company/GSTIN/credit strip above the header, catalogue nav instead of editorial nav, MOQ badges instead of wishlist, a "purchase list" drawer (shared `CartDrawer` component, now parameterized with `title`/`checkoutLabel` props) instead of a bag, and a credit/quotations stats row on the homepage.

**Design-system fixes made along the way** (all in `packages/ui`, discovered via the browser-driven verification below, not by inspection):
- `Button`'s `asChild` path crashed against Radix `Slot` whenever `loading={false}` — the falsy loading-spinner conditional still counted as a second child. Fixed by giving `asChild` its own render path with no spinner injection.
- Seven components called React hooks without `"use client"` (`combobox`, `date-picker`, `currency-input`, `weight-input`, `percentage-input`, `pagination`, `product-gallery`) — fine when only ever used inside already-client pages (Phase 0.5's showcase), but crashed the instant a **Server** Component rendered them directly, which real ERP/storefront pages now do.
- A second, related class: `data-table`, `button`, `table`, `input`, `textarea`, `card`, `badge` attach event handlers to the raw DOM elements they render, which also requires `"use client"` regardless of hook usage — Server Components cannot attach handlers to host elements across the boundary.
- Corollary discovered while fixing the dashboard: once `DataTable` is a Client Component, a Server Component page can no longer pass it column defs containing render functions (functions can't cross the Server→Client prop boundary). The fix is a small local Client Component wrapper at the call site (see `apps/erp/components/recent-orders-table.tsx`) — a real architectural pattern for this codebase going forward, not a one-off hack, and now the documented approach for any future server-rendered ERP list page.
- `toggleWishlist` called `toast()` (a cross-component `setState`) from inside a `setState` functional updater, which React flags as "setState while rendering" — moved the toast decision out of the updater.
- Added `AnnouncementBar` to the design system (new, for the B2C header) and gave `CartDrawer` optional `title`/`checkoutLabel`/`emptyTitle`/`emptyDescription` props so B2B could reuse it verbatim instead of forking a near-duplicate drawer.

**Verified, not claimed:** `pnpm typecheck` and `next build` clean on all four packages; `next lint` clean on all three apps. All three dev servers driven with headless Chromium (Playwright) — all 29 ERP nav routes plus the B2C/B2B homepages, PDPs, mobile viewports (390px) and placeholder routes checked for console/page errors; two real bugs found and fixed this way (a malformed `&param` vs. `?param` picsum URL breaking PDP gallery thumbnails; the toast-during-render warning above) in addition to the "use client" issues above. Screenshots reviewed for visual QA — dashboard/module pages, both storefronts in desktop and mobile, and the mobile stacked-card fallback on the dashboard's recent-orders table.

Not done: any real data fetching, auth, or the modules themselves (every ERP nav destination beyond the dashboard is an honest placeholder) — that starts at Phase 1.

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

- [ ] **Phase 1 — Core domain.** Monorepo, design system, and all three app shells are done (Phases 0.5 and 0.75) — this phase adds `packages/types`, `packages/validation`, and `apps/api` (DB connection, auth module, error/audit middleware) plus Catalog + Inventory modules (`Product`, `InventoryItem`, `InventoryLedger`, `Transaction`, `Location`), replacing the ERP's `/inventory/*` and `/sales/*` placeholder routes with real screens. No pricing yet (fixed/manual price entry only) — goal is a correct, ledger-driven inventory before pricing complexity is layered on.
- [ ] **Phase 2 — Pricing engine.** `packages/pricing-engine`, `MetalRate`, `PricingRule`, `PriceSnapshot`, `/pricing/preview` API, wired into ERP product/catalogue views for live price display. Heavy unit test investment here (see test-plan.md) before anything depends on it.
- [ ] **Phase 3 — B2C storefront MVP.** `apps/b2c-store`'s shell exists (Phase 0.75) with placeholder catalogue data — this phase wires it to the real Product/Inventory/Pricing APIs, replaces the client-only cart with real reservation, and builds real checkout (online payment, order confirmation → invoice + shipment stub).
- [ ] **Phase 4 — B2B portal.** `apps/b2b-portal`'s shell exists (Phase 0.75) — this phase adds Customer/CustomerGroup, CreditAccount, negotiated pricing, real PurchaseOrder-based ordering (replacing the placeholder purchase-list), offline payment mode, and the credit-limit approval workflow.
- [ ] **Phase 5 — Invoicing & payments.** Invoice generation from confirmed orders, Payment + PaymentAllocation, outstanding/overdue reporting for both channels.
- [ ] **Phase 6 — Manufacturing & job work.** ProductionOrder, material issue/receipt, JobWorkOrder + reconciliation workflow, discrepancy review.
- [ ] **Phase 7 — Compliance.** TaxRule engine (GST/CGST/SGST/IGST resolution), HUID/hallmarking tracking and enforcement, HSN-driven tax on invoices, compliance reporting.
- [ ] **Phase 8 — Polish & hardening.** Full design-system pass (dark mode ERP, empty/loading/error states everywhere), reporting dashboards, BullMQ notification jobs, performance pass (indexing, load test on reservation concurrency), security review.

Each phase should end with: docs/progress.md updated, docs/architecture.md updated if architecture changed, tests/test-plan.md updated, and a brief summary of what shipped vs. what's deferred.
