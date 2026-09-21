import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@jewellery/ui";

/** Real links, so each page can be crawled, opened in a new tab and shared. */
export function Pagination({ page, pageCount, href }: { page: number; pageCount: number; href: (page: number) => string }) {
  if (pageCount <= 1) return null;
  const pages = [...new Set([1, page - 1, page, page + 1, pageCount].filter((p) => p >= 1 && p <= pageCount))].sort((a, b) => a - b);
  const cell = "flex h-11 min-w-11 items-center justify-center border px-3 text-body-sm";
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1.5" data-testid="pagination">
      {page > 1 ? <Link href={href(page - 1)} rel="prev" className={cn(cell, "border-border hover:border-foreground")} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Link> : <span className={cn(cell, "border-transparent opacity-30")} aria-hidden="true"><ChevronLeft className="h-4 w-4" /></span>}
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - pages[i - 1]! > 1 && <span className="px-1 text-muted" aria-hidden="true">…</span>}
          <Link href={href(p)} aria-current={p === page ? "page" : undefined} aria-label={`Page ${p}`} className={cn(cell, p === page ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground")}>{p}</Link>
        </span>
      ))}
      {page < pageCount ? <Link href={href(page + 1)} rel="next" className={cn(cell, "border-border hover:border-foreground")} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Link> : <span className={cn(cell, "border-transparent opacity-30")} aria-hidden="true"><ChevronRight className="h-4 w-4" /></span>}
    </nav>
  );
}
