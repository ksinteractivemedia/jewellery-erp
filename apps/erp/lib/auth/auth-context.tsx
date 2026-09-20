"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { AuthSession, AuthUser, PermissionKey } from "@jewellery/types";
import { loginRequest, logoutRequest, onSessionLost, refreshSession, setAccessToken } from "./api-client";

type Status = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  status: Status;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * UI-only permission check (hide a menu item, show a "forbidden" screen). It is a courtesy
   * to the user, never a security boundary — the API re-checks every request server-side.
   */
  can: (permission: PermissionKey) => boolean;
  canAny: (permissions: PermissionKey[]) => boolean;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/** Routes that must never trigger a session restore (design-system preview pages). */
const PUBLIC_PREFIXES = ["/showcase"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [status, setStatus] = React.useState<Status>("loading");
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const skipRestore = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  const apply = React.useCallback((session: AuthSession | null) => {
    setUser(session?.user ?? null);
    setStatus(session ? "authenticated" : "unauthenticated");
  }, []);

  // Restore on load: the refresh cookie (if any) buys a fresh access token. Nothing is read from storage.
  React.useEffect(() => {
    if (skipRestore) return;
    let cancelled = false;
    refreshSession().then((session) => !cancelled && apply(session));
    return () => {
      cancelled = true;
    };
  }, [apply, skipRestore]);

  React.useEffect(
    () =>
      onSessionLost(() => {
        setAccessToken(null);
        apply(null);
      }),
    [apply]
  );

  const value = React.useMemo<AuthContextValue>(() => {
    const granted = new Set<string>(user?.permissions ?? []);
    return {
      status,
      user,
      login: async (email, password) => apply(await loginRequest(email, password)),
      logout: async () => {
        await logoutRequest().catch(() => undefined);
        apply(null);
      },
      can: (permission) => granted.has(permission),
      canAny: (permissions) => permissions.some((p) => granted.has(p)),
    };
  }, [status, user, apply]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Only follow same-origin relative paths after login — never an attacker-supplied absolute URL. */
export function safeNextPath(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
