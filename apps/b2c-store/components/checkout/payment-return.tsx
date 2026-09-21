"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { cancelPayment, verifyPayment } from "../../lib/checkout-api";
import { orderTokens } from "../../lib/order-session";

/**
 * Where the payment page sends the customer back. The browser's word about what happened is worth nothing, so this page asks
 * OUR API to check with the payment provider (or, if they backed out, to write the attempt off) and only then shows the order.
 */
export function PaymentReturn() {
  const router = useRouter();
  const params = useSearchParams();
  const orderNo = params.get("order") ?? "";
  const paymentId = params.get("payment");
  const cancelled = params.get("cancelled") === "1";
  const ran = React.useRef(false);
  const [problem, setProblem] = React.useState<string>();

  React.useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = orderTokens.get(orderNo);
    if (!orderNo || !token) return setProblem("We can’t confirm this order on this device.");
    (async () => {
      try {
        if (paymentId) {
          if (cancelled) await cancelPayment(orderNo, token, paymentId);
          else {
            const proof: Record<string, string> = {};
            params.forEach((value, key) => { if (key !== "order" && key !== "payment") proof[key] = value.slice(0, 500); });
            await verifyPayment(orderNo, token, paymentId, proof);
          }
        }
      } catch {
        /* the order page shows the truth whatever happened here */
      }
      router.replace(`/orders/${orderNo}`);
    })();
  }, [orderNo, paymentId, cancelled, params, router]);

  if (problem) return <div className="flex flex-col items-center gap-4 py-24 text-center" role="alert"><h2 className="font-display text-h2">{problem}</h2><p className="text-body text-muted">If you paid, you’ll receive your confirmation from us. Otherwise nothing was charged.</p><Link href="/" className="btn btn-outline">Back to the shop</Link></div>;
  return <div className="flex flex-col items-center gap-4 py-24 text-center" role="status" data-testid="verifying-payment"><Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" /><h2 className="font-display text-h2">Confirming your payment…</h2><p className="text-body text-muted">Please don’t close this page.</p></div>;
}
