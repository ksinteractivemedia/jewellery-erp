"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema } from "@jewellery/validation";
import { Alert, Button, FormField, Input } from "@jewellery/ui";
import { ApiError } from "../../../lib/auth/api-client";
import { safeNextPath, useAuth } from "../../../lib/auth/auth-context";

function LoginForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const { status, login } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (status === "authenticated") router.replace(next);
  }, [status, next, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const issues = parsed.error.flatten().fieldErrors;
      setFieldErrors({ email: issues.email?.[0] && "Enter a valid email address", password: issues.password?.[0] && "Enter your password" });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      router.replace(next);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many attempts. Please wait a few minutes and try again."
          : err instanceof ApiError && err.status === 401
            ? "Incorrect email or password."
            : "We couldn't reach the server. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-h3 text-foreground">Sign in</h1>
        <p className="text-body-sm text-muted">Use your work email and password.</p>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <FormField label="Email" htmlFor="email" error={fieldErrors.email}>
        <Input id="email" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!fieldErrors.email} />
      </FormField>
      <FormField label="Password" htmlFor="password" error={fieldErrors.password}>
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!fieldErrors.password} />
      </FormField>
      <Button type="submit" loading={submitting} className="w-full">
        Sign in
      </Button>
      <Link href="/forgot-password" className="text-center text-body-sm text-primary-active hover:underline">
        Forgot your password?
      </Link>
    </form>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense>
      <LoginForm />
    </React.Suspense>
  );
}
