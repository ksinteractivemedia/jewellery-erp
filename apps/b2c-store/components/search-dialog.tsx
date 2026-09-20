"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, SearchInput } from "@jewellery/ui";

const TRENDING = ["Gold bangles", "Diamond rings", "Bridal sets", "Silver anklets"];

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = React.useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] max-w-lg translate-y-0">
        <DialogHeader>
          <DialogTitle>Search</DialogTitle>
        </DialogHeader>
        <SearchInput
          autoFocus
          placeholder="Search for jewellery…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
        />
        <div className="mt-4 flex flex-col gap-2">
          <span className="text-caption font-medium uppercase tracking-wide text-muted">Trending</span>
          <div className="flex flex-wrap gap-2">
            {TRENDING.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setQuery(t)}
                className="rounded-full border border-border px-3 py-1 text-body-sm text-foreground hover:border-primary"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
