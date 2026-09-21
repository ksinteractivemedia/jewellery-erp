"use client";

import * as React from "react";
import type { AuthUser } from "@jewellery/types";
import { login as loginRequest, logout as logoutRequest, onSessionLost, refreshSession } from "./api";

interface AuthState {
  status: "loading" | "signed-out" | "signed-in";
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const Ctx = React.createContext<AuthState | null>(null);

/** Session state for the portal. The token itself never enters React state; this only knows WHO is signed in. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<Pick<AuthState, "status" | "user">>({ status: "loading", user: null });
  React.useEffect(() => {
    let live = true;
    refreshSession().then((s) => live && setState(s ? { status: "signed-in", user: s.user } : { status: "signed-out", user: null }));
    const off = onSessionLost(() => setState({ status: "signed-out", user: null }));
    return () => { live = false; off(); };
  }, []);
  const value = React.useMemo<AuthState>(() => ({
    ...state,
    signIn: async (email, password) => { const s = await loginRequest(email, password); setState({ status: "signed-in", user: s.user }); },
    signOut: async () => { await logoutRequest(); setState({ status: "signed-out", user: null }); },
  }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAuth = () => {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
};
