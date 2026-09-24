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
  INTAKE: "neutral", INSPECTED: "info", ESTIMATED: "info", APPROVED: "info", DECLINED: "danger",
  IN_PROGRESS: "warning", QC_PENDING: "warning", QC_FAILED: "danger", READY: "success", DELIVERED: "success", CANCELLED: "neutral",
};
export const Status = ({ s }: { s: string }) => <Badge variant={TONES[s] ?? "neutral"} data-testid="status">{s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</Badge>;

/** Picks one SOLD piece — a repair against an existing item only ever applies to a piece already sold to this customer. */
export function SoldItemPicker({ selected, onChange }: { selected: string; onChange: (id: string) => void }) {
  const [q, setQ] = React.useState("");
  const list = useInventoryList({ status: ["SOLD"], ...(q ? { q } : {}), pageSize: 25, sort: "updatedAt", order: "desc" } as never);
  const items = (list.data as { items?: { id: string; itemCode: string; type: string; grossWeight: number; purity: string; huid?: string }[] } | undefined)?.items ?? [];
  return (
    <div className="flex flex-col gap-2" data-testid="sold-item-picker">
      <Field label="Search sold pieces (item code or HUID)"><input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item code or HUID…" data-testid="item-picker-search" /></Field>
      <Table><thead><tr><Th></Th><Th>Item</Th><Th>Purity</Th><Th right>Gross wt</Th><Th>HUID</Th></tr></thead><tbody>
        {items.map((i) => (
          <tr key={i.id} className="cursor-pointer hover:bg-surface-sunken" onClick={() => onChange(i.id)} data-testid="item-picker-row">
            <Td><input type="radio" checked={selected === i.id} onChange={() => onChange(i.id)} aria-label={`Select ${i.itemCode}`} /></Td>
            <Td className="font-medium tabular">{i.itemCode}</Td>
            <Td>{i.purity}</Td>
            <Td right>{grams(i.grossWeight)}</Td>
            <Td className="font-mono">{i.huid ?? "—"}</Td>
          </tr>
        ))}
        {items.length === 0 && !list.isLoading && <tr><td colSpan={5} className="border-b border-border-subtle px-3 py-2.5 text-body-sm text-muted">No sold piece matches.</td></tr>}
      </tbody></Table>
    </div>
  );
}
