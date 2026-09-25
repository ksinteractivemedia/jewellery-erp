import * as React from "react";
import { cn } from "../lib/utils";
import { Label } from "./label";

export interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

/** Wraps a single form control with a consistent label / hint / error layout. */
export function FormField({ label, htmlFor, required, error, hint, className, children }: FormFieldProps) {
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const describedBy = error ? errorId : hint ? hintId : undefined;
  // The control itself carries the association a screen reader needs — the <p> having the id isn't enough on its own.
  const control =
    React.isValidElement<{ "aria-describedby"?: string; "aria-invalid"?: boolean; required?: boolean; "aria-required"?: boolean }>(children)
      ? React.cloneElement(children, {
          "aria-describedby": [describedBy, children.props["aria-describedby"]].filter(Boolean).join(" ") || undefined,
          ...(error ? { "aria-invalid": true } : {}),
          ...(required ? { required: true, "aria-required": true } : {}),
        })
      : children;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {control}
      {hint && !error && (
        <p id={hintId} className="text-caption text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
