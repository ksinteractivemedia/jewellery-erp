"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, TooltipProvider } from "@jewellery/ui";
import { AuthProvider } from "../lib/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({ defaultOptions: { queries: { retry: (n, e) => n < 1 && !(e instanceof Error && /\b4\d\d\b|not found|permission/i.test(e.message)), refetchOnWindowFocus: true } } }));
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
