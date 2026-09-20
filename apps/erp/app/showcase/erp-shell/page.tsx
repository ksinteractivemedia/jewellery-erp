"use client";

import * as React from "react";
import {
  BarChart3,
  Factory,
  Gem,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ERPLayout,
  MetricCard,
  MobileNavigation,
  PageHeader,
  Sidebar,
  type SidebarNavGroup,
  Topbar,
} from "@jewellery/ui";
import { ThemeToggle } from "../theme-toggle";

const navGroups: SidebarNavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "#dashboard", icon: LayoutDashboard, active: true }],
  },
  {
    label: "Operations",
    items: [
      { label: "Inventory", href: "#inventory", icon: Package, badge: 58 },
      { label: "Orders", href: "#orders", icon: ShoppingCart, badge: 12 },
      { label: "Manufacturing", href: "#manufacturing", icon: Factory },
      { label: "Job work", href: "#job-work", icon: Truck },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Customers", href: "#customers", icon: Users },
      { label: "Accounts", href: "#accounts", icon: Wallet },
      { label: "Reports", href: "#reports", icon: BarChart3 },
    ],
  },
  {
    label: "System",
    items: [{ label: "Settings", href: "#settings", icon: Settings }],
  },
];

export default function ERPShellShowcase() {
  const [paletteHint, setPaletteHint] = React.useState(false);

  return (
    <ERPLayout
      sidebar={
        <Sidebar
          groups={navGroups}
          brand={
            <span className="flex items-center gap-2 font-display text-h4 text-foreground">
              <Gem className="h-5 w-5 text-primary" /> Suvarna ERP
            </span>
          }
          footer={<span className="text-caption text-muted">v0.1 · Design system preview</span>}
        />
      }
      topbar={
        <Topbar
          navigation={
            <MobileNavigation
              groups={navGroups}
              brand={
                <span className="flex items-center gap-2 font-display text-h4 text-foreground">
                  <Gem className="h-5 w-5 text-primary" /> Suvarna ERP
                </span>
              }
            />
          }
          onSearchClick={() => setPaletteHint(true)}
          actions={
            <>
              <ThemeToggle />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Account menu">
                    <Users className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Priya Sharma</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Profile</DropdownMenuItem>
                  <DropdownMenuItem>Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
      }
    >
      <PageHeader
        title="Dashboard"
        description="This is the ERP shell composition — Sidebar + Topbar + ERPLayout — not a real dashboard yet."
        breadcrumb={[{ label: "Home", href: "#" }, { label: "Dashboard" }]}
        actions={<Button variant="primary">New sale</Button>}
      />
      {paletteHint && <p className="mb-4 text-body-sm text-muted">(Search would normally open the CommandPalette — see the main showcase page.)</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Today's sales" value="₹8,42,300" change={{ value: "12.4%", direction: "up" }} />
        <MetricCard label="Orders today" value="24" change={{ value: "4 pending", direction: "up", tone: "negative" }} />
        <MetricCard label="Outstanding (B2B)" value="₹24,10,000" />
        <MetricCard label="Items with job worker" value="18" />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Placeholder content area</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-muted">
            Real ERP screens (inventory list, order detail, manufacturing dashboards) are Phase 1+ work — see docs/progress.md.
            This page only demonstrates the layout shell.
          </p>
        </CardContent>
      </Card>
    </ERPLayout>
  );
}
