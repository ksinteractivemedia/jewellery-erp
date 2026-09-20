import * as React from "react";
import { Heart } from "lucide-react";
import { cn } from "../lib/utils";

export interface WishlistButtonProps {
  active: boolean;
  onToggle: () => void;
  className?: string;
}

export function WishlistButton({ active, onToggle, className }: WishlistButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? "Remove from wishlist" : "Add to wishlist"}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-sm transition-colors hover:text-primary",
        className
      )}
    >
      <Heart className={cn("h-4 w-4", active && "fill-primary text-primary")} />
    </button>
  );
}
