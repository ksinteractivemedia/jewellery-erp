"use client";

import * as React from "react";
import { X } from "lucide-react";
import type { InventoryListItem } from "@jewellery/types";
import { Checkbox, ScanInput, SearchInput, Skeleton, formatWeight, toast } from "@jewellery/ui";
import { inventoryApi } from "../../lib/api/inventory";
import { useInventoryList } from "../../lib/api/inventory-queries";

/**
 * Choose pieces by searching or scanning. `locationId`/`status` narrow what can be offered (a transfer
 * only offers AVAILABLE pieces at its source) — a convenience; the API re-checks every piece.
 */
export function ItemPicker({
  selected,
  onChange,
  locationId,
  status,
  single,
}: {
  selected: InventoryListItem[];
  onChange: (items: InventoryListItem[]) => void;
  locationId?: string;
  status?: string;
  single?: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const list = useInventoryList({ q: debounced || undefined, locationId, status: status as never, page: 1, pageSize: 8, sort: "itemCode", order: "asc" });
  const has = (id: string) => selected.some((s) => s.id === id);
  const toggle = (item: InventoryListItem) => onChange(single ? (has(item.id) ? [] : [item]) : has(item.id) ? selected.filter((s) => s.id !== item.id) : [...selected, item]);

  const scan = async (code: string) => {
    try {
      const res = await inventoryApi.scan(code);
      if (!res.item) return toast({ title: "No piece found", description: `Nothing matches “${res.code}”.`, variant: "danger" });
      if (locationId && res.item.location.id !== locationId) return toast({ title: "Not at this location", description: `${res.item.itemCode} is at ${res.item.location.name}.`, variant: "danger" });
      if (status && !status.split(",").includes(res.item.status)) return toast({ title: "Not eligible", description: `${res.item.itemCode} is ${res.item.status.toLowerCase().replace(/_/g, " ")}.`, variant: "danger" });
      if (!has(res.item.id)) onChange(single ? [res.item] : [...selected, res.item]);
    } catch (e) {
      toast({ title: "Scan failed", description: e instanceof Error ? e.message : "Try again", variant: "danger" });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <div className="min-w-[12rem] flex-1"><SearchInput aria-label="Find pieces" placeholder="Search code, HUID, SKU, name…" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} /></div>
        <div className="w-40"><ScanInput aria-label="Scan to add" placeholder="Scan to add" onScan={scan} /></div>
      </div>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected pieces">
          {selected.map((s) => (
            <li key={s.id} className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-caption">
              {s.itemCode}
              <button type="button" aria-label={`Remove ${s.itemCode}`} onClick={() => toggle(s)} className="text-muted hover:text-danger"><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ul>
      )}
      <ul className="flex max-h-60 flex-col divide-y divide-border-subtle overflow-y-auto rounded-md border border-border" aria-label="Matching pieces">
        {list.isLoading ? <li className="p-2"><Skeleton className="h-8" /></li> : (list.data?.items ?? []).length === 0 ? <li className="p-3 text-body-sm text-muted">No matching pieces.</li> : (list.data?.items ?? []).map((i) => (
          <li key={i.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-sunken">
              <Checkbox checked={has(i.id)} onCheckedChange={() => toggle(i)} aria-label={`Select ${i.itemCode}`} />
              <span className="flex min-w-0 flex-1 flex-col"><span className="font-mono text-body-sm">{i.itemCode}</span><span className="truncate text-caption text-muted">{i.product?.name ?? "No product"} · {i.purity} · {formatWeight(i.grossWeight)} · {i.location.name}</span></span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
