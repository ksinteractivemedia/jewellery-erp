"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import type { StoreImage } from "@jewellery/types";
import { Dialog, DialogContent, DialogTitle, cn } from "@jewellery/ui";
import { ProgressiveImage } from "../ui/progressive-image";

/**
 * Product images. On a phone it is a swipeable carousel (native scroll-snap, so it feels like the platform) with a
 * position indicator; on a desktop it is a thumbnail rail beside a large image that magnifies under the pointer. Either
 * opens a lightbox — arrows, keyboard and tap-to-zoom — for a proper look.
 */
export function Gallery({ images, name }: { images: StoreImage[]; name: string }) {
  const [active, setActive] = React.useState(0);
  const [lightbox, setLightbox] = React.useState(false);
  const track = React.useRef<HTMLDivElement>(null);
  const list = images.length ? images : [{ url: "", alt: name }];
  const many = list.length > 1;

  const goTo = React.useCallback((i: number) => {
    const next = (i + list.length) % list.length;
    setActive(next);
    const el = track.current;
    if (el) el.scrollTo({ left: el.clientWidth * next, behavior: "smooth" });
  }, [list.length]);

  const onScroll = () => {
    const el = track.current;
    if (el) setActive(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse lg:gap-4" data-testid="gallery">
      {/* Desktop stage: magnify on hover */}
      <div className="hidden min-w-0 flex-1 lg:block"><Stage image={list[active]!} onOpen={() => setLightbox(true)} /></div>

      {/* Phone: swipe */}
      <div className="relative lg:hidden">
        <div ref={track} onScroll={onScroll} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto scroll-smooth" role="group" aria-roledescription="carousel" aria-label={`${name} images`} data-testid="gallery-track">
          {list.map((img, i) => (
            <button key={img.url + i} type="button" onClick={() => setLightbox(true)} className="w-full shrink-0 snap-center" aria-label={`Open image ${i + 1} of ${list.length}`} aria-roledescription="slide">
              <ProgressiveImage src={img.url} alt={img.alt} ratio="aspect-[4/5]" priority={i === 0} />
            </button>
          ))}
        </div>
        {many && (
          <>
            <span className="pointer-events-none absolute bottom-3 right-3 bg-surface/90 px-2.5 py-1 text-[0.6875rem] font-medium tracking-[0.12em] backdrop-blur" aria-live="polite" data-testid="gallery-counter">{active + 1} / {list.length}</span>
            <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">{list.map((_, i) => <span key={i} className={cn("h-1 rounded-full transition-all", i === active ? "w-6 bg-foreground" : "w-1.5 bg-border")} />)}</div>
          </>
        )}
      </div>

      {/* Desktop thumbnails */}
      {many && (
        <div role="radiogroup" aria-label="Choose image" className="hidden w-20 shrink-0 flex-col gap-3 lg:flex">
          {list.map((img, i) => (
            <button key={img.url + i} type="button" role="radio" aria-checked={i === active} aria-label={`Show image ${i + 1}`} onClick={() => setActive(i)} className={cn("overflow-hidden border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", i === active ? "border-foreground" : "border-transparent opacity-70 hover:opacity-100")}>
              <ProgressiveImage src={img.url} alt="" ratio="aspect-[4/5]" />
            </button>
          ))}
        </div>
      )}

      <Lightbox open={lightbox} onOpenChange={setLightbox} images={list} index={active} onIndex={goTo} />
    </div>
  );
}

/** The big image: moves its focal point under the pointer to magnify — a mouse gesture only; touch uses the lightbox. */
function Stage({ image, onOpen }: { image: StoreImage; onOpen: () => void }) {
  const [zoom, setZoom] = React.useState<{ x: number; y: number } | null>(null);
  return (
    <div
      className="group relative cursor-zoom-in overflow-hidden"
      onPointerMove={(e) => { if (e.pointerType !== "mouse") return; const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}
      onPointerLeave={() => setZoom(null)}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      aria-label="Open image in full view"
      data-testid="gallery-stage"
    >
      <ProgressiveImage src={image.url} alt={image.alt} ratio="aspect-[4/5]" priority imgClassName="duration-200" className="[&_img]:will-change-transform" />
      {zoom && image.url && <div className="pointer-events-none absolute inset-0 bg-no-repeat" style={{ backgroundImage: `url(${image.url})`, backgroundSize: "220%", backgroundPosition: `${zoom.x}% ${zoom.y}%` }} data-testid="gallery-zoom" aria-hidden="true" />}
      <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 bg-surface/90 px-2.5 py-1.5 text-[0.6875rem] font-medium uppercase tracking-[0.14em] opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"><Expand className="h-3.5 w-3.5" aria-hidden="true" />Zoom</span>
    </div>
  );
}

function Lightbox({ open, onOpenChange, images, index, onIndex }: { open: boolean; onOpenChange: (o: boolean) => void; images: StoreImage[]; index: number; onIndex: (i: number) => void }) {
  const [zoomed, setZoomed] = React.useState(false);
  React.useEffect(() => { setZoomed(false); }, [index, open]);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "ArrowRight") onIndex(index + 1); if (e.key === "ArrowLeft") onIndex(index - 1); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, onIndex]);
  const img = images[index];
  const nav = "absolute top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 shadow-md hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="left-0 top-0 h-[100dvh] max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-[var(--palette-black)]/95 p-0" data-testid="lightbox">
        <DialogTitle className="sr-only">Product image {index + 1} of {images.length}</DialogTitle>
        <button type="button" onClick={() => onOpenChange(false)} aria-label="Close" className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-5 w-5" /></button>
        <div className={cn("h-full w-full", zoomed ? "overflow-auto" : "flex items-center justify-center overflow-hidden")}>
          {img && img.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.url} alt={img.alt} onClick={() => setZoomed((z) => !z)} className={cn("select-none transition-[width,max-height] duration-300", zoomed ? "w-[200%] max-w-none cursor-zoom-out" : "max-h-[92dvh] max-w-full cursor-zoom-in object-contain")} data-testid="lightbox-image" />
          )}
        </div>
        {images.length > 1 && (
          <>
            <button type="button" onClick={() => onIndex(index - 1)} className={cn(nav, "left-3")} aria-label="Previous image"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => onIndex(index + 1)} className={cn(nav, "right-3")} aria-label="Next image"><ChevronRight className="h-5 w-5" /></button>
            <span className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-surface/90 px-3 py-1 text-[0.6875rem] font-medium tracking-[0.14em]">{index + 1} / {images.length}</span>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
