import Link from "next/link";
import type { StoreCheckoutLine, StoreCheckoutTotals, StoreOrderItem } from "@jewellery/types";
import { formatGrams, formatMoney } from "../../lib/money";
import { PriceTag } from "../product/price";
import { ProgressiveImage } from "../ui/progressive-image";

type Row = { key: string; name: string; image?: { url: string; alt: string }; sub: string[]; right: React.ReactNode };

function List({ rows }: { rows: Row[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border-subtle">
      {rows.map((r) => (
        <li key={r.key} className="flex gap-4 py-4 first:pt-0">
          <div className="w-16 shrink-0"><ProgressiveImage src={r.image?.url} alt={r.image?.alt ?? r.name} ratio="aspect-[4/5]" /></div>
          <div className="flex min-w-0 flex-1 flex-col gap-1"><span className="font-display text-body leading-snug">{r.name}</span><span className="text-caption text-muted">{r.sub.join(" · ")}</span></div>
          <div className="shrink-0 text-right">{r.right}</div>
        </li>
      ))}
    </ul>
  );
}

/** Lines as the backend priced them just now (before an order exists). */
export function VerifiedLines({ lines }: { lines: StoreCheckoutLine[] }) {
  return (
    <List
      rows={lines.map((l) => ({
        key: `${l.slug}::${l.variantSku ?? ""}`,
        name: l.name,
        ...(l.image ? { image: l.image } : {}),
        sub: [l.variantLabel && `Size ${l.variantLabel}`, `Qty ${l.quantity}`].filter(Boolean) as string[],
        right: <PriceTag price={l.unitPrice} size="sm" showLive={false} />,
      }))}
    />
  );
}

/** Lines as they were frozen when the order was placed: the price then, and what it was built from. */
export function OrderLines({ items }: { items: StoreOrderItem[] }) {
  return (
    <List
      rows={items.map((i) => ({
        key: `${i.slug}::${i.variantSku ?? ""}`,
        name: i.name,
        ...(i.image ? { image: i.image } : {}),
        sub: [i.variantLabel && `Size ${i.variantLabel}`, `Qty ${i.quantity}`, `${i.pricedWith.purity} ${i.pricedWith.metalName}, ${formatGrams(i.pricedWith.netWeight)} at ${formatMoney(i.pricedWith.ratePerGram)}/g`].filter(Boolean) as string[],
        right: <span className="tabular text-body">{formatMoney(i.lineTotal)}</span>,
      }))}
    />
  );
}

export function Totals({ totals, supplyType, deliveryLabel, testId }: { totals: StoreCheckoutTotals; supplyType?: "INTRA_STATE" | "INTER_STATE"; deliveryLabel?: string; testId: string }) {
  return (
    <dl className="flex flex-col gap-2.5 border-t border-border-subtle pt-4 text-body-sm">
      <div className="flex justify-between"><dt className="text-muted">Value before GST</dt><dd className="tabular" data-testid={`${testId}-taxable`}>{formatMoney(totals.taxableValue)}</dd></div>
      <div className="flex justify-between"><dt className="text-muted">GST{supplyType ? (supplyType === "INTRA_STATE" ? " (CGST + SGST)" : " (IGST)") : ""}</dt><dd className="tabular" data-testid={`${testId}-gst`}>{formatMoney(totals.gst)}</dd></div>
      <div className="flex justify-between"><dt className="text-muted">{deliveryLabel ?? "Delivery"}</dt><dd className="tabular" data-testid={`${testId}-delivery`}>{totals.deliveryFee === 0 ? "Free" : formatMoney(totals.deliveryFee)}</dd></div>
      <div className="flex items-baseline justify-between border-t border-foreground pt-3"><dt className="text-body font-medium">Total</dt><dd className="tabular font-display text-h3" data-testid={`${testId}-total`}>{formatMoney(totals.total)}</dd></div>
    </dl>
  );
}

export const EditBag = () => <Link href="/cart" className="link-quiet text-center text-body-sm text-muted">Edit bag</Link>;
