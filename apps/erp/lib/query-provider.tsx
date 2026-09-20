"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "./auth/api-client";
import { useAuth } from "./auth/auth-context";

/**
 * Server state lives here. The cache is wiped whenever nobody is signed in, so the next user
 * on a shared machine can never be shown the previous user's cached catalogue or permissions.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // A 4xx won't fix itself on retry; only transient failures are worth another attempt.
            retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
          },
        },
      })
  );
  const { user } = useAuth();
  React.useEffect(() => {
    if (!user) client.clear();
  }, [user, client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
