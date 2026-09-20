import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "../lib/utils";

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, children, required, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn("text-body-sm font-medium text-foreground", className)}
    {...props}
  >
    {children}
    {required && (
      <span className="text-danger" aria-hidden="true">
        {" "}
        *
      </span>
    )}
  </LabelPrimitive.Root>
));
Label.displayName = "Label";
