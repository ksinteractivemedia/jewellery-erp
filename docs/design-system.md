# Design System

Status: **implemented** (Phase 0.5 — see [progress.md](./progress.md)). Governs `packages/ui` and the visual language shared by `apps/erp`, `apps/b2c-store`, `apps/b2b-portal`. See prompt-level constraints in [CLAUDE.md](../CLAUDE.md) for the non-negotiables (no generic SaaS look, no purple gradients, etc.). Live preview: `apps/erp` → `/showcase`, `/showcase/storefront`, `/showcase/erp-shell`.

## 1. Brand foundation

- **Primary accent:** `#FF9900` — used deliberately, as a signal (primary actions, active states, key highlights), never as a dominant fill. Rule of thumb: if more than ~10% of a screen is orange, pull back.
- **Neutrals:** Black, White, warm off-white, charcoal, soft grey — these carry the interface. Orange is the accent on top of a neutral foundation, not a co-equal color.
- All colors defined as **CSS variables / design tokens**, never hardcoded hex in components.

### Token structure (`packages/ui/src/styles/tokens.css`)

Implemented as: a private raw palette (`--palette-orange` `#FF9900`, `--palette-black` `#111111`, `--palette-charcoal` `#1A1A1A`, `--palette-white`, `--palette-offwhite` `#F7F5F2`, `--palette-cream` `#EFECE7`, `--palette-grey` `#6B6B6B`, `--palette-grey-soft` `#D9D5CE`) plus the semantic layer components actually consume, wired into Tailwind via `packages/config/tailwind-preset.cjs`:

```css
--color-background        --color-surface        --color-surface-elevated
--color-surface-sunken     --color-foreground      --color-muted
--color-border             --color-border-subtle   --color-ring

--color-primary --color-primary-hover --color-primary-active
--color-primary-foreground --color-primary-subtle

--color-success / -foreground / -subtle
--color-warning / -foreground / -subtle
--color-danger  / -foreground / -subtle
--color-info    / -foreground / -subtle

--radius-sm --radius-md --radius-lg --radius-full
--shadow-sm --shadow-md --shadow-lg
--font-display --font-sans
```

- Status colors (`success`/`warning`/`danger`/`info`) are fully separate from `--color-primary` — orange is never reused to mean "warning." `InventoryStatusBadge`/`OrderStatusBadge` deliberately map states like `RESERVED` to `info`, not `primary`, so the brand accent stays exclusive to actual brand/primary actions.
- Dark mode redefines the semantic layer two ways: automatically under `@media (prefers-color-scheme: dark)` (guarded by `:root:not([data-theme="light"])`), and via an explicit `:root[data-theme="dark"]` override for a manual toggle (see the `/showcase` theme switcher). Brand orange stays constant; neutrals and subtle-tint backgrounds invert. Verified working in both apps/erp and the storefront preview.

## 2. Typography

- **Fraunces** (display/editorial — hero copy, page titles, product names, collection headings) paired with **Plus Jakarta Sans** (UI text, body copy, dense ERP data) — both loaded via `next/font/google` in `apps/erp/app/layout.tsx` as `--font-display`/`--font-sans`, self-hosted (no runtime Google Fonts request). Neither is Inter/Roboto/system-default. Revisit only if real brand/licensed type assets are supplied later.
- Strong hierarchy, implemented as Tailwind font-size utilities in `packages/config/tailwind-preset.cjs`: `text-display-lg`, `text-display`, `text-h1`…`text-h4`, `text-body-lg`, `text-body`, `text-body-sm`, `text-caption`, `text-data`. Tabular figures via the `.tabular` utility class (`font-variant-numeric: tabular-nums`) — used on every currency/weight value so table columns align.
- Type scale is defined once in the shared Tailwind preset, not ad hoc `text-lg`/`text-2xl` sprinkled per component.

## 3. Two products, one identity

| | B2C storefront | ERP | B2B portal |
|---|---|---|---|
| Feel | Editorial, luxury, spacious | Operational, data-dense, fast | Operational, but merchandised (browsing a catalogue, not just managing one) |
| Density | Low — let the jewellery breathe | High — dense tables, compact rows | Medium |
| Theme | Light only | Light + dark | Light + dark |
| Motion | Slightly more (image transitions, hover reveals) | Minimal, functional only | Minimal |

