import type { Metadata } from "next";
import { CheckoutFlow } from "../../components/checkout/checkout-flow";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false }, alternates: { canonical: "/checkout" } };

export default function CheckoutPage() {
  return (
    <div className="container-page flex flex-col gap-10 pb-20 pt-8 sm:pt-12">
      <h1 className="heading-display text-h1 sm:text-display">Checkout</h1>
      <CheckoutFlow />
    </div>
  );
}
