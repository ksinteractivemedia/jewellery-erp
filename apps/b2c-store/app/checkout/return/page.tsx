import type { Metadata } from "next";
import { Suspense } from "react";
import { PaymentReturn } from "../../../components/checkout/payment-return";

export const metadata: Metadata = { title: "Confirming payment", robots: { index: false, follow: false } };

export default function PaymentReturnPage() {
  return (
    <div className="container-page pb-20 pt-8 sm:pt-12">
      <Suspense fallback={null}><PaymentReturn /></Suspense>
    </div>
  );
}
