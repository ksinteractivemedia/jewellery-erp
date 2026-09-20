# Design System

Status: proposed, pre-implementation. Governs `packages/ui` and the visual language shared by `apps/erp`, `apps/b2c-store`, `apps/b2b-portal`. See prompt-level constraints in [CLAUDE.md](../CLAUDE.md) for the non-negotiables (no generic SaaS look, no purple gradients, etc.).

## 1. Brand foundation

- **Primary accent:** `#FF9900` — used deliberately, as a signal (primary actions, active states, key highlights), never as a dominant fill. Rule of thumb: if more than ~10% of a screen is orange, pull back.
- **Neutrals:** Black, White, warm off-white, charcoal, soft grey — these carry the interface. Orange is the accent on top of a neutral foundation, not a co-equal color.
- All colors defined as **CSS variables / design tokens**, never hardcoded hex in components.

### Token structure (`packages/ui/tokens`)

```css
:root {
  /* brand */
  --color-brand: #FF9900;
  --color-brand-hover: /* darker/lighter step */;
  --color-brand-subtle: /* low-opacity tint, for backgrounds */;

  /* neutrals */
  --color-black: #0A0A0A;
  --color-white: #FFFFFF;
  --color-offwhite: #FAF8F5;   /* warm off-white */
  --color-charcoal: #262421;
  --color-grey-soft: #E7E4DF;

  /* semantic (derived from the above, never raw hex in components) */
  --surface-page, --surface-card, --surface-sunken;
  --border-default, --border-subtle;
  --text-primary, --text-secondary, --text-muted, --text-inverse;
  --status-success, --status-warning, --status-danger, --status-info;
}
```

- `--status-*` colors are separate from `--color-brand` — orange is never overloaded to also mean "warning," which would blur the brand accent's meaning.
- Dark mode (ERP + B2B portal only) redefines the semantic layer under `[data-theme="dark"]`; brand orange stays constant (it's already high-contrast on both black and off-white), neutrals invert.

## 2. Typography

- One premium, distinctive typeface — **not** Inter/Roboto/system-default. Recommend a refined serif or high-contrast sans for display/headings (jewellery = editorial feel) paired with a clean grotesque for UI text/data-density in the ERP.
  - Example pairing to evaluate: a serif like **Fraunces** or **Canela**-alternative for storefront headings, with **Söhne**/**General Sans**-class grotesque for body/UI. Final choice to be confirmed with actual brand assets before locking in — this doc records the *pairing strategy*, not a final license commitment.
- Strong hierarchy: display (storefront hero/product), heading (section titles), body, label/caption, data (tabular figures, monospace-adjacent numerals for ERP tables — use `font-variant-numeric: tabular-nums` so price/weight columns align).
- Type scale is a token (`--font-size-display`, `--font-size-h1`...`--font-size-caption`), not ad hoc `text-lg`/`text-2xl` sprinkled per component.

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

- **Actions:** Button (primary/secondary/ghost/destructive, with loading state), IconButton, DropdownMenu, Command palette (⌘K — search products/customers/orders across ERP)
- **Forms:** Input, Textarea, Select, Combobox, DatePicker, Checkbox, RadioGroup, Switch, form field wrapper with label/error/help text (wired to React Hook Form + Zod from `packages/validation`)
- **Data display:** DataTable (dense mode for ERP, server-side pagination/sort/filter built in), Card, Badge, StatusIndicator (maps inventory/order/invoice statuses to consistent color+label), MetricCard (KPI tiles), Chart primitives (per dataviz conventions — see below)
- **Navigation:** Tabs, Breadcrumbs, Sidebar/nav shell (ERP), top nav (storefront)
- **Feedback:** Dialog, Drawer, Toast, EmptyState, Skeleton (loading), confirmation dialog variant for destructive actions (delete, cancel order, write off inventory)
- **Overlay/utility:** Tooltip, Popover

Each component: documented props, one visual style, consumed identically across all three apps (theme-driven differences only, no per-app component forks).

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
