import type { StorePrice } from "@jewellery/types";
import { ChevronDown } from "lucide-react";
import { formatDate, formatGrams, formatMoney } from "../../lib/money";

type Available = Extract<StorePrice, { status: "AVAILABLE" }>;

/**
 * "How is this priced?" — every part of the price, in the order it is calculated, from the same numbers the total came
 * from. No cost, no margin, no rule names: what a shopper is owed is the honest structure of the number, not our books.
 */
export function PriceBreakdown({ price, defaultOpen }: { price: StorePrice; defaultOpen?: boolean }) {
  if (price.status !== "AVAILABLE") return null;
  const b = price.breakdown;
  const { basis } = price as Available;
  const rows: { label: React.ReactNode; hint?: string; amount: number; negative?: boolean }[] = [
    { label: `${basis.metalName} ${basis.purity}`, hint: `${formatGrams(basis.netWeight)} × ${formatMoney(basis.ratePerGram)} per gram`, amount: b.metalValue },
    ...(b.wastage > 0 ? [{ label: "Wastage", amount: b.wastage }] : []),
    { label: "Making charges", amount: b.makingCharges },
    ...(b.stoneValue > 0 ? [{ label: "Stones", amount: b.stoneValue }] : []),
    ...(b.discount > 0 ? [{ label: "Discount", amount: b.discount, negative: true }] : []),
  ];
  return (
    <details className="group border-y border-border-subtle" open={defaultOpen} data-testid="price-breakdown">
      <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[0.8125rem] font-medium uppercase tracking-[0.12em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        How is this priced?
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="flex flex-col gap-3 pb-5">
        <dl className="flex flex-col gap-2.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4">
              <dt className="flex flex-col text-body-sm text-foreground">{r.label}{r.hint && <span className="text-caption text-muted">{r.hint}</span>}</dt>
              <dd className={`tabular text-body-sm ${r.negative ? "text-success" : "text-foreground"}`}>{r.negative ? "− " : ""}{formatMoney(r.amount, { precise: true })}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 border-t border-border-subtle pt-2.5">
            <dt className="text-body-sm text-muted">Value before GST</dt>
            <dd className="tabular text-body-sm text-foreground">{formatMoney(b.taxableValue, { precise: true })}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-body-sm text-foreground">GST</dt>
            <dd className="tabular text-body-sm text-foreground">{formatMoney(b.gst, { precise: true })}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-t border-foreground pt-3">
            <dt className="text-body font-medium text-foreground">Total</dt>
            <dd className="tabular text-body font-medium text-foreground" data-testid="breakdown-total">{formatMoney(b.total, { precise: true })}</dd>
          </div>
        </dl>
        <p className="text-caption leading-relaxed text-muted">
          This price is calculated, not printed. It uses the {basis.metalName.toLowerCase()} rate in force since {formatDate(basis.rateEffectiveFrom)} and changes whenever that rate does; the amount you pay is confirmed at checkout.
        </p>
      </div>
    </details>
  );
}
