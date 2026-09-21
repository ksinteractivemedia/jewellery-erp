import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Boxes,
  Calculator,
  ClipboardList,
  FolderTree,
  Coins,
  CreditCard,
  Diamond,
  Factory,
  FileSignature,
  FileText,
  Gem,
  Hammer,
  Layers,
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
import { PERMISSIONS as P, type PermissionKey } from "@jewellery/types";

export interface NavLeaf {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission needed to see/open this screen. Omitted = any signed-in user. UI convenience only; the API enforces the real rule. */
  permission?: PermissionKey;
  /** The page renders its own PageHeader (title + actions), so the shell must not add a second one. */
  ownsHeader?: boolean;
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
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard, ownsHeader: true }],
  },
  {
    label: "Sales",
    items: [
      { label: "Orders", href: "/sales/orders", icon: ClipboardList, permission: P.SALES_VIEW },
      { label: "Invoices", href: "/sales/invoices", icon: FileText, permission: P.SALES_VIEW },
      { label: "Returns", href: "/sales/returns", icon: Undo2, permission: P.SALES_VIEW },
      { label: "Exchanges", href: "/sales/exchanges", icon: Repeat, permission: P.SALES_VIEW },
    ],
  },
  {
    label: "B2B",
    items: [
      { label: "Customers", href: "/b2b/customers", icon: Users, permission: P.B2B_VIEW },
      { label: "Purchase Orders", href: "/b2b/purchase-orders", icon: ClipboardList, permission: P.B2B_VIEW },
      { label: "Quotations", href: "/b2b/quotations", icon: FileSignature, permission: P.B2B_VIEW },
      { label: "Credit", href: "/b2b/credit", icon: CreditCard, permission: P.B2B_VIEW },
      { label: "Outstanding", href: "/b2b/outstanding", icon: AlertTriangle, permission: P.B2B_VIEW },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Products", href: "/inventory/products", icon: Gem, permission: P.CATALOG_VIEW, ownsHeader: true },
      { label: "Categories", href: "/inventory/categories", icon: FolderTree, permission: P.CATALOG_VIEW, ownsHeader: true },
      { label: "Collections", href: "/inventory/collections", icon: Layers, permission: P.CATALOG_VIEW, ownsHeader: true },
      { label: "Inventory", href: "/inventory/stock", icon: Boxes, permission: P.INVENTORY_VIEW, ownsHeader: true },
      { label: "Ledger", href: "/inventory/ledger", icon: BookOpen, permission: P.INVENTORY_VIEW, ownsHeader: true },
      { label: "Transfers", href: "/inventory/transfers", icon: ArrowLeftRight, permission: P.INVENTORY_VIEW, ownsHeader: true },
      { label: "Adjustments", href: "/inventory/adjustments", icon: SlidersHorizontal, permission: P.INVENTORY_VIEW, ownsHeader: true },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { label: "Suppliers", href: "/purchasing/suppliers", icon: Factory, permission: P.PURCHASING_VIEW },
      { label: "Purchase Orders", href: "/purchasing/purchase-orders", icon: ClipboardList, permission: P.PURCHASING_VIEW },
      { label: "Goods Receipts", href: "/purchasing/goods-receipts", icon: PackageCheck, permission: P.PURCHASING_VIEW },
    ],
  },
  {
    label: "Production",
    items: [
      { label: "Production Orders", href: "/production/orders", icon: ClipboardList, permission: P.PRODUCTION_VIEW },
      { label: "Job Work", href: "/production/job-work", icon: Hammer, permission: P.PRODUCTION_VIEW },
      { label: "Quality Control", href: "/production/quality-control", icon: BadgeCheck, permission: P.PRODUCTION_VIEW },
    ],
  },
  {
    label: "Pricing",
    items: [{ label: "Pricing Playground", href: "/pricing/playground", icon: Calculator, permission: P.PRICING_MANAGE, ownsHeader: true }],
  },
  {
    label: "Metals",
    items: [
      { label: "Gold Rates", href: "/metals/gold-rates", icon: TrendingUp, permission: P.PRICING_VIEW },
      { label: "Metal Inventory", href: "/metals/inventory", icon: Coins, permission: P.INVENTORY_VIEW },
    ],
  },
  {
    label: "Stones",
    items: [{ label: "Stone Inventory", href: "/stones/inventory", icon: Diamond, permission: P.INVENTORY_VIEW }],
  },
  {
    items: [
      { label: "Hallmarking", href: "/hallmarking", icon: ShieldCheck, permission: P.INVENTORY_VIEW },
      { label: "Repairs", href: "/repairs", icon: Wrench, permission: P.SALES_VIEW },
      { label: "Customers", href: "/customers", icon: Users, permission: P.CUSTOMERS_VIEW },
      { label: "Reports", href: "/reports", icon: BarChart3, permission: P.REPORTS_VIEW },
      { label: "Accounting", href: "/accounting", icon: Wallet, permission: P.ACCOUNTING_VIEW },
      { label: "Settings", href: "/settings", icon: SettingsIcon, permission: P.SETTINGS_MANAGE_USERS },
    ],
  },
];

export const NAV_FLAT: NavLeaf[] = NAV.flatMap((group) => group.items);

export function findNavItem(pathname: string): NavLeaf | undefined {
  return NAV_FLAT.find((item) => item.href === pathname);
}

/**
 * The nav leaf a path belongs to — exact match, or the leaf whose href it nests under
 * (`/inventory/products/123/edit` → Products). Used for permission guarding and the active
 * sidebar entry, so detail/edit screens inherit their section's rules without being nav items.
 */
export function findOwningNavItem(pathname: string): NavLeaf | undefined {
  return findNavItem(pathname) ?? NAV_FLAT.filter((i) => i.href !== "/" && pathname.startsWith(`${i.href}/`)).sort((a, b) => b.href.length - a.href.length)[0];
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
  const item = findOwningNavItem(pathname);
  const group = item ? NAV.find((g) => g.items.includes(item)) : undefined;
  const segments: BreadcrumbSegment[] = [{ label: "Home", href: "/" }];
  if (group?.label) segments.push({ label: group.label });
  segments.push({ label: item?.label ?? "Not found", href: item && item.href !== pathname ? item.href : undefined });
  return segments;
}

/** The nav a given user may see: leaves they lack permission for are dropped, and groups left empty vanish. */
export function visibleNav(can: (permission: PermissionKey) => boolean): NavGroup[] {
  return NAV.map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || can(item.permission)) })).filter((g) => g.items.length > 0);
}