They share: the token set, the type pairing, the component API (a `Button` is the same component everywhere, themed differently), spacing scale, and iconography (Lucide throughout — no mixing icon sets).

## 4. Spacing, radius, elevation

- 4px base spacing scale (4/8/12/16/24/32/48/64...), exposed as tokens, not raw Tailwind spacing typed inline everywhere — Tailwind config pulls from the same scale so `p-4` etc. stay meaningful.
- Radius: restrained. Small-to-medium radius on inputs/buttons/cards (think 6–10px), not the "everything is a huge rounded blob" look explicitly called out to avoid. Sharper corners read as more premium/enterprise here than heavy rounding.
- Shadows: subtle, functional (lift a dropdown/dialog off the page), never decorative glow. Prefer a 1px border + very soft shadow over a heavy drop shadow.
- No glassmorphism.

## 5. Component inventory (`packages/ui`)

Built on shadcn/ui primitives (Radix underneath), restyled to tokens above — not used off-the-shelf with default styling.

- **Actions:** Button (primary/secondary/ghost/destructive/link variants, loading state, `size="icon"` in place of a separate IconButton), DropdownMenu, CommandPalette (⌘K)
- **Forms:** Input, Textarea, Select, Combobox, SearchInput, DatePicker, CurrencyInput, WeightInput, PercentageInput, Checkbox, Label, FormField (label/error/hint wrapper), FormSection
- **Charts & dashboard primitives:** TrendChart (stacked columns over time), BarList (ranked bars with the figure printed beside each), SplitBar (a bar cut into shares, legend as text), Meter (a bounded gauge) — dependency-free, see §7
- **Data display:** Table + DataTable (sortable, selectable, client-driven — collapses to a stacked-card list below `md` instead of a server-driven mode), Pagination, Card family, Badge, StatusBadge (generic tone+label; InventoryStatusBadge/OrderStatusBadge map the actual enums onto it), MetricCard
- **Navigation:** Tabs, Breadcrumb, PageHeader, SectionHeader, Sidebar + Topbar + ERPLayout + MobileNavigation (ERP/portal shell), FilterBar, DataToolbar, BulkActionBar, DetailPanel
- **Feedback:** Dialog + ConfirmDialog, Drawer (one component, `side="left"|"right"|"bottom"`, built on Radix Dialog rather than a separate sheet library), Toast/Toaster + `toast()` hook, Alert, EmptyState, Skeleton
- **Overlay/utility:** Tooltip
- **Storefront:** StoreHeader/StoreFooter, AnnouncementBar, ProductCard/Grid/Gallery, ProductPrice(+Breakdown), CollectionHero, FilterDrawer, CartDrawer, WishlistButton, TrustBadge, ReviewSummary, CheckoutSummary — `CartDrawer` takes optional `title`/`checkoutLabel`/`emptyTitle`/`emptyDescription` overrides specifically so the B2B portal reuses the exact same component as a "purchase list" instead of forking a near-duplicate drawer (see progress.md, Phase 0.75).

React Hook Form + Zod (`packages/validation`) wiring happens where these are consumed in real forms — that package doesn't exist yet (Phase 1); today's forms use local `useState` only.

Each component: one visual style, consumed identically across all three apps (theme-driven differences only, no per-app component forks). Full list in `packages/ui/src/index.ts`.

**Server/Client boundary rule (important for anyone adding a component):** any component that calls a React hook itself, or attaches an event handler to a raw host element it renders (not merely forwarding to an already-`"use client"` Radix primitive), must have `"use client"` at its own top — regardless of whether today's callers happen to be Client Components. ERP pages are Server Components by default; several Phase 0.5 components only surfaced this gap once Phase 0.75 rendered them from real server-rendered pages. See progress.md, Phase 0.75, for the full list of components this applied to and the one exception that matters: a Server Component still cannot pass a column-defs-with-render-functions prop to a Client Component like `DataTable` — that always needs a small local Client Component wrapper at the call site (e.g. `apps/erp/components/catalog/product-list.tsx` around its columns).

