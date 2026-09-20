import * as React from "react";
import { cn } from "../lib/utils";

export interface ERPLayoutProps {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** Standard ERP page shell: fixed sidebar (desktop/tablet) + sticky topbar + scrollable content. Supports light/dark. */
export function ERPLayout({ sidebar, topbar, children, className }: ERPLayoutProps) {
  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar}
        <main className={cn("flex-1 overflow-y-auto p-4 md:p-6", className)}>{children}</main>
      </div>
    </div>
  );
}
