import Link from "next/link";
import type { StoreContent, StoreNavigation } from "@jewellery/types";

/** The footer's links are the real categories and collections; contact details appear only if the business has entered them. */
export function SiteFooter({ content, navigation }: { content: StoreContent; navigation: StoreNavigation }) {
  const top = navigation.categories.filter((c) => !c.parentSlug).slice(0, 6);
  const col = "flex flex-col gap-3";
  const h = "eyebrow text-foreground";
  const a = "text-body-sm text-muted transition-colors hover:text-foreground";
  return (
    <footer className="mt-10 border-t border-border-subtle bg-surface-sunken" data-testid="site-footer">
      <div className="container-page grid gap-12 py-16 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="flex max-w-sm flex-col gap-4">
          <span className="heading-display text-[1.5rem] uppercase tracking-[0.3em]">{content.brandName}</span>
          {content.tagline && <p className="text-body text-muted">{content.tagline}</p>}
          {(content.contact?.email || content.contact?.phone) && (
            <p className="flex flex-col gap-1 text-body-sm text-muted">
              {content.contact.email && <a href={`mailto:${content.contact.email}`} className="hover:text-foreground">{content.contact.email}</a>}
              {content.contact.phone && <a href={`tel:${content.contact.phone.replace(/\s/g, "")}`} className="hover:text-foreground">{content.contact.phone}</a>}
            </p>
          )}
        </div>
        <nav aria-label="Shop" className={col}><span className={h}>Shop</span>{top.map((c) => <Link key={c.slug} href={`/category/${c.slug}`} className={a}>{c.name}</Link>)}</nav>
        <nav aria-label="Collections" className={col}><span className={h}>Collections</span>{navigation.collections.slice(0, 6).map((c) => <Link key={c.slug} href={`/collections/${c.slug}`} className={a}>{c.name}</Link>)}<Link href="/collections" className={a}>All collections</Link></nav>
        <nav aria-label="Your account" className={col}><span className={h}>Your account</span><Link href="/account" className={a}>Account</Link><Link href="/account/orders" className={a}>Orders</Link><Link href="/wishlist" className={a}>Wishlist</Link><Link href="/cart" className={a}>Bag</Link></nav>
      </div>
      <div className="border-t border-border-subtle">
        <div className="container-page flex flex-col gap-2 py-6 text-caption text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} {content.brandName}</span>
          <span>Prices are calculated live from the metal rate.</span>
        </div>
      </div>
    </footer>
  );
}
