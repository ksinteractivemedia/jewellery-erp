import * as React from "react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export interface CollectionHeroProps {
  eyebrow?: string;
  title: string;
  description?: string;
  image: string;
  imageAlt?: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  className?: string;
}

/** Full-bleed editorial banner for collection/landing pages. */
export function CollectionHero({ eyebrow, title, description, image, imageAlt, ctaLabel, onCtaClick, className }: CollectionHeroProps) {
  return (
    <section className={cn("relative overflow-hidden rounded-lg bg-surface-sunken", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={imageAlt ?? ""} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      <div className="relative flex min-h-[360px] flex-col items-start justify-end gap-3 p-8 sm:min-h-[440px] sm:p-12">
        {eyebrow && <span className="text-caption font-medium uppercase tracking-wide text-white/80">{eyebrow}</span>}
        <h2 className="max-w-md font-display text-display text-white">{title}</h2>
        {description && <p className="max-w-md text-body text-white/85">{description}</p>}
        {ctaLabel && (
          <Button variant="primary" size="lg" onClick={onCtaClick} className="mt-2">
            {ctaLabel}
          </Button>
        )}
      </div>
    </section>
  );
}
