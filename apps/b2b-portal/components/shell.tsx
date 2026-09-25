"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Building2, ClipboardList, CreditCard, FileText, LayoutDashboard, LogOut, Menu, MessageSquareQuote, Package, ReceiptText, ShoppingCart, WalletCards, X, Zap } from "lucide-react";
import { cn, Drawer, DrawerContent, DrawerTitle } from "@jewellery/ui";
import { useAuth } from "../lib/auth";
import { cartPieces, cartStore, useCart } from "../lib/cart";
import { money0 } from "../lib/money";
import { useAccount, useDashboard } from "../lib/queries";
import { Loading } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
  { href: "/catalogue", label: "Catalogue", icon: BookOpen, id: "catalogue" },
  { href: "/quick-order", label: "Quick order", icon: Zap, id: "quick-order" },
  { href: "/cart", label: "Cart", icon: ShoppingCart, id: "cart" },
  { href: "/purchase-orders", label: "Purchase orders", icon: ClipboardList, id: "purchase-orders" },
  { href: "/quotations", label: "Quotations", icon: MessageSquareQuote, id: "quotations" },
  { href: "/orders", label: "Orders", icon: Package, id: "orders" },
  { href: "/invoices", label: "Invoices", icon: FileText, id: "invoices" },
  { href: "/payments", label: "Payments", icon: CreditCard, id: "payments" },
  { href: "/outstanding", label: "Outstanding", icon: WalletCards, id: "outstanding" },
  { href: "/account", label: "Account", icon: Building2, id: "account" },
] as const;

