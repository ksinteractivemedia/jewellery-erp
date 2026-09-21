import type { StoreProductCard } from "@jewellery/types";
import { ProductCard } from "../product/product-card";
import { Section, SectionHeading } from "../ui/section";

/** A titled row of products: a swipeable strip on a phone, a grid from tablet up. */
export function ProductRail({ eyebrow, title, description, href, linkLabel, products, tone, testId }: { eyebrow?: string; title: string; description?: string; href?: string; linkLabel?: string; products: StoreProductCard[]; tone?: "plain" | "sunken"; testId?: string }) {
  if (products.length === 0) return null;
  return (
    <Section tone={tone} label={title}>
      <div className="flex flex-col gap-10" data-testid={testId}>
        <SectionHeading eyebrow={eyebrow} title={title} description={description} href={href} linkLabel={linkLabel} />
        <ul className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 md:grid md:grid-cols-3 md:gap-x-6 md:gap-y-12 md:overflow-visible md:px-0 lg:grid-cols-4">
          {products.slice(0, 8).map((p) => <li key={p.id} className="w-[46%] shrink-0 snap-start sm:w-[38%] md:w-auto"><ProductCard product={p} /></li>)}
        </ul>
      </div>
    </Section>
  );
}
