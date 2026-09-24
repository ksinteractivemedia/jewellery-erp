"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, TooltipProvider } from "@jewellery/ui";
import { AuthProvider } from "../lib/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  // Without a default staleTime (0) every query refetches on every mount AND every window/tab focus — a real cost
  // on order/invoice/PO screens a buyer revisits constantly while assembling a purchase. 30s matches the other two apps.
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: (n, e) => n < 1 && !(e instanceof Error && /\b4\d\d\b|not found|permission/i.test(e.message)), refetchOnWindowFocus: true } } }));
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
