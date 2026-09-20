/**
 * Illustrative wholesale catalogue + account content only — no B2B customer/pricing
 * service exists yet (see docs/progress.md, Phase 4). Isolated here so it can't be
 * mistaken for a real data layer, per business-rules.md §7.3.
 */

export const CATALOGUE_LINKS = [
  { label: "Full Catalogue", href: "/catalogue" },
  { label: "New Arrivals", href: "/catalogue/new-arrivals" },
  { label: "Price Lists", href: "/price-lists" },
  { label: "Bulk Orders", href: "/bulk-orders" },
];

export const PLACEHOLDER_COMPANY = {
  name: "Anand Jewellers",
  gstin: "24AAACJ1234E1Z5",
  contactName: "Vikram Anand",
  creditLimit: 2500000,
  outstanding: 2180000,
  overdueAmount: 64000,
};

export interface WholesaleProduct {
  id: string;
  name: string;
  purity: string;
  price: number;
  moq: number;
  image: string;
}

export const FEATURED_PRODUCTS: WholesaleProduct[] = [
  { id: "w1", name: "Aarna Gold Bangle", purity: "22K", price: 108000, moq: 5, image: "https://picsum.photos/seed/aarna/480/600" },
  { id: "w2", name: "Zaira Diamond Necklace", purity: "18K", price: 198000, moq: 2, image: "https://picsum.photos/seed/zaira/480/600" },
  { id: "w3", name: "Rihaan Solitaire Ring", purity: "22K", price: 37500, moq: 10, image: "https://picsum.photos/seed/rihaan/480/600" },
  { id: "w4", name: "Meher Pearl Studs", purity: "18K", price: 25500, moq: 10, image: "https://picsum.photos/seed/meher/480/600" },
  { id: "w5", name: "Kabir Rope Chain", purity: "22K", price: 134000, moq: 3, image: "https://picsum.photos/seed/kabir/480/600" },
  { id: "w6", name: "Ishani Jhumka Earrings", purity: "22K", price: 61500, moq: 5, image: "https://picsum.photos/seed/ishani/480/600" },
  { id: "w7", name: "Devika Kada", purity: "22K", price: 88000, moq: 4, image: "https://picsum.photos/seed/devika/480/600" },
  { id: "w8", name: "Naina Tennis Bracelet", purity: "18K", price: 168000, moq: 2, image: "https://picsum.photos/seed/naina/480/600" },
];

export const CATEGORIES = [
  { title: "Bangles & Kadas", image: "https://picsum.photos/seed/wholesale-bangles/700/500", href: "/catalogue/bangles" },
  { title: "Necklaces & Sets", image: "https://picsum.photos/seed/wholesale-necklaces/700/500", href: "/catalogue/necklaces" },
  { title: "Rings", image: "https://picsum.photos/seed/wholesale-rings/700/500", href: "/catalogue/rings" },
  { title: "Earrings", image: "https://picsum.photos/seed/wholesale-earrings/700/500", href: "/catalogue/earrings" },
];

export const FOOTER_COLUMNS = [
  { heading: "Wholesale", links: [{ label: "Full Catalogue", href: "/catalogue" }, { label: "Price Lists", href: "/price-lists" }, { label: "Bulk Orders", href: "/bulk-orders" }] },
  { heading: "Account", links: [{ label: "Credit & Outstanding", href: "/account/credit" }, { label: "Order History", href: "/account/orders" }, { label: "Quotations", href: "/account/quotations" }] },
  { heading: "Company", links: [{ label: "About", href: "/about" }, { label: "Contact Sales", href: "/contact" }] },
];
