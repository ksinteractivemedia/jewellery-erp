"use client";

import * as React from "react";
import { useInventoryList } from "../../lib/api/inventory-queries";
import { Field, Table, Td, Th, grams, inputCls } from "./shared";

/** Picks whole AVAILABLE items to send — nothing here narrows by metal or purity, since any piece can be hallmarked. */
export function ItemPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const [q, setQ] = React.useState("");
  const list = useInventoryList({ status: ["AVAILABLE"], ...(q ? { q } : {}), pageSize: 25, sort: "updatedAt", order: "desc" } as never);
  const items = (list.data as { items?: { id: string; itemCode: string; type: string; grossWeight: number; purity: string; huid?: string; location: { name: string } }[] } | undefined)?.items ?? [];
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const selectedWeight = items.filter((i) => selected.includes(i.id)).reduce((s, i) => s + i.grossWeight, 0);
  return (
    <div className="flex flex-col gap-2" data-testid="item-picker">
      <Field label="Search available stock (item code)"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item code…" data-testid="item-picker-search" /></Field>
      <Table><thead><tr><Th></Th><Th>Item</Th><Th>Type</Th><Th>Purity</Th><Th right>Gross wt</Th><Th>Location</Th></tr></thead><tbody>
        {items.map((i) => (
          <tr key={i.id} className="cursor-pointer hover:bg-surface-sunken" onClick={() => toggle(i.id)} data-testid="item-picker-row">
            <Td><input type="checkbox" checked={selected.includes(i.id)} onChange={() => toggle(i.id)} aria-label={`Select ${i.itemCode}`} /></Td>
            <Td className="font-medium tabular">{i.itemCode}{i.huid && <span className="ml-2 text-caption text-muted">already hallmarked</span>}</Td>
            <Td>{i.type.replace(/_/g, " ")}</Td>
            <Td>{i.purity}</Td>
            <Td right>{grams(i.grossWeight)}</Td>
            <Td>{i.location.name}</Td>
          </tr>
        ))}
        {items.length === 0 && !list.isLoading && <tr><td colSpan={6} className="border-b border-border-subtle px-3 py-2.5 text-body-sm text-muted">No available stock matches.</td></tr>}
      </tbody></Table>
      {selected.length > 0 && <p className="text-caption text-muted">{selected.length} item{selected.length > 1 ? "s" : ""} selected — {grams(selectedWeight)} total</p>}
    </div>
  );
}
