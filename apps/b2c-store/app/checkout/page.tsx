"use client";

import Link from "next/link";
import { Alert, Button, CheckoutSummary, EmptyState } from "@jewellery/ui";
import { useStore } from "../../lib/store-context";

export default function CheckoutPage() {
  const { items, subtotal } = useStore();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
        <EmptyState
          title="Your bag is empty"
          description="Add something to your bag before checking out."
          action={
            <Button variant="secondary" asChild>
              <Link href="/">Continue shopping</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <h1 className="mb-6 font-display text-h1">Checkout</h1>
      <CheckoutSummary
        items={items.map((i) => ({ name: i.name, image: i.image, quantity: i.quantity, price: i.price }))}
        lines={[{ label: "Subtotal", amount: subtotal }]}
        total={subtotal}
      />
      <Alert variant="info" title="Payment isn't wired up yet" className="mt-4">
        Online payment, the pricing engine and order confirmation are Phase 3 work — see docs/progress.md.
      </Alert>
    </div>
  );
}
