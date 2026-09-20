import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "../lib/utils";

export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  onClear?: () => void;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value, onClear, placeholder = "Search…", ...props }, ref) => (
    <div className="relative flex items-center">
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted" aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder={placeholder}
        role="searchbox"
        className={cn(
          "h-9 w-full rounded-md border border-border bg-surface pl-9 pr-9 text-body text-foreground placeholder:text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
        {...props}
      />
      {onClear && value ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-2 flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
);
SearchInput.displayName = "SearchInput";
