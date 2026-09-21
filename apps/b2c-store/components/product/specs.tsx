import type { StoreProductDetail } from "@jewellery/types";
import { formatGrams } from "../../lib/money";

/** Facts about the piece, straight from the catalogue. A row appears only if there is a value for it — no dashes, no guesses. */
export function Specs({ product }: { product: StoreProductDetail }) {
  const { specs } = product;
  const rows: [string, React.ReactNode][] = [
    ...(product.metal ? [["Metal", product.metal.name] as [string, string]] : []),
    ...(product.purity ? [["Purity", product.purity] as [string, string]] : []),
    ...(specs.grossWeight !== undefined ? [["Gross weight", formatGrams(specs.grossWeight)] as [string, string]] : []),
    ...(specs.netWeight !== undefined ? [["Net metal weight", formatGrams(specs.netWeight)] as [string, string]] : []),
    ...(specs.stoneWeight !== undefined ? [["Stone weight", formatGrams(specs.stoneWeight)] as [string, string]] : []),
    ["SKU", product.sku],
  ];
  return (
    <div className="flex flex-col gap-8" data-testid="specs">
      <dl className="grid gap-x-10 gap-y-0 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-6 border-b border-border-subtle py-3.5"><dt className="text-body-sm text-muted">{k}</dt><dd className="tabular text-body-sm text-foreground">{v}</dd></div>
        ))}
      </dl>
      {specs.stones.length > 0 && (
        <div className="flex flex-col gap-3" data-testid="stones">
          <h3 className="eyebrow text-foreground">Stones</h3>
          <ul className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
            {specs.stones.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3.5">
                <span className="text-body text-foreground">{s.name}</span>
                <span className="text-body-sm text-muted">{s.quantity} × {s.caratWeight} ct{s.quality ? ` · ${s.quality}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
