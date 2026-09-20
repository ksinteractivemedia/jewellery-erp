import * as React from "react";
import { cn } from "../lib/utils";

export interface ProductGalleryProps {
  images: { src: string; alt: string }[];
  className?: string;
}

/** Main image + thumbnail rail for a product detail page. Keyboard accessible via native radio semantics. */
export function ProductGallery({ images, className }: ProductGalleryProps) {
  const [active, setActive] = React.useState(0);
  const current = images[active];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="aspect-square overflow-hidden rounded-md bg-surface-sunken">
        {current && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.src} alt={current.alt} className="h-full w-full object-cover" />
        )}
      </div>
      {images.length > 1 && (
        <div role="radiogroup" aria-label="Product images" className="flex gap-2 overflow-x-auto">
          {images.map((image, i) => (
            <button
              key={image.src}
              type="button"
              role="radio"
              aria-checked={i === active}
              aria-label={`Show image ${i + 1}`}
              onClick={() => setActive(i)}
              className={cn(
                "h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                i === active ? "border-primary" : "border-transparent"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
