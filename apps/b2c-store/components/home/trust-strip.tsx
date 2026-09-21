import { BadgeCheck, CreditCard, Gem, LifeBuoy, RotateCcw, Truck } from "lucide-react";
import type { StoreContent } from "@jewellery/types";
import { Section } from "../ui/section";

const ICONS = { hallmark: BadgeCheck, shipping: Truck, returns: RotateCcw, secure: CreditCard, certified: Gem, support: LifeBuoy } as const;

/** The assurances the business has chosen to state. Nothing here is built in: no content, no strip. */
export function TrustStrip({ trust }: { trust: StoreContent["trust"] }) {
  if (!trust.length) return null;
  return (
    <Section tone="sunken" label="Why shop with us" className="py-12 sm:py-14">
      <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4" data-testid="trust-strip">
        {trust.map((t) => { const Icon = ICONS[t.icon]; return (
          <li key={t.title} className="flex flex-col items-center gap-3 text-center"><Icon className="h-7 w-7" strokeWidth={1.25} aria-hidden="true" /><span className="text-[0.75rem] font-medium uppercase tracking-[0.16em]">{t.title}</span>{t.text && <span className="max-w-[16rem] text-body-sm text-muted">{t.text}</span>}</li>
        ); })}
      </ul>
    </Section>
  );
}
