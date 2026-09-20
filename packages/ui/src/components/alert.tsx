import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "../lib/utils";

const alertVariants = cva("flex gap-3 rounded-md border p-3 text-body-sm", {
  variants: {
    variant: {
      info: "border-transparent bg-info-subtle text-info",
      success: "border-transparent bg-success-subtle text-success",
      warning: "border-transparent bg-warning-subtle text-warning",
      danger: "border-transparent bg-danger-subtle text-danger",
    },
  },
  defaultVariants: { variant: "info" },
});

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  title?: string;
}

export function Alert({ className, variant = "info", title, children, ...props }: AlertProps) {
  const Icon = icons[variant ?? "info"];
  return (
    <div role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-0.5 text-foreground">
        {title && <span className="font-medium">{title}</span>}
        {children && <span className="text-muted">{children}</span>}
      </div>
    </div>
  );
}
