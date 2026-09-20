import * as React from "react";
import { cn } from "../lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-md bg-surface-sunken bg-[linear-gradient(110deg,transparent_33%,rgba(255,255,255,0.35)_50%,transparent_67%)] bg-[length:200%_100%]",
        className
      )}
      aria-hidden="true"
      {...props}
    />
  );
}
