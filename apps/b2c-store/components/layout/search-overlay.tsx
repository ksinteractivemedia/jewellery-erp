"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, Skeleton } from "@jewellery/ui";
import { useSuggestions } from "../../lib/queries";
import { ProgressiveImage } from "../ui/progressive-image";
import { PriceTag } from "../product/price";

/** Search as you type: a few real matches with their live prices, and Enter for the full results. */
export function SearchOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => { const t = setTimeout(() => setDebounced(text), 250); return () => clearTimeout(t); }, [text]);
  React.useEffect(() => { if (!open) setText(""); }, [open]);
  const results = useSuggestions(debounced);
  const items = results.data?.items ?? [];
  const go = (e: React.FormEvent) => { e.preventDefault(); if (text.trim()) { onOpenChange(false); router.push(`/search?q=${encodeURIComponent(text.trim())}`); } };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="top-0 max-h-[100dvh] w-full max-w-none translate-y-0 overflow-y-auto rounded-none border-0 p-0 sm:top-[8vh] sm:max-h-[84vh] sm:max-w-2xl sm:-translate-y-0 sm:rounded-sm" data-testid="search-overlay">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <form onSubmit={go} role="search" className="flex items-center gap-3 border-b border-border px-5">
          <Search className="h-5 w-5 text-muted" aria-hidden="true" />
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Search rings, necklaces, gold coins…" aria-label="Search jewellery" className="h-16 flex-1 bg-transparent font-display text-h4 outline-none placeholder:text-muted/60" data-testid="search-input" />
          <button type="button" onClick={() => onOpenChange(false)} className="text-[0.75rem] font-medium uppercase tracking-[0.14em] text-muted hover:text-foreground">Close</button>
        </form>
        <div className="p-5" aria-live="polite">
          {debounced.trim().length < 2 ? (
            <p className="py-8 text-center text-body text-muted">Type at least two letters to see pieces.</p>
          ) : results.isPending ? (
            <ul className="flex flex-col divide-y divide-border-subtle" aria-label="Searching…">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-4 py-3">
                  <Skeleton className="h-16 w-16 shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></div>
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-body text-muted" data-testid="search-empty">Nothing matches “{debounced}”. Try a metal, a category or a collection name.</p>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-border-subtle" data-testid="search-results">
                {items.map((p) => (
                  <li key={p.id}>
                    <Link href={`/product/${p.slug}`} onClick={() => onOpenChange(false)} className="flex items-center gap-4 py-3 hover:bg-surface-sunken/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <ProgressiveImage src={p.image?.url} alt={p.image?.alt ?? p.name} ratio="aspect-square" className="w-16 shrink-0" />
                      <div className="flex min-w-0 flex-1 flex-col gap-1"><span className="truncate font-display text-h4">{p.name}</span><span className="text-caption text-muted">{[p.metal?.name, p.purity].filter(Boolean).join(" · ")}</span></div>
                      <PriceTag price={p.price} size="sm" showLive={false} className="shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href={`/search?q=${encodeURIComponent(debounced.trim())}`} onClick={() => onOpenChange(false)} className="mt-4 flex items-center justify-between border-t border-border-subtle pt-4 text-[0.8125rem] font-medium uppercase tracking-[0.12em]">
                See all {results.data!.total} result{results.data!.total === 1 ? "" : "s"}<ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
