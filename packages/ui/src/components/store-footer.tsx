import * as React from "react";
import { cn } from "../lib/utils";

export interface StoreFooterColumn {
  heading: string;
  links: { label: string; href: string }[];
}

export interface StoreFooterProps {
  logo: React.ReactNode;
  tagline?: string;
  columns: StoreFooterColumn[];
  bottomNote?: string;
  renderLink?: (href: string, label: string) => React.ReactNode;
  className?: string;
}

export function StoreFooter({ logo, tagline, columns, bottomNote, renderLink, className }: StoreFooterProps) {
  return (
    <footer className={cn("border-t border-border-subtle bg-surface-sunken", className)}>
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_2fr]">
        <div className="flex flex-col gap-2">
          <div className="font-display text-h4 text-foreground">{logo}</div>
          {tagline && <p className="max-w-xs text-body-sm text-muted">{tagline}</p>}
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {columns.map((col) => (
            <div key={col.heading} className="flex flex-col gap-2.5">
              <p className="text-body-sm font-medium text-foreground">{col.heading}</p>
              <ul className="flex flex-col gap-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    {renderLink ? (
                      renderLink(link.href, link.label)
                    ) : (
                      <a href={link.href} className="text-body-sm text-muted hover:text-foreground">
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      {bottomNote && (
        <div className="border-t border-border-subtle px-4 py-4 text-center text-caption text-muted sm:px-6">
          {bottomNote}
        </div>
      )}
    </footer>
  );
}
