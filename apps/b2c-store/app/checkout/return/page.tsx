import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PaymentReturn } from "../../../components/checkout/payment-return";

export const metadata: Metadata = { title: "Confirming payment", robots: { index: false, follow: false } };

/** Matches `PaymentReturn`'s own "Confirming your payment…" state, so there's no blank flash before it mounts. */
const fallback = <div className="flex flex-col items-center gap-4 py-24 text-center" role="status"><Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" /><h2 className="font-display text-h2">Confirming your payment…</h2><p className="text-body text-muted">Please don’t close this page.</p></div>;

export default function PaymentReturnPage() {
  return (
    <div className="container-page pb-20 pt-8 sm:pt-12">
      <Suspense fallback={fallback}><PaymentReturn /></Suspense>
    </div>
  );
}
