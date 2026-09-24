import * as React from "react";
import { Menu } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "./drawer";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import type { SidebarNavGroup, SidebarNavItem } from "./sidebar";
import { cn } from "../lib/utils";

export interface MobileNavigationProps {
  groups: SidebarNavGroup[];
  brand: React.ReactNode;
  renderLink?: (item: SidebarNavItem, children: React.ReactNode) => React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Slide-in nav for phone/small-tablet widths — same nav data as Sidebar, different chrome. */
export function MobileNavigation({ groups, brand, renderLink, open, onOpenChange }: MobileNavigationProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation menu"
          className="-ml-1 flex h-11 w-11 items-center justify-center rounded-md text-foreground hover:bg-surface-sunken md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </DrawerTrigger>
      <DrawerContent side="left" className="max-w-[280px] p-0">
        <VisuallyHidden.Root>
          <DrawerTitle>Navigation</DrawerTitle>
        </VisuallyHidden.Root>
        <div className="flex h-14 items-center border-b border-border-subtle px-4">{brand}</div>
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Primary">
          {groups.map((group, gi) => (
            <div key={gi} className="mb-4">
              {group.label && (
                <p className="mb-1.5 px-2 text-caption font-medium uppercase tracking-wide text-muted">{group.label}</p>
              )}
              <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const content = (
                    <span
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-body-sm font-medium transition-colors",
                        item.active ? "bg-primary-subtle text-primary-active" : "text-foreground hover:bg-surface-sunken"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </span>
                  );
                  return (
                    <li key={item.href}>
                      {renderLink ? renderLink(item, content) : <a href={item.href}>{content}</a>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </DrawerContent>
    </Drawer>
  );
}
