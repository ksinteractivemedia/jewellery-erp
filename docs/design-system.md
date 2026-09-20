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
- **Data display:** Table + DataTable (sortable, selectable, client-driven — collapses to a stacked-card list below `md` instead of a server-driven mode), Pagination, Card family, Badge, StatusBadge (generic tone+label; InventoryStatusBadge/OrderStatusBadge map the actual enums onto it), MetricCard
- **Navigation:** Tabs, Breadcrumb, PageHeader, SectionHeader, Sidebar + Topbar + ERPLayout + MobileNavigation (ERP/portal shell), FilterBar, DataToolbar, BulkActionBar, DetailPanel
- **Feedback:** Dialog + ConfirmDialog, Drawer (one component, `side="left"|"right"|"bottom"`, built on Radix Dialog rather than a separate sheet library), Toast/Toaster + `toast()` hook, Alert, EmptyState, Skeleton
- **Overlay/utility:** Tooltip

React Hook Form + Zod (`packages/validation`) wiring happens where these are consumed in real forms — that package doesn't exist yet (Phase 1); today's forms in the showcase use local `useState` only.

Each component: one visual style, consumed identically across all three apps (theme-driven differences only, no per-app component forks). Full list in `packages/ui/src/index.ts`.

## 6. States & interaction rules

- **Loading:** Skeleton components matching final layout shape — no spinners-in-a-blank-page for primary content.
- **Empty states:** Always an icon/illustration-light message + a clear next action ("No orders yet — browse the catalogue"), never a bare "No data."
- **Errors:** Inline field errors from Zod validation messages; toast for action-level failures (e.g. "Item no longer available"); a dedicated error boundary/page for unexpected failures.
- **Destructive actions** (cancel order, delete product, write off inventory, close job work with unresolved discrepancy) always go through a confirmation Dialog stating the consequence in plain language.
- **Keyboard:** Command palette in ERP/B2B portal for power users; standard focus order and visible focus rings everywhere (accessibility, not just aesthetics).
- **Motion:** Short (~150–200ms), used for state transitions (hover, open/close, skeleton→content), never decorative looping animation.

## 7. Charts / data visualization

Any chart, KPI tile, or dashboard element follows the project's dataviz conventions (categorical/sequential palette derived from the token set, not arbitrary chart-library defaults) — load the dataviz skill at implementation time rather than inventing chart styling ad hoc here.

## 8. What this doc is not

Not a final visual spec (no Figma-equivalent color values beyond the palette given, no locked font license) — it is the ruleset implementation must follow so that ERP, storefront, and B2B portal are visibly one brand, and so no screen gets designed in isolation with its own one-off styling.
