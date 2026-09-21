import type { Metadata } from "next";
import { CartView } from "../../components/cart/cart-view";

export const metadata: Metadata = { title: "Your bag", robots: { index: false, follow: false }, alternates: { canonical: "/cart" } };

export default function CartPage() {
  return (
    <div className="container-page flex flex-col gap-10 pb-16 pt-8 sm:pt-12">
      <h1 className="heading-display text-h1 sm:text-display">Your bag</h1>
      <CartView />
    </div>
  );
}
