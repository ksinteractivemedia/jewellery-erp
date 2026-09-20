import * as React from "react";
import { cn } from "../lib/utils";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-12 text-center", className)}>
      {icon && <div className="text-muted">{icon}</div>}
      <div className="flex flex-col gap-1">
        <p className="text-body font-medium text-foreground">{title}</p>
        {description && <p className="text-body-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
