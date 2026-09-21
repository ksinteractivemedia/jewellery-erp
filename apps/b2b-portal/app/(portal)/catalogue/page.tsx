"use client";

import * as React from "react";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import type { B2BCatalogueItem } from "@jewellery/types";
import { toast } from "@jewellery/ui";
import { cartStore } from "../../../lib/cart";
import { BASIS_LABEL } from "../../../lib/status";
import { grams, money } from "../../../lib/money";
import { useCatalogue } from "../../../lib/queries";
import { Empty, Failure, Loading, PageHead, TableWrap } from "../../../components/ui";

const SORTS = [["sku", "SKU"], ["name", "Name"], ["price-asc", "Price: low to high"], ["price-desc", "Price: high to low"], ["stock", "Most in stock"]];

function Price({ item }: { item: B2BCatalogueItem }) {
  const p = item.price;
  if (p.status === "ON_REQUEST") return <div data-testid="price-on-request"><p className="font-medium">Price on request</p><p className="text-[0.75rem] text-muted">Add to a PO and we’ll quote it</p></div>;
  return (
    <div data-testid="price">
      <p className="num font-semibold" data-testid="price-taxable">{money(p.unitTaxable)} <span className="text-[0.6875rem] font-normal text-muted">+ GST</span></p>
      <p className="num text-[0.75rem] text-muted">{money(p.unitTotal)} incl. GST</p>
      <span className="text-[0.6875rem] text-muted" title={p.basisName}>{BASIS_LABEL[p.basis]}</span>
    </div>
  );
}
const Stock = ({ n }: { n: number }) => (n > 0 ? <span className="num font-medium text-success" data-testid="stock">{n} in stock</span> : <span className="font-medium text-danger" data-testid="stock">Out of stock</span>);

function AddBox({ item }: { item: B2BCatalogueItem }) {
  const [qty, setQty] = React.useState(String(item.minOrderQuantity));
  const n = Number(qty);
  const valid = Number.isInteger(n) && n >= item.minOrderQuantity;
  return (
    <div className="flex items-center gap-1.5">
      <input aria-label={`Quantity of ${item.sku}`} inputMode="numeric" className="field num w-16 text-right" value={qty} aria-invalid={!valid || undefined} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} data-testid={`qty-${item.sku}`} />
      <button className="btn btn-dark btn-sm" disabled={!valid} title={valid ? undefined : `Minimum ${item.minOrderQuantity}`} onClick={() => { cartStore.add({ sku: item.sku, quantity: n }); toast({ title: "Added to cart", description: `${n} × ${item.sku}`, variant: "success" }); }} data-testid={`add-${item.sku}`}>Add</button>
    </div>
  );
}

