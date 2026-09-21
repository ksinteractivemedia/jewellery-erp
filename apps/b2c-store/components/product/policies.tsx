import { BadgeCheck, CreditCard, Gem, LifeBuoy, RotateCcw, Truck } from "lucide-react";
import type { StoreContent } from "@jewellery/types";
import { ChevronDown } from "lucide-react";

const ICONS = { hallmark: BadgeCheck, shipping: Truck, returns: RotateCcw, secure: CreditCard, certified: Gem, support: LifeBuoy } as const;

/** What the business has said about itself — shown only if it was written. There is no built-in promise here. */
export function TrustList({ trust }: { trust: StoreContent["trust"] }) {
  if (!trust.length) return null;
  return (
    <ul className="grid gap-5 border-y border-border-subtle py-6 sm:grid-cols-2" aria-label="Why shop with us" data-testid="trust-list">
      {trust.map((t) => { const Icon = ICONS[t.icon]; return (
        <li key={t.title} className="flex items-start gap-3"><Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><span className="flex flex-col"><span className="text-body-sm font-medium">{t.title}</span>{t.text && <span className="text-caption text-muted">{t.text}</span>}</span></li>
      ); })}
    </ul>
  );
}

/** Shipping, returns and care, as the business wrote them. Sections with no text are simply absent. */
export function Policies({ policies }: { policies: StoreContent["policies"] }) {
  const items: [string, string][] = [];
  if (policies.shipping) items.push(["Shipping", policies.shipping]);
  if (policies.returns) items.push(["Returns", policies.returns]);
  if (policies.care) items.push(["Care instructions", policies.care]);
  if (!items.length) return null;
  return (
    <div className="border-t border-border-subtle" data-testid="policies">
      {items.map(([title, text]) => (
        <details key={title} className="group border-b border-border-subtle">
          <summary className="flex cursor-pointer list-none items-center justify-between py-5 text-[0.8125rem] font-medium uppercase tracking-[0.12em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">{title}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
          <p className="max-w-prose whitespace-pre-line pb-6 text-body text-muted">{text}</p>
        </details>
      ))}
    </div>
  );
}