## 6. States & interaction rules

- **Loading:** Skeleton components matching final layout shape — no spinners-in-a-blank-page for primary content.
- **Empty states:** Always an icon/illustration-light message + a clear next action ("No orders yet — browse the catalogue"), never a bare "No data."
- **Errors:** Inline field errors from Zod validation messages; toast for action-level failures (e.g. "Item no longer available"); a dedicated error boundary/page for unexpected failures.
- **Destructive actions** (cancel order, delete product, write off inventory, close job work with unresolved discrepancy) always go through a confirmation Dialog stating the consequence in plain language.
- **Keyboard:** Command palette in ERP/B2B portal for power users; standard focus order and visible focus rings everywhere (accessibility, not just aesthetics).
- **Motion:** Short (~150–200ms), used for state transitions (hover, open/close, skeleton→content), never decorative looping animation.

## 7. Charts / data visualization

Implemented for the ERP dashboard (`packages/ui`: `TrendChart`, `BarList`, `SplitBar`, `Meter`). They are plain HTML/CSS rather than a charting library: crisp at any width, no measuring, nothing to bundle, and easy to make accessible.

- **The number is always text.** A bar only adds shape; the figure is printed beside it. `TrendChart` columns are focusable buttons whose accessible name carries the exact values (`"Tue, 1 Sept: B2C ₹1,73,400, B2B ₹0"`), so keyboard and screen-reader users get the data, and a tooltip shows on hover *and* focus. `BarList` is a real `<ul>`; `Meter` is `role="meter"`.
- **Palette from tokens, not chart defaults.** Two categorical series use `--color-primary` (B2C) and `--color-info` (B2B); rankings and stock breakdowns use a calm neutral or `info`. The brand orange stays a signal — never the fill of a large area.
- **Zero is drawn, not omitted.** A quiet day is a zero-height column (the API zero-fills the series) so the shape of time is honest; an axis maximum is rounded to 1/2/2.5/5 × 10ⁿ so gridlines land on round numbers.
- **Density adapts:** at most ~8 x-axis labels on a wide chart, ~4 on a phone (labels never collide); daily columns up to 45 days, weekly beyond.
- **A KPI tile carries one number**, its change against the previous period (colour follows direction only), and one short caption. It has four states besides "ok": loading (skeleton), *not connected yet* (a dash and the reason — never a zero), *restricted* (a lock, for a figure the caller may not see), and *sample* (a quiet "Sample" marker; the banner and section headers carry the full label).
- **Prefer a section that says what it covers**: each dashboard card's caption is either the date range it applied or "Current position" for a snapshot, so a filter that doesn't reach a section is never silent.

## 7A. Storefront language (`apps/b2c-store`)

The storefront is the same brand as the ERP but deliberately does **not** look like it: editorial and quiet, generous whitespace, the Fraunces display face for headings and a wide-tracked uppercase for small labels, square (unrounded) image frames, hairline rules, warm neutrals with black and white doing the work.
- **Orange is a signal.** `#FF9900` marks primary CTAs (Add to bag), the bag count and small accents. **Text on it is black** (white on `#FF9900` fails contrast); it is never a large fill.
- **A live price is labelled.** Prices that come from a moving metal rate carry a "Live price" mark and a one-line explanation; the breakdown is a native `<details>` so it works without JavaScript. "Price on request" replaces the price and the buy buttons — never a placeholder number.
- **Images load progressively:** a tinted placeholder, a short fade-in on load, a monogram fallback on failure, `loading="lazy"` except the first image. Motion is limited to fades, small translations and a slow image scale on hover, and is switched off under `prefers-reduced-motion`.
- **Mobile first:** phone header with menu + search left and wishlist + bag right around a centred wordmark; swipeable scroll-snap gallery with a counter; filter sheet that reports the live result count; a sticky bottom buy bar that appears only once the real buttons scroll away.

## 8. What this doc is not

Not a final visual spec (no Figma-equivalent color values beyond the palette given, no locked font license) — it is the ruleset implementation must follow so that ERP, storefront, and B2B portal are visibly one brand, and so no screen gets designed in isolation with its own one-off styling.
