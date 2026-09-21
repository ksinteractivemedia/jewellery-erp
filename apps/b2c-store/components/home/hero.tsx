import Link from "next/link";
import type { StoreContent, StoreImage } from "@jewellery/types";
import { ProgressiveImage } from "../ui/progressive-image";

/** The opening statement. Its words come from the business's own content; its image from the hero setting or, failing that, a real product. */
export function Hero({ hero, image }: { hero: NonNullable<StoreContent["hero"]>; image?: StoreImage }) {
  return (
    <section className="border-b border-border-subtle" aria-labelledby="hero-title" data-testid="hero">
      <div className="container-page grid items-stretch gap-8 py-8 lg:grid-cols-[1fr_1.05fr] lg:gap-16 lg:py-0">
        <div className="order-2 flex flex-col justify-center gap-6 py-4 lg:order-1 lg:min-h-[640px] lg:py-20">
          {hero.eyebrow && <span className="eyebrow rise">{hero.eyebrow}</span>}
          <h1 id="hero-title" className="heading-display rise text-[2.5rem] leading-[1.05] [animation-delay:80ms] sm:text-[3.5rem] lg:text-[4.25rem]">{hero.title}</h1>
          {hero.subtitle && <p className="rise max-w-md text-body-lg text-muted [animation-delay:160ms]">{hero.subtitle}</p>}
          {hero.ctaLabel && hero.ctaHref && (
            <div className="rise mt-2 flex flex-wrap gap-3 [animation-delay:240ms]"><Link href={hero.ctaHref} className="btn btn-primary" data-testid="hero-cta">{hero.ctaLabel}</Link><Link href="/collections" className="btn btn-outline">All collections</Link></div>
          )}
        </div>
        <div className="order-1 lg:order-2 lg:py-10">
          <ProgressiveImage src={hero.imageUrl ?? image?.url} alt={image?.alt ?? hero.title} ratio="aspect-[4/5] lg:aspect-auto lg:h-full" className="lg:min-h-[560px]" priority />
        </div>
      </div>
    </section>
  );
}
