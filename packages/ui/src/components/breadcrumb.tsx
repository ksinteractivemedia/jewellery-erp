import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
  /** Render prop so consumers can plug in their router's Link component. */
  renderLink?: (item: BreadcrumbItem, children: React.ReactNode) => React.ReactNode;
}

export function Breadcrumb({ items, className, renderLink }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1 text-body-sm", className)}>
      <ol className="flex items-center gap-1">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          const label = (
            <span className={isLast ? "font-medium text-foreground" : "text-muted hover:text-foreground"}>
              {item.label}
            </span>
          );
          return (
            <li key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted" aria-hidden="true" />}
              {item.href && !isLast ? (
                renderLink ? (
                  renderLink(item, label)
                ) : (
                  <a href={item.href}>{label}</a>
                )
              ) : (
                <span aria-current={isLast ? "page" : undefined}>{label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
