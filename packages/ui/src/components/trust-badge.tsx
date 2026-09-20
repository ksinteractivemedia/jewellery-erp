import * as React from "react";
import { cn } from "../lib/utils";

export interface TrustBadgeProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  className?: string;
}

/** Certification/assurance markers (BIS Hallmarked, Secure Payments, Easy Returns, ...). */
export function TrustBadge({ icon: Icon, label, className }: TrustBadgeProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 text-center", className)}>
      <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
      <span className="text-body-sm text-foreground">{label}</span>
    </div>
  );
}
