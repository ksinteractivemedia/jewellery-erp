import * as React from "react";
import { cn } from "../lib/utils";

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  badge?: string | number;
}

export interface SidebarNavGroup {
  label?: string;
  items: SidebarNavItem[];
}

export interface SidebarProps {
  groups: SidebarNavGroup[];
  brand: React.ReactNode;
  footer?: React.ReactNode;
  /** Render prop so consumers can plug in their router's Link component. */
  renderLink?: (item: SidebarNavItem, children: React.ReactNode) => React.ReactNode;
  className?: string;
}

/** Primary ERP/B2B-portal navigation. Desktop/tablet only — see MobileNavigation for small screens. */
export function Sidebar({ groups, brand, footer, renderLink, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        "hidden h-full w-60 flex-col border-r border-border bg-surface md:flex",
        className
      )}
    >
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
                    {item.badge !== undefined && (
                      <span className="ml-auto rounded-full bg-surface-sunken px-1.5 text-caption text-muted">
                        {item.badge}
                      </span>
                    )}
                  </span>
                );
                return (
                  <li key={item.href}>
                    {renderLink ? (
                      renderLink(item, content)
                    ) : (
                      <a href={item.href} aria-current={item.active ? "page" : undefined}>
                        {content}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {footer && <div className="border-t border-border-subtle p-3">{footer}</div>}
    </aside>
  );
}
