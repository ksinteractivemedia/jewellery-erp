"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { Gem } from "lucide-react";
import {
  ERPLayout,
  MobileNavigation,
  PageHeader,
  Sidebar,
  type SidebarNavGroup,
  type SidebarNavItem,
  Topbar,
} from "@jewellery/ui";

// cmdk + its Radix Dialog are real weight most visits never touch — split them out of every page's
// main bundle and load only the first time someone actually opens the palette (⌘K or the search icon).
const CommandPalette = dynamic(() => import("@jewellery/ui").then((m) => m.CommandPalette), { ssr: false });
import { useAuth } from "../lib/auth/auth-context";
import { findNavItem, findOwningNavItem, getBreadcrumb, visibleNav, type NavLeaf } from "../lib/nav";
import { RequirePermission } from "./auth/require-permission";
import { NotificationsMenu } from "./notifications-menu";
import { UserMenu } from "./user-menu";

const brand = (
  <span className="flex items-center gap-2 font-display text-h4 text-foreground">
    <Gem className="h-5 w-5 text-primary" /> Suvarna ERP
  </span>
);

function withActiveState(nav: ReturnType<typeof visibleNav>, pathname: string): SidebarNavGroup[] {
  const owner = findOwningNavItem(pathname);
  return nav.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({ ...item, active: item.href === owner?.href })),
  }));
}

function renderNavLink(item: SidebarNavItem, children: React.ReactNode) {
  return (
    <Link href={item.href} aria-current={item.active ? "page" : undefined}>
      {children}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { can } = useAuth();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  // Once true, stays true — the palette (and its chunk) loads on first open and simply hides/shows after that,
  // rather than being torn down and its module re-fetched every close.
  const [paletteRequested, setPaletteRequested] = React.useState(false);
  const openPalette = React.useCallback((next: boolean | ((o: boolean) => boolean)) => {
    setPaletteRequested(true);
    setPaletteOpen(next);
  }, []);
  const nav = React.useMemo(() => visibleNav(can), [can]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openPalette]);

  const groups = withActiveState(nav, pathname);
  // Nested routes (detail/edit/new) inherit their section's permission but draw their own header.
  const currentItem = findOwningNavItem(pathname);
  const shellHeader = currentItem && !currentItem.ownsHeader && findNavItem(pathname) !== undefined;
  const breadcrumb = getBreadcrumb(pathname);

  const paletteGroups = React.useMemo(
    () => [
      {
        heading: "Navigate",
        items: nav.flatMap((g) => g.items).map((item: NavLeaf) => ({
          id: item.href,
          label: item.label,
          icon: <item.icon className="h-4 w-4" />,
          onSelect: () => router.push(item.href),
        })),
      },
    ],
    [router, nav]
  );

  return (
    <ERPLayout
      sidebar={<Sidebar groups={groups} brand={brand} renderLink={renderNavLink} footer={<span className="text-caption text-muted">v0.1 · Phase 1 in progress</span>} />}
      topbar={
        <Topbar
          navigation={<MobileNavigation groups={groups} brand={brand} renderLink={renderNavLink} />}
          onSearchClick={() => openPalette(true)}
          actions={
            <>
              <NotificationsMenu />
              <UserMenu />
            </>
          }
        />
      }
    >
      {(shellHeader || !currentItem) && <PageHeader title={currentItem?.label ?? "Dashboard"} breadcrumb={breadcrumb.length ? breadcrumb : undefined} />}
      <RequirePermission permission={currentItem?.permission}>{children}</RequirePermission>
      {paletteRequested && <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} groups={paletteGroups} placeholder="Search modules…" />}
    </ERPLayout>
  );
}
