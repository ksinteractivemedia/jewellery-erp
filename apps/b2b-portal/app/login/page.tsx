"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../lib/auth";

export default function LoginPage() {
  const { status, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (status === "signed-in") router.replace("/"); }, [status, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await signIn(email.trim(), password);
    } catch {
      setError("That email and password don’t match a wholesale account.");
    }
    setBusy(false);
  };

  return (
    <main id="main" className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <p className="text-center text-[1.25rem] font-semibold tracking-[0.2em]">SUVARNA</p>
        <p className="mb-8 text-center text-[0.6875rem] uppercase tracking-[0.16em] text-muted">Wholesale portal</p>
        <form onSubmit={submit} className="card flex flex-col gap-4 p-6" aria-label="Sign in" data-testid="login-form">
          <div className="flex flex-col gap-1.5"><label className="label" htmlFor="email">Email</label><input id="email" type="email" autoComplete="username" required className="field" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email" /></div>
          <div className="flex flex-col gap-1.5"><label className="label" htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" required className="field" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password" /></div>
          {error && <p className="text-[0.8125rem] text-danger" role="alert" data-testid="login-error">{error}</p>}
          <button className="btn btn-primary h-10" disabled={busy} data-testid="login-submit">{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}Sign in</button>
        </form>
        <p className="mt-4 text-center text-[0.75rem] text-muted">Trade customers only. To open an account, contact your Suvarna salesperson.</p>
      </div>
    </main>
  );
}
