import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "../lib/utils";

export interface TopbarProps {
  /** Rendered at the far left on mobile — typically <MobileNavigation />. */
  navigation?: React.ReactNode;
  title?: string;
  onSearchClick?: () => void;
  actions?: React.ReactNode;
  className?: string;
}

/** Sticky top bar for ERP/portal layouts: mobile nav trigger, page title, ⌘K search, user/account actions. */
export function Topbar({ navigation, title, onSearchClick, actions, className }: TopbarProps) {
  return (
    <header
      className={cn(
        "flex h-14 items-center gap-3 border-b border-border bg-surface px-4",
        className
      )}
    >
      {navigation}
      {title && <span className="truncate text-body font-medium text-foreground">{title}</span>}
      {onSearchClick && (
        <button
          type="button"
          onClick={onSearchClick}
          className="ml-auto flex h-9 w-full max-w-xs items-center gap-2 rounded-md border border-border bg-surface-sunken px-3 text-body-sm text-muted transition-colors hover:border-primary sm:w-64"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="truncate">Search…</span>
          <kbd className="ml-auto hidden rounded border border-border px-1 text-caption sm:inline">⌘K</kbd>
        </button>
      )}
      {actions && <div className={cn("flex items-center gap-2", !onSearchClick && "ml-auto")}>{actions}</div>}
    </header>
  );
}
