"use client";

import * as React from "react";
import { Toast, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "./toast";
import { dismissToast, useToastQueue } from "./use-toast";

/** Mount once near the app root. Trigger notifications with `toast({ title, description, variant })`. */
export function Toaster() {
  const items = useToastQueue();

  return (
    <ToastProvider swipeDirection="right">
      {items.map(({ id, title, description, variant, duration }) => (
        <Toast key={id} variant={variant} duration={duration} onOpenChange={(open) => !open && dismissToast(id)}>
          {title && <ToastTitle>{title}</ToastTitle>}
          {description && <ToastDescription>{description}</ToastDescription>}
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
