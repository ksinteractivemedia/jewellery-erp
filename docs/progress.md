# Progress

Update this file at the end of every major phase (see [CLAUDE.md](../CLAUDE.md)). Newest entry on top.

## Phase 1.7 — Jewellery Inventory (2026-09-20)

**Status: complete** — the physical-stock domain (items, immutable ledger, locations, transfers, reservation, adjustments), its query surface, scan architecture, ERP screens, dev seed and tests. Sale and return exist as **service functions** for the Orders module to call; they are deliberately not HTTP endpoints.

Produced:
- **Ledger rebuilt to the brief.** The 18 movement types (`PURCHASE_RECEIPT … SCRAP`, plus `MELTING`) replace Phase 1's vocabulary. Each entry now carries a gap-free per-item `sequence` (unique), consistent signed deltas, `balanceAfter` and an always-set `destinationLocationId`, so any past state is read straight off the ledger. Weight/quantity semantics that were ambiguous for unit items are fixed.
- **Movement rules table** (which named event may cause which status change, into which kind of location) on top of the status graph; a test proves they never disagree. New location type `MANUFACTURING_UNIT`.
- **Concurrency-safe by construction:** compare-and-set on `ledgerSeq` in a MongoDB transaction + a unique `(itemId, sequence)` index. Verified with real parallel transactions (8 racing reservations → exactly 1; 12 racing batch withdrawals → exactly 10; racing transfers, receives, approvals, HUID creations).
- **Reservation** with ownership (`reservedForOrder`, `reservedBy`, expiry), release, sale-only-for-the-holding-order, an expiry sweep, and a derived `availableForSale`. **Transfers** (two-step, in transit, partial receive, cancel). **Partner movements** (manufacturing, job work, repair, hallmarking out and back, with HUIDs). **Return inspection.** **Adjustments** as request → *different person* approves → ledger (stale requests refused). **HUID** rules (6 chars, unique, immutable, case-insensitive). Weight validation. No negative stock.
- **Reads:** list (search/filter/sort/page, filtered totals), item detail (product, weights, HUID, location, status, cost, **indicative metal valuation**), stock summaries by location / SKU / purity / metal, global and per-item ledger, per-item audit history, scan resolution, transfers, adjustments, meta.
- **Integrity tooling:** `replayLedger`, `reconcileItem`, `reconcileAll`.
- **ERP:** Inventory (sticky filter toolbar, URL-synced search/status/location/metal/purity/hallmark/availability filters, weight columns, filtered totals, summary tabs, scan box + global scanner listener, quick-view drawer, bulk actions whose menu depends on the selection's status), piece detail (all sections, timeline, audit tab, QR label), Receive stock, Ledger, Transfers (new/receive/cancel), Adjustments (four-eyes queue). New `ScanInput` and an extended `StockLocationBadge`; the existing table/filter/drawer/dialog/tabs/bulk-bar components are reused as-is.
- **Dev seed** (`apps/api/seed/inventory.seed.ts`, only reachable from `dev:memory`): 8 locations of every type, today's metal rates, ~66 pieces across the seeded catalogue with sales, returns, hallmarking, job work, repairs, manufacturing, three transfers (in transit / received / cancelled) and adjustments in every state — all produced through the real services; a test proves every piece reconciles with its ledger.

**Verified, not claimed:** `pnpm -r typecheck` clean (7 workspaces); **440 API tests passing** (172 new for inventory — see test-plan.md §13); ERP lint + production build clean; **100 Playwright checks** against the real API in Chromium (desktop + 390 px) all pass, including a scanner-speed keystroke burst opening a piece, a slow typist *not* triggering one, a full transfer dispatch → receive, hallmarking out and back with a HUID, reserve → release with the audit trail, four-eyes adjustment approval, self-approval blocked, and a viewer getting 403 on every stock-changing endpoint called directly.

Bugs found by running it, not by reading it:
- `find()` casts string ids to ObjectIds but **`aggregate()` does not** — filtered totals and summaries silently matched nothing (caught by the HTTP tests).
- The test harness raced Mongo's asynchronous unique-index build (a duplicate "succeeded" if it ran before the index existed) — the setup now waits for `init()` on every model.
- A Radix `Select` clears its value when the value and its options arrive in the same render; the receive form lost the pre-filled purity. Switched to `Combobox`.
- The quick-view drawer fired a detail query with an empty id while closed.
- The UI offered "Reserve" for a raw-material batch (the API correctly refused; the affordance no longer appears).
- Several E2E selector/timing bugs (name collisions between a filter button and a sortable header; asserting before a refetch landed) — recorded because they'd bite the next suite.

Not done, deliberately: **partial issue of a batch** (lot splitting → Phase 6), StoneInventory in the ledger, a cost-visibility permission, scheduling the expiry sweep and `reconcileAll` (BullMQ), location management screens (locations are seeded/API-only), label printing and camera/Bluetooth scan sources, a hard HUID-required-before-sale rule (compliance, Phase 7), per-branch data scoping, and the Playwright suite is still a scratch script (promote it to `apps/erp/e2e` — now two suites deep).

## Phase 1.6 — Product Master (2026-09-20)

**Status: complete** — catalogue API + validation + ERP screens + tests + dev-only seed. First real ERP data screens.

Produced:
- **Model.** `Product` reworked as a pure catalogue definition (see data-model.md §4): added `slug`, `purity`, `collectionIds`, `images{key,alt}`, `videos`, `tags`, `b2cEnabled`/`b2bEnabled`/`isActive`, `createdBy`/`updatedBy`; **removed** `status`, `channelVisibility`, `hasVariants`, `defaultPurity` (and variant `images`). New `ProductCollection`; category `description`. Explicitly *not* confused with `InventoryItem` — no quantity/piece status, no ledger writes, stock shown only to `inventory.view`.
- **API** (`catalog.view` to read, `catalog.manage` to write, all audited): `/api/products` (list with search/filter/sort/paging, create, get, patch, delete, `/bulk`, `/meta`), `/api/products/:id/variants`, `/api/catalog/categories`, `/api/catalog/collections`, `/api/media/images` (upload; public read). Image validation by magic bytes, `MediaStorage` port (local disk / memory).
- **Shared:** `slugify`, product/category/collection/variant/list-query/bulk/media schemas in `packages/validation`; catalogue view types in `packages/types`.
- **`packages/ui`:** new `Switch`, `TagInput`, `MultiSelect`, `ImageUploader`, `formatDate`; existing `DataTable`, `BulkActionBar`, `FilterBar`, `FilterDrawer`, `ConfirmDialog`, `Combobox`, `ProductGallery`, `FormSection` reused as-is. Added the missing `"use client"` to `BulkActionBar` and `FilterBar` (rule 8).
- **ERP:** Products list (URL-synced search/filters/sort/paging, chips, bulk actions, cards on mobile + filter drawer), create/edit form, detail page (gallery, variants CRUD, stock card for `inventory.view`, deactivate/delete), Categories tree manager, Collections manager. Nested routes inherit their section's permission and draw their own header (`ownsHeader`).
- **Dev seed** (`apps/api/seed`, only reachable from `dev:memory`): 3 metals with purities, 11 categories, 7 collections, 39 products, 32 variants, 61 generated PNGs. Refuses `NODE_ENV=production`; a test proves it only produces data the API would accept. No fake data in services.

**Verified, not claimed:** `pnpm -r typecheck` clean; **268 API tests passing** (77 new: schema rules, image detection + storage adapters, and an HTTP suite covering all-13-roles × catalogue endpoints, create/update/immutability/clear-with-null, reference and purity integrity, search/filter/sort/paging incl. regex-metacharacter safety, bulk idempotence, variants scoping/SKU namespace, delete guards against inventory, category cycles, media upload/serving hardening, audit trail); ERP lint + production build clean; **63 Playwright checks** against the real API + Chromium (desktop and 390 px) all pass — including thumbnails loading cross-origin, a fake `.png` being rejected by the server, a viewer being stopped in the UI *and* getting 403 calling the bulk API directly.

Bugs found by running it, not by reading it:
- Bulk `modified` counted rows that already had the value (the audit stamp always "modified" them) — now only rows that would change are touched.
- `networkidle` never settles under the Next dev server (HMR socket) — tests wait on the list's `aria-busy` instead.
- Several E2E selector bugs (substring-matching `Rings`/`Earrings`, "Edit" matching the sidebar's "Cr**edit**") — test bugs, not app bugs, but recorded because they'd bite the next suite.

Not done, deliberately: an **S3 media adapter** (dev disk/memory only), image re-encoding/EXIF stripping and thumbnails/CDN sizing, orphan-upload cleanup (uploaded-but-never-attached images remain), product import/export, per-channel content overrides, product price display (Phase 2), stock-by-location on the detail page, and the Playwright suite is still a scratch script (promote it to `apps/erp/e2e` next).

## Phase 1.5a — Authentication & authorization (2026-09-20)

**Status: complete** for staff auth on the ERP. First Express code in the repo (`apps/api/src/http`), scoped to auth, RBAC administration, the audit log, and one thin inventory read endpoint — the remaining business controllers (Phase 1.5) are still to come and will reuse this machinery.

Produced:
- **Authentication** — email/password, bcrypt, 15-min HS256 access JWT (identity only), rotating single-use refresh token in an httpOnly/SameSite=Strict cookie with reuse detection, server-side `sessions` (immediate revocation on logout / password change / reset / deactivation), per-account lockout + per-IP rate limits, password-reset architecture (`EmailSender` port, single-use hashed tokens, no account enumeration), change-password. Design and trade-offs: architecture.md §7.
- **RBAC** — 32 `module.action` permissions and 13 system roles (`packages/types/src/rbac.ts`, `role-matrix.ts`), synced to the DB at boot. Routes compose policies (`requirePermission` / `requireAnyPermission` / `authorize`) — no role names in controllers. Privilege-escalation rules (grant only what you hold, manage only who you outrank, no self role-change/deactivation; `ADMIN` structurally can't touch `SUPER_ADMIN`). Custom roles API.
- **Audit logging** — append-only `auditLogs`; auth events, authorization denials, user/role administration and reads of the audit log; credential-scrubbed metadata.
- **Backend endpoints** — `/api/auth/*`, `/api/users`, `/api/roles`, `/api/permissions`, `/api/audit-logs`, `/api/inventory/items`; helmet, CORS allow-list, body limit, JSON error handler that never leaks internals.
- **ERP frontend** — `/login`, `/forgot-password`, `/reset-password`; `AuthProvider` (in-memory access token, single-flight + Web-Locks-serialised refresh, session restore from the cookie, open-redirect-safe `?next=`), `AuthGate` route guard, permission-filtered sidebar/palette/mobile nav, `<RequirePermission>` + forbidden screen, real user menu with working sign-out.
- **Dev/ops tooling** — `pnpm --filter @jewellery/api dev:memory` (throwaway in-memory Mongo + one demo user per role, dev only), `bootstrap-admin` (first SUPER_ADMIN, refuses if one exists), `.env.example`.

**Verified, not claimed:** 191 API tests passing (129 new): role-matrix integrity/separation of duties, JWT (expiry, tamper, `alg:none`, wrong secret/audience), the auth service (lockout and recovery, timing-safe generic failures, rotation, reuse detection, concurrent-refresh race, idle/absolute expiry, deactivation, reset flow incl. single-use/expired/superseded/forged-secret), HTTP-level cookie flags/CSRF/CORS/rate limits, an **all 13 roles × every protected endpoint** allow/403 matrix, 401 for missing/expired/tampered/revoked tokens, live permission changes, escalation attempts, and audit content. `pnpm -r typecheck` clean, ERP lint + production build clean. Then a real end-to-end run — API on in-memory Mongo, ERP in Chromium (Playwright) — **27/27 checks**: deep-link → login → return, per-role sidebars, forbidden URL, session restore on reload, no token in web storage, cookie flags, sign-out really revokes, and a `VIEWER` calling the API directly with its own token still gets 403.

Bugs found by running it, not by reading it:
- `@jewellery/types`/`validation` loaded as CommonJS under plain Node, so `export *` re-exports weren't visible as named ESM exports (`tsx` crashed on boot) — invisible to `tsc` and Vitest; fixed with `"type": "module"`.
- The nav-permission edit silently didn't apply once (my regex excluded `Undo2`) and typecheck still passed — caught by re-checking the diff, which is why the E2E asserts on the rendered sidebar rather than trusting compilation.

Not done, deliberately: a real email transport (**password reset cannot complete in production until SES/SMTP is wired via the BullMQ notifications worker** — `UnconfiguredEmailSender` refuses to leak the link), MFA, B2C/B2B customer login UIs, a Settings → Users screen (the API exists), per-branch data scoping, Redis-backed rate limiting and permission caching, and permission enforcement on the mutating inventory/sales/B2B/accounting endpoints (those controllers don't exist yet — each will use the matching `inventory.*`/`sales.*`/`b2b.*`/`accounting.*` permission and add its own audit entry).

## Phase 1 — Backend domain layer (2026-09-20)

**Status: complete.** Domain/data layer only, as scoped — no controllers, no routes, no Express app wired up yet. Broader than the originally-planned Phase 1 (see progress.md's old "Recommended sequence"): pulls forward the data model for identity/org (Users, Roles, Permissions, Companies, Branches), parties (Customers, CustomerGroups, Suppliers), metals/stones (Metal, MetalRate, Stone, StoneInventory), and pricing config (PricingRule, PriceList) that were previously spread across Phases 2 and 4 — the instruction for this phase named all 20 modules explicitly, so they're all real now rather than staged.

Produced:
- **`packages/types`** — pure TypeScript interfaces for every entity below, zero runtime dependency, zero Mongoose. `Id`/`Paise`/`Grams` type aliases, shared `Address`/`StoneDetail` shapes.
- **`packages/validation`** — Zod schemas mirroring every entity (`createXSchema`/`updateXSchema`), including the cross-field business rules that are checkable at the shape level (pricing rule validity, GSTIN format, date ordering, "stoneWeight ≤ grossWeight").
- **`apps/api`** — new Express/Mongoose backend app (Express itself not added yet — genuinely unused this phase). `src/modules/{organization,auth,customers,suppliers,catalog,metals,stones,inventory,pricing}`, each with `*.model.ts` (Mongoose schema + typed model), `*.repository.ts` (data access using the Zod schemas), and a service file where real orchestration logic lives (`user.service.ts` for password hashing, `inventory-item.service.ts` + `inventory-transaction.service.ts` for the ledger, `pricing-rule.validation.ts` for rule resolution).
- **The inventory ledger, for real:** `weight-calculations.ts` (pure `netWeight`/`fineWeight` derivation), `status-transitions.ts` (the full legal-transition graph from business-rules.md §2.5 as one table), `inventory-transaction.service.ts` (`postInventoryTransaction`/`receiveNewInventoryItem` — both run inside a MongoDB session so the `InventoryItem` mutation and its `Transaction`+`InventoryLedger` entries commit or roll back together), and `appendOnlyPlugin` (`shared/append-only.plugin.ts`) enforcing immutability on `InventoryLedger`/`Transaction`/`MetalRate` at the Mongoose layer, not just by convention.
- **Test infrastructure:** Vitest + `mongodb-memory-server` running a real single-node replica set (required for the multi-document sessions above — a standalone in-memory Mongo can't do transactions), with a shared `test/setup.ts` that resets collections between tests.

Real bugs found and fixed via testing, not just claimed:
- The `postInventoryTransaction` line schema originally restricted `quantityDelta`/`weightDelta` to positive-only values, which made it impossible to represent material *leaving* a batch (e.g. `MANUFACTURING_ISSUE` reducing a gold bar's weight) — caught by the BATCH-item test, fixed to accept signed non-zero deltas.
- Two of my own test files had hand-calculation mistakes in the expected fine-weight values (off in the 3rd decimal place after rounding) — caught by actually running the tests rather than trusting the arithmetic, fixed to match `weight-calculations.ts`'s real output.
- Mongoose 8's `SchemaOptions<T, ...>` generic doesn't structurally unify across different model files even via a shared helper (variance in the `Model`/`Document`/`statics` type parameters) — resolved once in `mongoose.helpers.ts` with a documented double-cast rather than fighting it at all 20 call sites.

Verified: `pnpm -r typecheck` clean across all 9 workspace projects (nothing broke in the frontend apps or design system). 62 tests passing across 7 files: weight/fine-weight calculations (`weight-calculations.test.ts`), the full status-transition graph (`status-transitions.test.ts`), pricing rule shape + business-rule validation and priority/specificity resolution (`pricing-rule.validation.test.ts`), append-only enforcement on `InventoryLedger`/`Transaction`/`MetalRate` (`append-only.plugin.test.ts`), the ledger-posting service including an atomic-rollback test for an illegal transition (`inventory-transaction.service.test.ts`), and uniqueness constraints across six collections including a scoped-uniqueness case (branch code unique per company, not globally) (`uniqueness.test.ts`).

Not done, deliberately: controllers/routes/Express wiring (explicitly out of scope this phase), auth middleware/permission enforcement at request time (Role→Permission data model exists, nothing checks it yet since there's no request path), `packages/pricing-engine` itself (PricingRule/PriceList are the config it will read — Phase 2 builds the engine), StoneInventory's status changes aren't ledger-tracked the same way InventoryItem's are (documented gap in data-model.md §5, not an oversight).

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

- [x] **Phase 1 — Backend domain layer.** Done — see the entry above. `packages/types`, `packages/validation`, and `apps/api`'s domain/data layer for all 20 named modules (identity/org, parties, catalog, metals/stones, inventory ledger, pricing config). No controllers/routes/Express wiring yet.
- [ ] **Phase 1.5 — API surface (auth done — Phase 1.5a; catalogue — Phase 1.6; inventory — Phase 1.7).** Remaining: routes/controllers over Phase 1's repositories and services (catalogue, inventory mutations, customers, pricing config), each guarded with `requirePermission` and audited, request validation via `packages/validation`; plus the email transport and Settings → Users screen. Replaces the ERP's `/inventory/*`, `/sales/*`, `/b2b/*` etc. placeholder routes with real screens backed by real data for the first time.
- [ ] **Phase 2 — Pricing engine.** `packages/pricing-engine` (pure calculation functions consuming `PricingRule`/`MetalRate`/`PriceList`, all of which already exist as of Phase 1), `PriceSnapshot`, a `/pricing/preview` API, wired into ERP product/catalogue views for live price display. Heavy unit test investment here (see test-plan.md) before anything depends on it.
- [ ] **Phase 3 — B2C storefront MVP.** `apps/b2c-store`'s shell exists (Phase 0.75) with placeholder catalogue data — this phase wires it to the real Product/Inventory/Pricing APIs (Phase 1.5/2), replaces the client-only cart with real reservation, and builds real checkout (online payment, order confirmation → invoice + shipment stub).
- [ ] **Phase 4 — B2B portal.** `apps/b2b-portal`'s shell exists (Phase 0.75); `Customer`/`CustomerGroup` already exist (Phase 1) — this phase adds `CreditAccount`, negotiated pricing via existing `PricingRule`/`PriceList` scoping, real `PurchaseOrder`-based ordering (replacing the placeholder purchase-list), offline payment mode, and the credit-limit approval workflow.
- [ ] **Phase 5 — Invoicing & payments.** Invoice generation from confirmed orders, Payment + PaymentAllocation, outstanding/overdue reporting for both channels.
- [ ] **Phase 6 — Manufacturing & job work.** ProductionOrder, material issue/receipt, JobWorkOrder + reconciliation workflow, discrepancy review — built on Phase 1's `InventoryLedger`/`postInventoryTransaction` (the movement types already exist: `MANUFACTURING_ISSUE`, `MANUFACTURING_RECEIPT`, `JOB_WORK_ISSUE`, `JOB_WORK_RECEIPT`).
- [ ] **Phase 7 — Compliance.** TaxRule engine (GST/CGST/SGST/IGST resolution), HUID/hallmarking tracking and enforcement (the `InventoryItem.huid`/`hallmarkStatus` fields already exist — this phase adds the enforcement and the `HallmarkingRecord` collection), HSN-driven tax on invoices, compliance reporting.
- [ ] **Phase 8 — Polish & hardening.** Full design-system pass (dark mode ERP, empty/loading/error states everywhere), reporting dashboards, BullMQ notification jobs, performance pass (indexing, load test on reservation concurrency), security review.

Each phase should end with: docs/progress.md updated, docs/architecture.md updated if architecture changed, tests/test-plan.md updated, and a brief summary of what shipped vs. what's deferred.
