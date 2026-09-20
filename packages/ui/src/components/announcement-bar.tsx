import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

export interface AnnouncementBarProps {
  message: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

/** Slim strip above the storefront header for a seasonal message or policy note. Dismissible, not decorative-only. */
export function AnnouncementBar({ message, onDismiss, className }: AnnouncementBarProps) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center bg-[var(--palette-charcoal)] px-10 py-2 text-center text-caption text-white",
        className
      )}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss announcement"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-white/70 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
