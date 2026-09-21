import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** A visible trail — the same one the page describes to search engines in its structured data. */
export function Breadcrumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-caption text-muted" data-testid="breadcrumbs">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={item.name + i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
            {item.href && i < items.length - 1 ? <Link href={item.href} className="hover:text-foreground">{item.name}</Link> : <span aria-current={i === items.length - 1 ? "page" : undefined} className="text-foreground">{item.name}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
