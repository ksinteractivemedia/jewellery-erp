"use client";

import type { B2BLine, B2BResolvedLine } from "@jewellery/types";
import { cn } from "@jewellery/ui";
import { grams, money } from "../lib/money";
import { BASIS_LABEL } from "../lib/status";

export function Problems({ line }: { line: B2BResolvedLine }) {
  if (!line.problems.length) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5" data-testid="line-problems">
      {line.problems.map((p) => <li key={p.code} className={cn("text-[0.75rem]", p.blocking ? "font-medium text-danger" : "text-warning")} data-code={p.code}>{p.message}</li>)}
    </ul>
  );
}

/** The price a resolved line would carry: per unit before GST, GST, and the line total. */
export function LinePrice({ line }: { line: B2BResolvedLine }) {
  const p = line.item?.price;
  if (!p) return <span className="text-muted">—</span>;
  if (p.status === "ON_REQUEST") return <span className="text-warning">On request</span>;
  return <span className="num" title={BASIS_LABEL[p.basis]}>{money(p.unitTaxable)}</span>;
}

/** A frozen document's lines (PO, quotation, order, invoice): what, how many, at what price, and any negotiated concession. */
export function DocLines({ lines, testId = "doc-lines" }: { lines: B2BLine[]; testId?: string }) {
  return (
    <div className="card overflow-x-auto">
      <table className="tbl" data-testid={testId}>
        <thead><tr><th>SKU</th><th>Item</th><th className="text-right">Qty</th><th className="text-right">Unit (ex GST)</th><th className="text-right">GST</th><th className="text-right">Line total</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.sku} data-testid="doc-line">
              <td className="num whitespace-nowrap font-medium">{l.sku}</td>
              <td><p>{l.name}</p>{l.variantLabel && <p className="text-[0.75rem] text-muted">Size {l.variantLabel}</p>}{l.concession && <p className="text-[0.75rem] text-success" data-testid="concession">{l.concession.kind === "PERCENT" ? `${l.concession.value}% off` : `Agreed price ${money(l.concession.value)}`}{l.concession.note ? ` · ${l.concession.note}` : ""}</p>}</td>
              <td className="num text-right">{l.quantity}</td>
              <td className="num text-right">{l.priceOnRequest ? <span className="text-warning">On request</span> : money(l.unitTaxable)}</td>
              <td className="num text-right">{l.priceOnRequest ? "—" : money(l.lineGst)}</td>
              <td className="num text-right font-medium">{l.priceOnRequest ? "—" : money(l.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export { grams };
