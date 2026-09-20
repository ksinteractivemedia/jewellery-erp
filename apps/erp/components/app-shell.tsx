"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Gem } from "lucide-react";
import {
  CommandPalette,
  ERPLayout,
  MobileNavigation,
  PageHeader,
  Sidebar,
  type SidebarNavGroup,
  type SidebarNavItem,
  Topbar,
} from "@jewellery/ui";
import { findNavItem, getBreadcrumb, NAV, NAV_FLAT, type NavLeaf } from "../lib/nav";
import { NotificationsMenu } from "./notifications-menu";
import { UserMenu } from "./user-menu";

const brand = (
  <span className="flex items-center gap-2 font-display text-h4 text-foreground">
    <Gem className="h-5 w-5 text-primary" /> Suvarna ERP
  </span>
);

function withActiveState(pathname: string): SidebarNavGroup[] {
  return NAV.map((group) => ({
    label: group.label,
    items: group.items.map((item) => ({ ...item, active: item.href === pathname })),
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
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const groups = withActiveState(pathname);
  const currentItem = findNavItem(pathname);
  const breadcrumb = getBreadcrumb(pathname);

  const paletteGroups = React.useMemo(
    () => [
      {
        heading: "Navigate",
        items: NAV_FLAT.map((item: NavLeaf) => ({
          id: item.href,
          label: item.label,
          icon: <item.icon className="h-4 w-4" />,
          onSelect: () => router.push(item.href),
        })),
      },
    ],
    [router]
  );

  return (
    <ERPLayout
      sidebar={<Sidebar groups={groups} brand={brand} renderLink={renderNavLink} footer={<span className="text-caption text-muted">v0.1 · Phase 1 in progress</span>} />}
      topbar={
        <Topbar
          navigation={<MobileNavigation groups={groups} brand={brand} renderLink={renderNavLink} />}
          onSearchClick={() => setPaletteOpen(true)}
          actions={
            <>
              <NotificationsMenu />
              <UserMenu />
            </>
          }
        />
      }
    >
      <PageHeader title={currentItem?.label ?? "Dashboard"} breadcrumb={breadcrumb.length ? breadcrumb : undefined} />
      {children}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} groups={paletteGroups} placeholder="Search modules…" />
    </ERPLayout>
  );
}
