"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import type { StoreListResult, StoreSort } from "@jewellery/types";
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, cn } from "@jewellery/ui";
import { PAGE_SIZE, clearFilters, hasActiveFilters, parseListingParams, toApiQuery, toSearchString, type ListingParams } from "../../lib/listing-params";
import { formatMoney } from "../../lib/money";
import { useProducts } from "../../lib/queries";
import { ProductCard, ProductGrid } from "../product/product-card";
import { FiltersPanel } from "./filters-panel";
import { Pagination } from "./pagination";

const SORTS: { value: StoreSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "bestselling", label: "Bestselling" },
];

interface Props {
  /** Where filters and pages live, e.g. "/category/rings". */
  basePath: string;
  /** The page's own fixed scope — a category, a collection or a search — which filters narrow but never remove. */
  scope: { category?: string; collection?: string; q?: string };
  initial: StoreListResult;
  /** The params the server rendered `initial` for. */
  initialParams: ListingParams;
  emptyHint?: string;
}

/**
 * The product grid. The server renders the first page (so it is fast and crawlable); from there the shopper's choices live
 * in the URL and the list is re-read from the API with TanStack Query, keeping the old results on screen (dimmed) while the
 * new ones arrive. Every price on it is live.
 */
export function ListingView({ basePath, scope, initial, initialParams, emptyHint }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const params = React.useMemo(() => parseListingParams(Object.fromEntries(search.entries())), [search]);
  const [sheet, setSheet] = React.useState(false);

  const query = toApiQuery(scope, params);
  const initialQuery = toApiQuery(scope, initialParams);
  const result = useProducts(query, { initial: query === initialQuery ? initial : undefined });
  const data = result.data ?? initial;
  const busy = result.isPlaceholderData || result.isFetching;

  const extra = scope.q ? { q: scope.q } : {};
  const push = (next: ListingParams) => router.replace(`${pathname}${toSearchString(next, extra)}`, { scroll: false });
  const change = (patch: Partial<ListingParams>) => push({ ...params, ...patch, page: 1 });
  const pageCount = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const showCategories = !scope.category || data.facets.categories.some((c) => c.parentSlug === scope.category);
  const chips: { key: string; label: string; clear: Partial<ListingParams> }[] = [
    ...(params.category ? [{ key: "category", label: data.facets.categories.find((c) => c.slug === params.category)?.name ?? params.category, clear: { category: undefined } }] : []),
    ...(params.metal ? [{ key: "metal", label: data.facets.metals.find((m) => m.code === params.metal)?.name ?? params.metal, clear: { metal: undefined } }] : []),
    ...(params.purity ? [{ key: "purity", label: params.purity, clear: { purity: undefined } }] : []),
    ...(params.minRupees !== undefined || params.maxRupees !== undefined ? [{ key: "price", label: `${params.minRupees !== undefined ? formatMoney(params.minRupees * 100) : "Any"} – ${params.maxRupees !== undefined ? formatMoney(params.maxRupees * 100) : "any"}`, clear: { minRupees: undefined, maxRupees: undefined } }] : []),
    ...(params.inStock ? [{ key: "stock", label: "In stock", clear: { inStock: false } }] : []),
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-14" data-testid="listing">
      <aside className="hidden lg:block" aria-label="Filters"><div className="sticky top-28"><FiltersPanel facets={data.facets} params={params} onChange={change} showCategories={showCategories} /></div></aside>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="sticky top-16 z-20 -mx-4 flex items-center justify-between gap-3 border-b border-border-subtle bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => setSheet(true)} className="inline-flex h-11 items-center gap-2 border border-border px-4 text-[0.75rem] font-medium uppercase tracking-[0.14em] lg:hidden" data-testid="open-filters">
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />Filter{chips.length > 0 && <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] font-semibold text-[var(--palette-black)]">{chips.length}</span>}
            </button>
            <p className="text-body-sm text-muted" aria-live="polite" data-testid="result-count">{data.total} {data.total === 1 ? "piece" : "pieces"}</p>
          </div>
          <label className="flex items-center gap-2 text-body-sm">
            <span className="hidden text-muted sm:inline">Sort by</span>
            <select value={params.sort} onChange={(e) => change({ sort: e.target.value as StoreSort })} className="h-11 border border-border bg-surface px-3 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Sort by" data-testid="sort">
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Active filters" data-testid="active-filters">
            {chips.map((c) => <button key={c.key} type="button" onClick={() => change(c.clear)} className="inline-flex h-9 items-center gap-2 bg-surface-sunken px-3 text-body-sm hover:bg-border-subtle" aria-label={`Remove filter ${c.label}`}>{c.label}<X className="h-3.5 w-3.5" aria-hidden="true" /></button>)}
            <button type="button" onClick={() => push(clearFilters(params))} className="link-quiet text-body-sm text-muted">Clear all</button>
          </div>
        )}

        {result.isError && !result.data ? (
          <div className="flex flex-col items-center gap-4 border border-dashed border-border py-20 text-center" role="alert"><p className="font-display text-h3">We couldn’t load the pieces</p><button type="button" className="btn btn-outline btn-sm" onClick={() => result.refetch()}>Try again</button></div>
        ) : data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 border border-dashed border-border py-20 text-center" data-testid="listing-empty">
            <p className="font-display text-h3">No pieces match</p>
            <p className="max-w-sm text-body text-muted">{hasActiveFilters(params) ? "Try removing a filter or two." : (emptyHint ?? "There is nothing here yet.")}</p>
            {hasActiveFilters(params) && <button type="button" className="btn btn-outline btn-sm" onClick={() => push(clearFilters(params))}>Clear filters</button>}
          </div>
        ) : (
          <div className={cn("transition-opacity duration-200", busy && "opacity-60")} aria-busy={busy || undefined}>
            <ProductGrid>{data.items.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}</ProductGrid>
          </div>
        )}

        <Pagination page={data.page} pageCount={pageCount} href={(p) => `${basePath}${toSearchString({ ...params, page: p }, extra)}`} />
      </div>

      <Drawer open={sheet} onOpenChange={setSheet}>
        <DrawerContent side="bottom" className="max-h-[88dvh] bg-background" data-testid="filter-sheet">
          <DrawerHeader><DrawerTitle className="font-display text-h3">Filter</DrawerTitle></DrawerHeader>
          <DrawerBody><FiltersPanel facets={data.facets} params={params} onChange={change} showCategories={showCategories} /></DrawerBody>
          <DrawerFooter className="justify-between gap-3 bg-background">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => push(clearFilters(params))} disabled={!hasActiveFilters(params)}>Clear all</button>
            <button type="button" className="btn btn-primary flex-1" onClick={() => setSheet(false)} data-testid="show-results">Show {data.total} {data.total === 1 ? "piece" : "pieces"}</button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
