"use client";

import Link from "next/link";
import { Alert, Button, CheckoutSummary, EmptyState } from "@jewellery/ui";
import { useStore } from "../../lib/store-context";

export default function PurchaseOrderReviewPage() {
  const { items, subtotal } = useStore();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <EmptyState
          title="Your purchase list is empty"
          description="Add products from the catalogue to build a purchase order."
          action={
            <Button variant="secondary" asChild>
              <Link href="/">Browse catalogue</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <h1 className="mb-6 font-display text-h1">Review purchase order</h1>
      <CheckoutSummary
        items={items.map((i) => ({ name: i.name, image: i.image, quantity: i.quantity, price: i.price }))}
        lines={[{ label: "Subtotal", amount: subtotal }]}
        total={subtotal}
      />
      <Alert variant="info" title="Submission isn't wired up yet" className="mt-4">
        Negotiated pricing, credit-limit approval and PO submission are Phase 4 work — see docs/progress.md.
      </Alert>
    </div>
  );
}
