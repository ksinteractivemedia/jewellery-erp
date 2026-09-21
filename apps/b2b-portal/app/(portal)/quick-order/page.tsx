"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Plus, X } from "lucide-react";
import { toast } from "@jewellery/ui";
import { cartStore, useCart } from "../../../lib/cart";
import { blocking, mergeRows, newRow, parsePaste, readyRows, type Row } from "../../../lib/quick-order";
import { money } from "../../../lib/money";
import { useCartQuote } from "../../../lib/queries";
import { LinePrice, Problems } from "../../../components/lines";
import { CreditWarning, PageHead, TotalsBox } from "../../../components/ui";

const blank = () => Array.from({ length: 6 }, () => newRow());

/**
 * Type SKUs and quantities; the backend prices and checks every row as you go (unknown SKU, not offered, under the minimum,
 * stock, price on request). Nothing here computes a price. File import (CSV/Excel) comes later, on top of this same check.
 */
export default function QuickOrderPage() {
  const router = useRouter();
  useCart();
  const [rows, setRows] = React.useState<Row[]>(blank);
  const [paste, setPaste] = React.useState("");
  const [showPaste, setShowPaste] = React.useState(false);
  const [note, setNote] = React.useState<string>();
  const skuRefs = React.useRef<Map<string, HTMLInputElement>>(new Map());

  const lines = React.useMemo(() => mergeRows(readyRows(rows)), [rows]);
  const [settled, setSettled] = React.useState(lines);
  React.useEffect(() => { const t = setTimeout(() => setSettled(lines), 300); return () => clearTimeout(t); }, [lines]);
  const quote = useCartQuote(settled);
  const q = lines.length ? quote.data : undefined;
  const bySku = new Map(q?.lines.map((l) => [l.sku, l]));

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const addRow = () => { const r = newRow(); setRows((rs) => [...rs, r]); setTimeout(() => skuRefs.current.get(r.key)?.focus(), 30); };
  const applyPaste = () => {
    const { rows: parsed, ignored } = parsePaste(paste);
    if (parsed.length) setRows((rs) => [...rs.filter((r) => r.sku.trim() || r.quantity.trim()), ...parsed, ...blank().slice(0, 2)]);
    setNote(ignored.length ? `Ignored ${ignored.length} line${ignored.length > 1 ? "s" : ""} that didn’t look like “SKU, quantity”: ${ignored.slice(0, 3).join(" · ")}` : parsed.length ? `Added ${parsed.length} row${parsed.length > 1 ? "s" : ""}.` : "Nothing to add.");
    setPaste("");
    setShowPaste(false);
  };
  const toCart = () => {
    for (const l of lines) cartStore.add({ sku: l.sku, quantity: l.quantity });
    toast({ title: "Added to cart", description: `${lines.length} line${lines.length > 1 ? "s" : ""}`, variant: "success" });
    router.push("/cart");
  };
  const clean = !!q && q.canSubmit && lines.length > 0;

  return (
    <>
      <PageHead title="Quick order" sub="Enter SKUs and quantities. We price and check each line as you type." actions={<button className="btn btn-outline" onClick={() => setShowPaste((v) => !v)} data-testid="toggle-paste"><ClipboardPaste className="h-4 w-4" aria-hidden="true" />Paste a list</button>} />
      {showPaste && (
        <div className="card mb-4 flex flex-col gap-2 p-4" data-testid="paste-box">
          <label className="label" htmlFor="paste">One per line: SKU, quantity</label>
          <textarea id="paste" rows={5} className="field h-auto py-2 font-mono text-[0.8125rem]" placeholder={"GLD-EAR-0003, 12\nGLD-PND-0001, 6"} value={paste} onChange={(e) => setPaste(e.target.value)} data-testid="paste-input" />
          <div className="flex gap-2"><button className="btn btn-dark btn-sm" onClick={applyPaste} data-testid="paste-apply">Add rows</button><button className="btn btn-ghost btn-sm" onClick={() => setShowPaste(false)}>Cancel</button></div>
        </div>
      )}
      {note && <p className="mb-3 text-[0.8125rem] text-muted" role="status" data-testid="paste-note">{note}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Order lines">
          <div className="card overflow-x-auto">
            <table className="tbl" data-testid="quick-rows">
              <thead><tr><th style={{ width: "34%" }}>SKU</th><th style={{ width: "12%" }} className="text-right">Qty</th><th>Item</th><th className="text-right">Unit (ex GST)</th><th className="text-right">Line total</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const res = bySku.get(r.sku.trim().toUpperCase());
                  return (
                    <tr key={r.key} data-testid="quick-row" className="align-top">
                      <td><input ref={(el) => { if (el) skuRefs.current.set(r.key, el); }} className="field num uppercase" aria-label={`SKU, row ${i + 1}`} autoComplete="off" spellCheck={false} value={r.sku} onChange={(e) => patch(r.key, { sku: e.target.value })} data-testid="row-sku" /></td>
                      <td><input className="field num text-right" inputMode="numeric" aria-label={`Quantity, row ${i + 1}`} value={r.quantity} onChange={(e) => patch(r.key, { quantity: e.target.value.replace(/\D/g, "") })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); i === rows.length - 1 ? addRow() : skuRefs.current.get(rows[i + 1]!.key)?.focus(); } }} data-testid="row-qty" /></td>
                      <td className="min-w-[12rem]">{res?.item ? <><p className="font-medium" data-testid="row-name">{res.item.name}</p><p className="text-[0.75rem] text-muted">{res.item.metal} {res.item.purity} · {res.item.available} in stock · MOQ {res.item.minOrderQuantity}</p></> : null}{res && <Problems line={res} />}</td>
                      <td className="text-right">{res ? <LinePrice line={res} /> : null}</td>
                      <td className="num text-right font-medium">{res?.lineTotal != null ? money(res.lineTotal) : null}</td>
                      <td><button className="btn btn-ghost h-8 w-8 p-0" aria-label={`Remove row ${i + 1}`} onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [newRow()]))}><X className="h-4 w-4" aria-hidden="true" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="btn btn-ghost btn-sm mt-2" onClick={addRow} data-testid="add-row"><Plus className="h-4 w-4" aria-hidden="true" />Add row</button>
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start" aria-label="Summary">
          <div className="card flex flex-col gap-4 p-4">
            <h2 className="font-semibold">Summary</h2>
            {q ? <TotalsBox taxable={q.totals.taxable} gst={q.totals.gst} total={q.totals.total} complete={q.totals.complete} testId="quick-totals" /> : <p className="text-muted">Add a SKU and quantity to see prices.</p>}
            {q && <CreditWarning check={q.credit} />}
            {q && lines.some((l) => (bySku.get(l.sku) && blocking(bySku.get(l.sku)!))) && <p className="text-[0.8125rem] text-danger" role="alert" data-testid="blocked-note">Fix the lines marked in red to continue.</p>}
            <button className="btn btn-primary h-10" disabled={!clean} onClick={toCart} data-testid="add-all">Add {lines.length || ""} line{lines.length === 1 ? "" : "s"} to cart</button>
            <Link href="/catalogue" className="text-center text-[0.75rem] text-muted hover:text-foreground">Prefer to browse? Open the catalogue</Link>
          </div>
        </aside>
      </div>
    </>
  );
}
