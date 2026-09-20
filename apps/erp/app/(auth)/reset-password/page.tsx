"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { passwordSchema } from "@jewellery/validation";
import { Alert, Button, FormField, Input } from "@jewellery/ui";
import { ApiError, resetPasswordRequest } from "../../../lib/auth/api-client";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setFieldError(parsed.error.issues[0]?.message ?? "Choose a stronger password");
    if (password !== confirm) return setFieldError("Passwords don't match");
    setFieldError(null);
    setSubmitting(true);
    try {
      await resetPasswordRequest(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "INVALID_RESET_TOKEN" ? "This reset link is invalid or has expired. Request a new one." : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) return <Alert variant="danger">This reset link is incomplete. Request a new one from the sign-in page.</Alert>;

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-h3 text-foreground">Password updated</h1>
        <Alert variant="success">You&apos;ve been signed out everywhere. Sign in with your new password.</Alert>
        <Button asChild className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="font-display text-h3 text-foreground">Choose a new password</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      <FormField label="New password" htmlFor="password" hint="At least 10 characters, with a letter and a digit." error={fieldError ?? undefined}>
        <Input id="password" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} invalid={!!fieldError} />
      </FormField>
      <FormField label="Confirm password" htmlFor="confirm">
        <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </FormField>
      <Button type="submit" loading={submitting} className="w-full">
        Update password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense>
      <ResetForm />
    </React.Suspense>
  );
}
