import Link from "next/link";
import type { StoreCategoryNode, StoreCollectionNode } from "@jewellery/types";
import { cn } from "@jewellery/ui";
import { ProgressiveImage } from "../ui/progressive-image";

/** Featured collections as large editorial tiles. */
export function CollectionTiles({ collections }: { collections: StoreCollectionNode[] }) {
  return (
    <ul className={cn("grid gap-4 sm:gap-6", collections.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2", collections.length >= 3 && "lg:grid-cols-4")} data-testid="collection-tiles">
      {collections.map((c) => (
        <li key={c.slug}>
          <Link href={`/collections/${c.slug}`} className="group relative block overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ProgressiveImage src={c.image?.url} alt={c.image?.alt ?? c.name} ratio="aspect-[4/5]" imgClassName="transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-5 text-white">
              <span className="font-display text-h3 leading-tight">{c.name}</span>
              <span className="text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-white/80">{c.productCount} {c.productCount === 1 ? "piece" : "pieces"}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Category navigation: a swipeable row of real categories on a phone, a grid on a desktop. */
export function CategoryNav({ categories }: { categories: StoreCategoryNode[] }) {
  return (
    <ul className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:px-0 lg:grid-cols-6" data-testid="category-nav">
      {categories.map((c) => (
        <li key={c.slug} className="w-36 shrink-0 snap-start sm:w-auto">
          <Link href={`/category/${c.slug}`} className="group flex flex-col gap-3 focus-visible:outline-none">
            <ProgressiveImage src={c.image?.url} alt={c.image?.alt ?? c.name} ratio="aspect-square" className="ring-1 ring-border-subtle transition-shadow group-hover:ring-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring" imgClassName="transition-transform duration-700 group-hover:scale-105" />
            <span className="text-center text-[0.75rem] font-medium uppercase tracking-[0.14em]">{c.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
