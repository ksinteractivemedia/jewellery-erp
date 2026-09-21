import type { Metadata } from "next";
import { WishlistView } from "../../components/product/wishlist-view";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false, follow: false }, alternates: { canonical: "/wishlist" } };

export default function WishlistPage() {
  return (
    <div className="container-page flex flex-col gap-10 pb-20 pt-8 sm:pt-12">
      <div className="flex flex-col gap-3"><span className="eyebrow">Saved on this device</span><h1 className="heading-display text-h1 sm:text-display">Wishlist</h1></div>
      <WishlistView />
    </div>
  );
}
