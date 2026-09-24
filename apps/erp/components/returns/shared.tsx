"use client";

import * as React from "react";
import { Badge } from "@jewellery/ui";
import { useInventoryList } from "../../lib/api/inventory-queries";
import { Field, Table, Td, Th, inputCls } from "../shared/kit";

export { Field, Load, Table, Td, Th, btn, inputCls } from "../shared/kit";

export const day = (v: string) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const grams = (g?: number) => (g === undefined ? "—" : `${g.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} g`);

type Variant = "neutral" | "success" | "warning" | "danger" | "info";
const TONES: Record<string, Variant> = {
  REQUESTED: "neutral", APPROVED: "info", REJECTED: "danger", RECEIVED: "warning", INSPECTED: "info", SETTLED: "success", CANCELLED: "neutral",
};
export const Status = ({ s }: { s: string }) => <Badge variant={TONES[s] ?? "neutral"} data-testid="status">{s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</Badge>;

/**
 * Picks whole SOLD pieces — a return/repair always ties to the exact InventoryItem an order sold,
 * never just a SKU. The server is the real check (an item not actually sold on the given order is
 * refused); this only narrows what a person can even click.
 */
export function SoldItemPicker({ selected, onChange, multiple = true }: { selected: string[]; onChange: (ids: string[]) => void; multiple?: boolean }) {
  const [q, setQ] = React.useState("");
  const list = useInventoryList({ status: ["SOLD"], ...(q ? { q } : {}), pageSize: 25, sort: "updatedAt", order: "desc" } as never);
  const items = (list.data as { items?: { id: string; itemCode: string; type: string; grossWeight: number; purity: string; huid?: string; location: { name: string } }[] } | undefined)?.items ?? [];
  const toggle = (id: string) => onChange(multiple ? (selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]) : selected.includes(id) ? [] : [id]);
  return (
    <div className="flex flex-col gap-2" data-testid="sold-item-picker">
      <Field label="Search sold pieces (item code or HUID)"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item code or HUID…" data-testid="item-picker-search" /></Field>
      <Table><thead><tr><Th></Th><Th>Item</Th><Th>Type</Th><Th>Purity</Th><Th right>Gross wt</Th><Th>HUID</Th></tr></thead><tbody>
        {items.map((i) => (
          <tr key={i.id} className="cursor-pointer hover:bg-surface-sunken" onClick={() => toggle(i.id)} data-testid="item-picker-row">
            <Td><input type={multiple ? "checkbox" : "radio"} checked={selected.includes(i.id)} onChange={() => toggle(i.id)} aria-label={`Select ${i.itemCode}`} /></Td>
            <Td className="font-medium tabular">{i.itemCode}</Td>
            <Td>{i.type.replace(/_/g, " ")}</Td>
            <Td>{i.purity}</Td>
            <Td right>{grams(i.grossWeight)}</Td>
            <Td className="font-mono">{i.huid ?? "—"}</Td>
          </tr>
        ))}
        {items.length === 0 && !list.isLoading && <tr><td colSpan={6} className="border-b border-border-subtle px-3 py-2.5 text-body-sm text-muted">No sold piece matches.</td></tr>}
      </tbody></Table>
      {selected.length > 0 && <p className="text-caption text-muted">{selected.length} item{selected.length > 1 ? "s" : ""} selected</p>}
    </div>
  );
}
