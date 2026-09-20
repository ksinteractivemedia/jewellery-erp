import * as React from "react";
import { cn } from "../lib/utils";

export interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

/** Heading for a section within a page (a card block, a tab panel, a form group). One step down from PageHeader. */
export function SectionHeader({ title, description, actions, className }: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 pb-3", className)}>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-h4 font-medium text-foreground">{title}</h2>
        {description && <p className="text-body-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
