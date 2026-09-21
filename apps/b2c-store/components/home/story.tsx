import Link from "next/link";
import type { StoreContent, StoreImage } from "@jewellery/types";
import { ProgressiveImage } from "../ui/progressive-image";
import { Section } from "../ui/section";

/** The brand's own account of its craft. Words are the business's; the image is a real piece from the catalogue. */
export function Story({ story, image }: { story: NonNullable<StoreContent["story"]>; image?: StoreImage }) {
  return (
    <Section tone="dark" label="Craftsmanship">
      <div className={image ? "grid items-center gap-10 lg:grid-cols-2 lg:gap-20" : "mx-auto max-w-2xl text-center"} data-testid="story">
        {image && <ProgressiveImage src={image.url} alt={image.alt} ratio="aspect-[4/5]" className="bg-white/5 lg:order-2" />}
        <div className="flex flex-col gap-6">
          {story.eyebrow && <span className="eyebrow text-white/60">{story.eyebrow}</span>}
          <h2 className="heading-display text-h1 text-[var(--palette-offwhite)] sm:text-display">{story.title}</h2>
          <div className="flex flex-col gap-4">{story.body.map((p, i) => <p key={i} className="max-w-prose text-body-lg text-white/70">{p}</p>)}</div>
          {story.ctaLabel && story.ctaHref && <div><Link href={story.ctaHref} className="btn btn-primary">{story.ctaLabel}</Link></div>}
        </div>
      </div>
    </Section>
  );
}
