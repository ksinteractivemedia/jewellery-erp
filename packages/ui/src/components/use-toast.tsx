"use client";

import * as React from "react";

export interface ToastOptions {
  title?: string;
  description?: string;
  variant?: "default" | "success" | "danger";
  duration?: number;
}

export interface ToastRecord extends ToastOptions {
  id: string;
}

type Listener = (toasts: ToastRecord[]) => void;

let toasts: ToastRecord[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener(toasts));
}

export function toast(options: ToastOptions) {
  const id = crypto.randomUUID();
  toasts = [...toasts, { id, duration: 5000, ...options }];
  emit();
  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

/** Subscribes a component (the Toaster) to the current toast queue. */
export function useToastQueue() {
  const [state, setState] = React.useState<ToastRecord[]>(toasts);

  React.useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return state;
}