function Catalogue() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [text, setText] = React.useState(sp.get("q") ?? "");
  // Never rewrite the URL after the shopper has already navigated elsewhere (a debounced search firing mid-navigation would pull them back).
  const push = (n: URLSearchParams) => { if (window.location.pathname === path) router.replace(`${path}?${n}`); };
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp.toString()); v ? n.set(k, v) : n.delete(k); n.delete("page"); push(n); };
  React.useEffect(() => { const t = setTimeout(() => text !== (sp.get("q") ?? "") && set("q", text), 350); return () => clearTimeout(t); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const qs = new URLSearchParams(sp.toString());
  qs.set("pageSize", "25");
  const q = useCatalogue(qs.toString());
  const d = q.data;
  const page = Number(sp.get("page") ?? 1);
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;
  const go = (p: number) => { const n = new URLSearchParams(sp.toString()); n.set("page", String(p)); push(n); };
  const sel = "field w-auto min-w-[9rem]";

  return (
    <>
      <PageHead title="Catalogue" sub={d ? `${d.total} items offered to you · prices are yours, before GST` : "Prices are yours, before GST"} />
      <div className="mb-4 flex flex-wrap items-center gap-2" role="search" data-testid="filters">
        <div className="relative min-w-[14rem] flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" aria-hidden="true" /><input className="field pl-8" placeholder="Search SKU or name" aria-label="Search" value={text} onChange={(e) => setText(e.target.value)} data-testid="search" /></div>
        <select className={sel} aria-label="Category" value={sp.get("category") ?? ""} onChange={(e) => set("category", e.target.value)} data-testid="f-category"><option value="">All categories</option>{d?.facets.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name} ({c.count})</option>)}</select>
        <select className={sel} aria-label="Metal" value={sp.get("metal") ?? ""} onChange={(e) => set("metal", e.target.value)} data-testid="f-metal"><option value="">All metals</option>{d?.facets.metals.map((m) => <option key={m.code} value={m.code}>{m.name} ({m.count})</option>)}</select>
        <select className={sel} aria-label="Purity" value={sp.get("purity") ?? ""} onChange={(e) => set("purity", e.target.value)} data-testid="f-purity"><option value="">All purities</option>{d?.facets.purities.map((m) => <option key={m.code} value={m.code}>{m.code} ({m.count})</option>)}</select>
        <select className={sel} aria-label="Availability" value={sp.get("availability") ?? ""} onChange={(e) => set("availability", e.target.value)} data-testid="f-availability"><option value="">Any availability</option><option value="in">In stock</option><option value="out">Out of stock</option></select>
        <select className={sel} aria-label="Sort" value={sp.get("sort") ?? "sku"} onChange={(e) => set("sort", e.target.value)} data-testid="f-sort">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        {[...sp.keys()].some((k) => k !== "page") && <button className="btn btn-ghost btn-sm" onClick={() => { setText(""); router.replace(path); }}>Clear</button>}
      </div>

      {q.isError ? <Failure error={q.error} retry={() => q.refetch()} /> : !d ? <Loading rows={8} /> : d.items.length === 0 ? <Empty title="Nothing matches" hint="Try removing a filter." /> : (
        <>
          <div className="hidden md:block"><TableWrap><table className="tbl" data-testid="catalogue">
            <thead><tr><th>SKU</th><th>Item</th><th>Metal</th><th className="text-right">Net wt</th><th>Stock</th><th className="text-right">MOQ</th><th>Your price</th><th>Order</th></tr></thead>
            <tbody>{d.items.map((i) => (
              <tr key={i.sku} data-testid="catalogue-row">
                <td className="num whitespace-nowrap font-medium">{i.sku}</td>
                <td><div className="flex items-center gap-2.5">{i.image ? // eslint-disable-next-line @next/next/no-img-element
                <img src={i.image} alt="" loading="lazy" className="h-10 w-10 rounded object-cover" /> : <span className="h-10 w-10 rounded bg-surface-sunken" />}<div><p className="font-medium">{i.name}</p><p className="text-[0.75rem] text-muted">{[i.category, i.variantLabel && `Size ${i.variantLabel}`, i.hasStones && "Stone set"].filter(Boolean).join(" · ")}</p></div></div></td>
                <td className="whitespace-nowrap">{i.metal} {i.purity}</td>
                <td className="num text-right">{grams(i.netWeight)}</td>
                <td><Stock n={i.available} /></td>
                <td className="num text-right">{i.minOrderQuantity}</td>
                <td><Price item={i} /></td>
                <td><AddBox item={i} /></td>
              </tr>))}</tbody></table></TableWrap></div>
          <ul className="flex flex-col gap-3 md:hidden" data-testid="catalogue-cards">{d.items.map((i) => (
            <li key={i.sku} className="card flex flex-col gap-2 p-3"><div className="flex justify-between gap-3"><div><p className="num text-[0.75rem] font-semibold text-muted">{i.sku}</p><p className="font-medium">{i.name}</p><p className="text-[0.75rem] text-muted">{i.metal} {i.purity} · {grams(i.netWeight)}{i.variantLabel && ` · Size ${i.variantLabel}`}</p></div><Price item={i} /></div><div className="flex items-center justify-between"><span className="text-[0.75rem]"><Stock n={i.available} /> · MOQ {i.minOrderQuantity}</span><AddBox item={i} /></div></li>))}</ul>
          <nav className="mt-4 flex items-center justify-between text-[0.8125rem]" aria-label="Pages">
            <span className="text-muted">Page {page} of {pages}</span>
            <span className="flex gap-2"><button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => go(page - 1)}>Previous</button><button className="btn btn-outline btn-sm" disabled={page >= pages} onClick={() => go(page + 1)} data-testid="next-page">Next</button></span>
          </nav>
        </>
      )}
    </>
  );
}

export default function CataloguePage() {
  return <Suspense fallback={<Loading />}><Catalogue /></Suspense>;
}
