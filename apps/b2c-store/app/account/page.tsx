import type { Metadata } from "next";
import Link from "next/link";
import { Heart, Package, ShoppingBag } from "lucide-react";

export const metadata: Metadata = { title: "Account", robots: { index: false, follow: false }, alternates: { canonical: "/account" } };

const card = "group flex flex-col gap-3 border border-border-subtle bg-surface p-6 transition-colors hover:border-foreground";

export default function AccountPage() {
  return (
    <div className="container-page flex flex-col gap-12 pb-24 pt-8 sm:pt-12">
      <div className="flex max-w-2xl flex-col gap-4"><span className="eyebrow">Your account</span><h1 className="heading-display text-h1 sm:text-display">Account</h1></div>
      <div className="flex max-w-2xl gap-4 border border-border bg-surface p-6" role="status" data-testid="account-notice">
        <div className="flex flex-col gap-2"><p className="font-display text-h4">Customer accounts aren’t open yet.</p><p className="text-body text-muted">Signing in, saved addresses and order history arrive with online ordering. Until then you can still browse, keep a wishlist and fill a bag — both are kept on this device.</p></div>
      </div>
      <ul className="grid gap-4 sm:grid-cols-3">
        <li><Link href="/wishlist" className={card}><Heart className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" /><span className="font-display text-h4">Wishlist</span><span className="text-body-sm text-muted">Pieces you’ve saved.</span></Link></li>
        <li><Link href="/cart" className={card}><ShoppingBag className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" /><span className="font-display text-h4">Bag</span><span className="text-body-sm text-muted">What you’re considering.</span></Link></li>
        <li><Link href="/account/orders" className={card}><Package className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" /><span className="font-display text-h4">Orders</span><span className="text-body-sm text-muted">Your purchase history.</span></Link></li>
      </ul>
    </div>
  );
}
