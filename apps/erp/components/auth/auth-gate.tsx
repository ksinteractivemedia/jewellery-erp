"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Skeleton } from "@jewellery/ui";
import { useAuth } from "../../lib/auth/auth-context";

/** Wraps every authenticated screen: waits for session restore, then either renders or sends the user to /login. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (status === "unauthenticated") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, pathname, router]);

  if (status !== "authenticated") {
    return (
      <div className="flex h-screen w-full bg-background" aria-busy="true" aria-label="Loading">
        <Skeleton className="hidden h-full w-60 md:block" />
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
