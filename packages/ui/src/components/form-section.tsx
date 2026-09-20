import * as React from "react";
import { cn } from "../lib/utils";

export interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/** Groups related fields in a form with a heading — the standard building block for ERP data-entry forms. */
export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <fieldset className={cn("flex flex-col gap-4 border-t border-border-subtle pt-5 first:border-t-0 first:pt-0", className)}>
      <div className="flex flex-col gap-0.5">
        <legend className="text-body font-medium text-foreground">{title}</legend>
        {description && <p className="text-body-sm text-muted">{description}</p>}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
