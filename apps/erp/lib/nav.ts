import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Boxes,
  ClipboardList,
  Coins,
  CreditCard,
  Diamond,
  Factory,
  FileSignature,
  FileText,
  Gem,
  Hammer,
  LayoutDashboard,
  PackageCheck,
  Repeat,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Undo2,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface NavLeaf {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label?: string;
  items: NavLeaf[];
}

/**
 * The full ERP information architecture. Sidebar, MobileNavigation, breadcrumbs,
 * page titles and the command palette all derive from this single source —
 * see business-rules.md §7.1 (no duplicated navigation logic per surface).
 */
export const NAV: NavGroup[] = [
  {
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard }],
  },
  {
    label: "Sales",
    items: [
      { label: "Orders", href: "/sales/orders", icon: ClipboardList },
      { label: "Invoices", href: "/sales/invoices", icon: FileText },
      { label: "Returns", href: "/sales/returns", icon: Undo2 },
      { label: "Exchanges", href: "/sales/exchanges", icon: Repeat },
    ],
  },
  {
    label: "B2B",
    items: [
      { label: "Customers", href: "/b2b/customers", icon: Users },
      { label: "Purchase Orders", href: "/b2b/purchase-orders", icon: ClipboardList },
      { label: "Quotations", href: "/b2b/quotations", icon: FileSignature },
      { label: "Credit", href: "/b2b/credit", icon: CreditCard },
      { label: "Outstanding", href: "/b2b/outstanding", icon: AlertTriangle },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Products", href: "/inventory/products", icon: Gem },
      { label: "Inventory", href: "/inventory/stock", icon: Boxes },
      { label: "Ledger", href: "/inventory/ledger", icon: BookOpen },
      { label: "Transfers", href: "/inventory/transfers", icon: ArrowLeftRight },
      { label: "Adjustments", href: "/inventory/adjustments", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { label: "Suppliers", href: "/purchasing/suppliers", icon: Factory },
      { label: "Purchase Orders", href: "/purchasing/purchase-orders", icon: ClipboardList },
      { label: "Goods Receipts", href: "/purchasing/goods-receipts", icon: PackageCheck },
    ],
  },
  {
    label: "Production",
    items: [
      { label: "Production Orders", href: "/production/orders", icon: ClipboardList },
      { label: "Job Work", href: "/production/job-work", icon: Hammer },
      { label: "Quality Control", href: "/production/quality-control", icon: BadgeCheck },
    ],
  },
  {
    label: "Metals",
    items: [
      { label: "Gold Rates", href: "/metals/gold-rates", icon: TrendingUp },
      { label: "Metal Inventory", href: "/metals/inventory", icon: Coins },
    ],
  },
  {
    label: "Stones",
    items: [{ label: "Stone Inventory", href: "/stones/inventory", icon: Diamond }],
  },
  {
    items: [
      { label: "Hallmarking", href: "/hallmarking", icon: ShieldCheck },
      { label: "Repairs", href: "/repairs", icon: Wrench },
      { label: "Customers", href: "/customers", icon: Users },
      { label: "Reports", href: "/reports", icon: BarChart3 },
      { label: "Accounting", href: "/accounting", icon: Wallet },
      { label: "Settings", href: "/settings", icon: SettingsIcon },
    ],
  },
];

export const NAV_FLAT: NavLeaf[] = NAV.flatMap((group) => group.items);

export function findNavItem(pathname: string): NavLeaf | undefined {
  return NAV_FLAT.find((item) => item.href === pathname);
}

export function findNavGroup(pathname: string): NavGroup | undefined {
  return NAV.find((group) => group.items.some((item) => item.href === pathname));
}

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export function getBreadcrumb(pathname: string): BreadcrumbSegment[] {
  if (pathname === "/") return [];
  const item = findNavItem(pathname);
  const group = findNavGroup(pathname);
  const segments: BreadcrumbSegment[] = [{ label: "Home", href: "/" }];
  if (group?.label) segments.push({ label: group.label });
  segments.push({ label: item?.label ?? "Not found" });
  return segments;
}
