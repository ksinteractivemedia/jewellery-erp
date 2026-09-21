"use client";

import * as React from "react";
import { cn } from "@jewellery/ui";

interface Props {
  src?: string;
  alt: string;
  /** Tailwind aspect utility, e.g. "aspect-[4/5]" — the box is reserved before the image arrives, so nothing jumps. */
  ratio?: string;
  className?: string;
  imgClassName?: string;
  /** The first image on a page should not be lazy. */
  priority?: boolean;
  sizes?: string;
}

/**
 * Images arrive progressively: a warm placeholder of the final size is on screen at once, the file loads lazily, and it
 * fades in when ready. A missing or broken image falls back to a quiet monogram tile instead of a broken-image icon.
 * (Without JavaScript the image is simply shown — see the <noscript> rule in the layout.)
 */
export function ProgressiveImage({ src, alt, ratio = "aspect-[4/5]", className, imgClassName, priority, sizes }: Props) {
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const ref = React.useRef<HTMLImageElement>(null);

  // An image already in the browser cache can finish before React attaches onLoad. (Only the success case is decided here:
  // a lazy image that has not started loading also reports `complete`, so failure is left to onError.)
  React.useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, [src]);

  return (
    <div className={cn("relative overflow-hidden bg-surface-sunken", ratio, className)}>
      {(!src || failed) ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-sunken to-border-subtle" role="img" aria-label={alt}>
          <span className="font-display text-h1 text-muted/50" aria-hidden="true">{alt.trim().charAt(0).toUpperCase() || "◆"}</span>
        </div>
      ) : (
        <>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-surface-sunken to-border-subtle" aria-hidden="true" />}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={ref}
            src={src}
            alt={alt}
            sizes={sizes}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : undefined}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={cn("pi absolute inset-0 h-full w-full object-cover transition-[opacity,filter] duration-500 ease-out", loaded ? "opacity-100 blur-0" : "opacity-0 blur-sm", imgClassName)}
          />
        </>
      )}
    </div>
  );
}
