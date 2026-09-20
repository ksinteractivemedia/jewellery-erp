/**
 * Illustrative catalogue content only. There is no product/catalog service yet
 * (see docs/progress.md) — kept isolated here, never imported by anything
 * pretending to be a real data layer, per business-rules.md §7.3.
 */

export const NAV_LINKS = [
  { label: "New Arrivals", href: "/collections/new-arrivals" },
  { label: "Bridal", href: "/collections/bridal" },
  { label: "Gold", href: "/collections/gold" },
  { label: "Diamond", href: "/collections/diamond" },
  { label: "Silver", href: "/collections/silver" },
];

export interface PlaceholderProduct {
  id: string;
  name: string;
  purity: string;
  price: number;
  compareAtPrice?: number;
  image: string;
  badge?: string;
}

export const FEATURED_PRODUCTS: PlaceholderProduct[] = [
  { id: "p1", name: "Aarna Gold Bangle", purity: "22K", price: 118000, compareAtPrice: 128000, image: "https://picsum.photos/seed/aarna/480/600", badge: "Bestseller" },
  { id: "p2", name: "Zaira Diamond Necklace", purity: "18K", price: 214000, image: "https://picsum.photos/seed/zaira/480/600" },
  { id: "p3", name: "Rihaan Solitaire Ring", purity: "22K", price: 41500, image: "https://picsum.photos/seed/rihaan/480/600" },
  { id: "p4", name: "Meher Pearl Studs", purity: "18K", price: 28500, image: "https://picsum.photos/seed/meher/480/600", badge: "New" },
  { id: "p5", name: "Kabir Rope Chain", purity: "22K", price: 146000, image: "https://picsum.photos/seed/kabir/480/600" },
  { id: "p6", name: "Ishani Jhumka Earrings", purity: "22K", price: 68500, image: "https://picsum.photos/seed/ishani/480/600" },
  { id: "p7", name: "Devika Kada", purity: "22K", price: 96000, image: "https://picsum.photos/seed/devika/480/600" },
  { id: "p8", name: "Naina Tennis Bracelet", purity: "18K", price: 182000, image: "https://picsum.photos/seed/naina/480/600" },
];

export const COLLECTIONS = [
  { title: "Bridal Edit", description: "Statement pieces for the big day", image: "https://picsum.photos/seed/bridal-collection/900/700", href: "/collections/bridal" },
  { title: "Everyday Gold", description: "Lightweight 18K, made for daily wear", image: "https://picsum.photos/seed/everyday-gold/900/700", href: "/collections/gold" },
  { title: "Diamond Edit", description: "Certified diamonds, brilliant cut", image: "https://picsum.photos/seed/diamond-collection/900/700", href: "/collections/diamond" },
];

export const FOOTER_COLUMNS = [
  { heading: "Shop", links: [{ label: "New Arrivals", href: "/collections/new-arrivals" }, { label: "Bridal", href: "/collections/bridal" }, { label: "Gold", href: "/collections/gold" }] },
  { heading: "Help", links: [{ label: "Shipping", href: "/help/shipping" }, { label: "Returns", href: "/help/returns" }, { label: "Size Guide", href: "/help/size-guide" }] },
  { heading: "Company", links: [{ label: "About", href: "/about" }, { label: "Stores", href: "/stores" }, { label: "Careers", href: "/careers" }] },
];
