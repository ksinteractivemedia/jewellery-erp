import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";
import { Breadcrumbs } from "../../../components/ui/breadcrumbs";

export const metadata: Metadata = { title: "Orders", robots: { index: false, follow: false }, alternates: { canonical: "/account/orders" } };

export default function OrdersPage() {
  return (
    <div className="container-page flex flex-col gap-10 pb-24 pt-8 sm:pt-12">
      <Breadcrumbs items={[{ name: "Account", href: "/account" }, { name: "Orders" }]} />
      <h1 className="heading-display text-h1 sm:text-display">Orders</h1>
      <div className="flex flex-col items-center gap-5 border border-dashed border-border py-20 text-center" data-testid="orders-empty">
        <Package className="h-10 w-10 text-muted" strokeWidth={1.25} aria-hidden="true" />
        <h2 className="font-display text-h2">No orders yet</h2>
        <p className="max-w-md text-body text-muted">Customer accounts aren’t open yet, so there’s no order history to show here. When you place an order you’ll see it straight away, on the device you ordered from.</p>
        <Link href="/collections" className="btn btn-primary">Explore collections</Link>
      </div>
    </div>
  );
}