/** Signed-out visitors see the login; anyone signed in who isn't a wholesale customer is told so (the API refuses them regardless). */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, user, signOut } = useAuth();
  const router = useRouter();
  React.useEffect(() => { if (status === "signed-out") router.replace("/login"); }, [status, router]);
  if (status === "loading") return <div className="mx-auto max-w-3xl p-10"><Loading rows={4} /></div>;
  if (status === "signed-out") return null;
  if (user?.userType !== "B2B_BUYER") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-16 text-center" role="alert" data-testid="not-a-buyer">
        <h1 className="text-xl font-semibold">This is the wholesale portal</h1>
        <p className="text-muted">You’re signed in as {user?.name}, who isn’t a wholesale customer. Staff use the ERP.</p>
        <button className="btn btn-outline" onClick={() => signOut()}>Sign out</button>
      </div>
    );
  }
  return <>{children}</>;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  cartStore.use(user?.id ?? "anon");
  const cart = useCart();
  const account = useAccount();
  const dash = useDashboard();
  React.useEffect(() => setOpen(false), [pathname]);
  const pos = account.data?.position;
  const counts = dash.data?.counts;
  const badge: Record<string, number | undefined> = { cart: cartPieces(cart) || undefined, quotations: counts?.quotationsAwaitingYou || undefined, "purchase-orders": counts?.openPurchaseOrders || undefined, orders: counts?.ordersInProgress || undefined, invoices: counts?.unpaidInvoices || undefined, payments: counts?.paymentsPending || undefined };
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const nav = (
    <nav aria-label="Portal" className="flex flex-col gap-0.5">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} data-testid={`nav-${n.id}`} aria-current={active(n.href) ? "page" : undefined} className={cn("flex items-center gap-2.5 rounded-md px-3 py-2 text-[0.8125rem] font-medium transition-colors", active(n.href) ? "bg-foreground text-background" : "text-foreground hover:bg-surface-sunken")}>
          <n.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{n.label}</span>
          {badge[n.id] ? <span className={cn("num rounded-full px-1.5 text-[0.6875rem] font-semibold", active(n.href) ? "bg-primary text-[var(--palette-black)]" : "bg-primary text-[var(--palette-black)]")}>{badge[n.id]}</span> : null}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="hidden border-r border-border-subtle bg-surface lg:block">
        <div className="sticky top-0 flex h-screen flex-col gap-5 p-4">
          <Link href="/" className="px-3 pt-1"><span className="block text-[1.0625rem] font-semibold tracking-[0.18em]">SUVARNA</span><span className="text-[0.6875rem] uppercase tracking-[0.14em] text-muted">Wholesale</span></Link>
          {nav}
          <div className="mt-auto border-t border-border-subtle pt-3 text-[0.75rem]"><p className="font-medium">{user?.name}</p><p className="truncate text-muted">{account.data?.customer.name}</p><button className="mt-2 inline-flex items-center gap-1.5 text-muted hover:text-foreground" onClick={() => signOut()} data-testid="sign-out"><LogOut className="h-3.5 w-3.5" aria-hidden="true" />Sign out</button></div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border-subtle bg-background px-4 sm:px-6">
          <button className="btn btn-ghost -ml-2 h-9 w-9 p-0 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)} data-testid="open-menu"><Menu className="h-5 w-5" /></button>
          <p className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{account.data?.customer.name ?? "…"}{account.data?.customer.gstin && <span className="ml-2 hidden text-muted sm:inline">GSTIN {account.data.customer.gstin}</span>}</p>
          {pos && (
            <>
              {/* Below 640px the full chip has no room next to the menu/name/cart row — a compact, amount-only version keeps credit always visible per design-system.md §7B rather than hiding it outright. */}
              <Link href="/outstanding" className={cn("flex shrink-0 items-center rounded-md border px-2 py-1 text-[0.75rem] sm:hidden", pos.available < 0 || pos.onHold ? "border-danger bg-danger-subtle" : "border-border-subtle bg-surface")} aria-label={`Available credit: ${pos.available < 0 ? `minus ${money0(-pos.available)}` : money0(pos.available)}`} data-testid="credit-chip-compact">
                <span className={cn("num font-semibold", pos.available < 0 && "text-danger")}>{pos.available < 0 ? `−${money0(-pos.available)}` : money0(pos.available)}</span>
              </Link>
              <Link href="/outstanding" className={cn("hidden items-center gap-2 rounded-md border px-3 py-1.5 text-[0.75rem] sm:flex", pos.available < 0 || pos.onHold ? "border-danger bg-danger-subtle" : "border-border-subtle bg-surface")} data-testid="credit-chip">
                <span className="text-muted">Available credit</span><span className={cn("num font-semibold", pos.available < 0 && "text-danger")}>{pos.available < 0 ? `−${money0(-pos.available)}` : money0(pos.available)}</span>
              </Link>
            </>
          )}
          <Link href="/cart" className="btn btn-outline relative h-9 gap-1.5 px-3" aria-label={`Cart, ${cartPieces(cart)} pieces`} data-testid="cart-link"><ShoppingCart className="h-4 w-4" aria-hidden="true" /><span className="num text-[0.75rem]">{cartPieces(cart)}</span></Link>
        </header>

        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent side="left" hideClose className="w-[280px] max-w-[280px] gap-4 p-4 lg:hidden" data-testid="mobile-nav">
            <div className="flex items-center justify-between">
              <DrawerTitle className="text-[1.0625rem] font-semibold tracking-[0.18em]">SUVARNA</DrawerTitle>
              <button className="btn btn-ghost h-9 w-9 p-0" aria-label="Close menu" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            {pos && <div className="rounded-md border border-border-subtle p-3 text-[0.75rem]"><p className="label">Available credit</p><p className={cn("num text-[1.125rem] font-semibold", pos.available < 0 && "text-danger")}>{money0(pos.available)}</p></div>}
            {nav}
            <button className="mt-auto inline-flex items-center gap-2 text-muted" onClick={() => signOut()}><LogOut className="h-4 w-4" aria-hidden="true" />Sign out</button>
          </DrawerContent>
        </Drawer>

        <main id="main" className="mx-auto w-full max-w-[1280px] px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
export { ReceiptText, Package };
