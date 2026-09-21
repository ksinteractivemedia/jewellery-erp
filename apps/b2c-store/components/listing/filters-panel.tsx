"use client";

import * as React from "react";
import { Check } from "lucide-react";
import type { StoreFacets } from "@jewellery/types";
import { cn } from "@jewellery/ui";
import type { ListingParams } from "../../lib/listing-params";
import { formatMoney } from "../../lib/money";

type Patch = Partial<Pick<ListingParams, "metal" | "purity" | "category" | "minRupees" | "maxRupees" | "inStock">>;

const chip = (on: boolean) => cn("inline-flex h-10 items-center gap-1.5 border px-4 text-body-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground");

function Group({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-b border-border-subtle py-5">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[0.75rem] font-medium uppercase tracking-[0.16em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        {title}<span className="text-muted" aria-hidden="true"><span className="group-open:hidden">+</span><span className="hidden group-open:inline">−</span></span>
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}

/**
 * The filters, drawn from what is really in the current scope (metals, purities, categories and the live price range come
 * from the API's facets). Price bounds are whole rupees against the LIVE price; pieces priced on request have no price, so a
 * price filter leaves them out — and the panel says so.
 */
export function FiltersPanel({ facets, params, onChange, showCategories }: { facets: StoreFacets; params: ListingParams; onChange: (patch: Patch) => void; showCategories: boolean }) {
  const [min, setMin] = React.useState(params.minRupees?.toString() ?? "");
  const [max, setMax] = React.useState(params.maxRupees?.toString() ?? "");
  React.useEffect(() => { setMin(params.minRupees?.toString() ?? ""); setMax(params.maxRupees?.toString() ?? ""); }, [params.minRupees, params.maxRupees]);
  const apply = () => {
    const n = (s: string) => (/^\d{1,9}$/.test(s.replace(/[,\s]/g, "")) ? Number(s.replace(/[,\s]/g, "")) : undefined);
    onChange({ minRupees: n(min), maxRupees: n(max) });
  };
  const numeric = "h-11 w-full border border-border bg-surface px-3 text-right tabular text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const range = facets.price;

  return (
    <div className="flex flex-col" data-testid="filters">
      {showCategories && facets.categories.length > 1 && (
        <Group title="Category">
          <ul className="flex flex-col gap-1">
            <li><button type="button" className={cn("flex min-h-10 w-full items-center justify-between text-left text-body-sm", !params.category && "font-medium")} onClick={() => onChange({ category: undefined })}>All{!params.category && <Check className="h-4 w-4" aria-hidden="true" />}</button></li>
            {facets.categories.map((c) => (
              <li key={c.slug}>
                <button type="button" className={cn("flex min-h-10 w-full items-center justify-between gap-3 text-left text-body-sm", c.parentSlug && "pl-4 text-muted", params.category === c.slug && "font-medium text-foreground")} onClick={() => onChange({ category: c.slug })} aria-pressed={params.category === c.slug} data-testid={`filter-category-${c.slug}`}>
                  <span>{c.name} <span className="text-caption text-muted">({c.count})</span></span>
                  {params.category === c.slug && <Check className="h-4 w-4" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </Group>
      )}

      {facets.metals.length > 0 && (
        <Group title="Metal">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Metal">
            {facets.metals.map((m) => <button key={m.code} type="button" className={chip(params.metal === m.code)} aria-pressed={params.metal === m.code} onClick={() => onChange({ metal: params.metal === m.code ? undefined : m.code })} data-testid={`filter-metal-${m.code}`}>{m.name}</button>)}
          </div>
        </Group>
      )}

      {facets.purities.length > 0 && (
        <Group title="Purity">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Purity">
            {facets.purities.map((p) => <button key={p} type="button" className={chip(params.purity === p)} aria-pressed={params.purity === p} onClick={() => onChange({ purity: params.purity === p ? undefined : p })} data-testid={`filter-purity-${p}`}>{p}</button>)}
          </div>
        </Group>
      )}

      <Group title="Price">
        <form onSubmit={(e) => { e.preventDefault(); apply(); }} className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <label className="sr-only" htmlFor="price-min">Minimum price in rupees</label>
            <input id="price-min" inputMode="numeric" placeholder={range ? String(Math.floor(range.min / 100)) : "Min"} value={min} onChange={(e) => setMin(e.target.value)} onBlur={apply} className={numeric} data-testid="filter-min" />
            <span className="text-muted" aria-hidden="true">–</span>
            <label className="sr-only" htmlFor="price-max">Maximum price in rupees</label>
            <input id="price-max" inputMode="numeric" placeholder={range ? String(Math.ceil(range.max / 100)) : "Max"} value={max} onChange={(e) => setMax(e.target.value)} onBlur={apply} className={numeric} data-testid="filter-max" />
          </div>
          <button type="submit" className="btn btn-outline btn-sm w-full">Apply price</button>
          <p className="text-caption text-muted">
            {range ? <>Today’s prices run from {formatMoney(range.min)} to {formatMoney(range.max)}. </> : null}
            Prices are live, and pieces priced on request are left out when you filter by price.
          </p>
        </form>
      </Group>

      <Group title="Availability">
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 text-body-sm">
          In stock only
          <input type="checkbox" checked={params.inStock} onChange={(e) => onChange({ inStock: e.target.checked })} className="h-5 w-5 accent-[var(--color-primary)]" data-testid="filter-instock" />
        </label>
      </Group>
    </div>
  );
}
