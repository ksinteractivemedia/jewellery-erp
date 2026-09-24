# UX Audit

Status: **two passes complete** — a general UX pass (2026-09-23, §§ERP/B2B/B2C below) and a dedicated responsive-design pass across 7 breakpoints (2026-09-24, [§Responsive design audit](#responsive-design-audit-2026-09-24)). Both against [design-system.md](./design-system.md), both with prioritized findings and the highest-impact fixes applied. This is not a redesign: every fix below is scoped to what was actually broken or inconsistent, verified against real component code, not a visual overhaul.

**Method.** Each app (`apps/erp`, `apps/b2c-store`, `apps/b2b-portal`) was surveyed by reading every route's page component and every domain component tree, checked line-by-line against the rules in `docs/design-system.md`. No browser-automation tool was available this session (no Playwright, no screenshot tool), so this audit is grounded in source and Tailwind-class inspection rather than rendered screenshots — the same limitation already disclosed for Phase 9/10's own UI work in `docs/progress.md`. Every finding below cites a real file and line; nothing is guessed. `pnpm -r typecheck`, `next lint` (all three apps) and `next build` (all three apps) are clean after the fixes in this pass, and the full API suite (1616 tests) is unaffected.

## Priority key

- **P0** — a real bug (breaks a documented rule outright, e.g. two primary buttons on screen, a broken contrast token, a duplicated component with no shared source) or a systemic pattern repeated across many files. Fixed in this pass.
- **P1** — a real inconsistency worth fixing, scoped to a few files. Fixed in this pass where low-risk; otherwise listed for a follow-up.
- **P2** — a legitimate observation, but low-risk/low-reach or a larger structural change than "fix the highest-impact issues" calls for. Documented, not fixed, so it isn't lost.

---

## ERP (`apps/erp`)

### P0 — Fixed

**1. Eight byte-identical copies of the same table/form/loading primitives.**
`accounting/shared.tsx`, `exchange/shared.tsx`, `purchasing/shared.tsx`, `hallmarking/shared.tsx`, `manufacturing/shared.tsx`, `b2b/shared.tsx`, `repair/shared.tsx`, `returns/shared.tsx` each defined their own `Th`, `Td`, `Table`, `Load`, `Field`, `inputCls`, `btn` — confirmed byte-for-byte identical across all eight files (diffed directly). This is the single most systemic issue found: a spacing or style change to "the ERP's table" or "the ERP's secondary button" required editing eight files identically, and nothing enforced that they stayed in sync.
*Fix:* extracted the seven identical exports into one new `apps/erp/components/shared/kit.tsx`; each module's own `shared.tsx` now re-exports from it and keeps only what's genuinely module-specific (its own `Status` tone map, `day`/`money`/`grams` formatting, and one-off components like `DrCr`, `ReconciliationStrip`, `SoldItemPicker`). Zero behavior change — every consuming view still imports `Th`/`Td`/etc. from its own module's `./shared` exactly as before.

**2. Sixteen bare "Nothing here." empty states instead of the shared `EmptyState` component.**
`accounting/{debit-notes,credit-notes,ledger,receivables}-view.tsx`, `exchange/exchange-view.tsx`, `purchasing/{goods-receipts,purchase-orders}-view.tsx`, `hallmarking/batches-view.tsx`, `manufacturing/{reconciliation,quality-control,production-orders,job-work}-view.tsx`, `b2b/{desk-views,purchase-orders-view}.tsx`, `repair/repair-view.tsx`, `returns/returns-view.tsx` — sixteen sites across fifteen files rendered `<p className="rounded-lg border border-dashed border-border p-10 text-center text-muted">Nothing here.</p>` (or a similarly bare variant) instead of the real `EmptyState` component design-system.md §6 requires ("icon-light message + a clear next action, never a bare 'No data'"). `inventory/adjustments-view.tsx` was already doing this correctly and served as the reference implementation.
*Fix:* replaced all sixteen with `EmptyState`, each given a real icon (reusing the same Lucide icon already assigned to that module in `lib/nav.ts`, for visual consistency with the sidebar) and a description that says what to do next — "create the first one" where that's the real action, "try a different filter" where the empty state is filter-driven rather than genuinely empty, and a positive framing ("Nothing outstanding — every issued invoice has been paid in full") where an empty list is good news, not a gap.

**3. Auth-page links used the raw `text-primary` token, the one place brand orange likely fails contrast.**
`app/(auth)/login/page.tsx:68` and `app/(auth)/forgot-password/page.tsx:36,55` styled links with `text-primary` (`#FF9900`) directly on the white auth background; every other text link in the app correctly uses the darker `text-primary-active` token (confirmed in `dashboard/activity-panel.tsx`, `inventory/stock-list.tsx`, `catalog/collections-manager.tsx`, etc.). `#FF9900` text at typical body-link weight on white is the one contrast combination the design system doesn't explicitly clear (design-system.md §7A only clears black-on-orange for buttons).
*Fix:* changed both files' link `className` from `text-primary` to `text-primary-active`, matching the rest of the app.

### P1 — Fixed

**4. `report-view.tsx` (the reporting module, built this repo's previous phase) hand-rolled a second "secondary button" implementation right next to a real one.**
Line 68 styled a `<Link>` with raw `className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3..."` — a manual reimplementation of exactly what `<Button variant="secondary">` two lines below it already does.
*Fix:* wrapped the same `Link` in `<Button variant="secondary" size="sm" asChild>`, matching the one real component instead of duplicating its styling by hand.

**5. Three places dumped `error instanceof Error ? error.message : "…"` instead of the shared `errorMessage()` helper.**
`catalog/product-detail.tsx:90`, `catalog/edit-product.tsx:25`, `inventory/item-detail.tsx:74` each reimplemented the same fallback `lib/api/queries.ts` already exports as `errorMessage()` — and did it slightly wrong: the local version misses the app's own `ApiError` class (thrown by every failed API call), so a real API error with a useful message could fall through to the generic "Something went wrong" instead of showing it.
*Fix:* all three now call `errorMessage(error)`.

### P2 — Documented, not fixed

**6. Over-carding on detail pages.** `inventory/item-detail.tsx` wraps one record's data across 8 separate bordered `<Card>` sections (Product, Physical item, Weights, Purity & hallmark, Cost & valuation, Location & status, plus a floating action card); `catalog/product-detail.tsx` does the same with 6 cards. Each card pays its own header+padding cost, which works against the ERP's "high density" mandate (design-system.md §3) more than a two-column data sheet with section headings would. Restructuring two large, heavily-tested detail views is a real risk for a UX-only pass with no browser to verify the result against — left for a dedicated follow-up rather than risked here.

**7. Inconsistent top-level page gaps.** `gap-2`/`gap-3`/`gap-4`/`gap-5`/`gap-6` are all used for the equivalent "page flex-col wrapper" role with no documented rule for which density applies where. Cosmetic and low-risk to fix individually, but there's no single correct value to standardize on without a design decision the design-system doc doesn't currently make — noted for whoever makes that call, not silently guessed at here.

**8. Hand-rolled tables in the same 8 modules bypass `DataTable`'s sort/mobile-column-hiding.** The `Table`/`Th`/`Td` primitives consolidated in fix #1 are intentionally *not* `DataTable` — they're a lighter row renderer used where sorting/selection isn't needed. That's a legitimate design choice, but it does mean these tables have no mobile column-hiding story and could overflow on narrow viewports with many columns. Not fixed here: swapping to `DataTable` would change real interaction behavior (sortable headers, selection) across 8 modules, which is a larger change than a UX-polish pass should make without sign-off.

**9. `lib/nav.ts` groups Returns/Exchanges under Sales, Hallmarking as its own top-level group, and Repairs as an ungrouped standalone item**, even though all three are inventory/fulfillment sub-processes. This is an information-architecture question (where does hallmarking "belong"?) rather than a defect — the routes all work correctly (verified: unbuilt destinations render `app/(dashboard)/[...slug]/page.tsx`'s honest "isn't built yet" placeholder, not a 404, contrary to what a first read of `nav.ts` alone would suggest for `/metals/*`/`/stones/*`). Left as a product decision, not a bug fix.

---

## B2B portal (`apps/b2b-portal`)

### P0 — Fixed

**1. Two simultaneous orange primary buttons on the Payments screen — the direct violation of "orange reserved for the ONE primary action on a screen."**
`app/(portal)/payments/page.tsx`: the page header's "Report a payment" button (line 42, `btn btn-primary`) does not change appearance when its own form opens — so once open, it sits on screen at the same time as the form's own `btn btn-primary` "Send to accounts" submit button (line 54). Two orange CTAs visible together, with no way to tell which is "the" primary action.
*Fix:* the header button now demotes to `btn-outline` and relabels to "Close" while the form is open, so exactly one orange button is ever on screen — "Report a payment" when the form is closed, "Send to accounts" when it's open.

### P1 — Fixed

**2. The purchase-orders list page's CTA said "New order" while creating a "purchase order," and the nav item beside it is literally named "Orders" (a different object — sales orders).**
`app/(portal)/purchase-orders/page.tsx:19` — the button read "New order" on the *Purchase Orders* page, routing to `/quick-order`, while every other reference to the object it creates calls it a "purchase order" (`cart/page.tsx:93` "Submit purchase order", the `poNo` field, etc.). Against the separate "Orders" nav item (sales orders, a status the buyer's PO reaches after approval), this is a real source of first-time confusion, not just a style nit.
*Fix:* relabeled the button "New purchase order" — no route or behavior change.

**3. The Invoices empty state was missing the hint every sibling list page has.**
`app/(portal)/invoices/page.tsx:24` — `<Empty title="No invoices here" />` with no `hint`, while every other list on the same nav (purchase orders, orders, quotations) pairs its empty title with a one-line explanation of when the list fills in.
*Fix:* added a hint, filter-aware ("An invoice appears once we've fulfilled and billed an order" when unfiltered, "Try a different filter" otherwise) — matching the pattern already used elsewhere in this same file's sibling `Empty` usages.

### P2 — Documented, not fixed

**4. The portal almost entirely bypasses `packages/ui`.** `grep -rn "from \"@jewellery/ui\""` across `apps/b2b-portal/{app,components}` returns only 4 imports (`cn`, `toast`, `Toaster`, `TooltipProvider`) — every Button, Card, Table, Input, Select, Skeleton, EmptyState, Badge and CartDrawer in the 70+-component shared library is unused, and `app/globals.css` plus `components/ui.tsx`/`shell.tsx` define a full parallel implementation of the same primitives (`.btn`, `.field`, `.card`, `.tbl`, `PageHead`, `Loading`, `Empty`, `TableWrap`, `Pill`/`StatusPill`). This is the headline finding of the B2B survey and, structurally, the most important one in the whole audit. **Deliberately not fixed in this pass**: replatforming a working, 16-route app onto a different component library is a genuine rewrite — the kind of change "do not redesign everything blindly" and "do not introduce new dependencies unless necessary" are both warning against, and it cannot be safely verified without a browser in the loop. The two P0/P1 fixes above were chosen specifically because they're real, isolated defects fixable *within* the portal's existing local system, not reasons to justify the rewrite.

**5. Zero usage of the shared type scale (`text-h1`..`h4`/`text-body*`/`text-caption`) anywhere in the app** — confirmed by a repo-wide grep for those class names (0 matches) against 79 raw `text-[…]` arbitrary-value occurrences. This is systemic (every page, not a handful of files) and is really the typographic face of finding #4: the type scale is wired into `packages/config`'s Tailwind preset, which this app *does* consume, so the classes are available — they were simply never adopted. Fixing it properly means an app-wide pass reconciling every arbitrary size (`text-[0.8125rem]`, `text-[0.6875rem]`, etc.) against the nearest scale step, which risks subtly changing the compact 36px-control density the B2B brief specifically asks for if done hastily. Left for a dedicated pass with visual verification, not attempted blind here.

**6. Missing mobile card fallback on 7 of 8 list tables.** Only `catalogue/page.tsx` implements the documented "cards on phones" pattern (`md:hidden` card list); purchase orders, orders, quotations, invoices, payments, outstanding and the dashboard's recent-orders/due-invoices lists are all a bare `<table>` in `overflow-x-auto` with no narrow-viewport fallback. Real, but building seven bespoke mobile card layouts (each needs its own field selection — a payment card looks nothing like an invoice card) is exactly the "large, unverified change" this pass is scoped to avoid; noted for a follow-up that can actually check the result at 375px.

**7. `.btn-primary` (orange) vs `.btn-dark` (black) are used interchangeably for "primary-ish" actions** with no documented rule for which applies where (`catalogue/page.tsx:37` uses `btn-dark` for a per-row Add; `page.tsx:19` uses `btn-primary` for the page's own primary CTA). Not fixed: picking a rule ("per-row/secondary actions are always dark, the one page-level CTA is always orange") is a real design decision worth getting right rather than a mechanical find-and-replace.

---

## B2C storefront (`apps/b2c-store`)

**Overall: the strongest of the three apps against the design system.** Orange is genuinely sparse (6 files touch `bg/text/border-primary`), `prefers-reduced-motion` is honored globally, loading/empty/error states are handled deliberately almost everywhere, Fraunces is genuinely used for display copy rather than defaulting to Jakarta, and no generic gradient-hero/stock-photo/glassmorphism patterns were found anywhere.

### P0 — Fixed

**1. `CategoryNav`'s image frames were circular (`rounded-full`), the one direct contradiction of "square (unrounded) image frames" found anywhere in the app.**
`components/home/tiles.tsx:33` — every other image frame in the storefront (product gallery, product cards, cart lines, collection tiles) is square/rectangular and unrounded; the homepage's category-navigation avatars were the sole exception, giving that one row of the homepage a generic "circular category icon" look the rest of the site deliberately avoids.
*Fix:* removed `rounded-full`, keeping the same ring/hover treatment on a square frame — consistent with every other image on the site.

### P1 — Fixed

**2. Search-as-you-type used plain "Searching…" text instead of a `Skeleton`, the one loading state in the app that wasn't one.**
`components/layout/search-overlay.tsx:36` — every other async list in the app (cart drawer, cart page, wishlist, checkout, order view) uses `Skeleton` shaped like the content it's replacing; search alone showed bare text.
*Fix:* replaced with three skeleton rows shaped like the real result rows (image + two text lines), matching the pattern used everywhere else.

**3. The payment-confirmation route showed a blank white page during its `Suspense` boundary instead of a matching state.**
`app/checkout/return/page.tsx:10` — `<Suspense fallback={null}>` around `<PaymentReturn/>`, which has its own well-built "Confirming your payment…" spinner state once mounted, but nothing before that on a slow connection.
*Fix:* gave the `Suspense` boundary a fallback matching `PaymentReturn`'s own loading markup exactly, so there's no blank flash — the spinner appears immediately and doesn't change when the real component takes over.

### P2 — Documented, not fixed

**4. Trust content is duplicated in two unrelated layouts.** `TrustList` (`components/product/policies.tsx`, a bordered 2-column list on the PDP) and `TrustStrip` (`components/home/trust-strip.tsx`, a centered 4-icon grid on the homepage) present the same underlying data shape with no shared component or visual relationship — and `TrustStrip`'s own pattern (icon + uppercase label + one line, centered grid) is a generic SaaS trust-badge template, out of step with the rest of the site's editorial restraint. A real finding, but unifying two live, business-authored content blocks into one shared component is a content and layout decision better made with a screenshot in hand than blind — left for a follow-up.

**5. The app-wide `.btn`/`.field` local system technically bypasses `packages/ui`'s `Button`/`Input`/`FormField`, the same class of finding as B2B's #4 above — but with a real justification here that B2B's fork doesn't have.** `packages/ui`'s shared `Button` renders `rounded-md` corners and doesn't guarantee black text on its primary variant — both would violate B2C's own explicit "square frames" and "orange must carry black text" rules if used as-is. The local system correctly forces `rounded-sm` and black text on orange (`globals.css:41-44`). Still a structural duplication worth resolving eventually (ideally by adding a themed variant to the shared `Button` rather than forking it), but not a broken pattern in the way B2B's is — left as an architecture note, not fixed.

**6. Two different input heights/paddings within the same order flow.** `checkout-flow.tsx`'s own `field()` helper builds `h-12` inputs; `checkout/returns-section.tsx:84-93` builds a separate raw `<select>`/`<textarea>` at a different height/padding a few screens later in the same post-purchase flow. Small, localized, and lower-impact than the fixes above — left for a follow-up rather than bundled into this pass.

---

## What's next

The highest-leverage remaining item is B2B's `packages/ui` bypass (finding #4) — not because the local system looks bad (it mostly doesn't), but because every future B2B screen either keeps extending the fork or has to reconcile with it. That's a real project, not a polish pass, and deserves its own scoping and browser-verified execution rather than being folded into this audit.

Short of that, the concrete next steps this document leaves open, roughly in impact order: B2B's missing mobile card fallbacks (§B2B-6), B2B's type-scale adoption (§B2B-5), ERP's over-carded detail pages (§ERP-6), and B2C's duplicated trust content (§B2C-4) — each flagged above with why it wasn't attempted blind in this pass.

---

## Responsive design audit (2026-09-24)

A dedicated pass testing the required widths — **320, 375, 390, 768, 1024, 1280, 1440px** — against the specific surfaces requested: B2C navigation/product grids/PDP/cart/checkout; B2B catalogue/tables/PO/order detail/invoices; ERP sidebar/tables/filters/forms/dashboards/detail drawers.

**Method, same limitation as the general pass.** No browser or screenshot tool was available, so this is a rigorous source-and-Tailwind-breakpoint audit, not a rendered-viewport check — three focused surveys (one per app) read every relevant page and component and reasoned precisely about what each documented breakpoint does at each required width, citing file:line for every claim. This repo has no custom Tailwind `screens` override, so breakpoints are the framework defaults: unprefixed = below 640px (covers 320/375/390), `sm`=640, `md`=768, `lg`=1024, `xl`=1280, `2xl`=1536 — meaning 1440px (a required width with no breakpoint of its own) behaves identically to 1280px unless a component has its own fixed `max-w-[Npx]` container, which was checked for specifically in each app.

`pnpm -r typecheck`, `next lint` and `next build` are clean on all three apps after the fixes below. No new dependencies were introduced. Every fix is additive/corrective CSS (wrap protection, `min-w-0`, width breakpoints, touch-target sizing) — no layout was rebuilt from scratch, per "do not simply shrink desktop layouts."

### Fixed — real overflow/breakage bugs

1. **B2C cart line items could overflow at 320–390px whenever a line's quantity was >1.** `components/cart/cart-view.tsx` — the quantity-stepper-plus-line-total row had no `flex-wrap`; at 320px the available width (≈156px) was less than what the stepper (≈128px) plus a line-total (≈70–90px more) needed together. *Fix:* added `flex-wrap` (and `gap-y-1`) to that row — it now wraps the line-total onto its own line when tight, instead of overflowing.
2. **B2B PO-detail attachment filenames didn't actually truncate and could force page-level horizontal scroll at 320–390px.** `app/(portal)/purchase-orders/[id]/page.tsx:54` — the filename `<button>` had `truncate` but no `min-w-0`; a flex item's default `min-width: auto` means `truncate`'s `white-space: nowrap` never actually kicks in, so a long filename (e.g. "purchase-order-specifications-final-v2.pdf") pushed the whole (non-scrolling) attachments card wider than the viewport. *Fix:* added `min-w-0`, so the filename now genuinely truncates as the code always intended.
3. **ERP reports screen's date-range filter could overflow at 320–390px.** `components/reports/report-view.tsx` — the "From"/"To" date pair was one un-wrappable flex item (two fixed `w-40` inputs ≈340px total) inside `FilterBar`'s `flex flex-wrap` row; at ≈288px of usable width on a phone this single item couldn't shrink or wrap internally. *Fix:* the date-pair wrapper and every filter control (branch/location/customer-type/category/group-by selects) now use the `w-full sm:w-<N>` pattern already used correctly elsewhere in the app (`components/dashboard/filter-bar.tsx`) — full-width and stackable below 640px, fixed-width from `sm:` up.

### Fixed — real design-system violations

4. **B2B's persistent header hid the credit panel entirely below 640px, contradicting design-system.md §7B's "a header that always shows available credit."** `components/shell.tsx:88` — the credit chip was `hidden ... sm:flex`, so on a phone it disappeared from the header and was reachable only by opening the hamburger drawer. *Fix:* added a second, compact amount-only chip (`sm:hidden`, `aria-label="Available credit: …"` carrying the full context screen-reader users need) that's visible at every width below 640px; the existing fuller chip (label + amount) is unchanged at `sm:` and up.
5. **ERP's loading skeleton for the KPI strip didn't match its own loaded layout**, causing a real layout shift on load. `components/dashboard/dashboard-view.tsx:100` — skeleton was `grid-cols-2 lg:grid-cols-6`; the real `KpiStrip` is `grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6` — mismatched at every one of the 7 required widths (e.g. skeleton shows 6-up at 1280/1440 where real content shows 3-up). *Fix:* skeleton grid now matches `KpiStrip`'s exactly, per design-system.md §6 ("Skeleton components matching final layout shape").

### Fixed — layout gaps and touch targets

6. **B2C `ProductGrid` stayed at 2 columns from 320px all the way through 1023px** (`components/product/product-card.tsx`) — a 768px tablet got the same density as a 320px phone. *Fix:* the 3-column step now triggers at `md:` (768px) instead of `lg:` (1024px), so a tablet-width viewport gets a real density step before desktop's 4-column layout at `xl:`.
7. **B2B's catalogue filter bar wrapped into ~6 separate rows at 320–390px** (`app/(portal)/catalogue/page.tsx`) — five `min-w` selects plus a search box in one `flex flex-wrap` row pushed the actual catalogue far below the fold on a phone. *Fix:* a 2-column grid below `sm:` (search spans both columns; the five selects and the Clear button fall into a compact 2-up block) reverts to the original wrapping flex row from `sm:` up — same controls, same order, far less vertical space on a phone.
8. **Several icon-only touch targets were below the 44×44px guideline** (WCAG 2.5.5), specifically on controls that are *only* reachable on mobile/tablet widths (not on B2B, where 36px controls are the app's own stated design intent — design-system.md §7B — and were left alone): ERP's mobile-nav hamburger, notifications-menu trigger, and user-menu trigger (all `packages/ui`/`apps/erp`, previously 36px); B2C's cart-drawer quantity-stepper buttons (36px vs. the full cart page's already-correct 44px); B2C's wishlist heart button (36px, present on every product card). *Fix:* all bumped to 44×44px (`h-11 w-11`), icon size unchanged — more tappable padding, not a visual redesign. B2C's return-request line checkboxes (`components/checkout/returns-section.tsx`) had a clickable row under 20px tall regardless of viewport; given `min-h-11`.
9. **Two shared `packages/ui` overlay components had no wrap/width protection and could overflow a narrow viewport with realistic content**: `bulk-action-bar.tsx` (a floating, centered toolbar with no `flex-wrap` and no `max-w`, used by ERP's bulk-select screens) and `pagination.tsx` (an unwrapped row that, at a large page count, renders up to 7 page-number buttons plus a summary string with no way to shrink). *Fix:* both now wrap (`flex-wrap`) and `bulk-action-bar` additionally caps its own width (`max-w-[calc(100vw-2rem)]`) so it can never exceed the viewport regardless of how many bulk actions a future screen adds. `bulk-action-bar`'s clear button was also 24px — bumped to 32px, a meaningful improvement while staying proportionate to the compact toolbar around it (not stretched to 44px, which would have looked oversized next to a 2.5-line-height chip).

### Verified correct, not touched

Both B2C and ERP came back from their surveys with **most surfaces already correct** — worth recording so a future pass doesn't waste time re-checking them: B2C's nav breakpoint pairing (mobile/desktop chrome flips cleanly at exactly `lg`, no dead zone), PDP's stacked→side-by-side switch (clean single switch at 1024, gallery/sticky-buy-bar/swipe-carousel all correctly paired), checkout's sidebar switch (also a clean single switch at 1024, no squeezed-sidebar state between 640–1024), and `prefers-reduced-motion` handling (global, plus a component-level override on the live-price indicator). ERP's `DataTable` component genuinely implements the documented `md:`-breakpoint table→stacked-card collapse (verified in `stock-list.tsx`, `product-list.tsx`, `ledger-view.tsx`, `report-view.tsx`); its `TrendChart` genuinely implements the "~8 labels wide / ~4 on phone" density rule from design-system.md §7 (not aspirational — real `sm:`/`max-sm:` opacity toggles keyed off point count); its sidebar/mobile-nav pairing has no breakpoint mismatch anywhere in `apps/erp` or the ERP-relevant parts of `packages/ui`; no hover-only (touch-unreachable) action was found in any of the three apps.

### Documented, not fixed — larger or lower-confidence without a browser

- **Systemic: no visual scroll affordance on any horizontally-scrolling table**, in both B2B (`TableWrap`/`.tbl`, 7 of 8 list/detail surfaces) and ERP's hand-rolled `kit.tsx` tables (accounting/b2b/purchasing/manufacturing/hallmarking/repair/returns/exchange). Horizontal scroll itself is explicitly an acceptable mobile pattern per this task's own brief ("horizontal scrolling for complex tables" — not a bug), but nothing signals to a first-time phone user that a table scrolls at all; they may believe a column (e.g. Status/Balance) is simply missing. A robust fix (an edge fade/shadow keyed to actual scroll position) needs pixel-level verification this session can't do — left as a follow-up rather than risked blind.
- **B2B: only `catalogue/page.tsx` implements the documented "cards on phones, table on desktop" pattern** (design-system.md §7B); the other 7 list/detail surfaces (purchase orders, orders, quotations, invoices, payments, outstanding, dashboard) are table-only with horizontal scroll as their sole mobile treatment. Already flagged as a larger, deliberately-not-attempted item in the general pass (§B2B-6) — the responsive pass confirms the same gap from the breakpoint angle and doesn't change the earlier call: building 7 bespoke mobile card layouts is a real project, not a fix folded into an audit pass.
- **ERP's sidebar has no tablet-specific treatment**: it's fully hidden below `md` (768px) and a permanent, non-collapsible 240px panel from `md` up — so a 768px iPad-portrait viewport gives the sidebar 31% of the screen width versus 23% at desktop widths, with no icon-only/collapsed intermediate state. Not unsafe (240px never overflows), but a real product decision about whether ERP is meant to be used on a tablet at all — left for whoever owns that call rather than guessed at here.
- **ERP's `ledger-view.tsx` doesn't use the `FilterDrawer` bottom-sheet pattern that `stock-list.tsx`/`product-list.tsx` already use correctly** — its filter bar renders unconditionally (full-width stacked controls at mobile widths, not crushed, just always taking vertical space above the table). Fixing this means adding real drawer-open state to a screen that doesn't have it today; a legitimate improvement, but a behavioral change beyond what a CSS/breakpoint pass should make without sign-off.
- **B2B's `.btn`/`.field` parallel design system and near-zero type-scale adoption** (already the headline finding of the general pass, §B2B-4/5) are the reason several of B2B's responsive fixes above had to be done in the app's own local idiom (`.btn-outline`, grid/flex Tailwind classes) rather than via a shared, responsive-aware component — the same structural debt, seen again from the responsive angle.
